import { beforeEach, describe, expect, test } from 'bun:test';
import type { OrbitNode } from '../src/core/types';
import { branchNumbers } from '../src/core/branch-colors';
import { createMapTools } from '../src/core/map-tools/tools';
import { parseOrbit } from '../src/core/dispatch';
import { parseOrbitYAML } from '../src/core/parser-yaml';
import { renderToSVGString } from '../src/core/render-to-svg';
import { serializeOrbitMarkdown } from '../src/core/serializer-markdown';
import { serializeOrbitYAML } from '../src/core/serializer-yaml';
import { mount, useMapSize } from './helpers/renderer';

useMapSize(600, 400);

beforeEach(() => {
  document.body.innerHTML = '';
});

const MAP = `# Trip
## Food
- Tacos
## Museums
## Beaches
## Markets
`;

const IDS = ['trip', 'food', 'tacos', 'museums', 'beaches', 'markets'];

const node = (text: string, attributes: Partial<OrbitNode> = {}): OrbitNode => {
  return { id: text.toLowerCase(), text, level: 1, children: [], ...attributes };
};

type Colors = Record<string, string | null>;

/** Every node's color by id, as the map draws it. */
const colorsOf = (renderer: ReturnType<typeof mount>['renderer'], ids: string[]): Colors => {
  return Object.fromEntries(ids.map((id) => [id, renderer.getNodeColor(id)]));
};

/** `colors` with the colors of `ids` taken from `others`: the nodes an edit was meant to change. */
const besides = (colors: Colors, others: Colors, ids: string[]): Colors => {
  return { ...colors, ...Object.fromEntries(ids.map((id) => [id, others[id]])) };
};

/** The lines of a saved map that set a palette color. */
const numbered = (markdown: string): string[] => {
  return markdown.split('\n').filter((line) => line.includes('paletteColor'));
};

describe('palette turns', () => {
  test('top-level nodes take the palette\'s colors in turn, cycling', () => {
    const branches = ['A', 'B', 'C', 'D'].map((text) => node(text));
    expect([...branchNumbers(branches, 3).values()]).toEqual([1, 2, 3, 1]);
  });

  test('a node with a paletteColor takes it and gives up its turn, so the others keep theirs', () => {
    const branches = [node('A'), node('B', { paletteColor: 2 }), node('C'), node('D')];
    expect([...branchNumbers(branches, 7).values()]).toEqual([1, 2, 3, 4]);
  });

  test('turns skip the numbers other nodes have, and a number past the palette cycles', () => {
    const branches = [node('A', { paletteColor: 8 }), node('B'), node('C')];
    expect([...branchNumbers(branches, 7).values()]).toEqual([1, 2, 3]);
  });

  test('a node with a color or type of its own still takes its turn', () => {
    const branches = [node('A'), node('B', { color: 'tomato' }), node('C')];
    expect([...branchNumbers(branches, 7).values()]).toEqual([1, 2, 3]);
  });

  test('with every number taken, turns go round all of them again', () => {
    const branches = [node('A', { paletteColor: 1 }), node('B', { paletteColor: 2 }), node('C')];
    expect(branchNumbers(branches, 2).get(branches[2])).toBe(1);
  });
});

describe('paletteColor in a map', () => {
  test('reads and writes as a number, in markdown and YAML', () => {
    const document = parseOrbit('# Trip\n## Food <!-- orbit paletteColor: 3 -->\n## Museums\n');
    expect(document.root.children[0].paletteColor).toBe(3);
    expect(serializeOrbitMarkdown(document, { keepSource: false })).toContain('## Food <!-- orbit paletteColor: 3 -->');

    const yaml = parseOrbitYAML('nodes:\n  - text: Trip\n    children:\n      - text: Food\n        paletteColor: 3\n');
    expect(yaml.root.children[0].paletteColor).toBe(3);
    expect(serializeOrbitYAML(yaml)).toContain('paletteColor: 3\n');
  });

  test('a value that isn\'t a whole number from 1 is reported and kept as written', () => {
    const source = '# Trip\n## Food <!-- orbit paletteColor: blue -->\n';
    const document = parseOrbit(source);
    expect(document.root.children[0].paletteColor).toBeUndefined();
    expect(document.root.children[0].attrs).toEqual({ paletteColor: 'blue' });
    expect(document.diagnostics?.map((diagnostic) => diagnostic.code)).toContain('invalid-attributes');
    expect(serializeOrbitMarkdown(document)).toBe(source);
  });

  test('gives a node the palette\'s color by number, at any depth, with shades under it', () => {
    const { renderer } = mount('# Trip\n## Food\n- Tacos <!-- orbit paletteColor: 2 -->\n  - Al pastor\n  - Carnitas\n## Museums\n');
    expect(renderer.getNodeColor('tacos')).toBe(renderer.getNodeColor('museums'));
    expect(renderer.getNodeColor('tacos')).not.toBe(renderer.getNodeColor('food'));
    expect(renderer.getNodeColor('al-pastor')).toBe(renderer.getNodeColor('tacos'));
    expect(renderer.getNodeColor('carnitas')).not.toBe(renderer.getNodeColor('tacos'));
  });

  test('two top-level nodes with the same number share its color, and the others take the colors left', () => {
    const { renderer } = mount('# Trip\n## Food\n## Museums <!-- orbit paletteColor: 1 -->\n## Beaches <!-- orbit paletteColor: 1 -->\n');
    expect(renderer.getNodeColor('museums')).toBe(renderer.getNodeColor('beaches'));
    expect(renderer.getNodeColor('food')).not.toBe(renderer.getNodeColor('museums'));
  });

  test('a node\'s own color wins over its paletteColor', () => {
    const { renderer } = mount('# Trip\n## Food <!-- orbit color: "#123456", paletteColor: 2 -->\n## Museums\n');
    expect(renderer.getNodeColor('food')).toBe('#123456');
  });

  test('the picture of a map draws it the same way', () => {
    const svg = renderToSVGString('# Trip\n## Food <!-- orbit paletteColor: 3 -->\n## Museums <!-- orbit paletteColor: 3 -->\n');
    // Paper's third branch color, on both planets.
    expect(svg.match(/<circle [^>]*fill="#9ed5fd"/g)).toHaveLength(2);
  });
});

