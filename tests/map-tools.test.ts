import { beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMapTools } from '../src/core/map-tools/tools';
import { TOOL_SPECS } from '../src/core/map-tools/definitions';
import { parseOrbit } from '../src/core/dispatch';
import { serializeOrbitMarkdown } from '../src/core/serializer-markdown';
import type { OrbitEdit, OrbitNode } from '../src/core/types';
import { mount, useMapSize } from './helpers/renderer';

useMapSize(600, 400);

beforeEach(() => {
  document.body.innerHTML = '';
});

const MAP = `---
title: Launch plan
---
# 🚀 Launch
## Research
Talk to ten customers before we build anything.
- [x] Interviews #ux
- Survey
## Build
### Frontend
### Backend
## Marketing
`;

/** Ids and titles of a tree, as an outline. */
const shape = (node: OrbitNode, depth = 0): string[] => {
  return [`${'  '.repeat(depth)}${node.id}: ${node.text}`, ...node.children.flatMap((child) => shape(child, depth + 1))];
};

describe('reading the map', () => {
  test('read_map gives an outline with every id, the attributes and the start of each note', () => {
    const result = createMapTools(MAP).run('read_map');
    expect(result).toMatchObject({ ok: true, changed: false });
    expect(result.text).toBe([
      'The map "Launch plan" has 8 nodes.',
      '- Launch  #launch  (icon: 🚀)',
      '  - Research  #research',
      '    > Talk to ten customers before we build anything.',
      '    - Interviews  #interviews  (status: done; tags: ux)',
      '    - Survey  #survey',
      '  - Build  #build',
      '    - Frontend  #frontend',
      '    - Backend  #backend',
      '  - Marketing  #marketing',
    ].join('\n'));
  });

  test('read_map reads a branch, as many levels down as asked', () => {
    const tools = createMapTools(MAP);
    expect(tools.run('read_map', { node_id: 'research', depth: 1 }).text).toBe([
      '"Research" #research, in Launch, has 2 nodes under it.',
      '- Research  #research',
      '  > Talk to ten customers before we build anything.',
      '  - Interviews  #interviews  (status: done; tags: ux)',
      '  - Survey  #survey',
    ].join('\n'));
    expect(tools.run('read_map', { depth: 1 }).text).toContain('  - Build  #build\n    - … 2 children, 2 nodes in all under it');
  });

  test('a big map is cut short, whole levels first, with what is left out counted', () => {
    const branches = Array.from({ length: 6 }, (_, branch) => `## Branch ${branch + 1}\n${Array.from({ length: 8 }, (_, leaf) => `- Leaf ${branch + 1}.${leaf + 1}`).join('\n')}`);
    const tools = createMapTools(`# Big\n${branches.join('\n')}`, { readLimit: 20 });
    const { text } = tools.run('read_map');
    expect(text).toContain('- Branch 1  #branch-1\n    - … 8 children, 8 nodes in all under it');
    expect(text).not.toContain('Leaf');
    expect(text).toEndWith('Nodes further down aren\'t shown: read a branch with read_map and its node_id, or search with find_nodes.');
    // A node with more children than fit lists as many as fit.
    const wide = createMapTools(`# Wide\n${Array.from({ length: 30 }, (_, index) => `- Idea ${index + 1}`).join('\n')}`, { readLimit: 10 });
    const lines = wide.run('read_map').text.split('\n');
    expect(lines.filter((line) => line.startsWith('  - Idea'))).toHaveLength(9);
    expect(lines).toContain('  - … 21 more children of "Wide" #wide');
  });

  test('find_nodes searches titles, notes and tags, in any case and without accents, and statuses by what they mean', () => {
    const tools = createMapTools('# Viaje\n## Investigación\nHablar con CLIENTES.\n## Diseño #ux <!-- orbit status: shipped -->\n## Pruebas <!-- orbit status: planned -->');
    expect(tools.run('find_nodes', { query: 'investigacion' }).text).toContain('- Investigación  #investigacion  in Viaje');
    expect(tools.run('find_nodes', { query: 'clientes' }).text).toContain('#investigacion');
    expect(tools.run('find_nodes', { tag: '#UX' }).text).toContain('#diseno');
    expect(tools.run('find_nodes', { status: 'done' }).text).toBe('1 node matches:\n- Diseño  #diseno  (status: shipped; tags: ux)  in Viaje');
    expect(tools.run('find_nodes', { status: 'todo' }).text).toContain('#pruebas');
    expect(tools.run('find_nodes', { query: 'presupuesto' }).text).toBe('No node matches. Try fewer or other words, or read the map with read_map.');
    expect(tools.run('find_nodes', {})).toMatchObject({ ok: false, text: 'find_nodes needs something to look for: query, status, tag, or more than one.' });
  });

  test('read_node gives everything about a node, and the nodes that link to it', () => {
    const tools = createMapTools([
      '# Trip',
      '## Summit <!-- orbit priority: 1, owner: Ana -->',
      '![The view from the top](photos/summit.jpg)',
      'We made it. See [the camp](#camp).',
      '- Tent',
      '## Camp',
      '<!-- orbit link: "#summit" -->',
    ].join('\n'));
    expect(tools.run('read_node', { node_id: 'summit' }).text).toBe([
      '"Summit" #summit',
      'Where: Trip › Summit',
      'Priority: 1',
      'Picture: photos/summit.jpg (alt: The view from the top)',
      'Other attributes: owner: Ana',
      'Note:',
      'We made it. See [the camp](#camp).',
      'Children (1): "Tent" #tent',
      'Linked from: "Camp" #camp',
    ].join('\n'));
  });
});

