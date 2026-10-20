/**
 * Reads files out of a zip archive, such as an XMind map: its directory,
 * then each entry on request, stored or deflated, checked against its
 * CRC-32. Archives that span disks, need ZIP64 or are encrypted are refused,
 * and so is an entry that would unpack past the archive's limits.
 */

import { crc32, inflate, InflateError } from './inflate.js';

/** An archive that can't be read, or an entry that can't be unpacked. */
export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

export interface ZipLimits {
  /** The most entries an archive may list. */
  entries: number;

  /** The most bytes one entry may unpack to. */
  entrySize: number;

  /** The most bytes all the entries read may unpack to, together. */
  totalSize: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  entries: 20000,
  entrySize: 64 * 1024 * 1024,
  totalSize: 256 * 1024 * 1024,
};

interface ZipEntry {
  name: string;
  flags: number;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  headerOffset: number;
}

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;

/** Whether bytes start the way every zip archive does. */
export const isZip = (bytes: Uint8Array): boolean => {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
};

export class ZipArchive {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  private readonly limits: ZipLimits;
  private readonly entries = new Map<string, ZipEntry>();
  private unpacked = 0;

  constructor(bytes: Uint8Array, limits: Partial<ZipLimits> = {}) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.limits = { ...DEFAULT_ZIP_LIMITS, ...limits };
    this.readDirectory();
  }

  /** The names of the files in the archive, folders left out. */
  get names(): string[] {
    return [...this.entries.keys()].filter((name) => !name.endsWith('/'));
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  /** An entry's bytes, or null when the archive has no such file. */
  read(name: string): Uint8Array | null {
    const entry = this.entries.get(name);

    if (!entry) {
      return null;
    }

    if (entry.flags & 1) {
      throw new ZipError(`${name} is encrypted`);
    }

    if (entry.size > this.limits.entrySize || this.unpacked + entry.size > this.limits.totalSize) {
      throw new ZipError(`${name} is too large to unpack`);
    }

    const offset = entry.headerOffset;

    if (offset + 30 > this.bytes.length || this.view.getUint32(offset, true) !== LOCAL_HEADER) {
      throw new ZipError(`The archive has no data where ${name} should start`);
    }

    const start = offset + 30 + this.view.getUint16(offset + 26, true) + this.view.getUint16(offset + 28, true);
    const end = start + entry.compressedSize;

    if (end > this.bytes.length) {
      throw new ZipError(`${name} runs past the end of the archive`);
    }

    const stored = this.bytes.subarray(start, end);
    let data: Uint8Array;

    if (entry.method === 0) {
      data = stored;
    } else if (entry.method === 8) {
      try {
        data = inflate(stored, { expected: entry.size, limit: entry.size });
      } catch (error) {
        throw new ZipError(`${name} can't be unpacked: ${error instanceof InflateError ? error.message : String(error)}`);
      }
    } else {
      throw new ZipError(`${name} is compressed a way Orbit can't read (method ${entry.method})`);
    }

    if (data.length !== entry.size || crc32(data) !== entry.crc) {
      throw new ZipError(`${name} is damaged: its contents don't match its checksum`);
    }

    this.unpacked += data.length;
    return data;
  }

  /** An entry as UTF-8 text, or null when the archive has no such file. */
  text(name: string): string | null {
    const data = this.read(name);
    return data === null ? null : new TextDecoder('utf-8').decode(data);
  }

  private readDirectory(): void {
    const bytes = this.bytes;
    const view = this.view;
    let end = -1;

    // The directory's end record sits in the last 22 bytes, or before a comment of up to 64 KB.
    for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 22 - 65535); index--) {
      if (view.getUint32(index, true) === END_OF_DIRECTORY) {
        end = index;
        break;
      }
    }

    if (end === -1) {
      throw new ZipError('The file is not a zip archive, or its end is missing');
    }

    const disk = view.getUint16(end + 4, true);
    const count = view.getUint16(end + 10, true);
    const size = view.getUint32(end + 12, true);
    const offset = view.getUint32(end + 16, true);

    if (disk !== 0) {
      throw new ZipError('The archive spans several disks');
    }

    if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
      throw new ZipError('The archive needs ZIP64, which Orbit reads no map from');
    }

    if (count > this.limits.entries) {
      throw new ZipError(`The archive lists more than ${this.limits.entries} files`);
    }

    if (offset + size > end) {
      throw new ZipError("The archive's directory runs past its end");
    }

    const decoder = new TextDecoder('utf-8');
    let position = offset;

    for (let index = 0; index < count; index++) {
      if (position + 46 > end || view.getUint32(position, true) !== DIRECTORY_ENTRY) {
        throw new ZipError("The archive's directory is damaged");
      }

      const nameLength = view.getUint16(position + 28, true);
      const extraLength = view.getUint16(position + 30, true);
      const commentLength = view.getUint16(position + 32, true);

      if (position + 46 + nameLength > end) {
        throw new ZipError("The archive's directory is damaged");
      }

      const name = decoder.decode(bytes.subarray(position + 46, position + 46 + nameLength));
      const entry: ZipEntry = {
        name,
        flags: view.getUint16(position + 8, true),
        method: view.getUint16(position + 10, true),
        crc: view.getUint32(position + 16, true),
        compressedSize: view.getUint32(position + 20, true),
        size: view.getUint32(position + 24, true),
        headerOffset: view.getUint32(position + 42, true),
      };

      if (!this.entries.has(name)) {
        this.entries.set(name, entry);
      }

      position += 46 + nameLength + extraLength + commentLength;
    }
  }
}
