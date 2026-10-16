import { beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { OrbitActionEvent, OrbitNode } from '../src/core/types';
import { ActionBar } from '../src/core/ui/actions';
import { click, manualClock, mount, node, useMapSize } from './helpers/renderer';

useMapSize(600, 400);

beforeEach(() => {
  document.body.innerHTML = '';
});

const RICH = `# [Launch plan](https://example.com/plan)
> Ship it in **two** stages.
![Poster](https://example.com/poster.png)

## Teaser
<!-- orbit video: https://www.youtube.com/watch?v=aqz-KE-bpKQ -->

## Notes
> A planet with a note.

## Status <!-- orbit status: blocked -->`;

describe('labels', () => {
  test('labels are HTML over the map, hidden from assistive technology', () => {
    const { host } = mount('# Root\n\n## Alpha\n## Beta');
    const labels = Array.from(host.querySelectorAll('.orbit__labels .orbit-label'));
    expect(labels.map((label) => label.textContent).sort()).toEqual(['Alpha', 'Beta', 'Root']);
    expect(host.querySelector('.orbit__labels')?.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('svg text')).toBeNull();
  });

  test('a short label sits inside its node; the sun’s label is the largest', () => {
    const { host } = mount('# Root\n\n## Alpha');
    const sun = host.querySelector('.orbit-label--sun');
    const planet = host.querySelector('.orbit-label--planet');
    expect(sun?.classList.contains('orbit-label--outside')).toBe(false);
    expect(planet?.classList.contains('orbit-label--outside')).toBe(false);
    expect(Number.parseFloat((sun as HTMLElement).style.fontSize)).toBeGreaterThan(Number.parseFloat((planet as HTMLElement).style.fontSize));
  });

  test('a node showing a picture puts its label outside', () => {
    const { host } = mount('# Root\n\n## Photo\n![A photo](https://example.com/photo.png)');
    expect(node(host, 'photo').querySelector('image')).not.toBeNull();
    const labels = Array.from(host.querySelectorAll<HTMLElement>('.orbit-label'));
    const photo = labels.find((label) => label.textContent === 'Photo');
    expect(photo?.classList.contains('orbit-label--outside')).toBe(true);
  });

  test('a picture that fails to load gives the node its label back inside', () => {
    const clock = manualClock();

    try {
      const { host } = mount('# Root\n\n## Photo\n![A photo](https://example.com/photo.png)');
      // Let the map go idle first: the repaint the failure asks for is what moves the label.
      clock.advance(2000);
      const label = () => host.querySelector('.orbit-label[data-orbit-for="photo"]');
      expect(label()?.classList.contains('orbit-label--outside')).toBe(true);
      node(host, 'photo').querySelector('image')?.dispatchEvent(new Event('error'));
      clock.advance(100);
      expect(label()?.classList.contains('orbit-label--outside')).toBe(false);
    } finally {
      clock.restore();
    }
  });

  test('moons are too small for labels until zoomed in', () => {
    const { host } = mount('# Root\n\n## Planet\n- Moon one\n- Moon two');
    const labels = Array.from(host.querySelectorAll<HTMLElement>('.orbit-label')).filter((label) => label.style.display !== 'none');
    expect(labels.map((label) => label.textContent)).not.toContain('Moon one');
  });
});

describe('collapsed nodes', () => {
  test('a collapsed node shows a count instead of moons, and opens when entered', () => {
    const { host, renderer } = mount('# Root\n\n## Folded <!-- orbit collapsed: true -->\n- One\n- Two\n\n## Open\n- Three');
    expect(host.querySelector('[data-orbit-node-id="one"]')).toBeNull();
    expect(host.querySelector('[data-orbit-node-id="three"]')).not.toBeNull();
    expect(host.querySelector('.orbit-count')?.textContent).toBe('+2');
    renderer.focusNode('folded');
    expect(node(host, 'one').classList.contains('orbit-node--planet')).toBe(true);
    expect(node(host, 'two').classList.contains('orbit-node--planet')).toBe(true);
    expect(host.querySelector('.orbit-count')).toBeNull();
  });
});

describe('node details on the map', () => {
  test('nodes describe themselves to assistive technology', () => {
    const { host } = mount(RICH);
    expect(node(host, 'status').getAttribute('aria-label')).toBe('Status, status blocked');
    expect(node(host, 'notes').getAttribute('aria-label')).toBe('Notes, has note');
    expect(node(host, 'launch-plan').getAttribute('aria-label')).toBe('Launch plan, 3 items, has note, image, and link');
    expect(node(host, 'launch-plan').getAttribute('aria-current')).toBe('true');
  });

  test('status shows as a colored dot', () => {
    const { host } = mount(RICH);
    expect(node(host, 'status').querySelector('.orbit-node__status--blocked')).not.toBeNull();
  });

  test('planets with a note get a marker; videos get a play badge and a YouTube thumbnail', () => {
    const { host } = mount(RICH);
    expect(node(host, 'notes').querySelector('.orbit-node__marker')).not.toBeNull();
    const teaser = node(host, 'teaser');
    expect(teaser.querySelector('.orbit-node__play')).not.toBeNull();
    expect(teaser.querySelector('image')?.getAttribute('href')).toBe('https://img.youtube.com/vi/aqz-KE-bpKQ/hqdefault.jpg');
  });

  test('images are clipped to the node with this map’s clip path, and dropped if they fail', () => {
    const { host } = mount(RICH);
    const image = node(host, 'launch-plan').querySelector('image');
    const clip = host.querySelector('clipPath')?.id;
    expect(image?.getAttribute('clip-path')).toBe(`url(#${clip})`);
    image?.dispatchEvent(new Event('error'));
    expect(node(host, 'launch-plan').querySelector('image')).toBeNull();
  });

  test('unsafe image URLs are never loaded', () => {
    const { host } = mount('# Root\n![x](javascript:alert(1))');
    expect(node(host, 'root').querySelector('image')).toBeNull();
  });
});

describe('actions under the focused node', () => {
  test('the focused node offers a button per kind of content', () => {
    const { host } = mount(RICH);
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('.orbit-actions button'));
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['View image', 'Read note', 'Open link']);
    expect(host.querySelector('.orbit-actions--visible')).not.toBeNull();
  });

  test('a button reports its action; returning false keeps the default from running', () => {
    const onAction = mock<(argument: OrbitActionEvent) => false>(() => false as const);
    const { host } = mount(RICH, { onAction });
    click(host.querySelector('.orbit-action--note')!);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0].action).toBe('note');
    expect(onAction.mock.calls[0][0].node.id).toBe('launch-plan');
    expect(host.querySelector('dialog[open]')).toBeNull();
  });

  test('the note button opens the detail sheet with the note', () => {
    const { host } = mount(RICH);
    click(host.querySelector('.orbit-action--note')!);
    const dialog = host.querySelector('dialog.orbit-sheet');
    expect(dialog?.hasAttribute('open')).toBe(true);
    expect(dialog?.querySelector('.orbit-sheet__title')?.textContent).toBe('Launch plan');
    expect(dialog?.querySelector('.orbit-sheet__note strong')?.textContent).toBe('two');
  });

  test('the link button opens the link in a new tab, safely', () => {
    const open = spyOn(window, 'open').mockImplementation(() => null);
    const { host } = mount(RICH);
    click(host.querySelector('.orbit-action--link')!);
    expect(open).toHaveBeenCalledWith('https://example.com/plan', '_blank', 'noopener');
    open.mockRestore();
  });

  test('showDetailSheet: false keeps the sheet closed but links still open', () => {
    const open = spyOn(window, 'open').mockImplementation(() => null);
    const { host } = mount(RICH, { showDetailSheet: false });
    click(host.querySelector('.orbit-action--note')!);
    expect(host.querySelector('dialog[open]')).toBeNull();
    click(host.querySelector('.orbit-action--link')!);
    expect(open).toHaveBeenCalledTimes(1);
    open.mockRestore();
  });

  test('showActionButtons: false removes the buttons', () => {
    const { host } = mount(RICH, { showActionButtons: false });
    expect(host.querySelector('.orbit-actions--visible')).toBeNull();
  });

  test('the buttons follow the focus', () => {
    const { host, renderer } = mount(RICH);
    renderer.focusNode('notes');
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('.orbit-actions button'));
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['Read note']);
  });
});