describe('ids a model gets wrong', () => {
  test('an id with its #, or a title only one node has, finds the node; the result teaches the id', () => {
    const tools = createMapTools(MAP);
    expect(tools.run('read_node', { node_id: '#survey' }).text).toStartWith('"Survey" #survey');
    const byTitle = tools.run('read_node', { node_id: 'Survey' });
    expect(byTitle.text).toEndWith('Note: node_id takes ids: the id of "Survey" is #survey.');
  });

  test('an unknown id names the one it probably meant, and a title two nodes have names both', () => {
    const tools = createMapTools('# Trip\n## Food\n- Ideas\n## Places\n- Ideas');
    expect(tools.run('read_node', { node_id: 'fod' }).text).toBe('No node has the id "fod". Did you mean "Food" #food? read_map and find_nodes give every node\'s id.');
    expect(tools.run('remove_node', { node_id: 'Ideas' })).toEqual({
      ok: false,
      text: '2 nodes are called "Ideas": "Ideas" #ideas under "Food", "Ideas" #ideas-2 under "Places". Give node_id one of their ids. Nothing changed.',
      changed: false,
    });
  });

  test('an id from before a rename still finds the node, and a removed one says it was removed', () => {
    const tools = createMapTools(MAP);
    expect(tools.run('update_node', { node_id: 'survey', text: 'Customer survey' }).text).toBe('Changed "Customer survey" #customer-survey: set its title. Its id is #customer-survey now: it was #survey.');
    expect(tools.run('update_node', { node_id: 'survey', status: 'active' }).text).toBe('Changed "Customer survey" #customer-survey: set its status.\nNote: #survey is "Customer survey" #customer-survey now.');
    tools.run('remove_node', { node_id: 'build' });
    expect(tools.run('move_node', { node_id: 'frontend', parent_id: 'research' }).text).toBe('node_id names #frontend, but "Frontend" was removed. Nothing changed.');
  });
});

