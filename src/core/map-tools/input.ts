/**
 * What each map tool takes, written once: as the JSON Schema a model reads,
 * and as the checks a call goes through before anything changes. The checks
 * forgive what models often send (a number as text, a list as words
 * separated by commas, null for a field they leave out, a field's usual
 * other name) and explain the rest in words a model can act on.
 */

import { suggest } from '../suggest.js';

export type FieldType = 'string' | 'integer' | 'number' | 'boolean' | 'list' | 'record';

export interface Field {
  type: FieldType;
  description: string;
  required?: boolean;

  /** The words a list takes. */
  values?: readonly string[];

  /** The smallest number it takes. */
  minimum?: number;

  /** A record's own fields. Text alone stands for the first one: a picture's address for `{ src }`. */
  fields?: Fields;
}

export type Fields = Record<string, Field>;

/** A property of a tool's input, as JSON Schema. */
export type MapToolProperty = {
  type: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  minimum?: number;
  items?: { type: 'string'; enum?: string[] };
  properties?: Record<string, MapToolProperty>;
  required?: string[];
};

/** A tool's input, as JSON Schema: an object with the tool's fields. */
export type MapToolSchema = {
  type: 'object';
  properties: Record<string, MapToolProperty>;
  required?: string[];
};

/** The JSON Schema for an object with `fields`. */
export const schemaOf = (fields: Fields): MapToolSchema => {
  const required = Object.keys(fields).filter((name) => fields[name].required);
  return {
    type: 'object',
    properties: Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, propertyOf(field)])),
    ...(required.length > 0 ? { required } : {}),
  };
};

const propertyOf = (field: Field): MapToolProperty => {
  if (field.type === 'list') {
    return { type: 'array', description: field.description, items: field.values ? { type: 'string', enum: [...field.values] } : { type: 'string' } };
  }

  if (field.type === 'record') {
    return { ...schemaOf(field.fields ?? {}), description: field.description };
  }

  return { type: field.type, description: field.description, ...(field.minimum === undefined ? {} : { minimum: field.minimum }) };
};

/** A call's input, read: its values, and the fields it gave that the tool doesn't take, which were left out. */
export interface ReadInput {
  values: Record<string, unknown>;
  ignored: string[];
}

/** Thrown with a message for the model when a call's input can't be used. */
export class InputError extends Error {}

/**
 * Reads a call's input for `tool`: an object, or the JSON text of one, as
 * OpenAI sends it. Null stands for a field left out. A field under another
 * name it often goes by (`synonyms`) counts as that field; one that looks
 * like a misspelled field is an error, so nothing changes by mistake; any
 * other is left out, and reported.
 */
export const readInput = (tool: string, fields: Fields, input: unknown, synonyms: Readonly<Record<string, string>> = {}): ReadInput => {
  const record = inputRecord(tool, fields, input);
  const values: Record<string, unknown> = {};
  const ignored: string[] = [];
  const names = Object.keys(fields);

  for (const [given, value] of Object.entries(record)) {
    if (value === null || value === undefined) {
      continue;
    }

    const name = owns(fields, given) ? given : synonymOf(given, names, synonyms);

    if (name === undefined) {
      const near = suggest(given, names);

      if (near !== undefined) {
        throw new InputError(`${tool} has no field "${given}". Did you mean "${near}"? It takes ${list(names)}.`);
      }

      ignored.push(given);
      continue;
    }

    if (owns(values, name)) {
      throw new InputError(`${tool} got ${name} twice, as "${name}" and as "${given}": give it once.`);
    }

    values[name] = readValue(name, fields[name], value);
  }

  for (const name of names) {
    if (fields[name].required && !owns(values, name)) {
      throw new InputError(`${tool} needs ${name}: ${lowerFirst(fields[name].description)}`);
    }
  }

  return { values, ignored };
};

