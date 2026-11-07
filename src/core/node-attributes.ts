import type { DiagnosticCollector } from './diagnostics.js';
import type { OrbitFile, OrbitNode } from './types.js';
import { isPaletteNumber } from './branch-colors.js';
import { DUE_FORMS, readDue } from './dates.js';
import { didYouMean } from './suggest.js';
import { assignKey } from './yaml-mini.js';

type ImageMedia = NonNullable<OrbitNode['image']>;
type VideoMedia = NonNullable<OrbitNode['video']>;
type EmbedMedia = NonNullable<OrbitNode['embed']>;
type AudioMedia = NonNullable<OrbitNode['audio']>;
type MotionMedia = NonNullable<ImageMedia['motion']>;

const VIDEO_PROVIDERS = new Set(['youtube', 'vimeo', 'native']);
const TRUE_VALUES = new Set(['true', 'yes', 'on', '1']);
const FALSE_VALUES = new Set(['false', 'no', 'off', '0']);

/** Fields of a picture, video, sound, embed or live photo's motion that Orbit doesn't read, kept to be written back. */
const MEDIA_EXTRAS = new WeakMap<object, Record<string, unknown>>();

/**
 * The fields a picture, video or embed was written with that Orbit doesn't
 * read (a `width`, a provider it doesn't know): kept so saving writes them
 * back, for a newer version or another app that reads them.
 */
export const mediaExtras = (media: object | undefined): Record<string, unknown> | undefined => {
  return media ? MEDIA_EXTRAS.get(media) : undefined;
};

/** A copy of a picture, video or embed, with the fields Orbit doesn't read: its own, and its motion's. */
export const copyMedia = <Media extends object>(media: Media): Media => {
  const copy = JSON.parse(JSON.stringify(media)) as Media;

  const keepFrom = (original: object, copied: object): void => {
    const extras = MEDIA_EXTRAS.get(original);

    if (extras) {
      MEDIA_EXTRAS.set(copied, JSON.parse(JSON.stringify(extras)) as Record<string, unknown>);
    }
  };

  keepFrom(media, copy);
  const motion = (media as { motion?: unknown }).motion;

  if (motion && typeof motion === 'object') {
    keepFrom(motion, (copy as { motion: object }).motion);
  }

  return copy;
};

/** Whether two media values are the same file: both have the same `src`. */
const sameFile = (a: unknown, b: unknown): boolean => {
  const src = (value: unknown): unknown => (value && typeof value === 'object' ? (value as { src?: unknown }).src : undefined);
  return typeof src(a) === 'string' && src(a) === src(b);
};

/** Gives `copied` the fields Orbit doesn't read of `original`, unless it has its own. */
const keepExtrasOf = (original: unknown, copied: unknown): void => {
  if (!original || typeof original !== 'object' || !copied || typeof copied !== 'object' || MEDIA_EXTRAS.has(copied)) {
    return;
  }

  const extras = MEDIA_EXTRAS.get(original);

  if (extras) {
    MEDIA_EXTRAS.set(copied, JSON.parse(JSON.stringify(extras)) as Record<string, unknown>);
  }
};

/**
 * A picture, video, sound or embed to set on a node: a copy of `value` that
 * keeps the fields Orbit doesn't read. A value read from a file, or a copy of
 * one, keeps its own. Any other value for the same file as the node's
 * `current` one keeps `current`'s, as when an app rebuilds a picture from the
 * fields it knows to change its caption. A live photo's motion keeps its
 * fields the same way, and one given as its address alone is read as
 * `{ src }`, as the parsers read it.
 */
export const mediaWithExtras = <Media extends object>(value: Media, current: unknown): Media => {
  const copy = copyMedia(value);
  const given = (copy as { motion?: unknown }).motion;

  if (typeof given === 'string') {
    (copy as { motion?: unknown }).motion = { src: given.trim() };
  }

  if (sameFile(copy, current)) {
    keepExtrasOf(current, copy);
  }

  const motion = (copy as { motion?: unknown }).motion;
  const currentMotion = current && typeof current === 'object' ? (current as { motion?: unknown }).motion : undefined;

  if (sameFile(motion, currentMotion)) {
    keepExtrasOf(currentMotion, motion);
  }

  return copy;
};

