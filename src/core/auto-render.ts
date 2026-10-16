import { parseOrbit } from './dispatch.js';
import { OrbitSVGRenderer } from './svg-renderer.js';
import type { OrbitDocument, OrbitMediaOptions, RendererOptions } from './types.js';
import { OrbitParseError, reportParseDiagnostics, type OrbitDiagnostic } from './diagnostics.js';
import { isThemeName, mergeThemes, themeNames } from './themes.js';
import { THEME_SYNONYMS } from './document-options.js';
import { didYouMean } from './suggest.js';
import { wordsFor, type OrbitWords } from './languages.js';

export interface AutoRenderOptions extends RendererOptions {
  selector?: string;
  height?: number;
  strict?: boolean;
  className?: string;
}

/** Detail of the `orbit-error` event dispatched on an element whose map couldn't be drawn. */
export interface OrbitRenderErrorDetail {
  message: string;
  line?: number;
  error: Error | null;
  diagnostics: OrbitDiagnostic[];
}

/**
 * The `<orbit-map>` element's API, for code that holds a reference to one.
 * It also dispatches the map's events (`orbit-focus-change`,
 * `orbit-view-mode-change`, `orbit-node-click`, `orbit-action`,
 * `orbit-spin-settle`, `orbit-media-open`, `orbit-media-close`,
 * `orbit-media-state` and the rest) and `orbit-error`.
 */
export interface OrbitMapElement extends HTMLElement {
  /** The markdown or YAML the map is drawn from. Setting it updates the `source` attribute. */
  source: string;

  /** The renderer drawing the map, or null before the first render or after an error. */
  readonly renderer: OrbitSVGRenderer | null;

  /** Re-reads the source and redraws the map, keeping the reader's place when it can. */
  refresh(): void;

  /** Flies to a node by id, in focus mode. Returns false when the map has no such node. */
  flyTo(nodeId: string): boolean;

  /** Flies out to the overview of the whole map. */
  overview(): void;

  /** Shows a node's picture or video in the media viewer (see `OrbitSVGRenderer.openMedia`). Returns false when there's nothing to show. */
  openMedia(nodeId: string, options?: OrbitMediaOptions): boolean;

  /** Closes the media viewer. */
  closeMedia(): void;

  /** Plays the video in the media viewer. Returns false when it shows none it can play. */
  playMedia(): boolean;

  /** Pauses the video in the media viewer. Returns false when it shows none it can pause. */
  pauseMedia(): boolean;

  /** Moves the video in the media viewer to `seconds` from its start. Returns false when it shows none it can move. */
  seekMedia(seconds: number): boolean;

  /** Turns on the sound of the video in the media viewer, from a press. Returns false when it shows none it can drive. */
  unmuteMedia(): boolean;
}

const DEFAULT_SELECTOR = '.orbit-mind-map[data-orbit], pre > code.language-orbit, pre.orbit-rendered[data-orbit-source], orbit-map';
const DEFAULT_HEIGHT = 420;

const ELEMENT_STYLES = `
:host {
  display: block;
  position: relative;
  height: var(--orbit-map-height, ${DEFAULT_HEIGHT}px);
}

:host([hidden]) {
  display: none;
}

.map {
  width: 100%;
  height: 100%;
}
`;

/**
 * Renders an orbit map into the given element. Problems in the document never
 * throw: parse warnings go to the console, and a map that can't be drawn is
 * replaced by an error card and an `orbit-error` event on the element.
 *
 * Callers who later detach the element should invoke
 * `OrbitSVGRenderer.unmount(element)` to release RAF loops and the
 * ResizeObserver. The `<orbit-map>` web component does this automatically.
 */
