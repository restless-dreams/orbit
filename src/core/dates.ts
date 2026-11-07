/**
 * An idea's date: the `due` attribute, a day (`2026-11-20`) or a day and a
 * time of day (`2026-11-20 09:30`). It's local time, with no time zone: 9:30
 * means 9:30 wherever the map is read, as a date in a paper diary does.
 */

/** An idea's date, as Orbit reads its `due` attribute: a day, and a time of day when it has one. */
export interface OrbitDue {
  year: number;

  /** From 1 (January) to 12. */
  month: number;

  /** From 1 to the month's last day. */
  day: number;

  /** The hour, from 0 to 23, when the date has a time. */
  hours?: number;

  /** The minutes past the hour, when the date has a time. */
  minutes?: number;
}

/**
 * A date as people and apps write one: a year of four figures, a month and
 * a day, and optionally a time after a space or a `T` (as ISO 8601 writes
 * it), hours and minutes. Seconds and time zones aren't part of it.
 */
const WRITTEN_DUE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:(?:[Tt]|[ \t]+)(\d{1,2}):(\d{2}))?$/;

/** What `due` takes, for messages that say what's wrong with one. */
export const DUE_FORMS = 'a date, like 2026-11-20, or a date and a time, like 2026-11-20 09:30';

const daysIn = (year: number, month: number): number => {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

/**
 * Reads a `due` value: `2026-11-20`, or `2026-11-20 09:30` (or
 * `2026-11-20T09:30`, as programs write it; a single figure for the month,
 * day or hour works too). Null for anything else, and for a day or a time
 * that doesn't exist, such as February 30th or 24:00.
 */
export const parseDue = (value: unknown): OrbitDue | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const written = WRITTEN_DUE.exec(value.trim());

  if (!written) {
    return null;
  }

  const year = Number(written[1]);
  const month = Number(written[2]);
  const day = Number(written[3]);

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysIn(year, month)) {
    return null;
  }

  if (written[4] === undefined) {
    return { year, month, day };
  }

  const hours = Number(written[4]);
  const minutes = Number(written[5]);

  if (hours > 23 || minutes > 59) {
    return null;
  }

  return { year, month, day, hours, minutes };
};

const twoFigures = (value: number): string => {
  return String(value).padStart(2, '0');
};

/** A date as Orbit writes it: `2026-11-20`, or `2026-11-20 09:30` with its time. */
export const dueText = (due: OrbitDue): string => {
  const day = `${String(due.year).padStart(4, '0')}-${twoFigures(due.month)}-${twoFigures(due.day)}`;
  return due.hours === undefined ? day : `${day} ${twoFigures(due.hours)}:${twoFigures(due.minutes ?? 0)}`;
};

/** A `due` value in Orbit's own form, or null when it isn't a date (see `parseDue`). */
export const readDue = (value: unknown): string | null => {
  const due = parseDue(value);
  return due ? dueText(due) : null;
};

/** A local time on a day, any year (`new Date` reads years under 100 as 19xx). */
const localTime = (year: number, month: number, day: number, hours = 0, minutes = 0): Date => {
  const time = new Date(2000, month - 1, day, hours, minutes);
  time.setFullYear(year, month - 1, day);
  return time;
};

/** When a date comes, in local time: its time, or the start of its day. */
export const dueStart = (due: OrbitDue): Date => {
  return localTime(due.year, due.month, due.day, due.hours, due.minutes);
};

/** When a date is past, in local time: its time, or the end of its day, when the next one starts. */
export const dueEnd = (due: OrbitDue): Date => {
  return due.hours === undefined ? localTime(due.year, due.month, due.day + 1) : dueStart(due);
};

/** Whole days from `now`'s day to the date's, in local time: 0 today, 1 tomorrow, -1 yesterday. */
export const daysUntil = (due: OrbitDue, now: Date): number => {
  // Noon on both days, so a day an hour shorter or longer for daylight saving still counts as one.
  const day = localTime(due.year, due.month, due.day, 12).getTime();
  const today = localTime(now.getFullYear(), now.getMonth() + 1, now.getDate(), 12).getTime();
  return Math.round((day - today) / 86_400_000);
};

/** Whether a date is past at `now`: its day is over, or its time has come. */
export const isPast = (due: OrbitDue, now: Date): boolean => {
  return now.getTime() >= dueEnd(due).getTime();
};

/** `due` values read once each: maps show their dates on every frame. */
const readDates = new Map<string, OrbitDue | null>();
const READ_DATES_LIMIT = 5000;

/** A node's date, read once for each value its `due` has; null without one. */
export const nodeDue = (due: string | undefined): OrbitDue | null => {
  if (due === undefined) {
    return null;
  }

  let read = readDates.get(due);

  if (read === undefined) {
    if (readDates.size >= READ_DATES_LIMIT) {
      readDates.clear();
    }

    read = parseDue(due);
    readDates.set(due, read);
  }

  return read;
};

/**
 * The next moment, after `now`, that the dates of `nodes` look different:
 * when one of them is past, or the next day starts and "Tomorrow" becomes
 * "Today". Null when no node has a date.
 */
export const nextDateChange = (dates: Iterable<OrbitDue>, now: Date): Date | null => {
  let next: number | null = null;

  for (const due of dates) {
    const end = dueEnd(due).getTime();

    if (next === null) {
      next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    }

    if (end > now.getTime() && end < next) {
      next = end;
    }
  }

  return next === null ? null : new Date(next);
};

/**
 * Whether an idea's date is overdue at `now`: past, while the idea isn't
 * done. `done` says which statuses are (the map's own words included: see
 * `MapExtensions.status`).
 */
export const isOverdue = (due: OrbitDue, status: string | undefined, now: Date, done: (status: string) => boolean): boolean => {
  return isPast(due, now) && !(status !== undefined && done(status));
};

/** Every date in the tree under `root`, `root`'s own included. */
export const datesIn = (root: { due?: string; children: readonly { due?: string; children: readonly unknown[] }[] }): OrbitDue[] => {
  const dates: OrbitDue[] = [];

  const visit = (node: { due?: string; children: readonly unknown[] }): void => {
    const due = nodeDue(node.due);

    if (due) {
      dates.push(due);
    }

    for (const child of node.children) {
      visit(child as { due?: string; children: readonly unknown[] });
    }
  };

  visit(root);
  return dates;
};