describe('the action bar and keyboard focus', () => {
  const makeBar = (returnFocus?: () => void): ActionBar => {
    const bar = new ActionBar({
      onAction: () => undefined,
      describeLink: () => ({ kind: 'missing' }),
      actions: () => [],
      hasDetails: () => false,
      returnFocus,
    });
    document.body.appendChild(bar.element);
    return bar;
  };

  const NOTED: OrbitNode = { id: 'noted', text: 'Noted', level: 0, children: [], note: 'A note.' };

  test('hiding with a button focused hands focus back to the map instead of dropping it to <body>', () => {
    const mapNode = document.createElement('button');
    document.body.appendChild(mapNode);
    const returnFocus = mock(() => mapNode.focus());
    const bar = makeBar(returnFocus);
    bar.show(NOTED, 100, 100);
    const button = bar.element.querySelector('button')!;
    button.focus();
    expect(document.activeElement).toBe(button);
    bar.hide();
    expect(returnFocus).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(mapNode);
  });

  test('hiding with focus elsewhere leaves it alone', () => {
    const returnFocus = mock(() => undefined);
    const bar = makeBar(returnFocus);
    bar.show(NOTED, 100, 100);
    bar.hide();
    expect(returnFocus).not.toHaveBeenCalled();
  });

  test('with no handler wired, hiding blurs a focused button as before', () => {
    const bar = makeBar();
    bar.show(NOTED, 100, 100);
    const button = bar.element.querySelector('button')!;
    button.focus();
    bar.hide();
    expect(document.activeElement).not.toBe(button);
  });
});

