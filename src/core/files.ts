/**
 * What Orbit shows of an idea's files without opening them: each one's
 * name, kind and size, and its icon.
 */

import type { OrbitFile, OrbitNode } from './types.js';
import type { IconName } from './ui/icons.js';
import type { OrbitWords } from './languages.js';

/** The kinds of file Orbit tells apart, each with its own icon and word. */
export type FileKind = 'pdf' | 'document' | 'spreadsheet' | 'presentation' | 'image' | 'video' | 'audio' | 'archive' | 'text' | 'other';

/** Kinds by extension, for files whose type doesn't say. */
const EXTENSIONS: Record<string, FileKind> = {
  pdf: 'pdf',
  doc: 'document',
  docx: 'document',
  odt: 'document',
  rtf: 'document',
  pages: 'document',
  xls: 'spreadsheet',
  xlsx: 'spreadsheet',
  ods: 'spreadsheet',
  csv: 'spreadsheet',
  tsv: 'spreadsheet',
  numbers: 'spreadsheet',
  ppt: 'presentation',
  pptx: 'presentation',
  odp: 'presentation',
  key: 'presentation',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  avif: 'image',
  heic: 'image',
  heif: 'image',
  bmp: 'image',
  svg: 'image',
  tif: 'image',
  tiff: 'image',
  mp4: 'video',
  m4v: 'video',
  mov: 'video',
  webm: 'video',
  mkv: 'video',
  avi: 'video',
  mp3: 'audio',
  m4a: 'audio',
  aac: 'audio',
  ogg: 'audio',
  oga: 'audio',
  opus: 'audio',
  wav: 'audio',
  flac: 'audio',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  gz: 'archive',
  tgz: 'archive',
  tar: 'archive',
  bz2: 'archive',
  xz: 'archive',
  txt: 'text',
  md: 'text',
  markdown: 'text',
};

/** Kinds by the start of a media type, after the exact ones below. */
const TYPE_FAMILIES: [string, FileKind][] = [['image/', 'image'], ['video/', 'video'], ['audio/', 'audio'], ['text/csv', 'spreadsheet'], ['text/', 'text']];

/** Kinds by whole media type. */
const TYPES: Record<string, FileKind> = {
  'application/pdf': 'pdf',
  'application/msword': 'document',
  'application/rtf': 'document',
  'application/vnd.oasis.opendocument.text': 'document',
  'application/vnd.ms-excel': 'spreadsheet',
  'application/vnd.oasis.opendocument.spreadsheet': 'spreadsheet',
  'application/vnd.ms-powerpoint': 'presentation',
  'application/vnd.oasis.opendocument.presentation': 'presentation',
  'application/zip': 'archive',
  'application/x-zip-compressed': 'archive',
  'application/x-7z-compressed': 'archive',
  'application/vnd.rar': 'archive',
  'application/x-rar-compressed': 'archive',
  'application/gzip': 'archive',
  'application/x-tar': 'archive',
};

/** Office's own types, which name their kind in the middle. */
const OFFICE = /^application\/vnd\.openxmlformats-officedocument\.(wordprocessingml|spreadsheetml|presentationml)\./;
const OFFICE_KINDS: Record<string, FileKind> = { wordprocessingml: 'document', spreadsheetml: 'spreadsheet', presentationml: 'presentation' };

/** The icon each kind of file shows. */
export const FILE_ICONS: Record<FileKind, IconName> = {
  pdf: 'file-pdf',
  document: 'file-document',
  spreadsheet: 'file-spreadsheet',
  presentation: 'file-presentation',
  image: 'image',
  video: 'video',
  audio: 'audio',
  archive: 'file-archive',
  text: 'file-document',
  other: 'file',
};

/** The words that name each kind of file. */
const KIND_WORDS = {
  pdf: 'filePdf',
  document: 'fileDocument',
  spreadsheet: 'fileSpreadsheet',
  presentation: 'filePresentation',
  image: 'fileImage',
  video: 'fileVideo',
  audio: 'fileAudio',
  archive: 'fileArchive',
  text: 'fileText',
  other: 'fileOther',
} as const satisfies Record<FileKind, string>;

/** The files a node has: none when it has none. */
export const nodeFiles = (node: OrbitNode): readonly OrbitFile[] => {
  return node.files?.filter((file) => typeof file.src === 'string' && file.src.trim() !== '') ?? [];
};

/** The last part of an address's path, as its letters read: `media/Q3%20report.pdf` is `Q3 report.pdf`. */
const lastPart = (src: string): string => {
  const path = src.split(/[?#]/)[0].replace(/\/+$/, '');
  const last = path.slice(path.lastIndexOf('/') + 1);

  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
};

/** A file's name as people know it: its `name`, else the last part of its address. */
export const fileName = (file: OrbitFile): string => {
  const name = file.name?.trim();
  return name || lastPart(file.src) || file.src;
};

/** A file's extension, in lower case: from its name, else its address. Empty without one. */
const extensionOf = (file: OrbitFile): string => {
  for (const name of [file.name ?? '', lastPart(file.src)]) {
    const dot = name.lastIndexOf('.');

    if (dot > 0 && dot < name.length - 1) {
      return name.slice(dot + 1).toLowerCase();
    }
  }

  return '';
};

/** What kind of file it is: by its type, else by its extension. */
export const fileKind = (file: OrbitFile): FileKind => {
  const type = file.type?.trim().toLowerCase().split(';')[0] ?? '';
  const office = OFFICE.exec(type);

  if (office) {
    return OFFICE_KINDS[office[1]];
  }

  if (TYPES[type]) {
    return TYPES[type];
  }

  const family = TYPE_FAMILIES.find(([start]) => type.startsWith(start));
  return family ? family[1] : EXTENSIONS[extensionOf(file)] ?? 'other';
};

/**
 * The word for a file's kind, in the map's language: "PDF", "Spreadsheet".
 * A kind Orbit doesn't name is its extension in capitals ("EPUB"), else
 * "File".
 */
export const fileKindName = (file: OrbitFile, words: OrbitWords): string => {
  const kind = fileKind(file);
  const extension = extensionOf(file);

  if (kind === 'other' && /^[a-z0-9]{1,6}$/.test(extension)) {
    return extension.toUpperCase();
  }

  return words.text(KIND_WORDS[kind]);
};

/** What the sheet and prints say under a file's name: its kind, and its size when it has one ("PDF · 48 kB"). */
export const fileFacts = (file: OrbitFile, words: OrbitWords): string => {
  const size = file.size === undefined ? '' : words.fileSize(file.size);
  return [fileKindName(file, words), size].filter(Boolean).join(' · ');
};