export const renderOrbitElement = (element: Element, options: AutoRenderOptions = {}): OrbitSVGRenderer | null => {
  if (isOrbitMapElement(element)) {
    element.refresh();
    return element.renderer;
  }

  const target = getRenderTarget(element) as HTMLElement;
  const source = getOrbitSource(element, target);

  if (!source.trim()) {
    return null;
  }

  OrbitSVGRenderer.unmount(target);
  target.setAttribute('data-orbit-source', source);
  const elementOptions = readElementOptions(element);
  const settings = { ...elementOptions, ...definedOnly(options), theme: mergeThemes(elementOptions.theme, options.theme) };

  return renderSource(target, source, settings, element, (doc, settings) => {
    target.classList.add('orbit-rendered');
    applyClassNames(target, settings.className ?? doc.options.className);

    if (typeof getComputedStyle === 'function' && getComputedStyle(target).display === 'inline') {
      target.style.display = 'block';
    }

    const height = settings.height ?? doc.options.height;

    if (height) {
      target.style.minHeight = `${height}px`;
    } else if (!target.style.minHeight) {
      target.style.minHeight = `${DEFAULT_HEIGHT}px`;
    }
  });
};

/**
 * Renders every orbit block under `root` (default: the whole document). Each
 * block is independent: one that fails shows its error card and the rest
 * still render.
 */
export const renderOrbitMarkdownBlocks = (root?: ParentNode, options: AutoRenderOptions = {}): OrbitSVGRenderer[] => {
  const searchRoot = root ?? (typeof document === 'undefined' ? undefined : document);

  if (!searchRoot) {
    return [];
  }

  const renderers: OrbitSVGRenderer[] = [];

  for (const element of Array.from(searchRoot.querySelectorAll(options.selector || DEFAULT_SELECTOR))) {
    try {
      const renderer = renderOrbitElement(element, options);

      if (renderer) {
        renderers.push(renderer);
      }
    } catch (error) {
      showRenderError(getRenderTarget(element), element, error as Error, [], wordsFor(options.language, element, options.strings));
    }
  }

  return renderers;
};

/**
 * Registers the `<orbit-map>` element. Write the map as the element's
 * content (indent it however you like, `<!-- orbit … -->` comments included),
 * inside a `<script type="text/orbit">` child, or in a `source` attribute.
 * The map renders in a shadow root, so the raw markdown is never displayed,
 * and it redraws when the content or an attribute changes.
 *
 * @example
 * ```html
 * <script type="module">
 *   import { defineOrbitMapElement } from '@restless-dreams/orbit';
 *   defineOrbitMapElement();
 * </script>
 *
 * <orbit-map height="420" theme="night">
 *   # Launch
 *   ## Research <!-- orbit status: active -->
 *   ## Build
 * </orbit-map>
 * ```
 */
export const defineOrbitMapElement = (tagName = 'orbit-map'): void => {
  if (typeof window === 'undefined' || typeof customElements === 'undefined') {
    return;
  }

  if (customElements.get(tagName)) {
    return;
  }

  customElements.define(tagName, createOrbitMapElementClass());
};

