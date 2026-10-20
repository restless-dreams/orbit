/**
 * The script of a map shared as a web page (see page.ts). It draws the map
 * from the page's JSON, with its pictures swapped for the ones inside the
 * page, and presents it on request: one idea at a time, in reading order,
 * with its note as a caption, stepped with keys, buttons or swipes, full
 * screen where the browser allows. Printed, it's the map laid out for paper.
 */

import { createOrbitMap } from '../create.js';
import { parseOrbit } from '../dispatch.js';
import { OrbitWords } from '../languages.js';
import { findLinkedNode } from '../node-links.js';
import { renderPrintLayout } from '../print-layout.js';
import { renderNoteMarkdown } from '../ui/note-markdown.js';
import type { OrbitSVGRenderer } from '../svg-renderer.js';
import type { OrbitDocument, OrbitNode } from '../types.js';
import type { WebPageData } from './page.js';

/** A swipe at least this long, in px, steps to the next idea or back. */
const SWIPE = 60;
/** While presenting, the controls step aside after this long without the pointer moving, in ms. */
const CONTROLS_LINGER = 2500;
/** Room left between the caption and the map above it, in px. */
const CAPTION_GAP = 12;
/** Room the Present button takes under the map while exploring, in px. */
const EXPLORING_INSETS = { bottom: 68 };
/** The longest the print layout waits for the page to be idle, in ms. */
const PRINT_LAYOUT_DELAY = 2000;

const FORWARD = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'];
const BACK = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'];

/** Draws the page's map and lets it be presented. Returns the map, or null on a page that isn't one. */
export const startWebPage = (page: Document = document): OrbitSVGRenderer | null => {
  const element = (id: string) => page.getElementById(id);
  const dataElement = element('orbit-page');
  const container = element('page-map');

  if (!dataElement || !container) {
    return null;
  }

  const data = JSON.parse(dataElement.textContent ?? '{}') as WebPageData;
  const words = new OrbitWords(data.language, data.strings);
  const map = withMedia(parseOrbit(data.source, { untitled: words.text('untitledMap') }), data.media ?? {});
  const renderer = createOrbitMap(container, map, {
    theme: data.theme,
    viewMode: data.viewMode,
    focus: data.focus,
    language: data.language,
    strings: data.strings,
    insets: EXPLORING_INSETS,
  });

  layOutForPrint(page, element('page-print'), map, data);
  const body = element('page')!;
  const caption = element('page-caption')!;
  const title = element('page-title')!;
  const note = element('page-note')!;
  const controls = element('page-controls')!;
  const count = element('page-count')!;
  const presentButton = page.querySelector<HTMLButtonElement>('[data-present]');
  const order = readingOrder(map.root);
  let presenting = false;
  let index = 0;
  let linger = 0;

  const showControls = () => {
    body.classList.add('page--controls');
    window.clearTimeout(linger);
    linger = window.setTimeout(() => body.classList.remove('page--controls'), CONTROLS_LINGER);
  };

  const show = () => {
    const node = findNode(map.root, order[index]);
    title.textContent = node?.text || words.text('theIdea');

    if (node?.note && node.noteFormat === 'plain') {
      note.textContent = node.note;
    } else {
      note.replaceChildren(renderNoteMarkdown(node?.note ?? '', {
        baseUrl: map.options.baseUrl,
        resolveLink: (href) => findLinkedNode(map.root, href),
      }));
    }

    count.textContent = words.text('position', { index: index + 1, total: order.length });
    // The idea flies to the middle of what the caption leaves of the screen.
    const top = caption.getBoundingClientRect().top;
    renderer.setOptions({ insets: { bottom: Math.max(0, window.innerHeight - top + CAPTION_GAP) } });
    renderer.flyTo(order[index]);
  };

  const step = (by: number) => {
    index = Math.min(order.length - 1, Math.max(0, index + by));
    show();
  };

  const present = () => {
    presenting = true;
    index = Math.max(0, order.indexOf(renderer.getFocusedNode()?.id ?? ''));
    body.classList.add('page--presenting');
    caption.hidden = false;
    controls.hidden = false;
    // The page takes the keys, clicks and swipes now, and the caption says what the map's controls would.
    renderer.setOptions({ interactive: false, showControls: false });
    show();
    showControls();
    page.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const stop = () => {
    if (!presenting) {
      return;
    }

    presenting = false;
    body.classList.remove('page--presenting', 'page--controls');
    caption.hidden = true;
    controls.hidden = true;
    renderer.setOptions({ interactive: true, showControls: true, insets: EXPLORING_INSETS });

    if (page.fullscreenElement) {
      page.exitFullscreen().catch(() => undefined);
    }

    // Exploring picks up where the presentation was.
    renderer.flyTo(order[index]);
    presentButton?.focus();
  };

  presentButton?.addEventListener('click', present);
  page.querySelector('[data-close]')?.addEventListener('click', stop);

  page.querySelectorAll<HTMLElement>('[data-step]').forEach((button) => {
    button.addEventListener('click', () => {
      step(Number(button.dataset.step));
      showControls();
    });
  });

  // While presenting, the page has the keys before the map; P or F5 presents.
  page.defaultView?.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    if (!presenting) {
      const typing = (event.target as Element | null)?.closest?.('input, textarea, [contenteditable="true"]');

      if (!typing && (event.key === 'p' || event.key === 'P' || event.key === 'F5')) {
        event.preventDefault();
        present();
      }

      return;
    }

    if (FORWARD.includes(event.key) && !(event.target as Element | null)?.closest?.('button')) {
      event.preventDefault();
      step(1);
    } else if (BACK.includes(event.key)) {
      event.preventDefault();
      step(-1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      stop();
    }
  }, true);

  // Leaving full screen with the browser's own Escape ends the presentation too.
  page.addEventListener('fullscreenchange', () => {
    if (presenting && !page.fullscreenElement && page.fullscreenEnabled) {
      stop();
    }
  });

  // A swipe steps and a tap shows the controls; a mouse moving shows them too.
  let start: { x: number; y: number } | null = null;

  body.addEventListener('pointerdown', (event) => {
    if (presenting && !(event.target as Element).closest('.page__controls, .page__caption')) {
      start = { x: event.clientX, y: event.clientY };
    }
  });

  body.addEventListener('pointerup', (event) => {
    if (!presenting || !start) {
      return;
    }

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;

    if (Math.abs(dx) >= SWIPE && Math.abs(dx) > Math.abs(dy)) {
      step(dx < 0 ? 1 : -1);
    } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      showControls();
    }
  });

  body.addEventListener('pointermove', (event) => {
    if (presenting && event.pointerType === 'mouse') {
      showControls();
    }
  });

  return renderer;
};

