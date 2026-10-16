const supports = (property: string, value: string): boolean => {
  const css = (globalThis as { CSS?: { supports?: (property: string, value: string) => boolean } }).CSS;
  return typeof css?.supports !== 'function' || css.supports(property, value);
};

/**
 * What the browser draws with, checked once. A few effects need newer CSS:
 * older browsers, such as the WebViews of phones that don't update theirs,
 * get plainer versions of them instead of broken ones. Outside a browser (on
 * a server, or tests without a DOM) everything counts as there.
 */
export const browser = {
  /** CSS `color-mix()` (Chromium 111, Safari 16.2, Firefox 113). Without it, siblings keep their branch's own color. */
  mixesColors: supports('color', 'color-mix(in oklab, red 50%, blue)'),

  /** The `translate` property (Chromium 104, Safari 14.1, Firefox 72). Without it, overlays are centered through their transform. */
  translates: supports('translate', '1px'),
};

const coarseQueries = new WeakMap<Window, MediaQueryList>();

/**
 * Whether `element`'s page is used with a finger (`pointer: coarse`), where
 * the stylesheet makes buttons bigger. The query is made once per window.
 */
export const pointsCoarsely = (element: Element): boolean => {
  const view = element.ownerDocument.defaultView;

  if (!view || typeof view.matchMedia !== 'function') {
    return false;
  }

  let query = coarseQueries.get(view);

  if (!query) {
    query = view.matchMedia('(pointer: coarse)');
    coarseQueries.set(view, query);
  }

  return query.matches;
};

/**
 * The transform that puts an overlay at `x`, `y`. `centering` is the
 * stylesheet's `translate` for it, as `translate()` takes it: where the
 * browser lacks that property, the transform moves the overlay instead.
 */
export const overlayTransform = (x: number, y: number, centering: string): string => {
  const position = `translate3d(${x}px, ${y}px, 0)`;
  return browser.translates ? position : `${position} translate(${centering})`;
};