const keepExtras = (media: object, record: Record<string, unknown>, known: readonly string[]): void => {
  const extras = Object.fromEntries(Object.entries(record).filter(([key]) => !known.includes(key)));

  if (Object.keys(extras).length > 0) {
    MEDIA_EXTRAS.set(media, extras);
  }
};

/** The `src` of a media attribute: a URL string, or an object with a string `src`. */
const mediaRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === 'string' && value.trim() !== '') {
    return { src: value.trim() };
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;

    if (typeof record.src === 'string' && record.src.trim() !== '') {
      return record;
    }
  }

  return null;
};

const optionalString = (value: unknown): string | undefined => {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
};

/**
 * A live photo's motion: a URL, or `{ src, still }`. `still` is read when
 * it's a time, in seconds; anything else under it is kept as written, and so
 * are fields Orbit doesn't read.
 */
export const readMotion = (value: unknown): MotionMedia | undefined => {
  const record = mediaRecord(value);

  if (!record) {
    return undefined;
  }

  const motion: MotionMedia = { src: String(record.src) };
  const still = typeof record.still === 'number' && Number.isFinite(record.still) && record.still >= 0;

  if (still) {
    motion.still = record.still as number;
  }

  keepExtras(motion, record, still ? ['src', 'still'] : ['src']);
  return motion;
};

/**
 * A live photo's motion as the writers write it: its address alone when
 * that's all it has, else its fields, with the ones Orbit doesn't read after
 * its own.
 */
export const motionValue = (motion: MotionMedia): string | Record<string, unknown> => {
  const extras = mediaExtras(motion);

  if (motion.still === undefined && extras === undefined) {
    return motion.src;
  }

  return { src: motion.src, ...(motion.still === undefined ? {} : { still: motion.still }), ...extras };
};

export const readImage = (value: unknown): ImageMedia | undefined => {
  const record = mediaRecord(value);

  if (!record) {
    return undefined;
  }

  const image: ImageMedia = { src: String(record.src) };
  // A motion that isn't a URL or `{ src }` stays with the picture's other fields, as written: older versions keep it so too.
  const motion = record.motion === undefined ? undefined : readMotion(record.motion);
  const alt = optionalString(record.alt);
  const caption = optionalString(record.caption);

  if (motion) {
    image.motion = motion;
  }

  if (alt !== undefined) {
    image.alt = alt;
  }

  if (caption !== undefined) {
    image.caption = caption;
  }

  keepExtras(image, record, motion ? ['src', 'motion', 'alt', 'caption'] : ['src', 'alt', 'caption']);
  return image;
};

export const readVideo = (value: unknown): VideoMedia | undefined => {
  const record = mediaRecord(value);

  if (!record) {
    return undefined;
  }

  const video: VideoMedia = { src: String(record.src) };
  const knownProvider = typeof record.provider === 'string' && VIDEO_PROVIDERS.has(record.provider);

  if (knownProvider) {
    video.provider = record.provider as VideoMedia['provider'];
  }

  const thumbnail = optionalString(record.thumbnail);
  const caption = optionalString(record.caption);

  if (thumbnail !== undefined) {
    video.thumbnail = thumbnail;
  }

  if (caption !== undefined) {
    video.caption = caption;
  }

  // A provider Orbit doesn't know is played as a link, and kept as written.
  keepExtras(video, record, knownProvider ? ['src', 'provider', 'thumbnail', 'caption'] : ['src', 'thumbnail', 'caption']);
  return video;
};

/** A sound: a URL, or `{ src, caption }`. */
export const readAudio = (value: unknown): AudioMedia | undefined => {
  const record = mediaRecord(value);

  if (!record) {
    return undefined;
  }

  const audio: AudioMedia = { src: String(record.src) };
  const caption = optionalString(record.caption);

  if (caption !== undefined) {
    audio.caption = caption;
  }

  keepExtras(audio, record, ['src', 'caption']);
  return audio;
};

/**
 * One of an idea's files: an address, or `{ src, name, type, size }`. A
 * `size` that isn't a number of bytes, and fields Orbit doesn't read, are
 * kept as written.
 */
