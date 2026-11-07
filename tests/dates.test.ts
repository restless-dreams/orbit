import { afterEach, beforeEach, describe, expect, setSystemTime, spyOn, test } from 'bun:test';
import { parseOrbit } from '../src/core/dispatch';
import { serializeOrbitMarkdown } from '../src/core/serializer-markdown';
import { serializeOrbitYAML } from '../src/core/serializer-yaml';
import { daysUntil, dueEnd, dueStart, dueText, nextDateChange, parseDue, readDue } from '../src/core/dates';
import { renderPrintLayout } from '../src/core/print-layout';
import { OrbitWords } from '../src/core/languages';
import { COUNT_HEIGHT, DATE_CHIP_INSET, insideLabelLayout, insideLabelReach } from '../src/core/engine/views';
import type { OrbitNode } from '../src/core/types';
import { createMapTools } from '../src/core/map-tools/tools';
import { internals, mount, node, onScreen, useMapSize } from './helpers/renderer';

useMapSize(600, 400);

const find = (root: OrbitNode, id: string): OrbitNode => {
  const visit = (current: OrbitNode): OrbitNode | undefined => (current.id === id ? current : current.children.map(visit).find(Boolean));
  const found = visit(root);

  if (!found) {
    throw new Error(`No node ${id}`);
  }

  return found;
};

const diagnosticsOf = (text: string): string[] => {
  return (parseOrbit(text).diagnostics ?? []).map((diagnostic) => `${diagnostic.severity} ${diagnostic.code} ${diagnostic.line ?? ''}`.trim());
};

describe('reading a date', () => {
  test('a day, or a day and a time of day', () => {
    expect(parseDue('2026-11-20')).toEqual({ year: 2026, month: 11, day: 20 });
    expect(parseDue('2026-11-20 09:30')).toEqual({ year: 2026, month: 11, day: 20, hours: 9, minutes: 30 });
    expect(parseDue(' 2026-11-20  09:30 ')).toEqual({ year: 2026, month: 11, day: 20, hours: 9, minutes: 30 });
  });

  test('as programs write it too: a T before the time, and single figures', () => {
    expect(parseDue('2026-11-20T09:30')).toEqual({ year: 2026, month: 11, day: 20, hours: 9, minutes: 30 });
    expect(parseDue('2026-1-5 9:05')).toEqual({ year: 2026, month: 1, day: 5, hours: 9, minutes: 5 });
    expect(readDue('2026-1-5T9:05')).toBe('2026-01-05 09:05');
  });

  test('never a day or a time that doesn’t exist, nor anything else', () => {
    for (const value of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-10', '2026-04-31', '2026-11-20 24:00', '2026-11-20 09:60', 'tomorrow', '20261120', '2026-11-20 9', '2026-11-20T09:30:00', '2026-11-20T09:30Z', '26-11-20', '', '2026/11/20']) {
      expect({ value, due: parseDue(value) }).toEqual({ value, due: null });
    }

    expect(parseDue(20261120)).toBeNull();
    expect(parseDue(null)).toBeNull();
    // Leap years are the Gregorian calendar's.
    expect(parseDue('2028-02-29')).not.toBeNull();
    expect(parseDue('2000-02-29')).not.toBeNull();
    expect(parseDue('2100-02-29')).toBeNull();
  });

  test('written in Orbit’s own form', () => {
    expect(dueText({ year: 2026, month: 3, day: 7 })).toBe('2026-03-07');
    expect(dueText({ year: 2026, month: 3, day: 7, hours: 8, minutes: 5 })).toBe('2026-03-07 08:05');
    expect(dueText({ year: 33, month: 3, day: 7 })).toBe('0033-03-07');
  });

  test('in local time: a day starts at midnight and is past when the next starts, a time when it comes', () => {
    const day = parseDue('2026-11-20')!;
    const time = parseDue('2026-11-20 09:30')!;
    expect(dueStart(day)).toEqual(new Date(2026, 10, 20));
    expect(dueEnd(day)).toEqual(new Date(2026, 10, 21));
    expect(dueStart(time)).toEqual(new Date(2026, 10, 20, 9, 30));
    expect(dueEnd(time)).toEqual(new Date(2026, 10, 20, 9, 30));
    expect(dueEnd(parseDue('2026-12-31')!)).toEqual(new Date(2027, 0, 1));
    // Years before 100 are those years, not 19xx.
    expect(dueStart(parseDue('0033-03-07')!).getFullYear()).toBe(33);
  });

  test('days from today, by the calendar', () => {
    const now = new Date(2026, 10, 20, 23, 59);
    expect(daysUntil(parseDue('2026-11-20')!, now)).toBe(0);
    expect(daysUntil(parseDue('2026-11-21 00:01')!, now)).toBe(1);
    expect(daysUntil(parseDue('2026-11-19')!, now)).toBe(-1);
    expect(daysUntil(parseDue('2027-11-20')!, now)).toBe(365);
  });
});

