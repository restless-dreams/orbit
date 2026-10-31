/**
 * Names Orbit keeps working until 1.0 (see docs/compatibility.md): each says
 * once, the first time a page uses it, what to use instead.
 */

const warned = new Set<string>();

/** Warns once, the first time `name` is used, that `instead` replaces it. */
export const warnDeprecated = (name: string, instead: string): void => {
  if (warned.has(name)) {
    return;
  }

  warned.add(name);

  if (typeof console !== 'undefined') {
    console.warn(`[orbit] ${name} is deprecated: use ${instead}. It keeps working until Orbit 1.0.`);
  }
};

/**
 * `value` under the names Orbit reads now: a field set by its old name, one
 * of `renamed`'s keys, counts as the field it was renamed to unless that's
 * set too, and warns once (`where` names what it's a field of). The old
 * fields are left out of what's returned. Only fields set by hand count: a
 * parsed document's options answer to their old names through getters of
 * their own (`withOldNames`).
 */
export const withNewNames = <T extends object>(value: T, renamed: Readonly<Record<string, string>>, where: string): T => {
  let result: Record<string, unknown> | null = null;

  for (const [old, current] of Object.entries(renamed)) {
    const field = Object.getOwnPropertyDescriptor(value, old);

    if (!field || !('value' in field)) {
      continue;
    }

    result ??= { ...value } as Record<string, unknown>;
    delete result[old];

    if (field.value === undefined) {
      continue;
    }

    warnDeprecated(`${where} ${old}`, current);

    if (result[current] === undefined) {
      result[current] = field.value;
    }
  }

  return (result ?? value) as T;
};

/**
 * Lets `value` answer to the old names in `renamed` until 1.0, each read or
 * written as the field it was renamed to, with a warning, without showing
 * among its own fields (`Object.keys`, a spread or JSON leave them out).
 */
export const withOldNames = <T extends object>(value: T, renamed: Readonly<Record<string, string>>, where: string): T => {
  for (const [old, current] of Object.entries(renamed)) {
    Object.defineProperty(value, old, {
      configurable: true,
      enumerable: false,
      get(this: Record<string, unknown>) {
        warnDeprecated(`${where} ${old}`, current);
        return this[current];
      },
      set(this: Record<string, unknown>, next: unknown) {
        warnDeprecated(`${where} ${old}`, current);
        this[current] = next;
      },
    });
  }

  return value;
};