describe('adding nodes', () => {
  test('add_nodes reads a markdown outline, at any depth, with statuses, tags, icons, notes and attributes', () => {
    const tools = createMapTools(MAP);
    const result = tools.run('add_nodes', {
      parent_id: 'marketing',
      outline: '- Social media\n  - [ ] Instagram #social\n  - TikTok\n- Newsletter\n  A weekly email with what shipped.\n- 📣 Launch event <!-- orbit priority: 1, color: tomato -->',
    });
    expect(result).toEqual({
      ok: true,
      changed: true,
      text: [
        'Added 5 nodes under "Marketing" #marketing:',
        '- Social media  #social-media',
        '  - Instagram  #instagram  (status: todo; tags: social)',
        '  - TikTok  #tiktok',
        '- Newsletter  #newsletter',
        '  > A weekly email with what shipped.',
        '- Launch event  #launch-event  (icon: 📣; priority: 1; color: tomato)',
      ].join('\n'),
    });
    // Saved, the map reads back as it was changed.
    const saved = parseOrbit(serializeOrbitMarkdown(tools.document!));
    expect(shape(saved.root)).toEqual(shape(tools.document!.root));
    expect(saved.root.children[2].children[2]).toMatchObject({ text: 'Launch event', icon: '📣', priority: 1, color: 'tomato' });
  });

  test('new nodes go where index says, take ids no node has, and lines of plain text are a node each', () => {
    const tools = createMapTools(MAP);
    expect(tools.run('add_nodes', { parent_id: 'build', outline: 'Testing\nFrontend', index: 1 }).text).toBe([
      'Added 2 nodes under "Build" #build, after "Frontend" #frontend:',
      '- Testing  #testing',
      '- Frontend  #frontend-2',
      'Note: "Frontend" #frontend-2 has the same title as "Frontend" #frontend beside it. If it\'s there twice by mistake, remove one with remove_node.',
    ].join('\n'));
    expect(tools.document!.root.children[1].children.map((node) => node.id)).toEqual(['frontend', 'testing', 'frontend-2', 'backend']);
    expect(tools.run('add_nodes', { parent_id: 'build', outline: '- Docs', index: 0 }).text).toStartWith('Added 1 node under "Build" #build, first, before "Frontend" #frontend:');
  });

  test('an outline that doesn\'t read cleanly adds nothing, and says what to fix', () => {
    const tools = createMapTools(MAP);
    expect(tools.run('add_nodes', { parent_id: 'build', outline: '- QA <!-- orbit colour: tomato, priority: high -->' })).toEqual({
      ok: false,
      changed: false,
      text: [
        'outline doesn\'t read cleanly. Fix these, and send it again:',
        '- Line 1: Unknown attribute "colour". Did you mean "color"?',
        '- Line 1: priority must be a number',
        'Lines count from the outline\'s first line. Nothing changed.',
      ].join('\n'),
    });
    expect(tools.run('add_nodes', { parent_id: 'build', outline: '---\ntitle: X\n---\n- QA' }).text).toBe('outline takes the nodes to add as a markdown list, without frontmatter. Nothing changed.');
    expect(tools.run('add_nodes', { parent_id: 'build', outline: '  ' }).ok).toBe(false);
    expect(shape(tools.document!.root)).toHaveLength(8);
  });

  test('a link to no node is pointed out, with the id it probably meant', () => {
    const tools = createMapTools(MAP);
    expect(tools.run('add_nodes', { parent_id: 'build', outline: '- [Release](#reserch)' }).text).toEndWith('Note: "Release" #release links to #reserch, but no node has that id. Did you mean #research?');
  });
});

describe('changing nodes', () => {
  test('update_node changes only what it names, and clear removes attributes', () => {
    const tools = createMapTools(MAP);
    expect(tools.run('update_node', { node_id: 'interviews', note: 'Eight done, two to go.', priority: '2', tags: 'ux, research', clear: ['status'] }).text)
      .toBe('Changed "Interviews" #interviews: set its note, priority and tags; removed its status.');
    const interviews = tools.document!.root.children[0].children[0];
    expect(interviews).toMatchObject({ note: 'Eight done, two to go.', priority: 2, tags: ['ux', 'research'] });
    expect(interviews.status).toBeUndefined();
    expect(tools.run('update_node', { node_id: 'interviews', clear: ['color'] })).toEqual({ ok: true, changed: false, text: '"Interviews" #interviews has no color to remove: nothing changed.' });
    expect(tools.run('update_node', { node_id: 'interviews' }).text).toStartWith('update_node needs something to change: text, note, status');
  });

  test('a title that starts with an emoji sets the icon, as the map reads it back', () => {
    const tools = createMapTools(MAP);
    tools.run('update_node', { node_id: 'survey', text: '📊 Customer survey' });
    expect(tools.document!.root.children[0].children[1]).toMatchObject({ id: 'customer-survey', text: 'Customer survey', icon: '📊' });
  });

  test('values the map can\'t use change nothing, and say what it takes', () => {
    const tools = createMapTools(MAP);
    const text = (input: Record<string, unknown>) => tools.run('update_node', { node_id: 'survey', ...input }).text;
    expect(text({ color: 'light blue' })).toBe('"light blue" isn\'t a CSS color. Use a color name, such as tomato, or a code, such as #E8A33D. Nothing changed.');
    expect(text({ icon: 'chart' })).toBe('icon takes an emoji, such as 🚀, not "chart". Nothing changed.');
    expect(text({ link: '#reserch' })).toBe('link #reserch points at no node. Did you mean #research? Node links are # and a node\'s id. Nothing changed.');
    expect(text({ link: 'javascript:alert(1)' })).toStartWith('"javascript:alert(1)" isn\'t an address the map can open');
    expect(text({ priority: 'high' })).toBe('priority takes a number, like 1, not "high". Nothing changed.');
    expect(text({ text: '  ' })).toStartWith('text can\'t be empty');
    expect(text({ status: 'done', clear: ['status'] })).toBe('status is both given and in clear: give it a value, or clear it. Nothing changed.');
    expect(text({ clear: ['owner'] })).toBe('clear can\'t take "owner". It takes note, status, priority, tags, icon, color, link, image, video, embed and collapsed. Nothing changed.');
    expect(tools.document!.root.children[0].children[1]).toEqual(parseOrbit(MAP).root.children[0].children[1]);
  });

  test('pictures, videos and pages take an address, or an object with one', () => {
    const tools = createMapTools(MAP);
    tools.run('update_node', { node_id: 'survey', image: { src: 'https://example.com/chart.png', alt: 'Answers by week' }, video: 'https://youtu.be/aqz-KE-bpKQ' });
    expect(tools.document!.root.children[0].children[1]).toMatchObject({ image: { src: 'https://example.com/chart.png', alt: 'Answers by week' }, video: { src: 'https://youtu.be/aqz-KE-bpKQ' } });
    expect(tools.run('update_node', { node_id: 'survey', embed: { caption: 'Results' } }).text).toBe('embed needs src: the page\'s address. Nothing changed.');
  });
});