export const readFile = (value: unknown): OrbitFile | undefined => {
  const record = mediaRecord(value);

  if (!record) {
    return undefined;
  }

  const file: OrbitFile = { src: String(record.src) };
  const name = optionalString(record.name);
  const type = typeof record.type === 'string' && record.type.trim() !== '' ? record.type.trim() : undefined;
  const size = typeof record.size === 'number' && Number.isFinite(record.size) && record.size >= 0 ? record.size : undefined;
  const known = ['src'];

  if (name !== undefined) {
    file.name = name;
    known.push('name');
  }

  if (type !== undefined) {
    file.type = type;
    known.push('type');
  }

  if (size !== undefined) {
    file.size = size;
    known.push('size');
  }

  keepExtras(file, record, known);
  return file;
};

/**
 * An idea's files: a list of addresses or `{ src, name, type, size }`, or
 * one of them alone. Undefined when any of them isn't a file Orbit can read:
 * the whole value is then kept as written, so saving loses none of them.
 */
export const readFiles = (value: unknown): OrbitFile[] | undefined => {
  const entries = Array.isArray(value) ? value : [value];
  const files = entries.map(readFile);
  return files.every((file) => file !== undefined) ? files as OrbitFile[] : undefined;
};

/**
 * An idea's files as the writers write them: each with its fields, its
 * address first, as `src`, and the fields Orbit doesn't read after its own.
 * So each address is on a line of its own after `src: `, even one written
 * alone: apps that find a map's files by its text, as `media/…`, find it
 * there in either flavor.
 */
export const filesValue = (files: readonly OrbitFile[]): Record<string, unknown>[] => {
  return files.map((file) => ({
    src: file.src,
    ...(file.name === undefined ? {} : { name: file.name }),
    ...(file.type === undefined ? {} : { type: file.type }),
    ...(file.size === undefined ? {} : { size: file.size }),
    ...mediaExtras(file),
  }));
};

/**
 * Files to set on a node, read as a file's are: each given as its address
 * alone becomes `{ src }`, and each keeps the fields Orbit doesn't read of
 * the node's `current` file with the same address, unless it has its own.
 */
export const filesWithExtras = (given: readonly unknown[], current: unknown): OrbitFile[] => {
  const before = Array.isArray(current) ? current as unknown[] : [];

  return given.map((entry) => {
    // A file read from a file, or a copy of one, keeps its own fields Orbit doesn't read; any other is read as a file's.
    const file = entry && typeof entry === 'object' && MEDIA_EXTRAS.has(entry) ? copyMedia(entry as OrbitFile) : readFile(JSON.parse(JSON.stringify(entry)));

    if (!file) {
      throw new TypeError('A file needs an address.');
    }

    keepExtrasOf(before.find((earlier) => sameFile(earlier, file)), file);
    return file;
  });
};

export const readEmbed = (value: unknown): EmbedMedia | undefined => {
  const record = mediaRecord(value);

  if (!record) {
    return undefined;
  }

  const embed: EmbedMedia = { src: String(record.src) };
  const caption = optionalString(record.caption);

  if (caption !== undefined) {
    embed.caption = caption;
  }

  keepExtras(embed, record, ['src', 'caption']);
  return embed;
};

/** The attributes every node takes, in `<!-- orbit … -->` blocks and in YAML. */
export const NODE_ATTRIBUTE_KEYS = [
  'color', 'paletteColor', 'icon', 'status', 'priority', 'due', 'tags', 'collapsed', 'link',
  'note', 'noteFormat', 'image', 'video', 'audio', 'embed', 'files', 'caption', 'id', 'type',
] as const;

/**
 * Orbit's own attributes whose values a node's file wrote in a form Orbit
 * couldn't read, so they're kept in its `attrs` as written (a list for
 * `status`): a new value for one of them would replace what's there.
 */
export const unreadAttributes = (attrs: Record<string, unknown> | undefined): string[] => {
  return Object.keys(attrs ?? {}).filter((key) => key !== 'caption' && (NODE_ATTRIBUTE_KEYS as readonly string[]).includes(key));
};

/** Words people (and agents) reach for instead of an attribute's name. */
const ATTRIBUTE_SYNONYMS: Record<string, string> = {
  colour: 'color',
  emoji: 'icon',
  state: 'status',
  deadline: 'due',
  dueDate: 'due',
  due_date: 'due',
  tag: 'tags',
  labels: 'tags',
  url: 'link',
  href: 'link',
  img: 'image',
  picture: 'image',
  photo: 'image',
  youtube: 'video',
  sound: 'audio',
  voice: 'audio',
  recording: 'audio',
  iframe: 'embed',
  file: 'files',
  attachment: 'files',
  attachments: 'files',
  notes: 'note',
  description: 'note',
  details: 'note',
  collapse: 'collapsed',
  folded: 'collapsed',
  kind: 'type',
};

