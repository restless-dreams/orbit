/**
 * Inflate (RFC 1951), the compression inside zip files, read synchronously
 * and without `DecompressionStream`: the oldest browsers Orbit draws in
 * can't decompress raw deflate data, and a command line has no need to wait.
 * Codes are decoded the canonical way, a bit at a time, which is plenty fast
 * for the few megabytes a map holds.
 */

/** Data that isn't valid deflate data, or holds more than it said it would. */
export class InflateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InflateError';
  }
}

const LENGTH_BASES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA_BITS = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DISTANCE_BASES = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DISTANCE_EXTRA_BITS = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
const MAX_BITS = 15;

/** A canonical Huffman code: how many codes have each length, and the symbols in code order. */
interface HuffmanCode {
  counts: Uint16Array;
  symbols: Uint16Array;
}

const buildCode = (lengths: Uint8Array): HuffmanCode => {
  const counts = new Uint16Array(MAX_BITS + 1);

  for (const length of lengths) {
    counts[length] += 1;
  }

  counts[0] = 0;
  let left = 1;

  for (let length = 1; length <= MAX_BITS; length++) {
    left = left * 2 - counts[length];

    if (left < 0) {
      throw new InflateError('A Huffman code with more codes than its lengths allow');
    }
  }

  const offsets = new Uint16Array(MAX_BITS + 2);

  for (let length = 1; length <= MAX_BITS; length++) {
    offsets[length + 1] = offsets[length] + counts[length];
  }

  const symbols = new Uint16Array(lengths.length);

  for (let symbol = 0; symbol < lengths.length; symbol++) {
    if (lengths[symbol] !== 0) {
      symbols[offsets[lengths[symbol]]++] = symbol;
    }
  }

  return { counts, symbols };
};

const fixedLengths = new Uint8Array(288);
fixedLengths.fill(8, 0, 144);
fixedLengths.fill(9, 144, 256);
fixedLengths.fill(7, 256, 280);
fixedLengths.fill(8, 280, 288);
const FIXED_LITERALS = buildCode(fixedLengths);
const FIXED_DISTANCES = buildCode(new Uint8Array(30).fill(5));

class BitReader {
  private readonly data: Uint8Array;
  private position: number;
  private buffer = 0;
  private count = 0;

  constructor(data: Uint8Array, start: number) {
    this.data = data;
    this.position = start;
  }

  bits(needed: number): number {
    while (this.count < needed) {
      if (this.position >= this.data.length) {
        throw new InflateError('The data ends in the middle of a block');
      }

      this.buffer |= this.data[this.position++] << this.count;
      this.count += 8;
    }

    const value = this.buffer & ((1 << needed) - 1);
    this.buffer >>>= needed;
    this.count -= needed;
    return value;
  }

  /** Skips to the next whole byte and reads `length` bytes from there. */
  bytes(length: number): Uint8Array {
    this.buffer = 0;
    this.count = 0;

    if (this.position + length > this.data.length) {
      throw new InflateError('The data ends in the middle of a stored block');
    }

    const bytes = this.data.subarray(this.position, this.position + length);
    this.position += length;
    return bytes;
  }

  /** Skips to the next whole byte and reads a 16-bit little-endian number. */
  word(): number {
    const [low, high] = this.bytes(2);
    return low | (high << 8);
  }

  decode(code: HuffmanCode): number {
    let value = 0;
    let first = 0;
    let index = 0;

    for (let length = 1; length <= MAX_BITS; length++) {
      value |= this.bits(1);
      const count = code.counts[length];

      if (value - first < count) {
        return code.symbols[index + value - first];
      }

      index += count;
      first = (first + count) << 1;
      value <<= 1;
    }

    throw new InflateError('A code that no Huffman table has');
  }
}

/** Grows as it's written, never past its limit. */
class Output {
  bytes: Uint8Array;
  length = 0;
  private readonly limit: number;

  constructor(expected: number | undefined, limit: number) {
    this.limit = limit;
    this.bytes = new Uint8Array(Math.max(16, Math.min(expected ?? 65536, limit)));
  }

  private room(extra: number): void {
    const needed = this.length + extra;

    if (needed > this.limit) {
      throw new InflateError(`The data holds more than the ${this.limit} bytes it may`);
    }

    if (needed > this.bytes.length) {
      const grown = new Uint8Array(Math.min(this.limit, Math.max(needed, this.bytes.length * 2)));
      grown.set(this.bytes.subarray(0, this.length));
      this.bytes = grown;
    }
  }

  push(byte: number): void {
    this.room(1);
    this.bytes[this.length++] = byte;
  }

