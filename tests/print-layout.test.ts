import { afterEach, describe, expect, it } from 'bun:test';
import { PRINT_THEMES, printTheme, renderPrintLayout } from '../src/core/print-layout';
import { registerTheme, themeTokens } from '../src/core/themes';
import type { OrbitPrintOptions } from '../src/core/print-layout';

const MAP = `---
title: Weekend in Lisbon
theme: night
---
# 🧳 Lisbon
A long weekend in May.
## 🍽️ Food <!-- orbit status: done -->
- Pastéis #sweet #morning
- [Bifana](https://example.com/bifana)
## Museums <!-- orbit priority: 1 -->
> Gulbenkian first.
### Azulejo <!-- orbit link: "#food" -->
#### Tiles
##### Blue ones
###### Older ones
- Oldest
`;

const containers: HTMLElement[] = [];

const layOut = (source: string, options: OrbitPrintOptions = {}): HTMLElement => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  containers.push(container);
  return renderPrintLayout(container, source, options);
};

const texts = (layout: HTMLElement, selector: string): string[] => {
  return Array.from(layout.querySelectorAll(selector)).map((element) => element.textContent ?? '');
};

afterEach(() => {
  containers.splice(0).forEach((container) => container.remove());
});

describe('renderPrintLayout', () => {
  it('gives the map its title, its root note, its picture, then every idea in reading order', () => {
    const layout = layOut(MAP);
    expect(layout.querySelector('.orbit-print__title')?.textContent).toBe('🧳 Weekend in Lisbon');
    expect(layout.querySelector(':scope > .orbit-print__note')?.textContent).toBe('A long weekend in May.');
    const svg = layout.querySelector('.orbit-print__picture svg')!;
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 720 720');
    expect(texts(layout, '.orbit-print__name')).toEqual(['🍽️ Food', 'Pastéis', 'Bifana', 'Museums', 'Azulejo', 'Tiles', 'Blue ones', 'Older ones', 'Oldest']);
  });

  it('nests ideas by depth, with headings that stop at h6', () => {
    const layout = layOut(MAP);
    const levels = Array.from(layout.querySelectorAll('.orbit-print__name')).map((name) => name.tagName.toLowerCase());
    expect(levels).toEqual(['h2', 'h3', 'h3', 'h2', 'h3', 'h4', 'h5', 'h6', 'h6']);
    const oldest = Array.from(layout.querySelectorAll<HTMLElement>('.orbit-print__idea')).find((idea) => idea.querySelector('.orbit-print__name')?.textContent === 'Oldest')!;
    expect(oldest.dataset.depth).toBe('6');
    expect(oldest.querySelector('.orbit-print__name')!.classList.contains('orbit-print__name--depth-3')).toBe(true);
  });

  it('keeps an idea with ideas under it on the page of the first of them', () => {
    const layout = layOut(MAP);
    const parents = texts(layout, '.orbit-print__entry--parent .orbit-print__name');
    expect(parents).toEqual(['🍽️ Food', 'Museums', 'Azulejo', 'Tiles', 'Blue ones', 'Older ones']);
  });

  it('shows statuses with their colors, priorities, tags and types like the detail sheet', () => {
    const layout = layOut(`# Plan\n## Launch\n<!-- orbit\nstatus: shipped\npriority: 2\ntags: [web, ios]\ntype: milestone\n-->\n## Draft <!-- orbit status: waiting -->\n`, {
      nodeTypes: { milestone: { label: 'Milestone', icon: '🚩' } },
      statuses: { waiting: '#7C3AED' },
    });
    const [launch, draft] = Array.from(layout.querySelectorAll('.orbit-print__entry'));
    expect(launch.querySelector('.orbit-print__name')!.textContent).toBe('🚩 Launch');
    expect(texts(launch as HTMLElement, '.orbit-print__chip')).toEqual(['Milestone', 'shipped', 'Priority 2', '#web', '#ios']);
    // A word Orbit reads as done takes the theme's done color; a map's own word, its own color.
    expect(launch.querySelector<HTMLElement>('.orbit-print__chip--status')!.style.getPropertyValue('--orbit-print-status')).toBe(themeTokens('paper')['status-done'].toLowerCase());
    expect(draft.querySelector<HTMLElement>('.orbit-print__chip--status')!.style.getPropertyValue('--orbit-print-status')).toBe('#7c3aed');
  });

  it('prints a link’s address, and names the idea a link to another one goes to', () => {
    const layout = layOut(MAP);
    const bifana = layout.querySelector<HTMLAnchorElement>('.orbit-print__address')!;
    expect(bifana.textContent).toBe('https://example.com/bifana');
    expect(bifana.href).toBe('https://example.com/bifana');
    expect(texts(layout, '.orbit-print__link')).toEqual(['https://example.com/bifana', '→ See Food']);
  });

  it('leaves out links it can’t follow or show', () => {
    const layout = layOut('# Plan\n## Bad <!-- orbit link: "javascript:alert(1)" -->\n## Gone <!-- orbit link: "#nowhere" -->\n');
    expect(layout.querySelectorAll('.orbit-print__link')).toHaveLength(0);
  });

  it('renders notes as markdown without running their HTML, and plain notes as written', () => {
    const layout = layOut('# Plan\n## Notes\n**Bold** and <img src=x onerror="window.ran = true">\n## Plain\n<!-- orbit\nnoteFormat: plain\nnote: "*stars* stay\\nline two"\n-->\n');
    const [marked, plain] = Array.from(layout.querySelectorAll<HTMLElement>('.orbit-print__idea .orbit-print__note'));
    expect(marked.querySelector('strong')?.textContent).toBe('Bold');
    expect(marked.querySelector('img')).toBeNull();
    expect(marked.textContent).toContain('<img src=x');
    expect(plain.classList.contains('orbit-print__note--plain')).toBe(true);
    expect(plain.textContent).toBe('*stars* stay\nline two');
  });

  it('shows pictures, a video’s thumbnail and address, and an embed’s address', () => {
    const layout = layOut([
      '# Trip',
      '## Summit',
      '![The view from the top](photos/summit.jpg)',
      '<!-- orbit caption: At dawn -->',
      '## Film <!-- orbit video: "https://youtu.be/dQw4w9WgXcQ" -->',
      '## Demo <!-- orbit embed: "https://example.com/demo" -->',
    ].join('\n'), { baseUrl: 'https://maps.example/trip/' });
    const [summit, film, demo] = Array.from(layout.querySelectorAll<HTMLElement>('.orbit-print__media'));
    expect(summit.querySelector('img')!.src).toBe('https://maps.example/trip/photos/summit.jpg');
    expect(summit.querySelector('img')!.alt).toBe('The view from the top');
    expect(summit.querySelector('figcaption')!.textContent).toBe('At dawn');
    expect(film.querySelector('img')!.src).toContain('dQw4w9WgXcQ');
    expect(film.querySelector('figcaption')!.textContent).toBe('Video: https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(demo.querySelector('figcaption')!.textContent).toBe('https://example.com/demo');
  });

  it('adds what a node type’s details show, and carries on when they fail', () => {
    const layout = layOut('# Plan\n## Goal <!-- orbit type: goal -->\n## Broken <!-- orbit type: broken -->\n', {
      nodeTypes: {
        goal: { details: (node, element) => { element.textContent = `${node.text}: 120 of 300`; } },
        broken: { details: () => { throw new Error('No'); } },
      },
    });
    expect(texts(layout, '.orbit-print__details')).toEqual(['Goal: 120 of 300']);
    expect(texts(layout, '.orbit-print__name')).toEqual(['Goal', 'Broken']);
  });

  it('speaks the map’s language', () => {
    const layout = layOut(MAP, { language: 'es' });
    expect(layout.lang).toBe('es');
    expect(texts(layout, '.orbit-print__link')).toContain('→ Ver Food');
    expect(texts(layout, '.orbit-print__chip')).toContain('Prioridad 1');
  });

  it('draws the picture as asked, or not at all', () => {
    const opening = layOut(MAP);
    const whole = layOut(MAP, { viewMode: 'all', idPrefix: 'whole' });
    const focused = layOut(MAP, { focus: 'museums' });
    // The whole map draws the lines between ideas, which the opening view has none of; Museums in focus names its planet.
    expect(whole.querySelectorAll('svg line').length).toBeGreaterThan(0);
    expect(opening.querySelectorAll('svg line')).toHaveLength(0);
    expect(opening.querySelector('svg')!.textContent).not.toContain('Azulejo');
    expect(focused.querySelector('svg')!.textContent).toContain('Azulejo');
    expect(whole.querySelector('svg')!.innerHTML).toContain('id="whole-');
    expect(layOut(MAP, { picture: false }).querySelector('.orbit-print__picture')).toBeNull();
  });

  it('replaces what its container held, and lays out a map of one idea', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>Before</p>';
    document.body.appendChild(container);
    containers.push(container);
    renderPrintLayout(container, '# Alone');
    expect(container.children).toHaveLength(1);
    expect(container.querySelector('.orbit-print__title')!.textContent).toBe('Alone');
    expect(container.querySelector('.orbit-print__outline')).toBeNull();
  });

  it('adds its styles to the page once', () => {
    layOut(MAP);
    layOut(MAP);
    const sheets = [...document.adoptedStyleSheets].map((sheet) => [...sheet.cssRules].map((rule) => rule.cssText).join(''));
    const styles = [...sheets, ...Array.from(document.querySelectorAll('style[data-orbit-styles]')).map((style) => style.textContent ?? '')].join('');
    expect(styles).toContain('.orbit-print__entry');
  });

  it('prints on the theme’s light counterpart, without a background', () => {
    const layout = layOut(MAP);
    // Night prints as paper: its text, and planets in paper's colors.
    expect(layout.style.getPropertyValue('--_orbit-print-text')).toBe(themeTokens('paper').text.toLowerCase());
    expect(layout.querySelector('svg')!.innerHTML).not.toContain(`fill="${themeTokens('night').surface}"`);
  });
});

