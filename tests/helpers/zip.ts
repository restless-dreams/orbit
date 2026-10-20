import { deflateRawSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface ZipFile {
  name: string;
  data: Uint8Array | string;

  /** Kept as it is instead of deflated. */
  stored?: boolean;

  /** Marked encrypted, as a password-protected archive marks its entries. */
  encrypted?: boolean;

  /** A compression method other than stored (0) or deflated (8). */
  method?: number;
}

/** A zip archive of `files`, as apps write them: local headers, the data, then the directory. */
export const makeZip = (files: ZipFile[]): Uint8Array => {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    const name = encoder.encode(file.name);
    const method = file.method ?? (file.stored ? 0 : 8);
    const compressed = method === 8 ? new Uint8Array(deflateRawSync(data)) : data;
    const crc = Bun.hash.crc32(data);
    const flags = (file.encrypted ? 1 : 0) | 0x800;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, flags, true);
    local.setUint16(8, method, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, compressed.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, compressed);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, flags, true);
    entry.setUint16(10, method, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, compressed.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    directory.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + compressed.length;
  }

  const directorySize = directory.reduce((size, chunk) => size + chunk.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);

  const parts = [...chunks, ...directory, new Uint8Array(end.buffer)];
  const archive = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let position = 0;

  for (const part of parts) {
    archive.set(part, position);
    position += part.length;
  }

  return archive;
};

/** Every file in a folder, by its path inside the folder. */
export const folderFiles = (folder: string): ZipFile[] => {
  const files: ZipFile[] = [];

  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);

      if (statSync(path).isDirectory()) {
        walk(path);
      } else {
        files.push({ name: relative(folder, path).split('\\').join('/'), data: new Uint8Array(readFileSync(path)) });
      }
    }
  };

  walk(folder);
  return files;
};

/** The smallest PNG there is: one transparent pixel. */
export const ONE_PIXEL_PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (character) => character.charCodeAt(0));