describe('moving and removing nodes', () => {
  test('move_node moves a branch under another node, or to another place among its siblings', () => {
    const tools = createMapTools(MAP);
    expect(tools.run('move_node', { node_id: 'survey', parent_id: 'marketing' }).text).toBe('Moved "Survey" #survey under "Marketing" #marketing.');
    expect(tools.run('move_node', { node_id: 'build', parent_id: 'research', index: 0 }).text).toBe('Moved "Build" #build, with the 2 nodes under it, under "Research" #research, first, before "Interviews" #interviews.');
    expect(tools.run('move_node', { node_id: 'interviews', index: 0 }).text).toBe('Moved "Interviews" #interviews under "Research" #research, first, before "Build" #build.');
  });

  test('a move that can\'t be made says why', () => {
    const tools = createMapTools(MAP);
    expect(tools.run('move_node', { node_id: 'build', parent_id: 'frontend' }).text).toBe('"Build" #build can\'t go under "Frontend" #frontend, which is inside it. Move "Frontend" #frontend out of it first, or choose another parent. Nothing changed.');
    expect(tools.run('move_node', { node_id: 'build', parent_id: 'build' }).text).toBe('"Build" #build can\'t go under itself. Give parent_id another node. Nothing changed.');
    expect(tools.run('move_node', { node_id: 'launch', parent_id: 'build' }).text).toBe('"Launch" #launch is the root: it can\'t move, as every other node is under it. Nothing changed.');
    expect(tools.run('move_node', { node_id: 'build' }).text).toBe('move_node needs where to move the node: parent_id, index, or both. Nothing changed.');
  });

  test('reorder_children puts all the children in a new order at once', () => {
    const tools = createMapTools(MAP);
    expect(tools.run('reorder_children', { parent_id: 'launch', order: ['#marketing', 'Build', 'research'] }).text).toBe('The children of "Launch" #launch are in this order now: "Marketing" #marketing, "Build" #build, "Research" #research.');
    expect(tools.run('reorder_children', { parent_id: 'launch', order: ['marketing', 'build', 'research'] })).toMatchObject({ ok: true, changed: false });
    expect(tools.run('reorder_children', { parent_id: 'launch', order: ['marketing', 'build'] }).text).toBe('order needs all 3 children of "Launch" #launch, and leaves out "Research" #research. Nothing changed.');
    expect(tools.run('reorder_children', { parent_id: 'launch', order: ['marketing', 'marketing', 'build', 'research'] }).text).toBe('order lists "Marketing" #marketing twice: list each child once. Nothing changed.');
    expect(tools.run('reorder_children', { parent_id: 'launch', order: ['survey'] }).text).toBe('survey isn\'t a child of "Launch" #launch. Its children: "Marketing" #marketing, "Build" #build, "Research" #research. Nothing changed.');
  });

  test('remove_node removes a branch, never the root', () => {
    const tools = createMapTools(MAP);
    expect(tools.run('remove_node', { node_id: 'research' }).text).toBe('Removed "Research" #research and the 2 nodes under it.');
    expect(tools.run('remove_node', { node_id: 'launch' }).text).toStartWith('"Launch" #launch is the root, and the map is all under it: it can\'t be removed.');
    expect(shape(tools.document!.root)).toEqual(['launch: Launch', '  build: Build', '    frontend: Frontend', '    backend: Backend', '  marketing: Marketing']);
  });
});