const TRIP = `# Trip
## Flights <!-- orbit due: 2026-11-20 -->
## Hotel <!-- orbit due: "2026-11-20 09:30" -->
## Museum
<!-- orbit
status: active
due: 2026-11-21T14:05
-->
- Tickets <!-- orbit due: 2026-2-3 7:00 -->
- Passport <!-- orbit due: 2026-02-30 -->
- Someday <!-- orbit due: next week -->
`;

describe('the due attribute', () => {
  test('is read in markdown, in Orbit’s own form', () => {
    const { root } = parseOrbit(TRIP);
    expect(find(root, 'flights').due).toBe('2026-11-20');
    expect(find(root, 'hotel').due).toBe('2026-11-20 09:30');
    expect(find(root, 'museum').due).toBe('2026-11-21 14:05');
    expect(find(root, 'tickets').due).toBe('2026-02-03 07:00');
  });

  test('a date that doesn’t exist, or anything else, is kept as written, reported, and not used', () => {
    const { root } = parseOrbit(TRIP);
    expect(find(root, 'passport').due).toBeUndefined();
    expect(find(root, 'passport').attrs).toEqual({ due: '2026-02-30' });
    expect(find(root, 'someday').attrs).toEqual({ due: 'next week' });
    expect(diagnosticsOf(TRIP)).toEqual(['warning invalid-attributes 10', 'warning invalid-attributes 11']);
    expect(parseOrbit(TRIP).diagnostics?.[0]?.message).toBe('due must be a date, like 2026-11-20, or a date and a time, like 2026-11-20 09:30; kept as written, but not used');
  });

  test('a map with dates writes back exactly, and the same in Orbit’s own markdown and YAML', () => {
    const document = parseOrbit(TRIP);
    expect(serializeOrbitMarkdown(document)).toBe(TRIP);

    const own = serializeOrbitMarkdown(document, { keepSource: false });
    expect(own).toContain('## Flights <!-- orbit due: "2026-11-20" -->');
    expect(own).toContain('## Museum <!-- orbit status: active, due: "2026-11-21 14:05" -->');
    expect(own).toContain('- Tickets <!-- orbit due: "2026-02-03 07:00" -->');
    // Kept as written.
    expect(own).toContain('- Passport <!-- orbit due: "2026-02-30" -->');
    expect(own).toContain('- Someday <!-- orbit due: next week -->');

    const yaml = serializeOrbitYAML(document);
    expect(yaml).toContain('      - text: Hotel\n        due: "2026-11-20 09:30"');

    for (const text of [own, yaml]) {
      const { root } = parseOrbit(text);
      expect(['flights', 'hotel', 'museum', 'tickets'].map((id) => find(root, id).due)).toEqual(['2026-11-20', '2026-11-20 09:30', '2026-11-21 14:05', '2026-02-03 07:00']);
      expect(find(root, 'someday').attrs).toEqual({ due: 'next week' });
    }
  });

  test('is read in YAML', () => {
    const { root, diagnostics } = parseOrbit('nodes:\n  - text: Trip\n    children:\n      - text: Flights\n        due: 2026-11-20 09:30\n      - text: Hotel\n        due: "2026-11-21"\n      - text: Bad\n        due: 2026\n');
    expect(find(root, 'flights').due).toBe('2026-11-20 09:30');
    expect(find(root, 'hotel').due).toBe('2026-11-21');
    expect(find(root, 'bad').attrs).toEqual({ due: 2026 });
    expect((diagnostics ?? []).map((diagnostic) => diagnostic.code)).toEqual(['invalid-attributes']);
  });

  test('comes after the attributes Orbit has always read, where versions from before dates write it', () => {
    const document = parseOrbit('# Plan\n## Launch <!-- orbit due: 2026-11-20, status: todo, priority: 1 -->\n');
    expect(serializeOrbitMarkdown(document, { keepSource: false })).toContain('## Launch <!-- orbit status: todo, priority: 1, due: "2026-11-20" -->');
    expect(serializeOrbitYAML(document)).toContain('        status: todo\n        priority: 1\n        due: "2026-11-20"');
  });

  test('a misnamed date says what it’s called', () => {
    const { diagnostics } = parseOrbit('# Plan\n## Launch <!-- orbit deadline: 2026-11-20 -->\n');
    expect(diagnostics?.map((diagnostic) => diagnostic.message)).toEqual(['Unknown attribute "deadline", kept as a custom attribute. Did you mean "due"?']);
  });
});

