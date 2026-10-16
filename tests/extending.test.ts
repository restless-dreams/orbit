import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { parseOrbit } from '../src/core/dispatch';
import { documentToRendererOptions } from '../src/core/document-options';
import { registerAction, registerNodeType, registerStatus, type OrbitAction, type OrbitNodeType } from '../src/core/extensions';
import { registerTheme, themeNames, themeTokens } from '../src/core/themes';
import { renderToSVGString } from '../src/core/render-to-svg';
import { serializeOrbitMarkdown } from '../src/core/serializer-markdown';
import { serializeOrbitYAML } from '../src/core/serializer-yaml';
import type { OrbitActionDetail } from '../src/core/types';
import { click, mount, node, useMapSize } from './helpers/renderer';

useMapSize(600, 400);

const cleanups: (() => void)[] = [];

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  while (cleanups.length > 0) {
    cleanups.pop()!();
  }
});

/** Registers for this test only. */
const scoped = (unregister: () => void): void => {
  cleanups.push(unregister);
};

const MAP = `# Launch
## Research <!-- orbit type: milestone -->
- Interviews
## Build
- App shell <!-- orbit type: person -->
## Ship`;

describe('named themes', () => {
  test('a registered theme works as an option, in frontmatter and in exports', () => {
    scoped(registerTheme('brand', { preset: 'night', tokens: { 'color-root': '#FFD166' } }));
    const { host } = mount('# Launch\n## Research', { theme: 'brand' });
    const root = host.querySelector<HTMLElement>('.orbit')!;
    expect(root.dataset.orbitTheme).toBe('night');
    expect(root.style.getPropertyValue('--_orbit-color-root')).toBe('var(--orbit-color-root, #FFD166)');

    const fromFrontmatter = parseOrbit('---\ntheme: brand\n---\n# Launch');
    expect(fromFrontmatter.diagnostics).toEqual([]);
    expect(documentToRendererOptions(fromFrontmatter.options).theme).toBe('brand');

    expect(themeNames()).toContain('brand');
    expect(themeTokens('brand')['color-root']).toBe('#FFD166');
    expect(renderToSVGString('# Launch', { theme: 'brand' })).toContain('fill="#ffd166"');
  });

  test('a theme object can start from a registered theme and add its own tokens', () => {
    scoped(registerTheme('brand', { preset: 'night', tokens: { 'color-root': '#FFD166', 'color-1': '#06D6A0' } }));
    const { host } = mount('# Launch', { theme: { preset: 'brand', tokens: { 'color-1': '#118AB2' } } });
    const root = host.querySelector<HTMLElement>('.orbit')!;
    expect(root.dataset.orbitTheme).toBe('night');
    expect(root.style.getPropertyValue('--_orbit-color-root')).toBe('var(--orbit-color-root, #FFD166)');
    expect(root.style.getPropertyValue('--_orbit-color-1')).toBe('var(--orbit-color-1, #118AB2)');
  });

  test("a theme can't take a built-in name, and an unregistered name is reported", () => {
    expect(() => registerTheme('night', {})).toThrow(/one of Orbit's own themes/);
    const unregister = registerTheme('brand', { preset: 'glass' });
    unregister();
    expect(parseOrbit('---\ntheme: brand\n---\n# Launch').diagnostics?.map((diagnostic) => diagnostic.code)).toEqual(['invalid-option-value']);
  });
});

describe('status words', () => {
  test('a word maps to a tone or a color, on the dot, the CSS hook and the detail sheet', () => {
    const { host } = mount('# Launch <!-- orbit status: review -->\n> A note.\n## Research <!-- orbit status: on hold -->', {
      statuses: { review: 'active', 'On Hold': '#A855F7' },
    });
    expect(node(host, 'launch').querySelector('.orbit-node__status--active')).not.toBeNull();
    const held = node(host, 'research');
    expect(held.dataset.orbitStatus).toBe('on hold');
    expect(held.querySelector<SVGElement>('.orbit-node__status')!.style.fill).toBe('#A855F7');

    click(host.querySelector('.orbit-action--note')!);
    const chip = host.querySelector<HTMLElement>('dialog[open] .orbit-sheet__chip--status')!;
    expect(chip.style.getPropertyValue('--orbit-chip-dot')).toBe('var(--_orbit-status-active)');
  });

  test('registered words apply to every map, after the map\'s own', () => {
    scoped(registerStatus('shipped it', 'done'));
    scoped(registerStatus('review', 'blocked'));
    const { host } = mount('# Launch <!-- orbit status: shipped it -->\n## Research <!-- orbit status: review -->', { statuses: { review: 'active' } });
    expect(node(host, 'launch').querySelector('.orbit-node__status--done')).not.toBeNull();
    expect(node(host, 'research').querySelector('.orbit-node__status--active')).not.toBeNull();
  });

  test('exports color the dot the same way', () => {
    // Exports write colors in lowercase hex.
    expect(renderToSVGString('# Launch <!-- orbit status: on hold -->', { statuses: { 'on hold': '#A855F7' } })).toContain('fill="#a855f7"');
  });
});

describe('node types', () => {
  const TYPES: Record<string, OrbitNodeType> = {
    milestone: { label: 'Milestone', icon: '🏁', color: '#F59E0B', tokens: { 'node-stroke-width': '4' } },
  };

  test('a type gives its nodes an icon, a color and tokens, unless they set their own', () => {
    const { host } = mount(`${MAP}\n## Party <!-- orbit type: Milestone, icon: 🎉, color: "#EC4899" -->`, { nodeTypes: TYPES });
    const research = node(host, 'research');
    expect(research.dataset.orbitType).toBe('milestone');
    expect(research.querySelector<SVGElement>('.orbit-node__disc')!.style.fill).toBe('#F59E0B');
    expect(research.style.getPropertyValue('--_orbit-node-stroke-width')).toBe('4');
    const label = host.querySelector<HTMLElement>('.orbit-label[data-orbit-for="research"]')!;
    expect(label.querySelector('.orbit-label__icon')?.textContent).toBe('🏁');
    expect(label.style.getPropertyValue('--_orbit-node-stroke-width')).toBe('4');
    expect(research.getAttribute('aria-label')).toBe('🏁 Research, Milestone, 1 item');

    const party = node(host, 'party');
    expect(party.querySelector<SVGElement>('.orbit-node__disc')!.style.fill).toBe('#EC4899');
    expect(host.querySelector('.orbit-label[data-orbit-for="party"] .orbit-label__icon')?.textContent).toBe('🎉');
  });

  test('render() draws into a box over the node, moves the label outside, and cleans up', () => {
    const cleanup = mock(() => undefined);

    const render = mock((shown: { text: string }, element: HTMLElement) => {
      element.textContent = shown.text.slice(0, 2).toUpperCase();
      return cleanup;
    });

    const { host, renderer } = mount(MAP, { nodeTypes: { milestone: { render } } });
    const content = host.querySelector<HTMLElement>('.orbit__contents .orbit-node-content[data-orbit-for="research"]')!;
    expect(content.textContent).toBe('RE');
    expect(content.style.transform).toMatch(/^translate3d\(.+\) scale\(/);
    expect(render).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.orbit-label[data-orbit-for="research"]')?.classList.contains('orbit-label--outside')).toBe(true);
    renderer.render(parseOrbit('# Launch\n## Build'));
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.orbit-node-content')).toBeNull();
  });

  test('details() adds a section and a "Show details" button; the sheet names the type', () => {
    const { host, renderer } = mount(MAP, {
      nodeTypes: {
        milestone: {
          label: 'Milestone',
          details: (shown, element) => {
            element.textContent = `Due with ${shown.children.length} task`;
          },
        },
      },
    });
    renderer.focusNode('research');
    const button = host.querySelector<HTMLButtonElement>('.orbit-action--details')!;
    expect(button.getAttribute('aria-label')).toBe('Show details');
    click(button);
    const dialog = host.querySelector('dialog[open]')!;
    expect(dialog.querySelector('.orbit-sheet__details')?.textContent).toBe('Due with 1 task');
    expect(dialog.querySelector('.orbit-sheet__chip--type')?.textContent).toBe('Milestone');
  });

  test('registered types apply to every map; a map\'s own type wins', () => {
    scoped(registerNodeType('person', { icon: '👤' }));
    scoped(registerNodeType('milestone', { icon: '🧱' }));
    const { host } = mount(MAP, { nodeTypes: { milestone: { icon: '🏁' } } });
    expect(host.querySelector('.orbit-label[data-orbit-for="research"] .orbit-label__icon')?.textContent).toBe('🏁');
    expect(renderToSVGString(MAP, { focus: 'build' })).toContain('👤');
  });

  test('a render() that throws is reported, and the map still draws', () => {
    const error = spyOn(console, 'error').mockImplementation(() => undefined);
    const { host } = mount(MAP, { nodeTypes: { milestone: { render: () => { throw new Error('boom'); } } } });
    expect(error).toHaveBeenCalled();
    expect(String(error.mock.calls[0][0])).toContain('"milestone" node type\'s render()');
    expect(node(host, 'research')).toBeDefined();
    error.mockRestore();
  });

  test('exports use the type\'s icon, color and tokens', () => {
    const svg = renderToSVGString(MAP, { nodeTypes: { milestone: { icon: '🏁', color: '#F59E0B', tokens: { 'node-stroke-width': '4' } } } });
    expect(svg).toContain('🏁');
    expect(svg).toContain('fill="#f59e0b"');
    expect(svg).toContain('stroke-width="4"');
  });

  test('the type attribute reads back from markdown and YAML; kind suggests it', () => {
    const doc = parseOrbit(MAP);
    expect(doc.root.children[0].type).toBe('milestone');
    expect(parseOrbit(serializeOrbitMarkdown(doc)).root.children[0].type).toBe('milestone');
    expect(parseOrbit(serializeOrbitYAML(doc)).root.children[0].type).toBe('milestone');
    expect(parseOrbit('# A <!-- orbit kind: milestone -->').diagnostics?.[0].message).toContain('Did you mean "type"?');
  });
});

describe('types for display only', () => {
  const RINGS = `# Launch
## Research <!-- orbit type: milestone -->
- Interviews
## 🧪 Build
- App shell
## Ship`;
  /** Nodes with ideas under them and no type of their own are drawn as rings. */
  const rings = (shown: { type?: string; children: unknown[] }) => (!shown.type && shown.children.length > 0 ? 'ring' : undefined);
  const ring: OrbitNodeType = { label: 'Ring', render: (_shown, element) => { element.textContent = 'ring'; } };

  test('nodeTypeFor gives a node that names no type one to be drawn as; a type of its own wins', () => {
    const { host } = mount(RINGS, { nodeTypes: { ring, milestone: { label: 'Milestone' } }, nodeTypeFor: rings });
    expect(node(host, 'build').dataset.orbitType).toBe('ring');
    expect(node(host, 'build').getAttribute('aria-label')).toBe('🧪 Build, Ring, 1 item');
    expect(host.querySelector('.orbit-node-content[data-orbit-for="build"]')?.textContent).toBe('ring');
    expect(node(host, 'research').dataset.orbitType).toBe('milestone');
    expect(host.querySelector('.orbit-node-content[data-orbit-for="research"]')).toBeNull();
    expect(node(host, 'ship').dataset.orbitType).toBeUndefined();
  });

  test('the icon of a node drawn with content moves onto its pill', () => {
    const { host } = mount(RINGS, { nodeTypes: { ring }, nodeTypeFor: rings });
    const label = host.querySelector<HTMLElement>('.orbit-label[data-orbit-for="build"]')!;
    expect(label.classList.contains('orbit-label--outside')).toBe(true);
    expect(label.querySelector('.orbit-label__text')?.textContent).toBe('🧪 Build');
  });

  test('a type given for display is never written to the map, nor upgraded', () => {
    const upgrade = mock(() => undefined);
    const { renderer } = mount(RINGS, { nodeTypes: { ring: { ...ring, version: 2, upgrade } }, nodeTypeFor: rings });
    renderer.updateNode('ship', { status: 'done' });
    const build = renderer.getDocument()!.root.children[1];
    expect(build.type).toBeUndefined();
    expect(build.typeVersion).toBeUndefined();
    expect(upgrade).not.toHaveBeenCalled();
    const markdown = renderer.toMarkdown();
    expect(markdown).not.toContain('type: ring');
    expect(markdown).toContain('## 🧪 Build\n');
    expect(parseOrbit(markdown).root.children[1].type).toBeUndefined();
  });

  test('nodeTypeFor is asked again as the map draws, so its answer can change', () => {
    let on = true;
    const { host, renderer } = mount(RINGS, { nodeTypes: { ring }, nodeTypeFor: (shown) => (on ? rings(shown) : undefined) });
    expect(host.querySelector('.orbit-node-content[data-orbit-for="build"]')).not.toBeNull();
    on = false;
    renderer.render(renderer.getDocument()!);
    expect(host.querySelector('.orbit-node-content[data-orbit-for="build"]')).toBeNull();
  });

  test('a node whose answer changes with an edit elsewhere on the map is drawn again as its new type', () => {
    const withToDos = (shown: { children: { status?: string }[] }) => (shown.children.some((child) => child.status) ? 'ring' : undefined);
    const { host, renderer } = mount(RINGS, { nodeTypes: { ring }, nodeTypeFor: withToDos, editable: true });
    expect(node(host, 'build').dataset.orbitType).toBeUndefined();
    renderer.updateNode('app-shell', { status: 'todo' });
    expect(node(host, 'build').dataset.orbitType).toBe('ring');
    expect(node(host, 'build').getAttribute('aria-label')).toContain('Ring');
    expect(host.querySelector<HTMLElement>('.orbit-label[data-orbit-for="build"]')?.dataset.orbitType).toBe('ring');
    expect(host.querySelector('.orbit-node-content[data-orbit-for="build"]')?.textContent).toBe('ring');
    renderer.updateNode('app-shell', { status: undefined });
    expect(node(host, 'build').dataset.orbitType).toBeUndefined();
    expect(host.querySelector('.orbit-node-content[data-orbit-for="build"]')).toBeNull();
  });

  test('exports draw a type given for display, with its icon and tokens', () => {
    const svg = renderToSVGString(RINGS, { nodeTypes: { ring: { icon: '⭕', tokens: { 'node-stroke-width': '7' } } }, nodeTypeFor: (shown) => (shown.id === 'ship' ? 'ring' : undefined) });
    expect(svg).toContain('⭕');
    expect(svg).toContain('stroke-width="7"');
  });

  test('a nodeTypeFor that throws is reported once, and the nodes are drawn as they are', () => {
    const error = spyOn(console, 'error').mockImplementation(() => undefined);
    const { host, renderer } = mount(RINGS, { nodeTypes: { ring }, nodeTypeFor: () => { throw new Error('boom'); } });
    renderer.render(renderer.getDocument()!);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('nodeTypeFor()');
    expect(node(host, 'build').dataset.orbitType).toBeUndefined();
    renderer.destroy();
    error.mockRestore();
  });
});

describe('actions', () => {
  const assign: OrbitAction = { id: 'assign', label: 'Assign', icon: '👤', run: () => undefined };

  test('your actions follow Orbit\'s buttons, with an emoji, a path, an icon name or a letter', () => {
    const { host } = mount('# Launch\n> A note.', {
      actions: [
        assign,
        { id: 'edit', label: 'Edit', icon: 'M4 20h4L20 8l-4-4L4 16z', run: () => undefined },
        { id: 'list', label: 'List', icon: 'list', run: () => undefined },
        { id: 'share', label: (shown) => `Share ${shown.text}`, run: () => undefined },
      ],
    });
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('.orbit-actions button'));
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['Read note', 'Assign', 'Edit', 'List', 'Share Launch']);
    expect(buttons[1].querySelector('.orbit-icon--glyph')?.textContent).toBe('👤');
    expect(buttons[2].querySelector('path')?.getAttribute('d')).toBe('M4 20h4L20 8l-4-4L4 16z');
    expect(buttons[3].querySelector('svg.orbit-icon')).not.toBeNull();
    expect(buttons[4].querySelector('.orbit-icon--glyph')?.textContent).toBe('S');
  });

  test('pressing one fires the action event, then runs it; when() picks the nodes', () => {
    const run = mock((shown: { id: string }) => shown.id);
    const events: string[] = [];
    const { host, renderer } = mount('# Launch\n## Research', { actions: [{ id: 'assign', label: 'Assign', when: (shown) => shown.id === 'launch', run }] });
    renderer.on('action', (detail) => events.push(detail.action));
    click(host.querySelector('.orbit-action--custom')!);
    expect(events).toEqual(['assign']);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0].id).toBe('launch');
    renderer.focusNode('research');
    expect(host.querySelector('.orbit-action--custom')).toBeNull();
  });

  test('preventDefault() in the action event, or onAction returning false, keeps it from running', () => {
    const run = mock(() => undefined);
    const prevented = mount('# Launch', { actions: [{ ...assign, run }] });
    prevented.renderer.on('action', (detail: OrbitActionDetail) => detail.preventDefault());
    click(prevented.host.querySelector('.orbit-action--custom')!);
    const declined = mount('# Launch', { actions: [{ ...assign, run }], onAction: () => false });
    click(declined.host.querySelector('.orbit-action--custom')!);
    expect(run).not.toHaveBeenCalled();
  });

  test('the detail sheet lists them; pressing one closes the sheet and runs it', () => {
    const run = mock(() => undefined);
    const { host } = mount('# Launch\n> A note.', { actions: [{ ...assign, run }] });
    click(host.querySelector('.orbit-action--note')!);
    const button = host.querySelector<HTMLButtonElement>('dialog[open] .orbit-sheet__action')!;
    expect(button.textContent).toBe('👤Assign');
    click(button);
    expect(host.querySelector('dialog[open]')).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('a type\'s actions show only on its nodes; registered actions show everywhere, once', () => {
    scoped(registerAction({ id: 'archive', label: 'Archive', run: () => undefined }));
    scoped(registerAction({ id: 'assign', label: 'Assign (registered)', run: () => undefined }));
    const { host, renderer } = mount(MAP, {
      actions: [assign],
      nodeTypes: { milestone: { actions: [{ id: 'celebrate', label: 'Celebrate', run: () => undefined }] } },
    });
    const labels = () => Array.from(host.querySelectorAll('.orbit-action--custom')).map((button) => button.getAttribute('aria-label'));
    expect(labels()).toEqual(['Assign', 'Archive']);
    renderer.focusNode('research');
    expect(labels()).toEqual(['Assign', 'Archive', 'Celebrate']);
  });
});