const createOrbitMapElementClass = (): CustomElementConstructor => {
  // Declared lazily so importing this module never touches HTMLElement on a server.
  return class OrbitMapElementImplementation extends HTMLElement implements OrbitMapElement {
    #renderer: OrbitSVGRenderer | null = null;
    #mapContainer: HTMLDivElement | null = null;
    #observer: MutationObserver | null = null;
    #refreshQueued = false;
    #renderedSource: string | null = null;
    #documentHeight: number | undefined;

    static get observedAttributes(): string[] {
      const options = ['view-mode', 'height', 'palette', 'interactive', 'animation', 'theme', 'max-depth', 'editable', 'editing-keys'];
      // `lang` changes the language the map speaks, as on any element.
      return ['data-orbit', 'source', 'lang', ...options.flatMap((name) => [name, `data-${name}`])];
    }

    get renderer(): OrbitSVGRenderer | null {
      return this.#renderer;
    }

    flyTo(nodeId: string): boolean {
      return this.#renderer?.flyTo(nodeId) ?? false;
    }

    overview(): void {
      this.#renderer?.overview();
    }

    openMedia(nodeId: string, options?: OrbitMediaOptions): boolean {
      return this.#renderer?.openMedia(nodeId, options) ?? false;
    }

    closeMedia(): void {
      this.#renderer?.closeMedia();
    }

    playMedia(): boolean {
      return this.#renderer?.playMedia() ?? false;
    }

    pauseMedia(): boolean {
      return this.#renderer?.pauseMedia() ?? false;
    }

    seekMedia(seconds: number): boolean {
      return this.#renderer?.seekMedia(seconds) ?? false;
    }

    unmuteMedia(): boolean {
      return this.#renderer?.unmuteMedia() ?? false;
    }

    get source(): string {
      return readOrbitMapSource(this);
    }

    set source(value: string) {
      this.setAttribute('source', value);
    }

    connectedCallback(): void {
      this.#ensureShadowRoot();
      this.#observeContent();
      this.refresh();
    }

    disconnectedCallback(): void {
      this.#observer?.disconnect();
      this.#observer = null;
      this.#renderer?.destroy();
      this.#renderer = null;
      this.#renderedSource = null;
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
      if (!this.isConnected || oldValue === newValue) {
        return;
      }

      if (name === 'height' || name === 'data-height') {
        this.#applyHeight(this.#documentHeight);
        return;
      }

      if (name === 'data-orbit' || name === 'source' || !this.#renderer) {
        this.refresh();
        return;
      }

      // An absent attribute reads as undefined, which falls back to the
      // document's frontmatter instead of wiping it.
      this.#renderer.setOptions(readElementOptions(this));
    }

    refresh(): void {
      const container = this.#mapContainer;

      if (!container) {
        return;
      }

      const source = readOrbitMapSource(this);

      if (source === this.#renderedSource && (this.#renderer || container.hasChildNodes())) {
        return;
      }

      this.#renderedSource = source;

      const applyDocument = (doc: OrbitDocument) => {
        this.#documentHeight = doc.options.height;
        this.#applyHeight(doc.options.height);
        applyClassNames(this, doc.options.className);
      };

      // An edit redraws the existing map, so the reader keeps their place.
      const renderer = this.#renderer;

      if (renderer && source.trim()) {
        const options = readElementOptions(this);
        const parsed = parseSource(source, options, wordsFor(options.language, this, options.strings));

        if (parsed.doc) {
          applyDocument(parsed.doc);
          renderer.render(parsed.doc);
          return;
        }
      }

      this.#renderer?.destroy();
      this.#renderer = null;
      container.replaceChildren();

      if (!source.trim()) {
        this.#documentHeight = undefined;
        this.#applyHeight(undefined);
        return;
      }

      this.#renderer = renderSource(container, source, readElementOptions(this), this, applyDocument);
    }

    #ensureShadowRoot(): void {
      if (this.#mapContainer) {
        return;
      }

      const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = ELEMENT_STYLES;
      const container = document.createElement('div');
      container.className = 'map';
      container.setAttribute('part', 'map');
      root.replaceChildren(style, container);
      this.#mapContainer = container;
    }

    #observeContent(): void {
      if (this.#observer || typeof MutationObserver === 'undefined') {
        return;
      }

      // Also covers an element upgraded before the parser reached its content.
      this.#observer = new MutationObserver(() => this.#queueRefresh());
      this.#observer.observe(this, { childList: true, characterData: true, subtree: true });
    }

    #queueRefresh(): void {
      if (this.#refreshQueued) {
        return;
      }

      this.#refreshQueued = true;

      queueMicrotask(() => {
        this.#refreshQueued = false;

        if (this.isConnected) {
          this.refresh();
        }
      });
    }

    /** The `height` attribute wins over the document's frontmatter; author CSS wins over both. */
    #applyHeight(documentHeight: number | undefined): void {
      const height = readNumber(this.getAttribute('height') ?? this.getAttribute('data-height')) ?? documentHeight;

      if (height) {
        this.style.setProperty('--orbit-map-height', `${height}px`);
      } else {
        this.style.removeProperty('--orbit-map-height');
      }
    }
  };
};

const isOrbitMapElement = (element: Element): element is OrbitMapElement => {
  return typeof (element as Partial<OrbitMapElement>).refresh === 'function' && 'renderer' in element;
};