describe('setting a date', () => {
  test('updateNode sets it, in Orbit’s own form, and the file says so', () => {
    const { renderer: map } = mount(TRIP, { editable: true });
    map.updateNode('flights', { due: '2026-11-19T18:45' });
    expect(find(map.getDocument()!.root, 'flights').due).toBe('2026-11-19 18:45');
    expect(map.toMarkdown()).toContain('## Flights <!-- orbit due: "2026-11-19 18:45" -->');
    // Ideas it didn't change keep their lines.
    expect(map.toMarkdown()).toContain('- Tickets <!-- orbit due: 2026-2-3 7:00 -->');
  });

  test('undefined takes it off', () => {
    const { renderer: map } = mount(TRIP, { editable: true });
    map.updateNode('hotel', { due: undefined });
    expect(find(map.getDocument()!.root, 'hotel').due).toBeUndefined();
    expect(map.toMarkdown()).toContain('## Hotel\n');
  });

  test('a new one replaces one Orbit couldn’t read', () => {
    const { renderer: map } = mount(TRIP, { editable: true });
    map.updateNode('passport', { due: '2026-03-02' });
    expect(map.toMarkdown()).toContain('- Passport <!-- orbit due: "2026-03-02" -->');
  });

  test('addNode takes one too', () => {
    const { renderer: map } = mount(TRIP, { editable: true });
    const added = map.addNode('museum', { text: 'Guided tour', due: '2026-11-21 10:00' });
    expect(added?.due).toBe('2026-11-21 10:00');
    expect(map.toMarkdown()).toContain('- Guided tour <!-- orbit due: "2026-11-21 10:00" -->');
  });

  test('a date that isn’t one is refused, and the map stays as it was', () => {
    const { renderer: map } = mount(TRIP, { editable: true });
    const before = map.toMarkdown();

    for (const due of ['2026-02-30', 'tomorrow', 20261120, { date: '2026-11-20' }]) {
      expect(() => map.updateNode('flights', { due } as never)).toThrow(TypeError);
    }

    expect(() => map.updateNode('flights', { due: 'soon' })).toThrow('A node\'s due is a date, or a date and a time, like { due: \'2026-11-20 09:30\' }, but got "soon".');
    expect(map.toMarkdown()).toBe(before);
  });
});

describe('the map tools', () => {
  const PLAN = '# Launch\n## Research <!-- orbit due: 2026-11-20 -->\n## Build\n';

  test('models read an idea’s date, with its weekday', () => {
    const tools = createMapTools(PLAN);
    expect(tools.run('read_map').text).toContain('- Research  #research  (due: 2026-11-20)');
    expect(tools.run('read_node', { node_id: 'research' }).text).toContain('Date: 2026-11-20 (a Friday, in the reader\'s local time)');
  });

  test('update_node sets one, in Orbit’s own form, and clear takes it off', () => {
    const tools = createMapTools(PLAN);
    expect(tools.run('update_node', { node_id: 'build', due: '2026-11-27T14:00' }).text).toBe('Changed "Build" #build: set its date.');
    expect(tools.document!.root.children[1].due).toBe('2026-11-27 14:00');
    expect(tools.run('update_node', { node_id: 'build', deadline: '2026-11-28' }).text).toBe('Changed "Build" #build: set its date.');
    expect(tools.document!.root.children[1].due).toBe('2026-11-28');
    expect(tools.run('update_node', { node_id: 'research', clear: ['due'] }).text).toBe('Changed "Research" #research: removed its date.');
    expect(tools.document!.root.children[0].due).toBeUndefined();
  });

  test('a date that isn’t one changes nothing, and says what it takes', () => {
    const tools = createMapTools(PLAN);
    expect(tools.run('update_node', { node_id: 'build', due: '2026-02-30' }).text).toBe('"2026-02-30" isn\'t a date: give one such as 2026-11-20, or a date and a time such as 2026-11-20 09:30. A day that doesn\'t exist, such as February 30, can\'t be one. Nothing changed.');
    expect(tools.document!.root.children[1].due).toBeUndefined();
  });
});

