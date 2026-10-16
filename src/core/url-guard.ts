/**
 * URL guard for Orbit. Validates the scheme per render surface, lets
 * relative URLs through unchanged, and resolves them against an optional
 * baseUrl.
 */

export type UrlSurface = 'image' | 'video' | 'embed' | 'link';

const warned = new Set<string>();
const WARN_LIMIT = 500;

/**
 * A URL as browsers read it: without the control characters and spaces at
 * its ends, and without tabs and line breaks anywhere. The URL standard drops
 * them before it reads the scheme, so " javascript:" and "java\tscript:"
 * are both "javascript:" to a browser.
 */
export const normalizeUrl = (url: string): string => {
  // eslint-disable-next-line no-control-regex
  return url.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '').replace(/[\t\n\r]/g, '');
};

/**
 * The URL to use on `surface`, or null when its scheme isn't allowed there.
 * Checks the URL the way a browser will read it, and returns it in that form.
 * A blocked URL is reported on the console, unless `report` is false: for
 * checking one before it goes into a map.
 */
export const guardUrl = (input: string, surface: UrlSurface, report = true): string | null => {
  const warn = report ? warnOnce : () => undefined;
  const url = normalizeUrl(input);

  // Protocol-relative URLs (//host/path) are absolute on a base; route through the allowlist.
  if (url.startsWith('//')) {
    const probe = `https:${url}`;
    let parsed: URL;

    try {
      parsed = new URL(probe);
    } catch {
      warn(url, 'unparseable URL');
      return null;
    }

    if (!schemeAllowed('https', surface, parsed)) {
      warn(url, `surface "${surface}" forbidden`);
      return null;
    }

    return url;
  }

  if (!hasScheme(url)) {
    return url;
  }

  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    warn(url, 'unparseable URL');
    return null;
  }

  const scheme = parsed.protocol.replace(/:$/, '');

  if (!schemeAllowed(scheme, surface, parsed)) {
    warn(url, `surface "${surface}" forbidden`);
    return null;
  }

  return url;
};

const hasScheme = (url: string): boolean => {
  return /^[a-z][a-z0-9+.-]*:/i.test(url);
};

const schemeAllowed = (scheme: string, surface: UrlSurface, parsed: URL): boolean => {
  if (scheme === 'http' || scheme === 'https') {
    return true;
  }

  if (scheme === 'data' && surface === 'image') {
    return /^data:image\/(png|jpeg|jpg|gif|webp|avif|bmp|ico);/i.test(parsed.href);
  }

  if (scheme === 'blob') {
    return surface === 'image' || surface === 'video';
  }

  if (scheme === 'mailto' || scheme === 'tel' || scheme === 'sms') {
    return surface === 'link';
  }

  return false;
};

const warnOnce = (url: string, why: string): void => {
  if (warned.has(url)) {
    return;
  }

  if (warned.size >= WARN_LIMIT) {
    return;
  }

  warned.add(url);

  if (typeof console !== 'undefined') {
    console.warn(`[orbit] blocked URL (${why}): ${url}`);
  }
};

/**
 * Resolve a baseUrl string to its canonical absolute href.
 *
 * - Absolute baseUrls (`https://example.com/assets/`) are returned as `URL().href`.
 * - Relative baseUrls (`/assets/`, `./foo/`) are resolved against `document.baseURI` in browsers.
 * - Throws if baseUrl is relative and no `document.baseURI` is available (Node/SSR).
 */
export const resolveBaseUrl = (baseUrl: string): string => {
  try {
    return new URL(baseUrl).href;
  } catch {
    if (typeof document !== 'undefined' && document.baseURI) {
      return new URL(baseUrl, document.baseURI).href;
    }

    throw new Error(
      `RendererOptions.baseUrl is relative ("${baseUrl}") and no document.baseURI is available. ` +
      `Provide an absolute baseUrl when running outside a browser document context.`,
    );
  }
};

/**
 * Resolve `url` against `baseUrl` if relative; pass through if absolute or no baseUrl.
 *
 * - Absolute URLs (https://, http://, etc.) pass through unchanged.
 * - Protocol-relative URLs (//host/path) are treated as already-absolute (resolved by the browser at fetch time).
 * - Relative URLs (foo.jpg, ./x, /assets/y) are resolved against `baseUrl`.
 *
 * For directory-relative resolution, `baseUrl` should end with `/`.
 * Per WHATWG URL spec, `new URL('foo.jpg', 'https://x/dir')` yields `https://x/foo.jpg`
 * (the trailing path segment is consumed); `new URL('foo.jpg', 'https://x/dir/')` yields `https://x/dir/foo.jpg`.
 */
export const resolveUrl = (url: string, baseUrl: string | undefined): string => {
  if (!baseUrl) {
    return url;
  }

  if (url.startsWith('//')) {
    return url;
  }

  try {
    new URL(url);
    return url; // already absolute
  } catch {
    const base = resolveBaseUrl(baseUrl);
    return new URL(url, base).href;
  }
};