/** Keys a flavor accepts besides the node attributes, and the words that stand in for them. */
export interface AttributeVocabulary {
  keys: readonly string[];
  synonyms?: Readonly<Record<string, string>>;
}

/**
 * What `type` takes, said when its version is past the whole numbers a
 * number holds exactly (`Number.MAX_SAFE_INTEGER`), which would be written
 * back with other digits.
 */
export const TYPE_WITH_VERSION = `one word, with a version up to ${Number.MAX_SAFE_INTEGER}`;

/** A value Orbit reads as text: a string, or a number or true/false written without quotes. */
const scalar = (value: unknown): string | undefined => {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : undefined;
};

/**
 * A value Orbit can't read for one of its own attributes: a list where it
 * takes one word, a word where it takes a number. Reported, and kept in
 * `attrs` under its own name, so saving writes it back as it was written:
 * a newer version of Orbit, or another app, may read it.
 */
const keepUnread = (node: OrbitNode, key: string, value: unknown, diagnostics: DiagnosticCollector, line: number | undefined, expected: string): void => {
  diagnostics.recover('invalid-attributes', `${key} must be ${expected}; kept as written, but not used`, line);
  node.attrs ??= {};
  assignKey(node.attrs, key, value);
};

/**
 * A picture, video or embed without an address Orbit can read: reported, and
 * kept in `attrs` as written, as `keepUnread` keeps other values, so an edit
 * of its node doesn't lose it. A later format may write one Orbit can't read
 * yet, such as a picture with several sources.
 */
const keepWithoutSource = (node: OrbitNode, key: string, value: unknown, diagnostics: DiagnosticCollector, line: number | undefined): void => {
  diagnostics.recover('media-missing-source', `${key} needs a URL (or an object with a src); kept as written, but not shown`, line);
  node.attrs ??= {};
  assignKey(node.attrs, key, value);
};

/**
 * Applies one typed attribute (from a `<!-- orbit ... -->` block or a YAML
 * node map) to a node. Unknown keys are kept in `node.attrs`, with a note
 * when they look like a misspelled attribute. Values Orbit can't read are
 * reported and kept in `node.attrs` too, so they're written back.
 */