describe('calls a model gets wrong', () => {
  test('an unknown tool names the one it probably meant', () => {
    expect(createMapTools(MAP).run('add_node', {}).text).toBe('There\'s no tool "add_node". Did you mean add_nodes? The tools are read_map, find_nodes, read_node, add_nodes, update_node, move_node, reorder_children and remove_node.');
  });

  test('input comes as an object or as JSON text; fields under other names count, misspelled ones change nothing, others are left out', () => {
    const tools = createMapTools(MAP);
    expect(tools.run('add_nodes', '{"parent_id": "build", "outline": "- QA"}').ok).toBe(true);
    expect(tools.run('add_nodes', '{"parent_id": "build",').text).toStartWith('add_nodes\'s input isn\'t valid JSON');
    expect(tools.run('add_nodes', ['build']).text).toBe('add_nodes takes an object, like {"parent_id": "…"}, not a list. Nothing changed.');
    expect(tools.run('update_node', { id: 'qa', title: 'Testing', colour: 'tomato', index: null }).text).toBe('Changed "Testing" #testing: set its title and color. Its id is #testing now: it was #qa.');
    expect(tools.run('update_node', { node_id: 'testing', stauts: 'done' }).text).toBe('update_node has no field "stauts". Did you mean "status"? It takes node_id, text, note, status, priority, tags, icon, color, link, image, video, embed, collapsed and clear. Nothing changed.');
    expect(tools.run('update_node', { node_id: 'testing', status: 'done', reason: 'Asked for it' }).text).toBe('Changed "Testing" #testing: set its status.\nNote: update_node doesn\'t take "reason", so it was left out. It takes node_id, text, note, status, priority, tags, icon, color, link, image, video, embed, collapsed and clear.');
    expect(tools.run('read_node', {}).text).toBe('read_node needs node_id: the node to read, by the id read_map or find_nodes gave.');
  });
});

describe('what a map offers', () => {
  test('readOnly offers only the tools that read, and refuses the others', () => {
    const tools = createMapTools(MAP, { readOnly: true });
    expect(tools.definitions.map((definition) => definition.name)).toEqual(['read_map', 'find_nodes', 'read_node']);
    expect(tools.run('remove_node', { node_id: 'build' }).text).toBe('remove_node isn\'t available: this map can only be read.');
    expect(tools.instructions).toStartWith('You can read the mind map with the map tools.');
  });

  test('a map written for a newer version of the format is read, not changed', () => {
    const tools = createMapTools('---\nschemaVersion: 99\n---\n# Future\n## Idea');
    expect(tools.run('read_map').ok).toBe(true);
    expect(tools.run('remove_node', { node_id: 'idea' }).text).toStartWith('This map was written for a newer version of Orbit');
  });

  test('a parsed document is changed in place', () => {
    const document = parseOrbit(MAP);
    createMapTools(document).run('remove_node', { node_id: 'marketing' });
    expect(document.root.children.map((node) => node.id)).toEqual(['research', 'build']);
    expect(() => createMapTools(null as never)).toThrow('createMapTools() takes a map on screen');
  });
});

describe('definitions', () => {
  const tools = createMapTools(MAP);

  test('each tool has a name, a description and an input schema with only what every provider reads', () => {
    for (const definition of tools.definitions) {
      expect(definition.name).toMatch(/^[a-z_]+$/);
      expect(definition.description.length).toBeGreaterThan(40);
      expect(definition.inputSchema.type).toBe('object');
      expect(Object.keys(definition.inputSchema.properties).length).toBeGreaterThan(0);
      const text = JSON.stringify(definition.inputSchema);

      for (const keyword of ['$ref', '$defs', 'anyOf', 'oneOf', 'additionalProperties', 'default', '"null"']) {
        expect(text).not.toContain(keyword);
      }
    }

    expect(tools.definitions.find((definition) => definition.name === 'remove_node')?.annotations).toEqual({ readOnlyHint: false, destructiveHint: true });
  });

  test('they come in each provider\'s shape', () => {
    const [read] = tools.definitions;
    expect(tools.for('anthropic')[0]).toEqual({ name: 'read_map', description: read.description, input_schema: read.inputSchema });
    expect(tools.for('openai')[0]).toEqual({ type: 'function', name: 'read_map', description: read.description, parameters: read.inputSchema, strict: false });
    expect(tools.for('openai-chat')[0]).toEqual({ type: 'function', function: { name: 'read_map', description: read.description, parameters: read.inputSchema } });
    expect(tools.for('gemini')).toEqual([{ functionDeclarations: tools.definitions.map(({ name, description, inputSchema }) => ({ name, description, parametersJsonSchema: inputSchema })) }]);
    expect(() => tools.for('claude' as never)).toThrow('Map tools come in the shapes of "anthropic", "openai", "openai-chat", "gemini", not "claude".');
  });

  test('changing what for() gives changes nothing else', () => {
    const [read] = tools.for('anthropic');
    read.input_schema.properties.node_id.description = 'Changed';
    expect(tools.for('anthropic')[0].input_schema.properties.node_id.description).not.toBe('Changed');
  });
});

