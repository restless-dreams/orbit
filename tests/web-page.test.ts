import { describe, expect, it } from 'bun:test';
import { exportWebPage } from '../src/core/web-page/page';
import { startWebPage } from '../src/core/web-page/runtime';
import { parseOrbit } from '../src/core/dispatch';
import { ORBIT_THEME_PRESETS, themeTokens } from '../src/core/themes';
import type { WebPageData } from '../src/core/web-page/page';
import type { OrbitRendererTheme } from '../src/core/types';
import { manualClock, useMapSize, useReducedMotion } from './helpers/renderer';

useMapSize(800, 600);
useReducedMotion();

/** A page as a browser reads it: the document, the data its script gets, and the script itself. */
const readPage = (html: string): { page: Document; data: WebPageData; script: string } => {
  const page = new DOMParser().parseFromString(html, 'text/html');
  return {
    page,
    data: JSON.parse(page.getElementById('orbit-page')!.textContent!) as WebPageData,
    script: JSON.parse(page.getElementById('orbit-script')!.textContent!) as string,
  };
};

/** The page's body in this document, its script started, as a browser does (the inline scripts don't run here). */
const openPage = (html: string) => {
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
  const renderer = startWebPage(document)!;
  const text = (id: string) => document.getElementById(id)!.textContent;
  const key = (name: string) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
  return { renderer, text, key };
};

describe('exportWebPage', () => {
  it('puts the map, its title, its language and the script inside one page', () => {
    const markdown = '---\ntitle: Launch <plan>\n---\n# Launch\n## Research\nSee </script> and <!-- this -->.';
    const html = exportWebPage(markdown, { script: 'window.started = "</script>";', language: 'es' });
    const { page, data, script } = readPage(html);
    expect(page.title).toBe('Launch <plan>');
    expect(page.documentElement.lang).toBe('es');
    expect(page.querySelector('[data-present]')!.textContent).toContain('Presentar');
    // Nothing in the map or the script ends their elements early: they read back as they went in.
    expect(data.source).toBe(markdown);
    expect(script).toBe('window.started = "</script>";');
    expect(html.match(/<\/script>/g)).toHaveLength(3);
  });

  it('takes its colors from the theme, and follows light and dark for auto', () => {
    const night = exportWebPage('# Launch', { script: '', theme: 'night' });
    expect(night).toContain(`--page-background: ${themeTokens('night').surface};`);
    // Paper draws no background of its own: the page is white behind it.
    expect(exportWebPage('# Launch', { script: '' })).toContain('--page-background: #ffffff;');
    const automatic = exportWebPage('---\ntheme: auto\n---\n# Launch', { script: '' });
    expect(automatic).toContain('@media (prefers-color-scheme: dark)');
  });

  it('writes the theme\'s colors inside its style, so they can\'t add markup', () => {
    const elements = (html: string) => Array.from(readPage(html).page.querySelectorAll('*'), (element) => element.tagName).join(' ');
    const html = exportWebPage('# Launch', {
      script: '',
      theme: { preset: 'paper', tokens: { surface: 'red; } </style><script>alert(1)</script><style> :root {', 'sheet-text': '</STYLE\t><img src=x onerror=alert(2)>' } },
    });
    // The page has the elements any page has, and no others: the colors stay text inside its style.
    expect(elements(html)).toBe(elements(exportWebPage('# Launch', { script: '' })));
    expect(html.match(/<\/style/gi)).toHaveLength(1);
  });

  it('writes a theme\'s colors into its style only when they stay in their own declaration, as the live map takes them', () => {
    const style = (theme: string | OrbitRendererTheme) => readPage(exportWebPage('# Launch', { script: '', theme })).page.querySelector('style')!.textContent!;
    const paper = style({ preset: 'paper' });
    const breakouts: Record<string, string>[] = [
      // Ending the declaration and its rule, which the live map's style.setProperty refuses too.
      { surface: 'red; } body { display: none } :root {' },
      // Two values the live map takes, which only together end the rule: the first opens a string, the second closes it.
      { surface: '"', 'sheet-background': '" } body { display: none } :root { --page-end: "' },
      // An escape, a comment and a string that would run on over what comes after them.
      { 'sheet-text': 'red\\' },
      { 'sheet-border': 'red /*' },
      { 'sheet-muted-text': '"red' },
      { 'sheet-shadow': '0 8px 24px rgba(0, 0, 0, 0.2' },
      // Something to load, which a color never needs.
      { surface: 'url(wallpaper.png)' },
    ];

    for (const tokens of breakouts) {
      // Each falls back to the preset's color, as the print layout's fonts do.
      expect(style({ preset: 'paper', tokens })).toBe(paper);
    }

    const plain = { surface: '#123456', 'sheet-shadow': '0 8px 24px rgba(15, 23, 42, 0.16)', 'sheet-border': 'color-mix(in oklab, var(--page-text) 12%, transparent)' };
    const kept = style({ preset: 'paper', tokens: plain });
    expect(kept).toContain('--page-background: #123456;');
    expect(kept).toContain('--page-shadow: 0 8px 24px rgba(15, 23, 42, 0.16);');
    expect(kept).toContain('--page-border: color-mix(in oklab, var(--page-text) 12%, transparent);');

    // Every built-in theme's colors are plain enough: given on paper, the page writes them as that theme's page does.
    for (const [name, tokens] of Object.entries(ORBIT_THEME_PRESETS)) {
      expect(style({ preset: 'paper', tokens: { ...tokens } })).toBe(style(name));
    }
  });

  it('prints the map laid out for paper instead of the map on screen', () => {
    const { page } = readPage(exportWebPage('# Launch', { script: '' }));
    expect(page.getElementById('page-print')).not.toBeNull();
    const styles = page.querySelector('style')!.textContent!;
    expect(styles).toContain('.page__print { display: none; }');
    expect(styles).toMatch(/@media print \{[^}]*@page[\s\S]*\.page \{ display: none; \}[\s\S]*\.page__print \{ display: block; \}/);
  });

  it('takes a parsed document as orbit-md, a YAML map included', () => {
    const { data } = readPage(exportWebPage(parseOrbit('nodes:\n  - text: Launch\n    children: [Research]'), { script: '' }));
    expect(data.source).toBe('# Launch\n\n## Research\n');
  });
});