describe('URLs that hide a script', () => {
  // Browsers drop spaces and control characters at a URL's ends, and tabs and
  // line breaks inside it, before they read its scheme.
  const DISGUISED = [' javascript:alert(1)', 'java\tscript:alert(1)', '\njavascript:alert(1)'];

  const tree = (attributes: Partial<OrbitNode>): OrbitNode => {
    const root: OrbitNode = { id: 'root', text: 'Root', level: 0, children: [] };
    const child: OrbitNode = { id: 'trap', text: 'Trap', level: 1, children: [], ...attributes };
    Object.defineProperty(child, 'parent', { value: root, enumerable: false });
    root.children.push(child);
    return root;
  };

  test('never open from the link button', () => {
    const open = spyOn(window, 'open').mockImplementation(() => null);

    for (const link of DISGUISED) {
      const { host, renderer } = mount('# Root');
      renderer.render(tree({ link }));
      renderer.focusNode('trap');
      const button = host.querySelector<HTMLElement>('.orbit-action--link');

      if (button) {
        click(button);
      }
    }

    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  test('get no link button in the first place, as the detail sheet hides them', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined);

    for (const link of DISGUISED) {
      const { host, renderer } = mount('# Root');
      renderer.render(tree({ link }));
      renderer.focusNode('trap');
      expect(host.querySelector('.orbit-action--link')).toBeNull();
    }

    warn.mockRestore();
  });

  test('never become links in a note', () => {
    for (const url of DISGUISED) {
      const { host, renderer } = mount('# Root');
      renderer.render(tree({ note: `Read [this](${url}) first.`, noteFormat: 'markdown' }));
      renderer.focusNode('trap');
      click(host.querySelector('.orbit-action--note')!);
      const note = host.querySelector('dialog[open] .orbit-sheet__note');
      expect(note?.textContent).toContain('this');

      for (const anchor of Array.from(note?.querySelectorAll('a') ?? [])) {
        expect(anchor.href.toLowerCase()).not.toContain('script:');
      }
    }
  });

  test('never load in the page frame of the detail sheet', () => {
    for (const src of DISGUISED) {
      const { host, renderer } = mount('# Root');
      renderer.render(tree({ embed: { src }, note: 'A page.', noteFormat: 'markdown' }));
      renderer.focusNode('trap');
      click(host.querySelector('.orbit-action--note')!);
      expect(host.querySelector('dialog[open]')).not.toBeNull();
      expect(host.querySelector('dialog[open] iframe')).toBeNull();
    }
  });
});

