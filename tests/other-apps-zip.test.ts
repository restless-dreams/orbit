import { describe, expect, test } from 'bun:test';
import { deflateRawSync, constants } from 'node:zlib';
import { crc32, inflate, InflateError } from '../src/core/other-apps/inflate';
import { isZip, ZipArchive, ZipError } from '../src/core/other-apps/zip';
import { makeZip } from './helpers/zip';

/** A seeded generator, so a failure repeats. */
const random = (seed: number): (() => number) => {
  let state = seed;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

/** Bytes as varied as maps are: runs, words, and noise. */
const sampleBytes = (next: () => number, length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  const words = ['idea', 'orbit', ' planet', '<node TEXT="', '"/>\n', 'moon', 'ñandú', '🚀'].map((word) => new TextEncoder().encode(word));
  let index = 0;

  while (index < length) {
    const choice = next();

    if (choice < 0.4) {
      const word = words[Math.floor(next() * words.length)];
      bytes.set(word.subarray(0, Math.min(word.length, length - index)), index);
      index += word.length;
    } else if (choice < 0.6) {
      const run = Math.floor(next() * 300);
      bytes.fill(Math.floor(next() * 256), index, Math.min(length, index + run));
      index += run;
    } else {
      bytes[index] = Math.floor(next() * 256);
      index += 1;
    }
  }

  return bytes;
};

describe('inflate', () => {
  test('reads what zlib deflates, at every level and strategy, for hundreds of inputs', () => {
    const next = random(42);
    const strategies = [constants.Z_DEFAULT_STRATEGY, constants.Z_FIXED, constants.Z_HUFFMAN_ONLY, constants.Z_RLE, constants.Z_FILTERED];

    for (let round = 0; round < 400; round++) {
      const length = round < 20 ? round : Math.floor(next() ** 3 * 200000);
      const input = sampleBytes(next, length);
      const level = Math.floor(next() * 10);
      const strategy = strategies[Math.floor(next() * strategies.length)];
      const deflated = new Uint8Array(deflateRawSync(input, { level, strategy }));
      const output = inflate(deflated, round % 2 === 0 ? { expected: input.length } : {});
      expect(output.length).toBe(input.length);
      expect(Buffer.from(output).equals(Buffer.from(input))).toBe(true);
    }
  });

  test('reads stored blocks, and data larger than a stored block holds', () => {
    const input = sampleBytes(random(7), 200000);
    const deflated = new Uint8Array(deflateRawSync(input, { level: 0 }));
    expect(Buffer.from(inflate(deflated)).equals(Buffer.from(input))).toBe(true);
  });

  test('refuses data that would unpack past its limit', () => {
    const bomb = new Uint8Array(deflateRawSync(new Uint8Array(10_000_000)));
    expect(bomb.length).toBeLessThan(20000);
    expect(() => inflate(bomb, { limit: 1_000_000 })).toThrow(InflateError);
    expect(() => inflate(bomb, { expected: 1000, limit: 1000 })).toThrow(/more than the 1000 bytes/);
  });

  test('refuses damaged data', () => {
    const deflated = new Uint8Array(deflateRawSync(sampleBytes(random(3), 5000)));
    expect(() => inflate(deflated.subarray(0, deflated.length / 2))).toThrow(InflateError);
    expect(() => inflate(Uint8Array.from([0x07]))).toThrow(/unknown type/);
    expect(() => inflate(Uint8Array.from([0x01, 0x05, 0x00, 0x00, 0x00]))).toThrow(/complement/);
    // A fixed block whose first code is a back reference: there's nothing before it to copy.
    expect(() => inflate(Uint8Array.from([0x03, 0x02]))).toThrow(InflateError);
  });

  test('checks entries the way zip does', () => {
    expect(crc32(new Uint8Array())).toBe(0);
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const bytes = sampleBytes(random(11), 50000);
    expect(crc32(bytes)).toBe(Bun.hash.crc32(bytes));
  });
});

describe('zip archives', () => {
  test('lists and reads stored and deflated files, folders left out', () => {
    const archive = new ZipArchive(makeZip([
      { name: 'content.json', data: '[{"title":"A"}]' },
      { name: 'resources/', data: '', stored: true },
      { name: 'resources/picture.png', data: Uint8Array.from([1, 2, 3, 4]), stored: true },
    ]));
    expect(archive.names).toEqual(['content.json', 'resources/picture.png']);
    expect(archive.has('resources/')).toBe(true);
    expect(archive.text('content.json')).toBe('[{"title":"A"}]');
    expect([...archive.read('resources/picture.png')!]).toEqual([1, 2, 3, 4]);
    expect(archive.read('missing.txt')).toBeNull();
  });

  test('knows a zip by its first bytes', () => {
    expect(isZip(makeZip([{ name: 'a', data: 'b' }]))).toBe(true);
    expect(isZip(new TextEncoder().encode('<opml/>'))).toBe(false);
    expect(isZip(new Uint8Array())).toBe(false);
  });

  test('reads an archive with a comment after its directory', () => {
    const zip = makeZip([{ name: 'a.txt', data: 'hello' }]);
    const comment = new TextEncoder().encode('made by a test');
    const withComment = new Uint8Array(zip.length + comment.length);
    withComment.set(zip);
    withComment.set(comment, zip.length);
    new DataView(withComment.buffer).setUint16(zip.length - 2, comment.length, true);
    expect(new ZipArchive(withComment).text('a.txt')).toBe('hello');
  });

  test('refuses what it can\'t read safely', () => {
    expect(() => new ZipArchive(new TextEncoder().encode('not a zip at all, just text'))).toThrow(/not a zip/);

    const truncated = makeZip([{ name: 'a.txt', data: 'hello' }]);
    expect(() => new ZipArchive(truncated.subarray(0, truncated.length - 30))).toThrow(ZipError);

    const encrypted = new ZipArchive(makeZip([{ name: 'content.xml', data: '<x/>', encrypted: true }]));
    expect(() => encrypted.read('content.xml')).toThrow(/encrypted/);

    const bzip = new ZipArchive(makeZip([{ name: 'content.xml', data: '<x/>', method: 12 }]));
    expect(() => bzip.read('content.xml')).toThrow(/method 12/);

    const damaged = makeZip([{ name: 'a.txt', data: 'hello hello hello', stored: true }]);
    damaged[30 + 'a.txt'.length] ^= 0xff;
    expect(() => new ZipArchive(damaged).read('a.txt')).toThrow(/checksum/);
  });

  test('stops at its limits: entries, the size of one, and the size of all', () => {
    const many = makeZip(Array.from({ length: 30 }, (_, index) => ({ name: `file-${index}.txt`, data: 'x' })));
    expect(() => new ZipArchive(many, { entries: 10 })).toThrow(/more than 10 files/);

    const big = new ZipArchive(makeZip([{ name: 'big.bin', data: new Uint8Array(5000) }]), { entrySize: 1000 });
    expect(() => big.read('big.bin')).toThrow(/too large/);

    const two = new ZipArchive(makeZip([{ name: 'a.bin', data: new Uint8Array(800) }, { name: 'b.bin', data: new Uint8Array(800) }]), { totalSize: 1000 });
    expect(two.read('a.bin')).toHaveLength(800);
    expect(() => two.read('b.bin')).toThrow(/too large/);
  });

  test('refuses an archive that needs ZIP64', () => {
    const zip = makeZip([{ name: 'a.txt', data: 'hello' }]);
    new DataView(zip.buffer).setUint32(zip.length - 6, 0xffffffff, true);
    expect(() => new ZipArchive(zip)).toThrow(/ZIP64/);
  });
});
