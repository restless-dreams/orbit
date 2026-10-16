/**
 * Frames for the detail sheet and the media viewer: another site's page
 * (an embed), and YouTube's and Vimeo's players.
 */

import { guardUrl, resolveUrl } from '../url-guard.js';

/** A page shown in a frame, or null when its URL isn't allowed in one. */
export const embedFrame = (url: string, baseUrl: string | undefined, title: string): HTMLIFrameElement | null => {
  const guarded = guardUrl(url, 'embed');

  if (!guarded) {
    return null;
  }

  const frame = document.createElement('iframe');
  const source = resolveUrl(guarded, baseUrl);
  frame.src = source;
  frame.title = title;
  // Another site's page keeps its own origin, which it needs for its cookies
  // and storage. A page from the map's own site gets none: with scripts and
  // its real origin, it could reach into the page around the map.
  frame.setAttribute('sandbox', sameOrigin(source) ? 'allow-scripts allow-presentation allow-popups' : 'allow-scripts allow-same-origin allow-presentation allow-popups');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.setAttribute('allow', 'fullscreen; picture-in-picture');
  frame.setAttribute('allowfullscreen', '');
  return frame;
};

/**
 * YouTube's or Vimeo's player in a frame, from an embed URL made by
 * `toVideoEmbedUrl`, or null when its URL isn't allowed in one.
 */
export const playerFrame = (src: string, title: string): HTMLIFrameElement | null => {
  const guarded = guardUrl(src, 'embed');

  if (!guarded) {
    return null;
  }

  const frame = document.createElement('iframe');
  frame.src = guarded;
  frame.title = title;
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox');
  // YouTube's player won't play without knowing which site it's on (its
  // "Error 153"), and some pages send no referrer by default: send the
  // page's origin, never its address.
  frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  frame.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
  frame.setAttribute('allowfullscreen', '');
  return frame;
};

/** Whether a URL is on the page's own origin; relative URLs are. */
const sameOrigin = (url: string): boolean => {
  if (typeof location === 'undefined') {
    return false;
  }

  try {
    return new URL(url, document.baseURI).origin === location.origin;
  } catch {
    return true;
  }
};