describe('videos in the detail sheet', () => {
  const sheetFor = (video: OrbitNode['video']): HTMLElement => {
    const quiet = spyOn(console, 'error').mockImplementation(() => undefined);
    const root: OrbitNode = { id: 'root', text: 'Root', level: 0, children: [] };
    const clip: OrbitNode = { id: 'clip', text: 'Clip', level: 1, children: [], note: 'A clip.', video };
    Object.defineProperty(clip, 'parent', { value: root, enumerable: false });
    root.children.push(clip);
    const { host, renderer } = mount('# Root');
    renderer.render(root);
    renderer.focusNode('clip');
    click(host.querySelector('.orbit-action--note')!);
    quiet.mockRestore();
    const dialog = host.querySelector<HTMLElement>('dialog.orbit-sheet[open]');

    if (!dialog) {
      throw new Error('The sheet did not open');
    }

    return dialog;
  };

  test("a video declared provider 'native' plays in a <video>, even from a CDN address with no extension", () => {
    const dialog = sheetFor({ src: 'https://cdn.example.com/stream', provider: 'native' });
    const media = dialog.querySelector('.orbit-sheet__media');
    expect(media?.querySelector('video')?.getAttribute('src')).toBe('https://cdn.example.com/stream');
    expect(media?.querySelector('iframe')).toBeNull();
  });

  test('a blob: video plays in a <video> instead of vanishing into an empty figure', () => {
    const dialog = sheetFor({ src: 'blob:https://example.com/1234' });
    const media = dialog.querySelector('.orbit-sheet__media');
    expect(media?.querySelector('video')?.getAttribute('src')).toBe('blob:https://example.com/1234');
    expect(media?.querySelector('iframe')).toBeNull();
  });
});

describe('pages in the detail sheet', () => {
  const sandboxFor = (src: string): string | null | undefined => {
    // The test page loads no frames, and says so on the console.
    const quiet = spyOn(console, 'error').mockImplementation(() => undefined);
    const { host } = mount(`# Root\n## Page <!-- orbit embed: "${src}" -->\n> A page.`);
    click(node(host, 'page'));
    click(host.querySelector('.orbit-action--note')!);
    const sandbox = host.querySelector('dialog[open] iframe')?.getAttribute('sandbox');
    quiet.mockRestore();
    return sandbox;
  };

  test("another site's page keeps its own origin", () => {
    expect(sandboxFor('https://example.org/widget')).toBe('allow-scripts allow-same-origin allow-presentation allow-popups');
  });

  test('a page from the same site runs without its origin', () => {
    expect(sandboxFor(`${location.origin}/upload/page.html`)).toBe('allow-scripts allow-presentation allow-popups');
    expect(sandboxFor('pages/local.html')).toBe('allow-scripts allow-presentation allow-popups');
  });

  test('pages learn nothing of the page around the map; YouTube and Vimeo learn its origin, which their players need', () => {
    const quiet = spyOn(console, 'error').mockImplementation(() => undefined);

    const referrers = (attributes: string) => {
      const { host } = mount(`# Root\n## Clip <!-- orbit ${attributes} -->\n> A clip.`);
      click(node(host, 'clip'));
      click(host.querySelector('.orbit-action--note')!);
      return host.querySelector('dialog[open] iframe')?.getAttribute('referrerpolicy');
    };

    expect(referrers('embed: "https://example.org/widget"')).toBe('no-referrer');
    expect(referrers('video: "https://www.youtube.com/watch?v=aqz-KE-bpKQ"')).toBe('strict-origin-when-cross-origin');
    expect(referrers('video: "https://vimeo.com/76979871"')).toBe('strict-origin-when-cross-origin');
    quiet.mockRestore();
  });
});

