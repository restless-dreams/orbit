import type { DiagnosticCollector } from './diagnostics.js';
import type { OrbitNode } from './types.js';
import { didYouMean } from './suggest.js';
import { assignKey } from './yaml-mini.js';

type ImageMedia = NonNullable<OrbitNode['image']>;
type VideoMedia = NonNullable<OrbitNode['video']>;
type EmbedMedia = NonNullable<OrbitNode['embed']>;

const VIDEO_PROVIDERS = new Set(['youtube', 'vimeo', 'native']);
const TRUE_VALUES = new Set(['true', 'yes', 'on', '1']);
const FALSE_VALUES = new Set(['false', 'no', 'off', '0']);

/** Fields of a picture, video or embed that Orbit doesn't read, kept to be written back. */
const MEDIA_EXTRAS = new WeakMap<object, Record<string, unknown>>();

/**
 * The fields a picture, video or embed was written with that Orbit doesn't
 * read (a `width`, a provider it doesn't know): kept so saving writes them
 * back, for a newer version or another app that reads them.
 */
export const mediaExtras = (media: object | undefined): Record<string, unknown> | undefined => {
  return media ? MEDIA_EXTRAS.get(media) : undefined;
};

/** A copy of a picture, video or embed, with the fields Orbit doesn't read. */
export const copyMedia = <Media extends object>(media: Media): Media => {
  const copy = JSON.parse(JSON.stringify(media)) as Media;
  const extras = MEDIA_EXTRAS.get(media);

  if (extras) {
    MEDIA_EXTRAS.set(copy, JSON.parse(JSON.stringify(extras)) as Record<string, unknown>);
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

export const readImage = (value: unknown): ImageMedia | undefined => {
  const record = mediaRecord(value);

  if (!record) {
    return undefined;
  }

  const image: ImageMedia = { src: String(record.src) };
  const alt = optionalString(record.alt);
  const caption = optionalString(record.caption);

  if (alt !== undefined) {
    image.alt = alt;
  }

  if (caption !== undefined) {
    image.caption = caption;
  }

  keepExtras(image, record, ['src', 'alt', 'caption']);
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
  'color', 'icon', 'status', 'priority', 'tags', 'collapsed', 'link',
  'note', 'noteFormat', 'image', 'video', 'embed', 'caption', 'id', 'type',
] as const;

/** Words people (and agents) reach for instead of an attribute's name. */
const ATTRIBUTE_SYNONYMS: Record<string, string> = {
  colour: 'color',
  emoji: 'icon',
  state: 'status',
  tag: 'tags',
  labels: 'tags',
  url: 'link',
  href: 'link',
  img: 'image',
  picture: 'image',
  photo: 'image',
  youtube: 'video',
  iframe: 'embed',
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
    case 'priority': {
      const priority = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : Number.NaN;

      if (Number.isFinite(priority)) {
        node.priority = priority;
      } else {
        keepUnread(node, key, value, diagnostics, line, 'a number');
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
      node.type = versioned ? versioned[1] : text.trim();

      if (versioned) {
        node.typeVersion = Number(versioned[2]);
      }

      return;
    }
    case 'image': {
      const image = readImage(value);

      if (image) {
        node.image = image;
      } else {
        diagnostics.recover('media-missing-source', 'image needs a URL (or an object with a src)', line);
      }

      return;
    }
    case 'video': {
      const video = readVideo(value);

      if (video) {
        node.video = video;
      } else {
        diagnostics.recover('media-missing-source', 'video needs a URL (or an object with a src)', line);
      }

      return;
    }
    case 'embed': {
      const embed = readEmbed(value);

      if (embed) {
        node.embed = embed;
      } else {
        diagnostics.recover('media-missing-source', 'embed needs a URL (or an object with a src)', line);
      }

      return;
    }
    case 'caption': {
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