describe('colors stay with their ideas', () => {
  test('removing a top-level idea leaves every other color, writing numbers only after it', () => {
    const { renderer } = mount(MAP);
    const before = colorsOf(renderer, IDS);
    renderer.removeNode('museums');
    expect(besides(colorsOf(renderer, IDS), before, ['museums'])).toEqual(before);
    expect(numbered(renderer.toMarkdown())).toEqual(['## Beaches <!-- orbit paletteColor: 3 -->', '## Markets <!-- orbit paletteColor: 4 -->']);
  });

  test('moving a top-level idea writes one number, the moved idea\'s', () => {
    const { renderer } = mount(MAP);
    const before = colorsOf(renderer, IDS);
    renderer.moveNode('markets', 'trip', 0);
    expect(colorsOf(renderer, IDS)).toEqual(before);
    expect(numbered(renderer.toMarkdown())).toEqual(['## Markets <!-- orbit paletteColor: 4 -->']);
  });

  test('an idea added at the end takes the next color, and nothing is written', () => {
    const { renderer } = mount(MAP);
    const before = colorsOf(renderer, IDS);
    renderer.addNode('trip', { text: 'Parks' });
    expect(colorsOf(renderer, IDS)).toEqual(before);
    expect(Object.values(before)).not.toContain(renderer.getNodeColor('parks'));
    expect(numbered(renderer.toMarkdown())).toEqual([]);
  });

  test('an idea added between others takes a color none of them has, and only it gets a number', () => {
    const { renderer } = mount(MAP);
    const before = colorsOf(renderer, IDS);
    renderer.addNode('trip', { text: 'Parks' }, 1);
    expect(colorsOf(renderer, IDS)).toEqual(before);
    expect(Object.values(before)).not.toContain(renderer.getNodeColor('parks'));
    expect(numbered(renderer.toMarkdown())).toEqual(['## Parks <!-- orbit paletteColor: 5 -->']);
  });

  test('an idea moved under another takes its new branch\'s shade, and drops its number', () => {
    const { renderer } = mount(MAP);
    const before = colorsOf(renderer, IDS);
    renderer.moveNode('food', 'museums');
    expect(besides(colorsOf(renderer, IDS), before, ['food', 'tacos'])).toEqual(before);
    expect(renderer.getNodeColor('food')).not.toBe(before.food);

    renderer.moveNode('markets', 'beaches');
    expect(renderer.toMarkdown()).not.toContain('Markets <!-- orbit paletteColor');
    expect(renderer.getNodeColor('beaches')).toBe(before.beaches);
  });

  test('an idea with its own color keeps it, and the ideas around it keep theirs', () => {
    const { renderer } = mount('# Trip\n## Food\n## Museums <!-- orbit color: "#123456" -->\n## Beaches\n## Markets\n');
    const ids = ['food', 'museums', 'beaches', 'markets'];
    const before = colorsOf(renderer, ids);
    renderer.removeNode('food');
    expect(besides(colorsOf(renderer, ids), before, ['food'])).toEqual(before);
    expect(renderer.toMarkdown()).toContain('## Museums <!-- orbit color: "#123456" -->\n');
  });

  test('a renamed idea, or one checked off, changes nothing else', () => {
    const { renderer } = mount(MAP);
    renderer.updateNode('museums', { text: 'Galleries', status: 'done' });
    expect(numbered(renderer.toMarkdown())).toEqual([]);
  });

  test('the map reads back with the same colors', () => {
    const { renderer } = mount(MAP);
    renderer.removeNode('food');
    renderer.moveNode('markets', 'trip', 0);
    const kept = colorsOf(renderer, ['museums', 'beaches', 'markets']);
    const { renderer: reopened } = mount(renderer.toMarkdown());
    expect(colorsOf(reopened, ['museums', 'beaches', 'markets'])).toEqual(kept);
  });

  test('numbers name the map\'s own palette when it has one', () => {
    const { renderer } = mount(`---\npalette: ["#111111", "#aa0000", "#00aa00", "#0000aa"]\n---\n${MAP}`);
    renderer.removeNode('food');
    expect(colorsOf(renderer, ['museums', 'beaches', 'markets'])).toEqual({ museums: '#00aa00', beaches: '#0000aa', markets: '#aa0000' });
  });

  test('in a big orbit, where colors repeat, an edit that would number most ideas numbers none', () => {
    const items = Array.from({ length: 30 }, (_, index) => `- Item ${index + 1}`).join('\n');
    const { renderer } = mount(`# Long list\n${items}\n`);
    const second = renderer.getNodeColor('item-2');
    renderer.removeNode('item-1');
    expect(numbered(renderer.toMarkdown())).toEqual([]);
    expect(renderer.getNodeColor('item-3')).toBe(second);
  });

  test('the map tools keep colors on a map that isn\'t drawn', () => {
    const document = parseOrbit(MAP);
    const tools = createMapTools(document);
    expect(tools.run('remove_node', { node_id: 'museums' }).ok).toBe(true);
    expect(numbered(serializeOrbitMarkdown(document))).toEqual(['## Beaches <!-- orbit paletteColor: 3 -->', '## Markets <!-- orbit paletteColor: 4 -->']);
  });
});