describe('links between nodes', () => {
  const LINKED = `# Launch plan

## Build <!-- orbit link: "#research" -->
Starts when [Research](#research) is done.

## [Read the research](#research)

## Research
- Interviews

## Broken <!-- orbit link: "#nowhere" -->`;

  test('a #id link button reads "Go to …" and flies to that node', () => {
    const open = spyOn(window, 'open').mockImplementation(() => null);
    const { host, renderer } = mount(LINKED);
    renderer.focusNode('read-the-research');
    const button = host.querySelector<HTMLButtonElement>('.orbit-action--link');
    expect(button?.getAttribute('aria-label')).toBe('Go to Research');
    click(button!);
    expect(renderer.getFocusedNode()?.id).toBe('research');
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  test('a link to a node the map does not have gets no button', () => {
    const { host, renderer } = mount(LINKED);
    renderer.focusNode('broken');
    expect(host.querySelector('.orbit-action--link')).toBeNull();
  });

  test('in the detail sheet, a note link goes to its node', () => {
    const { host, renderer } = mount(LINKED);
    renderer.focusNode('build');
    click(host.querySelector('.orbit-action--note')!);
    const link = host.querySelector<HTMLAnchorElement>('dialog[open] .orbit-sheet__note a');
    expect(link?.getAttribute('href')).toBe('#research');
    expect(link?.getAttribute('target')).toBeNull();
    click(link!);
    expect(host.querySelector('dialog[open]')).toBeNull();
    expect(renderer.getFocusedNode()?.id).toBe('research');
  });

  test("in the detail sheet, the node's own link goes to its node", () => {
    const { host, renderer } = mount(LINKED);
    renderer.focusNode('build');
    click(host.querySelector('.orbit-action--note')!);
    const button = host.querySelector<HTMLButtonElement>('dialog[open] button.orbit-sheet__link');
    expect(button?.textContent).toBe('Go to Research →');
    click(button!);
    expect(host.querySelector('dialog[open]')).toBeNull();
    expect(renderer.getFocusedNode()?.id).toBe('research');
  });
});

describe('tooltip', () => {
  test('pointing at a node with a note shows its text and the start of the note', () => {
    const { host } = mount(RICH);
    const notes = node(host, 'notes');
    const over = new MouseEvent('pointerover', { bubbles: true });
    Object.defineProperty(over, 'pointerType', { value: 'mouse' });
    notes.dispatchEvent(over);
    const tooltip = host.querySelector('.orbit-tooltip');
    expect(tooltip?.classList.contains('orbit-tooltip--visible')).toBe(true);
    expect(tooltip?.textContent).toContain('Notes');
    expect(tooltip?.textContent).toContain('A planet with a note.');
  });

  test('a huge note is previewed from its start, without unpacking all of it', () => {
    const { host, renderer } = mount('# Root\n\n## Big');
    // Link markup like this unpacks quadratically: the tooltip never reads past a few hundred characters.
    renderer.updateNode('big', { note: 'word ['.repeat(40_000) });
    const over = new MouseEvent('pointerover', { bubbles: true });
    Object.defineProperty(over, 'pointerType', { value: 'mouse' });
    node(host, 'big').dispatchEvent(over);
    const detail = host.querySelector('.orbit-tooltip__detail');
    expect(detail?.textContent?.startsWith('word [word [')).toBe(true);
    expect(detail?.textContent?.length).toBeLessThanOrEqual(141);
  });
});
