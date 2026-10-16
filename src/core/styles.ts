import componentStyles from './styles/orbit.scss';
import { themeStylesheet } from './themes.js';

const STYLESHEET = componentStyles + themeStylesheet();
const styledRoots = new WeakSet<Document | ShadowRoot>();
let sharedSheet: CSSStyleSheet | null = null;

/**
 * Adds the orbit stylesheet, once, to the document or shadow root that holds
 * `element`. Constructable stylesheets are used where available, so pages
 * with a strict Content Security Policy keep working.
 */
export const ensureStyles = (element: Node): void => {
  const target = styleTarget(element);

  if (!target || styledRoots.has(target)) {
    return;
  }

  styledRoots.add(target);

  if ('adoptedStyleSheets' in target && typeof CSSStyleSheet === 'function' && 'replaceSync' in CSSStyleSheet.prototype) {
    try {
      sharedSheet ??= createSheet();
      target.adoptedStyleSheets = [...target.adoptedStyleSheets, sharedSheet];
      return;
    } catch {
      // A sheet built for another document can't be adopted: fall back to a <style> element.
    }
  }

  const style = (element.ownerDocument ?? document).createElement('style');
  style.setAttribute('data-orbit-styles', '');
  style.textContent = STYLESHEET;

  if (isShadowRoot(target)) {
    target.appendChild(style);
  } else {
    (target.head ?? target.documentElement).appendChild(style);
  }
};

const createSheet = (): CSSStyleSheet => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(STYLESHEET);
  return sheet;
};

const styleTarget = (element: Node): Document | ShadowRoot | null => {
  const root = element.getRootNode?.();

  if (root && isShadowRoot(root)) {
    return root;
  }

  return element.ownerDocument ?? (typeof document === 'undefined' ? null : document);
};

const isShadowRoot = (node: Node): node is ShadowRoot => {
  return typeof ShadowRoot !== 'undefined' && node instanceof ShadowRoot;
};