/** Parses a map's source; a document that can't be drawn comes back as an error instead. */
const parseSource = (
  source: string,
  options: AutoRenderOptions,
  words: OrbitWords,
): { doc: OrbitDocument; error?: undefined; diagnostics?: undefined } | { doc?: undefined; error: Error | null; diagnostics: OrbitDiagnostic[] } => {
  let doc: OrbitDocument;

  try {
    doc = parseOrbit(source, { strict: options.strict ?? false, untitled: words.text('untitledMap') });
  } catch (error) {
    return { error: error as Error, diagnostics: [] };
  }

  const blocking = (doc.diagnostics ?? []).filter((diagnostic) => diagnostic.severity === 'error');

  if (blocking.length > 0 && doc.root.children.length === 0 && doc.root.text === '') {
    return { error: null, diagnostics: blocking };
  }

  reportParseDiagnostics(doc);
  return { doc };
};

const renderSource = (
  target: HTMLElement,
  source: string,
  options: AutoRenderOptions,
  eventTarget: Element,
  applyDocument: (doc: OrbitDocument, options: AutoRenderOptions) => void,
): OrbitSVGRenderer | null => {
  const words = wordsFor(options.language, eventTarget, options.strings);
  const parsed = parseSource(source, options, words);

  if (!parsed.doc) {
    showRenderError(target, eventTarget, parsed.error, parsed.diagnostics, words);
    return null;
  }

  const doc = parsed.doc;

  target.replaceChildren();
  target.removeAttribute('data-orbit-error');
  applyDocument(doc, options);
  // Element attributes and explicit options win over the document's own;
  // the renderer layers them over the frontmatter when it renders `doc`.
  const renderer = new OrbitSVGRenderer(target, options);
  renderer.render(doc);
  return renderer;
};

const showRenderError = (target: Element, eventTarget: Element, error: Error | null, diagnostics: OrbitDiagnostic[], words: OrbitWords): void => {
  const first = diagnostics[0];
  const line = error instanceof OrbitParseError ? error.line : first?.line;
  const message = error
    ? error.message.replace(/ at line \d+$/, '')
    : first?.message ?? words.text('mapNotDrawnReason');
  const detail: OrbitRenderErrorDetail = { message, line, error, diagnostics };

  target.replaceChildren(buildErrorCard(message, line, words));
  target.setAttribute('data-orbit-error', '');

  if (typeof console !== 'undefined') {
    console.error(`[orbit] ${line === undefined ? '' : `line ${line}: `}${message}`);
  }

  eventTarget.dispatchEvent(new CustomEvent<OrbitRenderErrorDetail>('orbit-error', { detail, bubbles: true, composed: true }));
};

const buildErrorCard = (message: string, line: number | undefined, words: OrbitWords): HTMLElement => {
  const card = document.createElement('div');
  card.setAttribute('role', 'alert');
  card.className = 'orbit-error';
  card.style.cssText = [
    'box-sizing:border-box',
    'margin:12px',
    'padding:14px 16px',
    'border:1px dashed var(--orbit-error-border, #E58A8A)',
    'border-radius:12px',
    'background:var(--orbit-error-background, #FFF6F5)',
    'color:var(--orbit-error-text, #7A1F1F)',
    'font:14px/1.45 var(--orbit-font-family, var(--orbit-sans-font, ui-sans-serif, system-ui, sans-serif))',
  ].join(';');
  const title = document.createElement('strong');
  title.textContent = words.text('mapNotDrawn');
  title.style.display = 'block';
  const description = document.createElement('span');
  description.textContent = line === undefined ? message : words.text('problemOnLine', { line, message });
  card.append(title, description);
  return card;
};