describe('a map on screen', () => {
  test('changes animate as edits, fire edit, and save', () => {
    const edits: OrbitEdit[] = [];
    const { renderer } = mount(MAP, { onEdit: (edit) => edits.push(edit) });
    const tools = createMapTools(renderer);
    tools.run('add_nodes', { parent_id: 'marketing', outline: '- Social media\n  - Instagram\n- Newsletter' });
    tools.run('update_node', { node_id: 'survey', status: 'done' });
    tools.run('move_node', { node_id: 'backend', parent_id: 'marketing' });
    tools.run('remove_node', { node_id: 'frontend' });
    expect(edits.map((edit) => `${edit.kind} ${edit.node.id}`)).toEqual(['add social-media', 'add newsletter', 'update survey', 'move backend', 'remove frontend']);
    expect(shape(parseOrbit(renderer.toMarkdown()).root)).toEqual([
      'launch: Launch',
      '  research: Research',
      '    interviews: Interviews',
      '    survey: Survey',
      '  build: Build',
      '  marketing: Marketing',
      '    social-media: Social media',
      '      instagram: Instagram',
      '    newsletter: Newsletter',
      '    backend: Backend',
    ]);
  });

  test('read_map says what the reader is looking at, and show_node takes them to a node', () => {
    const { renderer } = mount(MAP);
    const tools = createMapTools(renderer);
    expect(tools.definitions.map((definition) => definition.name)).toContain('show_node');
    expect(tools.run('read_map').text).toStartWith('The map "Launch plan" has 8 nodes. The reader is looking at "Launch" #launch.');
    expect(tools.run('show_node', { node_id: 'build' }).text).toBe('The map shows "Build" #build now, with its children around it.');
    expect(renderer.getFocusedNode()?.id).toBe('build');
    renderer.overview();
    expect(tools.run('read_map').text).toStartWith('The map "Launch plan" has 8 nodes. The reader is looking at the whole map.');
    expect(tools.instructions).toEndWith('- The reader sees each change on the map as you make it, and show_node takes them to a node.');
  });

  test('a renamed node in focus stays in focus, under its new id', () => {
    const { renderer } = mount(MAP, { focus: 'build' });
    createMapTools(renderer).run('update_node', { node_id: 'build', text: 'Engineering' });
    expect(renderer.getFocusedNode()?.id).toBe('engineering');
  });
});

describe('the guide', () => {
  const guide = readFileSync(join(import.meta.dir, '../docs/map-tools.md'), 'utf8');

  test('shows what the tools say to the calls it describes', () => {
    const shown = /```text\n([\s\S]*?)```/.exec(guide)![1].trim().split('\n\n');
    const tools = createMapTools('# Launch\n## Build\n### Frontend\n## Marketing');
    expect([
      tools.run('read_node', { node_id: 'lanch' }).text,
      tools.run('move_node', { node_id: 'build', parent_id: 'frontend' }).text,
      tools.run('add_nodes', { parent_id: 'marketing', outline: '- Social media\n- Newsletter <!-- orbit colour: tomato -->' }).text,
    ]).toEqual(shown);
  });

  test('its outline adds what it says', () => {
    const tools = createMapTools(MAP);
    const result = tools.run('add_nodes', JSON.parse(/```json\n([\s\S]*?)```/.exec(guide)![1]));
    expect(result.text).toContain('- Instagram  #instagram  (status: todo; tags: social)');
    expect(result.text).toContain('  > A weekly email with what shipped.');
  });

  test('lists every tool, with every field it takes', () => {
    for (const spec of TOOL_SPECS) {
      const row = guide.split('\n').find((line) => line.startsWith(`| \`${spec.name}\` |`));
      expect(row).toBeDefined();

      for (const field of Object.keys(spec.fields)) {
        expect(row).toContain(`\`${field}\``);
      }
    }
  });
});