const inputRecord = (tool: string, fields: Fields, input: unknown): Record<string, unknown> => {
  let value = input;

  if (typeof value === 'string') {
    if (value.trim() === '') {
      return {};
    }

    try {
      value = JSON.parse(value);
    } catch (error) {
      throw new InputError(`${tool}'s input isn't valid JSON (${(error as Error).message}). Send an object, like ${example(fields)}.`);
    }
  }

  if (value === null || value === undefined) {
    return {};
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new InputError(`${tool} takes an object, like ${example(fields)}, not ${describe(value)}.`);
  }

  return value as Record<string, unknown>;
};

/** The field `given` names in another case, or under another name it often goes by. */
const synonymOf = (given: string, names: readonly string[], synonyms: Readonly<Record<string, string>>): string | undefined => {
  const lowered = given.toLowerCase();
  return names.find((name) => name.toLowerCase() === lowered) ?? (owns(synonyms, lowered) ? synonyms[lowered] : undefined);
};

/** Whether `record` has `key` of its own, not one every object inherits, such as `constructor`. */
export const owns = (record: object, key: string): boolean => {
  return Object.prototype.hasOwnProperty.call(record, key);
};

const readValue = (name: string, field: Field, value: unknown): unknown => {
  switch (field.type) {
    case 'string':
      if (typeof value === 'string') {
        return value;
      }

      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }

      throw new InputError(`${name} takes text, not ${describe(value)}.`);
    case 'integer':
    case 'number': {
      const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;

      if (!Number.isFinite(number) || (field.type === 'integer' && !Number.isInteger(number))) {
        throw new InputError(`${name} takes ${field.type === 'integer' ? 'a whole number' : 'a number'}, like ${field.minimum ?? 1}, not ${describe(value)}.`);
      }

      if (field.minimum !== undefined && number < field.minimum) {
        throw new InputError(`${name} takes ${field.minimum} or more, not ${number}. ${field.description}`);
      }

      return number;
    }
    case 'boolean': {
      const word = typeof value === 'string' ? value.trim().toLowerCase() : value;

      if (word === true || word === 'true' || word === 'yes') {
        return true;
      }

      if (word === false || word === 'false' || word === 'no') {
        return false;
      }

      throw new InputError(`${name} takes true or false, not ${describe(value)}.`);
    }
    case 'list': {
      const items = Array.isArray(value) ? value : typeof value === 'string' ? (value.trim() === '' ? [] : value.split(',')) : null;

      if (!items || items.some((item) => typeof item !== 'string' && typeof item !== 'number')) {
        throw new InputError(`${name} takes a list of words, like ["${field.values?.[0] ?? 'design'}"], not ${describe(value)}.`);
      }

      const words = items.map((item) => String(item).trim()).filter((item) => item !== '');

      for (const word of words) {
        if (field.values && !field.values.includes(word)) {
          const near = suggest(word, field.values);
          throw new InputError(`${name} can't take "${word}".${near === undefined ? '' : ` Did you mean "${near}"?`} It takes ${list(field.values)}.`);
        }
      }

      return words;
    }
    case 'record': {
      const fields = field.fields ?? {};
      const first = Object.keys(fields)[0];

      if (typeof value === 'string') {
        return { [first]: value };
      }

      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new InputError(`${name} takes an object, like {"${first}": "…"}, not ${describe(value)}.`);
      }

      return readInput(name, fields, value).values;
    }
  }
};

/** A value, as an error message names it. */
export const describe = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'a list';
  }

  if (typeof value === 'string') {
    return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value);
  }

  if (typeof value === 'object') {
    return 'an object';
  }

  return String(value);
};

/** "a, b and c" */
export const list = (words: readonly string[]): string => {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
};

const example = (fields: Fields): string => {
  const name = Object.keys(fields).find((key) => fields[key].required) ?? Object.keys(fields)[0];
  return name === undefined ? '{}' : `{"${name}": "…"}`;
};

const lowerFirst = (text: string): string => {
  return text.charAt(0).toLowerCase() + text.slice(1);
};
