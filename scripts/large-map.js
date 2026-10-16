/**
 * A large made-up map: the database of a city library, drawn the way a big
 * schema map is. Twelve areas are planets, about 130 tables (folded until
 * you fly in) are their moons, and each table's columns orbit it: usually a
 * dozen or two, but three wide tables have 260, 80 and 70, the crowded
 * orbits a real schema has. Most ideas have notes that link between tables.
 * The same map every time, so measurements compare: `bun run bench`
 * measures Orbit on it, and the website's home page shows it.
 *
 *   import { hugeOrbits, largeMap } from './large-map.js';
 *   const markdown = largeMap();             // about 2,400 ideas
 *   const smaller = largeMap({ areas: 4 }); // about 700
 *   const huge = hugeOrbits();               // orbits of 150 planets with moons, and of 1,000 (`bun run bench -- --map=huge`)
 */

const AREAS = [
  ['📚', 'Catalog', '#C2304A'],
  ['🧑‍🤝‍🧑', 'Members', '#2F7CF6'],
  ['🔁', 'Loans & Returns', '#2E9E5B'],
  ['🏛️', 'Branches', '#8E4EC6'],
  ['🗓️', 'Events', '#E5484D'],
  ['💳', 'Fees & Payments', '#D97706'],
  ['📦', 'Acquisitions', '#0EA5E9'],
  ['🧾', 'Reports', '#64748B'],
  ['🔐', 'Staff & Access', '#9333EA'],
  ['📨', 'Notices', '#DB2777'],
  ['🌐', 'Digital Lending', '#059669'],
  ['🧰', 'Maintenance', '#B45309'],
];

const NOUNS = ['book', 'copy', 'member', 'card', 'loan', 'hold', 'branch', 'shelf', 'author', 'series', 'event', 'room', 'fee', 'payment', 'order', 'vendor', 'report', 'staff', 'role', 'notice', 'ebook', 'license', 'device', 'repair', 'review', 'tag', 'visit', 'donation', 'budget', 'audit'];
const QUALIFIERS = ['', 'items', 'logs', 'requests', 'history', 'links', 'settings', 'counts', 'queues', 'versions'];
const KINDS = [
  ['🔑', 'Keys'],
  ['🔤', 'Text'],
  ['🔢', 'Numbers'],
  ['☑️', 'Yes / no'],
  ['🕒', 'Times'],
  ['🧩', 'Other'],
];
const TYPES = { Keys: 'int8', Text: 'varchar', Numbers: 'int4', 'Yes / no': 'bool', Times: 'timestamp', Other: 'jsonb' };
const FIELDS = ['status', 'name', 'title', 'code', 'notes', 'kind', 'label', 'source', 'state', 'total', 'count', 'amount', 'position', 'started', 'ended', 'created', 'updated', 'reviewed', 'active', 'public', 'archived', 'external', 'language', 'format', 'region', 'priority'];