/**
 * Lays the map out for paper in `container` before the page prints, or once
 * the page is idle, so a browser printing without asking it first (a
 * headless one making a PDF) finds it ready too.
 */
const layOutForPrint = (page: Document, container: HTMLElement | null, map: OrbitDocument, data: WebPageData): void => {
  const view = page.defaultView;

  if (!container || !view) {
    return;
  }

  let laidOut = false;

  const layOut = () => {
    if (laidOut) {
      return;
    }

    laidOut = true;
    renderPrintLayout(container, map, { theme: data.theme, viewMode: data.viewMode, focus: data.focus, language: data.language, strings: data.strings });
  };

  view.addEventListener('beforeprint', layOut);

  if (typeof view.requestIdleCallback === 'function') {
    view.requestIdleCallback(layOut, { timeout: PRINT_LAYOUT_DELAY });
  } else {
    view.setTimeout(layOut, PRINT_LAYOUT_DELAY);
  }
};

/** The map with its pictures swapped for the ones inside the page, wherever the map shows them. */
export const withMedia = (map: OrbitDocument, media: Record<string, string>): OrbitDocument => {
  if (Object.keys(media).length === 0) {
    return map;
  }

  const swap = (src: string) => media[src] ?? src;

  const visit = (node: OrbitNode) => {
    if (node.image) {
      node.image = { ...node.image, src: swap(node.image.src) };
    }

    if (node.video?.thumbnail) {
      node.video = { ...node.video, thumbnail: swap(node.video.thumbnail) };
    }

    if (node.note && node.noteFormat !== 'plain') {
      node.note = node.note.replace(/(!\[[^\]]*\]\()([^)\s]+)/g, (_match, start: string, src: string) => `${start}${swap(src)}`);
    }

    node.children.forEach(visit);
  };

  visit(map.root);
  return map;
};

/** Every node's id, in reading order: the order the page presents them in. */
const readingOrder = (root: OrbitNode): string[] => {
  const ids: string[] = [];

  const visit = (node: OrbitNode) => {
    ids.push(node.id);
    node.children.forEach(visit);
  };

  visit(root);
  return ids;
};

const findNode = (root: OrbitNode, id: string): OrbitNode | null => {
  if (root.id === id) {
    return root;
  }

  for (const child of root.children) {
    const found = findNode(child, id);

    if (found) {
      return found;
    }
  }

  return null;
};
