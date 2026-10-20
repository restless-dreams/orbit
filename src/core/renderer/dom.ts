/** The page around a map: its elements, events, focus and scrolling, as the renderer reads them. */

import { OrbitWords } from '../languages.js';

export const reportListenerError = (error: unknown): void => {
  const report = (globalThis as { reportError?: (error: unknown) => void }).reportError;

  if (typeof report === 'function') {
    report(error);
  } else {
    setTimeout(() => {
      throw error;
    });
  }
};

export const createEmptyState = (words: OrbitWords): HTMLDivElement => {
  const empty = document.createElement('div');
  empty.className = 'orbit-empty';
  empty.hidden = true;
  fillEmptyState(empty, words);
  return empty;
};

/** The empty map's message and hint, in `words`' language. */
export const fillEmptyState = (empty: HTMLDivElement, words: OrbitWords): void => {
  const title = document.createElement('strong');
  title.textContent = words.text('emptyMap');
  const hint = document.createElement('span');
  hint.textContent = words.text('emptyMapHint');
  empty.replaceChildren(title, hint);
};

/** The + in arrow-key order around the orbit. */
export const SLOT_STOP = '\u0000slot';

export const isAddSlot = (target: EventTarget | null): boolean => {
  return Boolean(target && typeof (target as Element).closest === 'function' && (target as Element).closest('[data-orbit-add]'));
};

export const nodeIdFrom = (target: EventTarget | null): string | null => {
  const element = target && typeof (target as Element).closest === 'function' ? (target as Element).closest('[data-orbit-node-id]') : null;
  return element?.getAttribute('data-orbit-node-id') ?? null;
};

export const isFocusVisible = (target: EventTarget | null): boolean => {
  try {
    return (target as Element).matches(':focus-visible');
  } catch {
    return true;
  }
};

export const isApplePlatform = (): boolean => {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
};

/** Whether the document, or any element around `element`, can scroll. */
export const scrollsAround = (element: Element): boolean => {
  const document = element.ownerDocument;
  const scroller = document.scrollingElement;

  if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) {
    return true;
  }

  let current: Element | null = parentAcrossShadow(element);

  while (current && current !== document.documentElement && current !== document.body) {
    if (current.scrollHeight > current.clientHeight + 1 && typeof getComputedStyle === 'function') {
      const overflow = getComputedStyle(current).overflowY;

      if (overflow === 'auto' || overflow === 'scroll') {
        return true;
      }
    }

    current = parentAcrossShadow(current);
  }

  return false;
};

export const parentAcrossShadow = (element: Element): Element | null => {
  if (element.parentElement) {
    return element.parentElement;
  }

  const root = element.getRootNode();
  return typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot ? root.host : null;
};