export const assignNodeAttribute = (
  node: OrbitNode,
  key: string,
  value: unknown,
  diagnostics: DiagnosticCollector,
  line?: number,
  vocabulary: AttributeVocabulary = { keys: [] },
): void => {
  switch (key) {
    case 'color':
    case 'icon':
    case 'status':
    case 'link': {
      const text = scalar(value);

      if (text === undefined) {
        keepUnread(node, key, value, diagnostics, line, 'one value');
      } else {
        node[key] = text;
      }

      return;
    }
    case 'paletteColor': {
      const paletteNumber = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : Number.NaN;

      if (isPaletteNumber(paletteNumber)) {
        node.paletteColor = paletteNumber;
      } else {
        keepUnread(node, key, value, diagnostics, line, 'a whole number from 1');
      }

      return;
    }
    case 'priority': {
      const priority = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : Number.NaN;

      if (Number.isFinite(priority)) {
        node.priority = priority;
      } else {
        keepUnread(node, key, value, diagnostics, line, 'a number');
      }

      return;
    }
    case 'due': {
      const due = readDue(value);

      // Kept as written otherwise, as a day that doesn't exist is: before Orbit read `due`, it was any app's own attribute.
      if (due === null) {
        keepUnread(node, key, value, diagnostics, line, DUE_FORMS);
      } else {
        node.due = due;
      }

      return;
    }
    case 'tags': {
      // Joins any hashtags from the title. A single value may list several, as `palette` does: `tags: web, mobile`.
      const single = Array.isArray(value) ? undefined : scalar(value);
      const tags = Array.isArray(value)
        ? value.map(scalar)
        : single === undefined ? [undefined] : single.split(',').map((tag) => tag.trim()).filter((tag) => tag !== '');

      if (tags.some((tag) => tag === undefined)) {
        keepUnread(node, key, value, diagnostics, line, 'a word or a list of words');
        return;
      }

      node.tags = [...new Set([...(node.tags ?? []), ...(tags as string[])])];
      return;
    }
    case 'collapsed': {
      const word = scalar(value)?.toLowerCase();

      if (word !== undefined && (TRUE_VALUES.has(word) || FALSE_VALUES.has(word))) {
        node.collapsed = TRUE_VALUES.has(word);
      } else {
        keepUnread(node, key, value, diagnostics, line, 'true or false');
      }

      return;
    }
    case 'note': {
      const text = scalar(value);

      if (text === undefined) {
        keepUnread(node, key, value, diagnostics, line, 'text');
        return;
      }

      node.note = text;

      if (node.noteFormat === undefined) {
        node.noteFormat = 'markdown';
      }

      return;
    }
    case 'noteFormat':
      if (value === 'markdown' || value === 'plain') {
        node.noteFormat = value;
      } else {
        keepUnread(node, key, value, diagnostics, line, '"markdown" or "plain"');
      }

      return;
    case 'id': {
      const text = scalar(value);

      if (text === undefined || text.trim() === '') {
        keepUnread(node, key, value, diagnostics, line, 'one word');
      } else {
        node.id = text;
      }

      return;
    }
    case 'type': {
      const text = scalar(value);

      if (text === undefined) {
        keepUnread(node, key, value, diagnostics, line, 'one word');
        return;
      }

      // `task@2`: the version of the type the node was written for.
      const versioned = /^(.*\S)@(\d+)$/.exec(text.trim());
      const version = versioned ? Number(versioned[2]) : undefined;

      // A version past the whole numbers a number holds exactly would be written back with other digits: kept as written.
      if (version !== undefined && !Number.isSafeInteger(version)) {
        keepUnread(node, key, value, diagnostics, line, TYPE_WITH_VERSION);
        return;
      }

      node.type = versioned ? versioned[1] : text.trim();

      if (version !== undefined) {
        node.typeVersion = version;
      }

      return;
    }
    case 'image': {
      const image = readImage(value);

      if (image) {
        node.image = image;
      } else {
        keepWithoutSource(node, key, value, diagnostics, line);
      }

      return;
    }
    case 'video': {
      const video = readVideo(value);

      if (video) {
        node.video = video;
      } else {
        keepWithoutSource(node, key, value, diagnostics, line);
      }

      return;
    }
    case 'audio': {
      const audio = readAudio(value);

      // A value that isn't a sound is kept as written: before Orbit read `audio`, it was any app's own attribute.
      if (audio) {
        node.audio = audio;
      } else {
        keepUnread(node, key, value, diagnostics, line, 'a URL, or an object with a src');
      }

      return;
    }
    case 'files': {
      const files = readFiles(value);

      // Kept as written otherwise: before Orbit read `files`, it was any app's own attribute.
      if (files) {
        node.files = files;
      } else {
        keepUnread(node, key, value, diagnostics, line, 'a list of addresses, or of objects with a src');
      }

      return;
    }
    case 'embed': {
      const embed = readEmbed(value);

      if (embed) {
        node.embed = embed;
      } else {
        keepWithoutSource(node, key, value, diagnostics, line);
      }

      return;
    }
    case 'caption': {
      // Never a sound's: its caption is in its own value, so older versions, which keep `audio` as a custom attribute, read a caption as this does.
      const target = node.video ?? node.embed ?? node.image;

      if (target) {
        if (value !== null && value !== undefined) {
          target.caption = String(value);
        }
      } else {
        diagnostics.note('caption-without-media', 'caption kept, but not shown: the node has no image, video or embed', line);
        node.attrs ??= {};
        node.attrs.caption = value;
      }

      return;
    }
    default: {
      const hint = didYouMean(key, [...NODE_ATTRIBUTE_KEYS, ...vocabulary.keys], { ...ATTRIBUTE_SYNONYMS, ...vocabulary.synonyms });

      if (hint) {
        diagnostics.note('unknown-attribute', `Unknown attribute "${key}", kept as a custom attribute.${hint}`, line);
      }

      if (!node.attrs) {
        node.attrs = {};
      }

      assignKey(node.attrs, key, value);
    }
  }
};
