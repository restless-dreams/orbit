import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { defineOrbitMapElement } from '../src/core/auto-render';
import type { OrbitMapElement, OrbitRenderErrorDetail } from '../src/core/auto-render';
import { OrbitSVGRenderer } from '../src/core/svg-renderer';
import { useReducedMotion } from './helpers/renderer';

useReducedMotion();

// happy-dom has no layout, so give every map a size to draw into.
const prototype = OrbitSVGRenderer.prototype as unknown as { readContainerSize: () => { width: number; height: number } };
const originalReadSize = prototype.readContainerSize;

beforeAll(() => {
  prototype.readContainerSize = () => ({ width: 600, height: 420 });
  defineOrbitMapElement();
});

afterAll(() => {
  prototype.readContainerSize = originalReadSize;
});

beforeEach(() => {
  document.body.innerHTML = '';
});

const createMap = (content: string, attributes: Record<string, string> = {}): OrbitMapElement => {
  const element = document.createElement('orbit-map') as OrbitMapElement;

  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }

  element.innerHTML = content;
  document.body.appendChild(element);
  return element;
};

/** The texts of the map's node labels, the sun's first. */
const nodeTexts = (element: OrbitMapElement): string[] => {
  return Array.from(element.shadowRoot!.querySelectorAll('.orbit-label__text')).map((label) => label.textContent ?? '');
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('<orbit-map>', () => {
  it('renders the README example inside a shadow root at the requested height', () => {
    const element = createMap('\n# 🚀 Project\n\n## Research\n## Build\n', { height: '320', 'view-mode': 'focus' });
    expect(element.shadowRoot?.querySelector('svg')).not.toBeNull();
    expect(element.style.getPropertyValue('--orbit-map-height')).toBe('320px');
    const styles = element.shadowRoot!.querySelector('style')!.textContent!;
    expect(styles).toContain('display: block');
    expect(styles).toContain('height: var(--orbit-map-height, 420px)');
  });

  it('never renders the raw markdown: the light DOM stays out of view', () => {
    const element = createMap('# Root\n## A');
    expect(element.shadowRoot?.querySelector('slot')).toBeNull();
    expect(element.shadowRoot?.textContent).not.toContain('# Root');
  });

  it('parses markdown indented like normal HTML', () => {
    const element = createMap(`
      # 🚀 Project

      ## Research
      ## Build
    `);
    expect(nodeTexts(element)).toEqual(['Project', 'Research', 'Build']);
  });

  it('keeps attribute comments written inside the element', () => {
    const element = createMap('# Root\n## Research <!-- orbit color: "#ff0000" -->\n## Build');
    const research = element.shadowRoot!.querySelector<SVGCircleElement>('[data-orbit-node-id="research"] .orbit-node__disc');
    expect(research?.style.fill).toBe('#ff0000');
  });

  it('applies frontmatter written inside the element', () => {
    const element = createMap('\n---\ntitle: Roadmap\nview: all\n---\n# Root\n## A');
    expect(element.renderer?.getViewMode()).toBe('all');
    expect(element.shadowRoot?.querySelector('svg')?.getAttribute('aria-label')).toBe('Roadmap');
  });

  it('says when its theme attribute names no theme, and keeps the document\'s', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    const element = createMap('---\ntheme: cosmos\n---\n# Map\n## A', { theme: 'dark' });
    expect(warn.mock.calls.map((call) => String(call[0]))).toContainEqual(expect.stringContaining('Unknown theme "dark" on <orbit-map>'));
    expect(warn.mock.calls.map((call) => String(call[0])).join('\n')).toContain('Did you mean "night"?');
    expect(element.shadowRoot!.querySelector<HTMLElement>('.orbit')!.dataset.orbitTheme).toBe('cosmos');
    warn.mockRestore();
  });

  it('reads a <script type="text/orbit"> child', () => {
    const element = createMap('<script type="text/orbit">\n# Root\n## From script <!-- orbit status: active -->\n</script>');
    expect(nodeTexts(element)).toEqual(['Root', 'From script']);
  });

  it('redraws when its content changes', async () => {
    const element = createMap('# Root\n## A');
    element.textContent = '# Root\n## A\n## B';
    await flush();
    expect(nodeTexts(element)).toEqual(['Root', 'A', 'B']);
  });

  it('renders content that arrives after the element was connected', async () => {
    const element = document.createElement('orbit-map') as OrbitMapElement;
    document.body.appendChild(element);
    expect(element.renderer).toBeNull();
    element.append('# Late\n## Arrival');
    await flush();
    expect(nodeTexts(element)).toEqual(['Late', 'Arrival']);
  });

  it('exposes source as a property', () => {
    const element = createMap('# Root\n## A');
    expect(element.source).toBe('# Root\n## A');
    element.source = '# Other\n## X';
    expect(nodeTexts(element)).toEqual(['Other', 'X']);
  });

  it('keeps the SVG when only a display attribute changes', () => {
    const element = createMap('# Root\n## A', { 'view-mode': 'focus' });
    const before = element.shadowRoot!.querySelector('svg');
    element.setAttribute('view-mode', 'all');
    expect(element.shadowRoot!.querySelector('svg')).toBe(before);
    expect(element.renderer?.getViewMode()).toBe('all');
  });

  it('reads display options from data-* attributes, including changes', () => {
    const element = createMap('# Root\n## A');
    element.setAttribute('data-theme', 'night');
    expect(element.shadowRoot!.querySelector('.orbit')?.getAttribute('data-orbit-theme')).toBe('night');
    element.setAttribute('data-view-mode', 'all');
    expect(element.renderer?.getViewMode()).toBe('all');
    element.setAttribute('data-height', '280');
    expect(element.style.getPropertyValue('--orbit-map-height')).toBe('280px');
  });

  it('falls back to the document\'s height when the height attribute is removed', () => {
    const element = createMap('---\nheight: 300\n---\n# Root\n## A', { height: '320' });
    expect(element.style.getPropertyValue('--orbit-map-height')).toBe('320px');
    element.removeAttribute('height');
    expect(element.style.getPropertyValue('--orbit-map-height')).toBe('300px');
  });

  it('never removes a class the page set itself, even one the document also asked for', () => {
    const element = createMap('---\nclassName: wide framed\n---\n# Root\n## A', { class: 'wide' });
    expect(element.classList.contains('framed')).toBe(true);
    element.source = '# Root\n## A';
    expect(element.classList.contains('wide')).toBe(true);
    expect(element.classList.contains('framed')).toBe(false);
  });

  it('drops classes a previous version of the document asked for', () => {
    const element = createMap('---\nclassName: old-map kept\n---\n# Root\n## A');
    expect(element.classList.contains('old-map')).toBe(true);
    expect(element.classList.contains('kept')).toBe(true);
    element.source = '---\nclassName: kept new-map\n---\n# Root\n## A';
    expect(element.classList.contains('old-map')).toBe(false);
    expect(element.classList.contains('kept')).toBe(true);
    expect(element.classList.contains('new-map')).toBe(true);
    element.source = '# Root\n## A';
    expect(element.classList.contains('new-map')).toBe(false);
    expect(element.classList.contains('kept')).toBe(false);
  });

  it('shows an error card and fires orbit-error for a map that cannot be drawn', () => {
    const errors: OrbitRenderErrorDetail[] = [];
    document.body.addEventListener('orbit-error', (event) => errors.push((event as CustomEvent<OrbitRenderErrorDetail>).detail));
    const element = createMap('nodes:\n  - text: A\n    tags: [a, b');
    expect(element.shadowRoot?.querySelector('[role="alert"]')?.textContent).toContain('Invalid YAML');
    expect(errors).toHaveLength(1);
    expect(errors[0].diagnostics[0].code).toBe('invalid-yaml');
  });

  it('takes editing and its keys from attributes', () => {
    const element = createMap('# Trip\n## Food\n## Museums', { editable: '', 'editing-keys': '' });
    const museums = element.shadowRoot!.querySelector('[data-orbit-node-id="museums"]')!;
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    museums.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(element.shadowRoot!.querySelector<HTMLTextAreaElement>('.orbit-editor')!.hidden).toBe(false);
  });

  it('releases the renderer when removed', () => {
    const element = createMap('# Root\n## A');
    expect(element.renderer).not.toBeNull();
    element.remove();
    expect(element.renderer).toBeNull();
  });
});