describe('the page', () => {
  const MAP = '# Trip\nWhere we go.\n## Summit\n![The view](photos/summit.jpg)\nWe made it. ![Again](photos/summit.jpg)\n## Camp\n### Tent\n';
  const PICTURE = 'data:image/jpeg;base64,AAAA';

  it('draws the map with the pictures inside the page, in nodes and notes', () => {
    const { renderer } = openPage(exportWebPage(MAP, { script: '', media: { 'photos/summit.jpg': PICTURE } }));
    const summit = renderer.getDocument()!.root.children[0];
    expect(summit.image?.src).toBe(PICTURE);
    expect(summit.note).toBe(`We made it. ![Again](${PICTURE})`);
  });

  it('presents in reading order, each note as a caption, and stops where it was', () => {
    const clock = manualClock();
    const { renderer, text, key } = openPage(exportWebPage(MAP, { script: '' }));
    const caption = document.getElementById('page-caption')!;
    expect(caption.hidden).toBe(true);
    const present = document.querySelector('[data-present]') as HTMLButtonElement;
    present.focus();
    present.click();
    expect(caption.hidden).toBe(false);
    expect([text('page-title'), text('page-note'), text('page-count')]).toEqual(['Trip', 'Where we go.', '1 of 4']);
    // The Present button hides, so the title has the focus, and the keys. (Compared by id: with a map on the page, Bun's
    // toBe takes 20 s to describe two different elements, then passes.)
    expect(document.activeElement?.id).toBe('page-title');
    // The page has the map's keys while presenting, and the map takes no input of its own.
    key('ArrowRight');
    key('ArrowRight');
    expect([text('page-title'), text('page-count')]).toEqual(['Camp', '3 of 4']);
    key('ArrowLeft');
    expect(text('page-title')).toBe('Summit');
    key('Escape');
    clock.advance(2000);
    expect(caption.hidden).toBe(true);
    expect(document.activeElement?.className).toBe('page__present');
    expect(renderer.getFocusedNode()?.id).toBe('summit');
    // P presents again, from the idea in focus.
    key('p');
    expect(text('page-count')).toBe('2 of 4');
    // The page keeps its listener on the window: stopped, it leaves the keys of later tests to their maps.
    key('Escape');
    clock.restore();
  });

  it('shows a note\'s table and checklist in its caption, the boxes unable to change, and gives them the theme\'s colors', () => {
    const html = exportWebPage('# Trip\n## Packing\n> - [ ] Boots\n> - [x] Hat\n\n| Item | Cost |\n|---|---|\n| Hotel | 300 |\n', { script: '', theme: 'night' });
    expect(html).toContain(`--page-accent: ${themeTokens('night')['control-active-background']};`);
    expect(html).toContain('--_orbit-control-active-background: var(--page-accent);');
    const { text, key } = openPage(html);
    (document.querySelector('[data-present]') as HTMLButtonElement).click();
    key('ArrowRight');
    expect(text('page-title')).toBe('Packing');
    const note = document.getElementById('page-note')!;
    expect(Array.from(note.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'), (box) => [box.checked, box.disabled])).toEqual([[false, true], [true, true]]);
    expect(note.querySelector('.orbit-note__table td')?.textContent).toBe('Hotel');
    key('Escape');
  });

  it('lays the map out for print before printing, once, with the pictures inside the page', () => {
    openPage(exportWebPage(MAP, { script: '', theme: 'night', language: 'es', media: { 'photos/summit.jpg': PICTURE } }));
    const print = document.getElementById('page-print')!;
    window.dispatchEvent(new Event('beforeprint'));
    const layout = print.querySelector<HTMLElement>('.orbit-print')!;
    expect(layout.querySelector('.orbit-print__title')!.textContent).toBe('Trip');
    expect(layout.lang).toBe('es');
    expect(Array.from(layout.querySelectorAll('.orbit-print__name')).map((name) => name.textContent)).toEqual(['Summit', 'Camp', 'Tent']);
    expect(layout.querySelector<HTMLImageElement>('.orbit-print__image')!.src).toBe(PICTURE);
    // Night prints as paper.
    expect(layout.style.getPropertyValue('--_orbit-print-text')).toBe(themeTokens('paper').text.toLowerCase());
    window.dispatchEvent(new Event('beforeprint'));
    expect(print.querySelector('.orbit-print')).toBe(layout);
  });
});
