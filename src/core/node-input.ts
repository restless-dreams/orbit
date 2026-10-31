/**
 * What `addNode` and `updateNode` take, read as the parsers read a file: the
 * format's shorthands work here too (a picture, video, sound or embed as its
 * address, a live photo's motion as its own, tags as `'web, mobile'`, a type
 * as `'task@2'`), and a value Orbit can't read throws a `TypeError` that
 * says what it takes, before anything in the tree changes.
 */

import type { OrbitNodeInput } from './types.js';
import { isPaletteNumber } from './branch-colors.js';

const TRUE_WORDS = new Set(['true', 'yes', 'on', '1']);
const FALSE_WORDS = new Set(['false', 'no', 'off', '0']);

/** An address to show in an error, for each kind of file. */
const MEDIA_EXAMPLES: Record<string, string> = {
  image: "'summit.jpg'",
  video: "'talk.mp4'",
  audio: "'memo.m4a'",
  embed: "'https://example.com'",
};

/** A value as an error message names it: `"done"`, `42`, `null`, `a list`, `an object`. */
const described = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'a list';
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  return typeof value === 'object' ? 'an object' : String(value);
};

const refuse = (key: string, takes: string, example: string, got: string): never => {
  throw new TypeError(`A node's ${key} is ${takes}, like { ${key}: ${example} }, but got ${got}.`);
};

/** A value Orbit reads as text: a string, or a number or true/false. */
const scalar = (value: unknown): string | undefined => {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isAddress = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim() !== '';
};

/** A number written as a number or as digits, as the parsers read one. */
const numeric = (value: unknown): number => {
  return typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : Number.NaN;
};

/**
 * A picture, video, sound or embed: its address alone becomes `{ src }`, and
 * an object stays itself, so editing keeps the fields Orbit doesn't read. Its
 * text fields have to be text, and a picture's motion an address or an
 * object with one.
 */
const media = (key: string, value: unknown, textFields: readonly string[]): object => {
  if (isAddress(value)) {
    return { src: value.trim() };
  }

  if (!isRecord(value) || !isAddress(value.src)) {
    return refuse(key, 'an address, or an object with a src', MEDIA_EXAMPLES[key], isRecord(value) ? 'an object without a src' : described(value));
  }

  for (const field of textFields) {
    if (value[field] !== undefined && scalar(value[field]) === undefined) {
      refuse(`${key}'s ${field}`, 'text', "'The summit at dawn'", described(value[field]));
    }
  }

  const motion = key === 'image' ? value.motion : undefined;

  if (motion !== undefined && !isAddress(motion) && !(isRecord(motion) && isAddress(motion.src))) {
    refuse("image's motion", 'an address, or an object with a src', "'summit-motion.mp4'", isRecord(motion) ? 'an object without a src' : described(motion));
  }

  return value;
};

/** `changes` with each attribute read as the parsers read it. Throws for one Orbit can't read. */
export const readNodeInput = (changes: OrbitNodeInput): OrbitNodeInput => {
  const read: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(changes)) {
    // Undefined removes the attribute.
    if (value === undefined) {
      read[key] = undefined;
      continue;
    }

    switch (key) {
      case 'text':
      case 'note': {
        read[key] = scalar(value) ?? refuse(key, 'text', key === 'text' ? "'Budget'" : "'Remember the tickets.'", described(value));
        break;
      }
      case 'icon':
      case 'color':
      case 'status':
      case 'link': {
        const examples: Record<string, string> = { icon: "'🌿'", color: "'#E5484D'", status: "'done'", link: "'https://example.com'" };
        read[key] = scalar(value) ?? refuse(key, 'one value', examples[key], described(value));
        break;
      }
      case 'paletteColor': {
        const number = numeric(value);
        read.paletteColor = isPaletteNumber(number) ? number : refuse(key, 'a whole number from 1', '3', described(value));
        break;
      }
      case 'priority': {
        const number = numeric(value);
        read.priority = Number.isFinite(number) ? number : refuse(key, 'a number', '1', described(value));
        break;
      }
      case 'tags': {
        // A single value may list several, as files write them: `tags: web, mobile`.
        const words = Array.isArray(value) ? value.map(scalar) : scalar(value)?.split(',').map((tag) => tag.trim()).filter((tag) => tag !== '');
        read.tags = words && words.every((word) => word !== undefined) ? words : refuse(key, 'a list of words, or words separated by commas', "['web', 'mobile']", described(value));
        break;
      }
      case 'collapsed': {
        const word = scalar(value)?.toLowerCase() ?? '';
        read.collapsed = TRUE_WORDS.has(word) || FALSE_WORDS.has(word) ? TRUE_WORDS.has(word) : refuse(key, 'true or false', 'true', described(value));
        break;
      }
      case 'noteFormat': {
        read.noteFormat = value === 'markdown' || value === 'plain' ? value : refuse(key, "'markdown' or 'plain'", "'plain'", described(value));
        break;
      }
      case 'type': {
        const text = scalar(value)?.trim() || refuse(key, 'one word', "'goal'", described(value));
        // `task@2`: the version of the type the node was written for, as the parsers read it.
        const versioned = /^(.*\S)@(\d+)$/.exec(text);
        read.type = versioned ? versioned[1] : text;

        if (versioned && changes.typeVersion === undefined) {
          read.typeVersion = Number(versioned[2]);
        }

        break;
      }
      case 'typeVersion': {
        const number = numeric(value);
        read.typeVersion = Number.isInteger(number) && number >= 1 ? number : refuse(key, 'a whole number from 1', '2', described(value));
        break;
      }
      case 'image': {
        read.image = media(key, value, ['alt', 'caption']);
        break;
      }
      case 'video': {
        read.video = media(key, value, ['provider', 'thumbnail', 'caption']);
        break;
      }
      case 'audio':
      case 'embed': {
        read[key] = media(key, value, ['caption']);
        break;
      }
      case 'attrs': {
        read.attrs = isRecord(value) ? value : refuse(key, 'an object of attributes', "{ owner: 'Ana' }", described(value));
        break;
      }
      default: {
        read[key] = value;
      }
    }
  }

  return read as OrbitNodeInput;
};
