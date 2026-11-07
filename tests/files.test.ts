import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { parseOrbit } from '../src/core/dispatch';
import { parseOrbitYAML } from '../src/core/parser-yaml';
import { serializeOrbitMarkdown } from '../src/core/serializer-markdown';
import { serializeOrbitYAML } from '../src/core/serializer-yaml';
import { renderToSVGString } from '../src/core/render-to-svg';
import { renderPrintLayout } from '../src/core/print-layout';
import { createMapTools } from '../src/core/map-tools/tools';
import { fileFacts, fileKind, fileKindName, fileName } from '../src/core/files';
import { OrbitWords } from '../src/core/languages';
import { ORBIT_THEME_PRESETS, themeTokens } from '../src/core/themes';
import { contrastRatio } from '../src/core/engine/colors';
import { color } from './theme-contrast';
import type { OrbitFileOpenDetail, OrbitNode } from '../src/core/types';
import { click, mount, node, useMapSize } from './helpers/renderer';

useMapSize(600, 400);

beforeEach(() => {
  document.body.innerHTML = '';
});

const TRIP = `# ✈️ Trip
## Tickets
<!-- orbit
files:
  - src: media/boarding-pass.pdf
    name: Boarding pass.pdf
    type: application/pdf
    size: 48213
  - src: media/hotel.docx
    name: "Hotel: booking, final.docx"
    type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
    size: 1200000
    pages: 3
-->
## Budget <!-- orbit files: media/budget.xlsx -->
## Packing
- List <!-- orbit status: todo -->
  <!-- orbit
  files:
    - media/list.txt
  -->
`;

const find = (root: OrbitNode, id: string): OrbitNode => {
  const visit = (current: OrbitNode): OrbitNode | undefined => (current.id === id ? current : current.children.map(visit).find(Boolean));
  return visit(root)!;
};