/** `<orbit-map>` source: the `source` / `data-orbit` attribute, a `<script type="text/orbit">` child, or the content itself. */
const readOrbitMapSource = (element: Element): string => {
  const attribute = element.getAttribute('source') ?? element.getAttribute('data-orbit');

  if (attribute !== null) {
    return attribute;
  }

  const script = Array.from(element.children).find(
    (child) => child.tagName === 'SCRIPT' && /orbit|markdown|yaml/i.test(child.getAttribute('type') ?? ''),
  );

  if (script) {
    return script.textContent ?? '';
  }

  return serializeContent(element);
};

const getOrbitSource = (element: Element, target: Element): string => {
  return (
    element.getAttribute('data-orbit') ||
    element.getAttribute('source') ||
    target.getAttribute('data-orbit-source') ||
    serializeContent(element)
  );
};

/**
 * The element's content as written: text, plus HTML comments (`<!-- orbit
 * … -->` attribute blocks are comments to the HTML parser and would
 * otherwise be lost).
 */
const serializeContent = (element: Element): string => {
  let source = '';

  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === 3) {
      source += (node as Text).data;
    } else if (node.nodeType === 8) {
      source += `<!--${(node as Comment).data}-->`;
    } else if (node.nodeType === 1) {
      source += (node as Element).outerHTML;
    }
  }

  return source;
};

const getRenderTarget = (element: Element): Element => {
  if (element.matches('code.language-orbit') && element.parentElement) {
    return element.parentElement;
  }

  return element;
};

const readViewMode = (value: string | undefined): RendererOptions['viewMode'] => {
  return value === 'focus' || value === 'all' ? value : undefined;
};

/** A `theme` attribute that names a theme. One that doesn't is left out, so the document's own theme applies, and the console says so. */
const readTheme = (value: unknown): string | undefined => {
  if (isThemeName(value)) {
    return value;
  }

  if (typeof value === 'string' && value !== '') {
    console.warn(`[orbit] Unknown theme "${value}" on <orbit-map>, so it's left out. Themes: ${themeNames().join(', ')}.${didYouMean(value, themeNames(), THEME_SYNONYMS)}`);
  }

  return undefined;
};

/** Display options from attributes: `view-mode` or `data-view-mode`, and so on. */
const readElementOptions = (element: Element): AutoRenderOptions => {
  const attribute = (name: string) => element.getAttribute(name) ?? element.getAttribute(`data-${name}`);
  return {
    viewMode: readViewMode(attribute('view-mode') || undefined),
    theme: readTheme(attribute('theme')),
    height: readNumber(attribute('height')),
    maxDepth: readNumber(attribute('max-depth')),
    palette: readList(attribute('palette')),
    interactive: readBoolean(attribute('interactive')),
    orbitAnimation: readBoolean(attribute('animation')),
    editable: readBoolean(attribute('editable')),
    editingKeys: readBoolean(attribute('editing-keys')),
  };
};

const readNumber = (value: string | null): number | undefined => {
  if (!value) {
    return undefined;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const readBoolean = (value: string | null): boolean | undefined => {
  if (value === null) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === '' || normalized === 'true' || normalized === '1') {
    return true;
  }

  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  return undefined;
};

const readList = (value: string | null): string[] | undefined => {
  if (!value) {
    return undefined;
  }

  return value.split(',').map((item) => item.trim()).filter(Boolean);
};

const definedOnly = <T extends object>(options: T): Partial<T> => {
  return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) as Partial<T>;
};

/**
 * Class names a map's `className` added to an element, so the next render can
 * drop the ones it no longer asks for. A class the element already had is
 * the page's, and never counted.
 */
const appliedClassNames = new WeakMap<Element, string[]>();

/** Adds the class names a map asks for, and removes the ones an earlier render of it added. */
const applyClassNames = (element: Element, className: string | undefined): void => {
  const previous = appliedClassNames.get(element) ?? [];
  const next = className?.split(/\s+/).filter(Boolean) ?? [];
  const added = next.filter((name) => previous.includes(name) || !element.classList.contains(name));
  const stale = previous.filter((name) => !next.includes(name));

  if (stale.length > 0) {
    element.classList.remove(...stale);
  }

  if (next.length > 0) {
    element.classList.add(...next);
  }

  appliedClassNames.set(element, added);
};