describe('printTheme', () => {
  it('prints each dark theme as its light counterpart, and light ones as themselves', () => {
    expect(PRINT_THEMES).toEqual({
      auto: 'paper',
      night: 'paper',
      'glass-night': 'glass',
      cosmos: 'paper',
      blueprint: 'ink',
      'flat-night': 'flat',
      'material-night': 'material',
      'liquid-night': 'liquid',
    });

    for (const light of ['paper', 'glass', 'ink', 'contrast', 'flat', 'material', 'liquid']) {
      expect(printTheme(light).preset).toBe(light);
    }

    expect(printTheme(undefined).preset).toBe('paper');
    expect(printTheme('night').tokens).toEqual({ surface: 'transparent', 'surface-pattern': 'none' });
  });

  it('keeps a light theme’s own tokens, and only the colors of a dark one', () => {
    expect(printTheme({ preset: 'paper', tokens: { text: '#111111', 'color-1': '#FF0000' } }).tokens).toEqual({
      text: '#111111',
      'color-1': '#FF0000',
      surface: 'transparent',
      'surface-pattern': 'none',
    });
    expect(printTheme({ preset: 'night', tokens: { text: '#EEEEEE', 'color-1': '#FF0000' } })).toEqual({
      preset: 'paper',
      tokens: { 'color-1': '#FF0000', surface: 'transparent', 'surface-pattern': 'none' },
    });
  });

  it('follows a registered theme to the built-in one it starts from', () => {
    const unregister = registerTheme('brand-night', { preset: 'night', tokens: { 'color-root': '#123456', text: '#FFFFFF' } });

    try {
      expect(printTheme('brand-night')).toEqual({ preset: 'paper', tokens: { 'color-root': '#123456', surface: 'transparent', 'surface-pattern': 'none' } });
    } finally {
      unregister();
    }
  });
});