  append(bytes: Uint8Array): void {
    this.room(bytes.length);
    this.bytes.set(bytes, this.length);
    this.length += bytes.length;
  }

  copy(distance: number, length: number): void {
    if (distance > this.length) {
      throw new InflateError('A back reference to before the start of the data');
    }

    this.room(length);

    for (let index = 0; index < length; index++) {
      this.bytes[this.length] = this.bytes[this.length - distance];
      this.length += 1;
    }
  }
}

/**
 * Raw deflate data, inflated. `expected` sizes the output when it's known
 * (a zip entry says so); the output never grows past `limit`, so a small
 * file can't unpack into an enormous one.
 */
export const inflate = (data: Uint8Array, options: { expected?: number; limit?: number } = {}): Uint8Array => {
  const limit = options.limit ?? Math.max(options.expected ?? 0, 64 * 1024 * 1024);
  const reader = new BitReader(data, 0);
  const output = new Output(options.expected, limit);
  let last = 0;

  while (last === 0) {
    last = reader.bits(1);
    const type = reader.bits(2);

    if (type === 0) {
      const length = reader.word();
      const complement = reader.word();

      if ((length ^ 0xffff) !== complement) {
        throw new InflateError("A stored block whose length doesn't match its complement");
      }

      output.append(reader.bytes(length));
    } else if (type === 1) {
      inflateBlock(reader, output, FIXED_LITERALS, FIXED_DISTANCES);
    } else if (type === 2) {
      const [literals, distances] = readDynamicCodes(reader);
      inflateBlock(reader, output, literals, distances);
    } else {
      throw new InflateError('A block of an unknown type');
    }
  }

  return output.bytes.subarray(0, output.length);
};

const readDynamicCodes = (reader: BitReader): [HuffmanCode, HuffmanCode] => {
  const literalCount = reader.bits(5) + 257;
  const distanceCount = reader.bits(5) + 1;
  const codeLengthCount = reader.bits(4) + 4;

  if (literalCount > 286 || distanceCount > 30) {
    throw new InflateError('A block with more codes than deflate has');
  }

  const codeLengths = new Uint8Array(19);

  for (let index = 0; index < codeLengthCount; index++) {
    codeLengths[CODE_LENGTH_ORDER[index]] = reader.bits(3);
  }

  const codeLengthCode = buildCode(codeLengths);
  const lengths = new Uint8Array(literalCount + distanceCount);
  let index = 0;

  while (index < lengths.length) {
    const symbol = reader.decode(codeLengthCode);

    if (symbol < 16) {
      lengths[index++] = symbol;
      continue;
    }

    let repeat: number;
    let value = 0;

    if (symbol === 16) {
      if (index === 0) {
        throw new InflateError('A repeat with nothing before it');
      }

      value = lengths[index - 1];
      repeat = 3 + reader.bits(2);
    } else if (symbol === 17) {
      repeat = 3 + reader.bits(3);
    } else {
      repeat = 11 + reader.bits(7);
    }

    if (index + repeat > lengths.length) {
      throw new InflateError('Code lengths that run past their table');
    }

    lengths.fill(value, index, index + repeat);
    index += repeat;
  }

  if (lengths[256] === 0) {
    throw new InflateError('A block with no code for its end');
  }

  return [buildCode(lengths.subarray(0, literalCount)), buildCode(lengths.subarray(literalCount))];
};

const inflateBlock = (reader: BitReader, output: Output, literals: HuffmanCode, distances: HuffmanCode): void => {
  for (;;) {
    const symbol = reader.decode(literals);

    if (symbol < 256) {
      output.push(symbol);
    } else if (symbol === 256) {
      return;
    } else {
      const lengthIndex = symbol - 257;

      if (lengthIndex >= LENGTH_BASES.length) {
        throw new InflateError('A length code deflate has no length for');
      }

      const length = LENGTH_BASES[lengthIndex] + reader.bits(LENGTH_EXTRA_BITS[lengthIndex]);
      const distanceSymbol = reader.decode(distances);

      if (distanceSymbol >= DISTANCE_BASES.length) {
        throw new InflateError('A distance code deflate has no distance for');
      }

      output.copy(DISTANCE_BASES[distanceSymbol] + reader.bits(DISTANCE_EXTRA_BITS[distanceSymbol]), length);
    }
  }
};

let crcTable: Uint32Array | null = null;

/** The CRC-32 zip files check their entries with. */
export const crc32 = (bytes: Uint8Array): number => {
  if (!crcTable) {
    crcTable = new Uint32Array(256);

    for (let index = 0; index < 256; index++) {
      let value = index;

      for (let bit = 0; bit < 8; bit++) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }

      crcTable[index] = value >>> 0;
    }
  }

  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
};