describe('dates on the map', () => {
  // A Wednesday morning.
  const NOW = new Date(2026, 10, 18, 10, 0);

  beforeEach(() => {
    setSystemTime(NOW);
  });

  afterEach(() => {
    setSystemTime();
  });

  const PLAN = `# Plan
## Call <!-- orbit due: "2026-11-18 18:30" -->
## Pack <!-- orbit due: 2026-11-19 -->
## Deposit <!-- orbit due: 2026-11-20 -->
## Visa <!-- orbit due: 2026-11-16 -->
## Insurance <!-- orbit due: 2026-11-16, status: done -->
## Gifts <!-- orbit due: 2026-12-24 -->
## Passport <!-- orbit due: 2027-01-05 -->
## Ideas
`;

  /** The date chips on the map, by node, with "(overdue)" after the past ones. */
  const chipsOf = (host: HTMLElement): Record<string, string> => {
    return Object.fromEntries([...host.querySelectorAll<HTMLElement>('.orbit-date')].map((chip) => [
      chip.dataset.orbitFor,
      `${(chip.textContent ?? '').replace(/\s/g, ' ')}${chip.classList.contains('orbit-date--overdue') ? ' (overdue)' : ''}`,
    ]));
  };

  test('a planet shows its date small, in the attention color once it’s past, unless the idea is done', () => {
    const { host } = mount(PLAN);
    expect(chipsOf(host)).toEqual({
      call: '6:30 PM',
      pack: 'Tomorrow',
      deposit: 'Fri',
      visa: 'Nov 16 (overdue)',
      insurance: 'Nov 16',
      gifts: 'Dec 24',
      passport: 'Jan 5, 2027',
    });
    // Screen readers hear it with the idea's name.
    expect(host.querySelector('.orbit-date')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('in the map’s language, its own way', () => {
    const { host } = mount(PLAN, { language: 'es' });
    const format = (options: Intl.DateTimeFormatOptions, date: Date) => new Intl.DateTimeFormat('es', options).format(date).replace(/\s/g, ' ');
    expect(chipsOf(host)).toMatchObject({
      call: format({ hour: 'numeric', minute: '2-digit' }, new Date(2026, 10, 18, 18, 30)),
      pack: 'Mañana',
      deposit: format({ weekday: 'short' }, new Date(2026, 10, 20)),
      visa: `${format({ month: 'short', day: 'numeric' }, new Date(2026, 10, 16))} (overdue)`,
    });
  });

  test('in Brazilian Portuguese, its own way, with Portuguese for the day next to today and for what screen readers hear', () => {
    const { host } = mount(PLAN, { language: 'pt-BR' });
    const format = (options: Intl.DateTimeFormatOptions, date: Date) => new Intl.DateTimeFormat('pt-BR', options).format(date).replace(/\s/g, ' ');
    expect(chipsOf(host)).toMatchObject({
      call: format({ hour: 'numeric', minute: '2-digit' }, new Date(2026, 10, 18, 18, 30)),
      pack: 'Amanhã',
      deposit: format({ weekday: 'short' }, new Date(2026, 10, 20)),
      visa: `${format({ month: 'short', day: 'numeric' }, new Date(2026, 10, 16))} (overdue)`,
    });

    const full = (date: Date) => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(date);
    expect(node(host, 'deposit').getAttribute('aria-label')).toBe(`Deposit, data: ${full(new Date(2026, 10, 20))}`);
    expect(node(host, 'visa').getAttribute('aria-label')).toBe(`Visa, data: ${full(new Date(2026, 10, 16))}, atrasada`);
  });

  test('a status the map calls done is never overdue', () => {
    const { host } = mount('# Plan\n## Visa <!-- orbit due: 2026-11-16, status: listo -->\n## Bank <!-- orbit due: 2026-11-16, status: hecho -->\n', { statuses: { listo: 'done' } });
    expect(chipsOf(host)).toEqual({ visa: 'Nov 16', bank: 'Nov 16 (overdue)' });
  });

  test('the chip sits inside its planet at the bottom, beside the planet’s “+N”', () => {
    const { host, renderer } = mount('# Plan\n## Deposit <!-- orbit due: 2026-11-20 -->\n## Museums <!-- orbit due: 2026-11-30, collapsed: true -->\n- Gulbenkian\n- MAAT\n- Azulejo\n## Visa\n');

    const place = (id: string) => {
      const entry = internals(renderer).scene!.nodes.get(id)!;
      const center = onScreen(renderer, entry);
      const transform = host.querySelector<HTMLElement>(`.orbit-date[data-orbit-for="${id}"]`)!.style.transform;
      const [x, y] = /translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(transform)!.slice(1).map(Number);
      return { dx: x - center.x, dy: y - center.y, radius: entry.radius * internals(renderer).camera.scale };
    };

    const deposit = place('deposit');
    expect(Math.abs(deposit.dx)).toBeLessThanOrEqual(0.1);
    expect(deposit.dy).toBeCloseTo(deposit.radius - DATE_CHIP_INSET, 0);
    // With a "+N" at its lower right, it moves left of it.
    const museums = place('museums');
    expect(host.querySelector('.orbit-count[data-orbit-for="museums"]')?.textContent).toBe('+3');
    expect(museums.dx).toBeLessThan(0);
    expect(museums.dy).toBeCloseTo(museums.radius - DATE_CHIP_INSET, 0);
  });

  test('a name inside a planet rises clear of its date', () => {
    const name = 'Marketing campaign for the launch';
    const dated = insideLabelLayout('planet', 30, name, false, undefined, true, 0, 'en', true)!;
    const plain = insideLabelLayout('planet', 30, name, false, undefined, true, 0, 'en')!;
    // The chip's top, inside the planet, less the gap names keep; the space under a line's letters may pass over it.
    expect(insideLabelReach(dated)).toBeLessThanOrEqual(30 - DATE_CHIP_INSET - COUNT_HEIGHT / 2 - 1.5 + dated.fontSize * 0.15 + 0.01);
    expect(insideLabelReach(plain)).toBeGreaterThan(insideLabelReach(dated));
  });

  test('screen readers hear the date with the idea, and whether it’s overdue', () => {
    const { host } = mount(PLAN);
    expect(node(host, 'deposit').getAttribute('aria-label')).toBe('Deposit, date: Friday, November 20, 2026');
    expect(node(host, 'visa').getAttribute('aria-label')).toBe('Visa, date: Monday, November 16, 2026, overdue');
    expect(node(host, 'insurance').getAttribute('aria-label')).toBe('Insurance, status: Done, date: Monday, November 16, 2026');
    expect(node(host, 'call').getAttribute('aria-label')?.replace(/\s/g, ' ')).toBe('Call, date: Wednesday, November 18, 2026 at 6:30 PM');
  });

  test('the outline shows each date after its idea, in the attention color once it’s overdue', () => {
    const { host } = mount(PLAN);
    const entry = (id: string) => [...host.querySelectorAll<HTMLElement>('.orbit-outline__dated')].find((element) => element.querySelector('.orbit-outline__name')?.textContent === id);
    expect(entry('Deposit')?.querySelector('.orbit-outline__date')?.textContent).toBe('Fri, Nov 20');
    expect(entry('Deposit')?.textContent).toBe('Deposit, Fri, Nov 20');
    expect(entry('Visa')?.querySelector('.orbit-outline__date--overdue')?.textContent).toBe('Overdue: Mon, Nov 16');
    expect(entry('Passport')?.querySelector('.orbit-outline__date')?.textContent).toBe('Tue, Jan 5, 2027');
    expect(host.querySelectorAll('.orbit-outline__dated')).toHaveLength(7);
  });

  test('the tooltip says the date', () => {
    const { host } = mount(PLAN);
    const over = new MouseEvent('pointerover', { bubbles: true });
    Object.defineProperty(over, 'pointerType', { value: 'mouse' });
    node(host, 'visa').dispatchEvent(over);
    expect(host.querySelector('.orbit-tooltip__detail')?.textContent).toBe('Overdue: Mon, Nov 16');
  });

  test('the detail sheet shows it, saying “Overdue” in words once it is', () => {
    const { host, renderer } = mount(PLAN);
    const open = (id: string) => (renderer as unknown as { openDetails(node: OrbitNode): void }).openDetails(find(renderer.getDocument()!.root, id));
    open('deposit');
    const chip = host.querySelector('dialog.orbit-sheet .orbit-sheet__chip--date');
    expect(chip?.querySelector('.orbit-visually-hidden')?.textContent).toBe('Date: Fri, Nov 20');
    expect(chip?.querySelector('[aria-hidden="true"]:not(svg)')?.textContent).toBe('Fri, Nov 20');
    expect(chip?.querySelector('svg')).not.toBeNull();
    open('visa');
    const past = host.querySelector('dialog.orbit-sheet .orbit-sheet__chip--date');
    expect(past?.classList.contains('orbit-sheet__chip--overdue')).toBe(true);
    expect(past?.textContent).toBe('Overdue: Mon, Nov 16');
  });

  test('a print lists it with its year', () => {
    const page = renderPrintLayout(document.createElement('div'), PLAN);
    expect([...page.querySelectorAll('.orbit-print__chip')].map((chip) => chip.textContent)).toContain('Date: Fri, Nov 20, 2026');
  });

  test('the map shows them again when they next look different, and when it comes back into view', async () => {
    const timers = spyOn(globalThis, 'setTimeout');
    const { host } = mount(PLAN);
    // The call's time comes first, at 6:30 tonight: then it's past.
    const waits = timers.mock.calls.map((call) => call[1]);
    expect(waits).toContain(8.5 * 3_600_000 + 250);
    timers.mockRestore();

    setSystemTime(new Date(2026, 10, 19, 9, 0));
    document.dispatchEvent(new Event('visibilitychange'));
    // The chips change on the next frame.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(chipsOf(host)).toMatchObject({ call: 'Yesterday (overdue)', pack: 'Today', deposit: 'Tomorrow' });
    expect(node(host, 'call').getAttribute('aria-label')).toEndWith(', overdue');
    expect(host.querySelector('.orbit-outline__date--overdue')?.textContent?.replace(/\s/g, ' ')).toBe('Overdue: Wed, Nov 18, 6:30 PM');
  });

  test('a sound beside a video goes to the upper left, out of the date’s way', () => {
    const { host } = mount('# Plan\n## Talk <!-- orbit due: 2026-11-20, audio: memo.m4a -->\n[Clip](https://example.com/clip.mp4)\n## Song <!-- orbit audio: song.m4a -->\n[Clip](https://example.com/song.mp4)\n');
    expect(node(host, 'talk').querySelector('.orbit-node__sound')?.getAttribute('transform')).toBe('translate(-0.72 -0.72) scale(0.17)');
    expect(node(host, 'song').querySelector('.orbit-node__sound')?.getAttribute('transform')).toBe('translate(-0.72 0.72) scale(0.17)');
  });
});

describe('when dates next change', () => {
  test('the next date to become past, or the next day, whichever is first; none without dates', () => {
    const now = new Date(2026, 10, 18, 10, 0);
    expect(nextDateChange([parseDue('2026-11-18 18:30')!, parseDue('2026-11-25')!], now)).toEqual(new Date(2026, 10, 18, 18, 30));
    expect(nextDateChange([parseDue('2026-11-25')!], now)).toEqual(new Date(2026, 10, 19));
    // Past ones change nothing more, but the day still moves on.
    expect(nextDateChange([parseDue('2026-11-01')!], now)).toEqual(new Date(2026, 10, 19));
    expect(nextDateChange([], now)).toBeNull();
  });
});

describe('a date in words', () => {
  const words = (tag: string) => new OrbitWords(tag);
  const due = parseDue('2026-11-20 18:30')!;
  const now = new Date(2026, 10, 20, 9, 0);

  test('a tag’s hour cycle is the one its times take', () => {
    expect(words('en-US-u-hc-h23').shortDate(due, now)).toBe('18:30');
    expect(words('en-US').shortDate(due, now).replace(/\s/g, ' ')).toBe('6:30 PM');
  });

  test('in the detail sheet and for screen readers, with the year when it’s another year’s', () => {
    expect(words('en').mediumDate(due, now).replace(/\s/g, ' ')).toBe('Fri, Nov 20, 6:30 PM');
    expect(words('en').mediumDate(parseDue('2027-01-05')!, now)).toBe('Tue, Jan 5, 2027');
    expect(words('en').mediumDate(parseDue('2026-11-20')!)).toBe('Fri, Nov 20, 2026');
    expect(words('en').fullDate(parseDue('2026-11-20')!)).toBe('Friday, November 20, 2026');
  });
});