/** A small seeded generator (mulberry32), so every run draws the same map. */
const seeded = (seed) => {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * The map as orbit-md. `areas` (1–12, default 12) scales it: about 250
 * ideas per area.
 */
export const largeMap = ({ areas = AREAS.length, seed = 7 } = {}) => {
  const random = seeded(seed);
  const between = (low, high) => low + Math.floor(random() * (high - low + 1));
  const pick = (items) => items[Math.floor(random() * items.length)];

  // Tables first, so notes and links can point at any of them.
  const used = new Set();
  const tables = [];

  for (const [areaIndex] of AREAS.slice(0, areas).entries()) {
    for (let index = 0; index < between(8, 14); index += 1) {
      let name = `${pick(NOUNS)}${(() => {
        const qualifier = pick(QUALIFIERS);
        return qualifier ? `_${qualifier}` : 's';
      })()}`;

      for (let suffix = 2; used.has(name); suffix += 1) {
        name = `${name.replace(/_\d+$/, '')}_${suffix}`;
      }

      used.add(name);
      tables.push({ name, area: areaIndex, columns: between(4, 24) });
    }
  }

  // The wide tables: one of the second, fifth and eighth areas' tables each.
  for (const [areaIndex, columns] of [[4, 260], [1, 80], [7, 70]]) {
    const table = tables.find((candidate) => candidate.area === areaIndex);

    if (table) {
      table.columns = columns;
    }
  }

  const link = (table) => `[\`${table.name}\`](#${table.name})`;

  const lines = ['---', 'title: The city library', '---', '# City library', '<!-- orbit', 'id: "library"', '-->'];
  lines.push(
    `> The made-up database of a city library, drawn as a solar system: **${tables.length} tables** in **${areas} areas**. Each planet is an area; fly into one to see its tables, then into a table for its columns.`,
    '',
  );

  for (const [areaIndex, [icon, title, color]] of AREAS.slice(0, areas).entries()) {
    const areaTables = tables.filter((table) => table.area === areaIndex);
    const id = `area-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
    lines.push(`## ${icon} ${title}`, '<!-- orbit', `id: "${id}"`, `color: "${color}"`, '-->');
    lines.push(`> ${areaTables.length} tables. Largest: ${areaTables.slice(0, 3).map(link).join(', ')}.`, '>', `> **Linked to** ${Array.from({ length: 3 }, () => link(pick(tables))).join(' · ')}`, '');

    for (const table of areaTables) {
      lines.push(`### ${table.name}`, '<!-- orbit', `id: "${table.name}"`, `icon: "${pick(['📗', '🗂️', '🧮', '🧷', '📇', '🗃️'])}"`, 'collapsed: true', '-->');
      const parents = Array.from({ length: between(1, 4) }, () => pick(tables));
      lines.push(
        `> \`${table.name}\` · table in ${title}`,
        '>',
        `> One row per ${table.name.split('_')[0]}, with ${table.columns} columns and about ${between(1, 900)} thousand rows.`,
        '>',
        `> **Belongs to** ${parents.map(link).join(' · ')}`,
        '',
      );
      const names = new Set(['id']);
      lines.push('- 🔑 id <!-- orbit status: "primary key" -->', `  > \`${table.name}.id\` · \`int8\` · required`);

      for (let column = 1; column < table.columns; column += 1) {
        const [icon, kind] = pick(KINDS);
        const target = kind === 'Keys' ? pick(tables) : null;
        let name = target ? `${target.name.split('_')[0]}_id` : `${pick(NOUNS)}_${pick(FIELDS)}`;

        for (let suffix = 2; names.has(name); suffix += 1) {
          name = `${name.replace(/_\d+$/, '')}_${suffix}`;
        }

        names.add(name);

        if (target) {
          lines.push(`- 🔗 ${name} <!-- orbit link: "#${target.name}", status: "foreign key" -->`, `  > \`${table.name}.${name}\` · \`int8\` · required`, '  >', `  > Points at ${link(target)}.`);
        } else {
          lines.push(`- ${icon} ${name}`, `  > \`${table.name}.${name}\` · \`${TYPES[kind]}\` · ${random() < 0.5 ? 'required' : 'optional'}`);
        }
      }

      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
};

/**
 * A map of the biggest orbits a map is likely to have, for checking that
 * they spin and fly smoothly: an area of 150 tables whose columns circle
 * them as moons (not folded), and a table of 1,000 columns.
 */
export const hugeOrbits = ({ tables = 150, widest = 1000, seed = 11 } = {}) => {
  const random = seeded(seed);
  const between = (low, high) => low + Math.floor(random() * (high - low + 1));
  const pick = (items) => items[Math.floor(random() * items.length)];
  const lines = ['---', 'title: Huge orbits', '---', '# Huge orbits', '<!-- orbit', 'id: "huge"', '-->', ''];
  lines.push('## 🗄️ Busy area', '<!-- orbit', 'id: "busy"', '-->', `> ${tables} tables, each with its columns as moons.`, '');
  const used = new Set();

  for (let index = 0; index < tables; index += 1) {
    let name = `${pick(NOUNS)}_${pick(QUALIFIERS.filter(Boolean))}`;

    for (let suffix = 2; used.has(name); suffix += 1) {
      name = `${name.replace(/_\d+$/, '')}_${suffix}`;
    }

    used.add(name);
    lines.push(`### ${name}`, '<!-- orbit', `id: "${name}"`, '-->');

    for (let column = 0; column < between(6, 12); column += 1) {
      lines.push(`- ${pick(NOUNS)}_${pick(FIELDS)}`);
    }

    lines.push('');
  }

  lines.push('## 📜 Wide table', '<!-- orbit', 'id: "wide"', '-->', `> One table with ${widest} columns.`, '');
  const names = new Set();

  for (let column = 0; column < widest; column += 1) {
    let name = `${pick(NOUNS)}_${pick(FIELDS)}`;

    for (let suffix = 2; names.has(name); suffix += 1) {
      name = `${name.replace(/_\d+$/, '')}_${suffix}`;
    }

    names.add(name);
    lines.push(`- ${name}`);
  }

  lines.push('', '## 🌱 Calm area', '<!-- orbit', 'id: "calm"', '-->', '- quiet_table', '  - id', '  - name', '');
  return `${lines.join('\n')}\n`;
};