describe('the format', () => {
  test('an idea’s files are a list of addresses, or of their name, type and size, and one alone is a list of one', () => {
    const map = parseOrbit(TRIP);
    expect(map.diagnostics).toEqual([]);
    expect(find(map.root, 'tickets').files).toEqual([
      { src: 'media/boarding-pass.pdf', name: 'Boarding pass.pdf', type: 'application/pdf', size: 48213 },
      { src: 'media/hotel.docx', name: 'Hotel: booking, final.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 1200000 },
    ]);
    expect(find(map.root, 'budget').files).toEqual([{ src: 'media/budget.xlsx' }]);
    expect(find(map.root, 'list').files).toEqual([{ src: 'media/list.txt' }]);
    expect(find(map.root, 'tickets').attrs).toBeUndefined();
  });

  test('YAML holds them the same way', () => {
    const map = parseOrbitYAML(`nodes:
  - text: Trip
    children:
      - text: Tickets
        files:
          - src: media/boarding-pass.pdf
            name: Boarding pass.pdf
            size: 48213
      - text: Budget
        files: [media/budget.xlsx, media/fx.csv]
`);
    expect(map.diagnostics).toEqual([]);
    expect(find(map.root, 'tickets').files).toEqual([{ src: 'media/boarding-pass.pdf', name: 'Boarding pass.pdf', size: 48213 }]);
    expect(find(map.root, 'budget').files).toEqual([{ src: 'media/budget.xlsx' }, { src: 'media/fx.csv' }]);
  });

  test('a list Orbit can’t read whole is kept as written, and said, so saving loses none of it', () => {
    const source = '# Trip\n## Tickets\n<!-- orbit\nfiles:\n  - media/a.pdf\n  - name: No address\n-->\n';
    const map = parseOrbit(source);
    const tickets = find(map.root, 'tickets');
    expect(tickets.files).toBeUndefined();
    expect(tickets.attrs?.files).toEqual(['media/a.pdf', { name: 'No address' }]);
    expect(map.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['invalid-attributes']);
    expect(serializeOrbitMarkdown(map)).toBe(source);
    expect(serializeOrbitMarkdown(map, { keepSource: false })).toContain('files:\n  - media/a.pdf\n  - name: No address\n');
  });

  test('a size that isn’t a number of bytes, and fields Orbit doesn’t read, stay as written', () => {
    const map = parseOrbit('# Trip\n## Tickets\n<!-- orbit\nfiles:\n  - src: media/a.pdf\n    size: big\n    checksum: abc\n-->\n');
    expect(find(map.root, 'tickets').files).toEqual([{ src: 'media/a.pdf' }]);
    expect(serializeOrbitMarkdown(map, { keepSource: false })).toContain('files:\n  - src: media/a.pdf\n    size: big\n    checksum: abc\n');
    expect(serializeOrbitYAML(map)).toContain('files:\n          - src: media/a.pdf\n            size: big\n            checksum: abc\n');
  });

  test('“attachments” is read as a word of the map’s own, and Orbit says what it means', () => {
    const map = parseOrbit('# Trip\n## Tickets <!-- orbit attachments: [media/a.pdf] -->\n');
    expect(find(map.root, 'tickets').attrs?.attachments).toEqual(['media/a.pdf']);
    expect(map.diagnostics[0]?.message).toContain('files');
  });

  test('saving writes a map’s files back byte for byte, and in Orbit’s own form after the date, a list of its own', () => {
    const map = parseOrbit(TRIP);
    expect(serializeOrbitMarkdown(map)).toBe(TRIP);
    const own = serializeOrbitMarkdown(parseOrbit('# Trip\n## Tickets <!-- orbit due: 2026-11-20, owner: Ana, files: [media/a.pdf] -->\n'), { keepSource: false });
    expect(own).toBe('# Trip\n\n## Tickets\n<!-- orbit\ndue: "2026-11-20"\nfiles:\n  - src: media/a.pdf\nowner: Ana\n-->\n');
    const written = serializeOrbitMarkdown(map, { keepSource: false });
    expect(written).toContain('<!-- orbit\nfiles:\n  - src: media/boarding-pass.pdf\n    name: Boarding pass.pdf\n    type: application/pdf\n    size: 48213\n  - src: media/hotel.docx\n    name: "Hotel: booking, final.docx"\n');
    expect(written).toContain('    size: 1200000\n    pages: 3\n-->');
    const again = parseOrbit(written);
    expect(find(again.root, 'tickets').files).toEqual(find(map.root, 'tickets').files!);
    expect(serializeOrbitMarkdown(again, { keepSource: false })).toBe(written);
  });

  test('YAML writes them too, and reads them back the same', () => {
    const map = parseOrbit(TRIP);
    const yaml = serializeOrbitYAML(map);
    expect(yaml).toContain('      - text: Budget\n        files:\n          - src: media/budget.xlsx\n');
    const back = parseOrbitYAML(yaml);
    expect(find(back.root, 'tickets').files).toEqual(find(map.root, 'tickets').files!);
    expect(serializeOrbitYAML(back)).toBe(yaml);
    expect(serializeOrbitMarkdown(back, { keepSource: false })).toContain('    pages: 3\n');
  });

  test('every file’s address is in the text after `media/`, one to a line: apps that find a map’s files by their text find them', () => {
    const written = serializeOrbitMarkdown(parseOrbit(TRIP), { keepSource: false });

    for (const name of ['boarding-pass.pdf', 'hotel.docx', 'budget.xlsx', 'list.txt']) {
      expect(written).toMatch(new RegExp(`^ +- src: media/${name.replace('.', '\\.')}$`, 'm'));
    }
  });
});

describe('editing', () => {
  test('updateNode and addNode take files as a file’s are written, and undefined takes them off', () => {
    const { renderer } = mount('# Trip\n## Tickets\n');
    renderer.updateNode('tickets', { files: ['media/a.pdf', { src: 'media/b.xlsx', name: 'Budget.xlsx', type: 'application/vnd.ms-excel', size: 820 }] });
    expect(renderer.toMarkdown()).toBe('# Trip\n## Tickets\n<!-- orbit\nfiles:\n  - src: media/a.pdf\n  - src: media/b.xlsx\n    name: Budget.xlsx\n    type: application/vnd.ms-excel\n    size: 820\n-->\n');
    renderer.addNode('trip', { text: 'Visa', files: 'media/visa.pdf' });
    expect(renderer.toMarkdown()).toContain('## Visa\n<!-- orbit\nfiles:\n  - src: media/visa.pdf\n-->\n');
    renderer.updateNode('tickets', { files: undefined });
    expect(renderer.toMarkdown()).toBe('# Trip\n## Tickets\n\n## Visa\n<!-- orbit\nfiles:\n  - src: media/visa.pdf\n-->\n');
  });

  test('a file Orbit can’t read is refused, and the map stays as it was', () => {
    const { renderer } = mount('# Trip\n## Tickets\n');
    expect(() => renderer.updateNode('tickets', { files: [{ name: 'No address' } as never] })).toThrow('A node\'s files are addresses, or objects with a src');
    expect(() => renderer.updateNode('tickets', { files: [{ src: 'media/a.pdf', size: -1 }] })).toThrow('file\'s size is a number of bytes');
    expect(() => renderer.updateNode('tickets', { files: [{ src: 'media/a.pdf', name: ['a'] as never }] })).toThrow('file\'s name is text');
    expect(renderer.toMarkdown()).toBe('# Trip\n## Tickets\n');
  });

  test('a file given again with the fields an app knows keeps the ones it doesn’t, and edits elsewhere keep them all', () => {
    const { renderer } = mount(TRIP);
    const tickets = renderer.getDocument()!.root.children[0];
    renderer.updateNode('tickets', { files: tickets.files!.map((file) => ({ src: file.src, name: file.name, type: file.type, size: file.size })) });
    expect(renderer.toMarkdown()).toContain('    pages: 3\n');
    renderer.updateNode('tickets', { text: 'Tickets and stays', color: '#E5484D' });
    expect(renderer.toMarkdown()).toContain('    pages: 3\n');
    renderer.removeNode('budget');
    renderer.updateNode('tickets-and-stays', { files: [tickets.files![1]] });
    expect(renderer.toMarkdown()).not.toContain('boarding-pass');
    expect(renderer.toMarkdown()).toContain('    pages: 3\n');
  });
});

describe('what Orbit shows of a file', () => {
  const words = new OrbitWords('en');

  test('its name, else the last part of its address as it reads', () => {
    expect(fileName({ src: 'media/x.pdf', name: 'Q3 report.pdf' })).toBe('Q3 report.pdf');
    expect(fileName({ src: 'media/Q3%20report.pdf' })).toBe('Q3 report.pdf');
    expect(fileName({ src: 'https://example.com/files/plan.pdf?v=2#page=3' })).toBe('plan.pdf');
    expect(fileName({ src: 'media/%E0%A4%A.pdf' })).toBe('%E0%A4%A.pdf');
  });

  test('its kind, by its type, else its extension', () => {
    expect(fileKind({ src: 'media/a', type: 'application/pdf' })).toBe('pdf');
    expect(fileKind({ src: 'media/a', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })).toBe('spreadsheet');
    expect(fileKind({ src: 'media/a', type: 'APPLICATION/VND.OPENXMLFORMATS-OFFICEDOCUMENT.PRESENTATIONML.PRESENTATION' })).toBe('presentation');
    expect(fileKind({ src: 'media/a.bin', type: 'text/csv; charset=utf-8' })).toBe('spreadsheet');
    expect(fileKind({ src: 'media/a.DOCX' })).toBe('document');
    expect(fileKind({ src: 'media/a', name: 'Photos.zip' })).toBe('archive');
    expect(fileKind({ src: 'media/a.epub' })).toBe('other');
    expect(fileKindName({ src: 'media/a.epub' }, words)).toBe('EPUB');
    expect(fileKindName({ src: 'media/readme' }, words)).toBe('File');
    expect(fileKindName({ src: 'media/a.xlsx' }, new OrbitWords('es'))).toBe('Hoja de cálculo');
    expect(fileKindName({ src: 'media/a.xlsx' }, new OrbitWords('pt-BR'))).toBe('Planilha');
  });

  test('its size, as phones say it, in the map’s language', () => {
    expect(fileFacts({ src: 'media/a.pdf', size: 820 }, words)).toBe('PDF · 820 bytes');
    expect(fileFacts({ src: 'media/a.pdf', size: 48213 }, words)).toBe('PDF · 48 kB');
    expect(fileFacts({ src: 'media/a.pdf', size: 1_250_000 }, words)).toBe('PDF · 1.3 MB');
    expect(fileFacts({ src: 'media/a.pdf', size: 1_250_000 }, new OrbitWords('es'))).toBe('PDF · 1,3 MB');
    expect(fileFacts({ src: 'media/a.pdf' }, words)).toBe('PDF');
    expect(words.fileSize(1)).toBe('1 byte');
    expect(words.fileSize(999_999_999)).toBe('1 GB');
    expect(words.fileSize(9_960)).toBe('10 kB');
    expect(words.fileSize(9_940)).toBe('9.9 kB');
  });
});

describe('on the map', () => {
  test('a planet with files wears a paperclip at its upper left, with how many from two on, and says so', () => {
    const { host, renderer } = mount(TRIP);
    renderer.focusNode('trip');
    const tickets = node(host, 'tickets').querySelector('.orbit-node__files')!;
    expect(tickets.getAttribute('transform')).toBe('translate(-0.720 -0.720) scale(0.2)');
    expect(tickets.querySelector('path')?.getAttribute('d')).toStartWith('M0.496 -0.183');
    expect(tickets.querySelector('text')?.textContent).toBe('2');
    expect(Number(tickets.querySelector('rect')?.getAttribute('width'))).toBeGreaterThan(2);
    const budget = node(host, 'budget').querySelector('.orbit-node__files')!;
    expect(budget.querySelector('text')).toBeNull();
    expect(budget.querySelector('rect')?.getAttribute('width')).toBe('2');
    expect(node(host, 'tickets').getAttribute('aria-label')).toContain('has 2 files');
    expect(node(host, 'budget').getAttribute('aria-label')).toContain('has 1 file');
    expect(node(host, 'packing').querySelector('.orbit-node__files')).toBeNull();
  });

  test('beside a sound that’s at the upper left, it moves along the rim', () => {
    const { host } = mount('# Trip\n## Talk <!-- orbit audio: media/q.m4a, due: 2026-11-20, files: [media/slides.pdf] -->\n[Talk](https://example.com/talk.mp4)\n');
    const talk = node(host, 'talk');
    expect(talk.querySelector('.orbit-node__sound')?.getAttribute('transform')).toBe('translate(-0.72 -0.72) scale(0.17)');
    expect(talk.querySelector('.orbit-node__files')?.getAttribute('transform')).toBe('translate(-0.320 -0.967) scale(0.2)');
  });

  test('exported maps draw it too, the count at its own size', () => {
    const svg = renderToSVGString(TRIP, { width: 800, height: 600 });
    expect((svg.match(/<path d="M0\.496 -0\.183/g) ?? []).length).toBe(2);
    expect(svg).toMatch(/font-weight="700"[^>]*>2<\/text>/);
  });

  test('the idea in focus offers "Show files", which opens the detail sheet at them', () => {
    const { host, renderer } = mount(TRIP);
    renderer.focusNode('tickets');
    const button = host.querySelector<HTMLButtonElement>('.orbit-action--files')!;
    expect(button.getAttribute('aria-label')).toBe('Show files');
    click(button);
    const sheet = host.querySelector<HTMLDialogElement>('dialog.orbit-sheet[open]')!;
    const section = sheet.querySelector('[data-section="files"]')!;
    expect(section.querySelector('.orbit-sheet__files-heading')?.textContent).toBe('Files');
    expect([...section.querySelectorAll('.orbit-sheet__file-name')].map((name) => name.textContent)).toEqual(['Boarding pass.pdf', 'Hotel: booking, final.docx']);
    expect([...section.querySelectorAll('.orbit-sheet__file-facts')].map((facts) => facts.textContent)).toEqual(['PDF · 48 kB', 'Document · 1.2 MB']);
    expect(section.querySelector('button.orbit-sheet__file')?.getAttribute('aria-label')).toBe('Open Boarding pass.pdf, PDF, 48 kB');
    expect(section.querySelector('.orbit-sheet__files-stayed')).toBeNull();
  });
});

describe('opening a file', () => {
  let opened: unknown[][] = [];
  let opening: ReturnType<typeof spyOn>;

  beforeEach(() => {
    opened = [];

    opening = spyOn(window, 'open').mockImplementation((...args: unknown[]) => {
      opened.push(args);
      return null;
    });
  });

  afterEach(() => {
    opening.mockRestore();
  });

  const openSheet = (options = {}): { host: HTMLElement; sheet: HTMLDialogElement; renderer: ReturnType<typeof mount>['renderer'] } => {
    const { host, renderer } = mount(TRIP, { baseUrl: 'https://example.com/maps/', ...options });
    renderer.focusNode('tickets');
    click(host.querySelector('.orbit-action--files')!);
    return { host, renderer, sheet: host.querySelector<HTMLDialogElement>('dialog.orbit-sheet[open]')! };
  };

  test('says which, and opens its address in a new tab unless the page takes it', () => {
    const { host, sheet } = openSheet();
    const heard: OrbitFileOpenDetail[] = [];
    host.addEventListener('orbit-file-open', (event) => heard.push((event as CustomEvent<OrbitFileOpenDetail>).detail));
    click(sheet.querySelectorAll('button.orbit-sheet__file')[1]);
    expect(heard.map((detail) => [detail.node.id, detail.index, detail.file.name])).toEqual([['tickets', 1, 'Hotel: booking, final.docx']]);
    expect(opened).toEqual([['https://example.com/maps/media/hotel.docx', '_blank', 'noopener']]);
    expect(sheet.open).toBe(true);
  });

  test('an app takes it with preventDefault(), the event’s or a DOM listener’s, or onFileOpen returning false', () => {
    const { renderer, sheet } = openSheet();
    const off = renderer.on('file-open', (detail) => detail.preventDefault());
    click(sheet.querySelector('button.orbit-sheet__file')!);
    off();
    expect(opened).toEqual([]);

    const callback = openSheet({ onFileOpen: () => false });
    click(callback.sheet.querySelector('button.orbit-sheet__file')!);
    expect(opened).toEqual([]);

    const dom = openSheet();
    dom.host.addEventListener('orbit-file-open', (event) => event.preventDefault());
    click(dom.sheet.querySelector('button.orbit-sheet__file')!);
    expect(opened).toEqual([]);
  });

  test('an address that isn’t the web’s or the map’s own never opens', () => {
    const quiet = spyOn(console, 'warn').mockImplementation(() => undefined);
    const { host, renderer } = mount('# Trip\n## Tickets <!-- orbit files: ["javascript:alert(1)"] -->\n');
    renderer.focusNode('tickets');
    click(host.querySelector('.orbit-action--files')!);
    click(host.querySelector('dialog.orbit-sheet[open] button.orbit-sheet__file')!);
    expect(opened).toEqual([]);
    quiet.mockRestore();
  });

  test('with openFiles false, the sheet lists them without opening them, and says they stayed with the map', () => {
    const { sheet } = openSheet({ openFiles: false, language: 'es' });
    expect(sheet.querySelector('button.orbit-sheet__file')).toBeNull();
    expect(sheet.querySelectorAll('div.orbit-sheet__file').length).toBe(2);
    expect(sheet.querySelector('.orbit-sheet__files-heading')?.textContent).toBe('Archivos');
    expect(sheet.querySelector('.orbit-sheet__files-stayed')?.textContent).toBe('Los archivos se quedaron con el mapa: no están en esta página.');
  });
});

describe('elsewhere', () => {
  test('prints name each file, its kind and its size, after the idea’s media', () => {
    const container = document.createElement('div');
    renderPrintLayout(container, TRIP);
    const files = [...container.querySelectorAll('.orbit-print__file')].map((file) => file.textContent);
    expect(files).toEqual(['Boarding pass.pdf · PDF · 48 kB', 'Hotel: booking, final.docx · Document · 1.2 MB', 'budget.xlsx · Spreadsheet', 'list.txt · Text']);
  });

  test('map tools read them', () => {
    const tools = createMapTools(TRIP);
    expect(tools.run('read_node', { node_id: 'tickets' }).text).toContain('Files: Boarding pass.pdf: media/boarding-pass.pdf (kind: PDF; size: 48 kB); Hotel: booking, final.docx: media/hotel.docx (kind: Document; size: 1.2 MB)');
    expect(tools.run('read_map', {}).text).toContain('files: Boarding pass.pdf, Hotel: booking, final.docx');
  });

  test('every theme draws the paperclip and its count apart from the badge, 4.5:1 or more', () => {
    for (const preset of Object.keys(ORBIT_THEME_PRESETS)) {
      const tokens = themeTokens(preset) as Record<string, string>;
      expect(contrastRatio(color(tokens['badge-stroke']), color(tokens['note-indicator']))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
