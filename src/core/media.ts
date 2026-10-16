/**
 * Video provider helpers shared by the parser (provider detection), the
 * renderer (thumbnail derivation), and the detail sheet and media viewer
 * (embed URL conversion, and links to a video's page on its site).
 *
 * YouTube and Vimeo forbid framing their watch pages (X-Frame-Options /
 * frame-ancestors); only the dedicated embed endpoints may be iframed, so
 * anything that puts a video URL into an <iframe> must go through
 * `toVideoEmbedUrl` first.
 */

import { normalizeUrl } from './url-guard.js';

export type VideoProvider = 'youtube' | 'vimeo' | 'native';

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be']);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);
const NATIVE_VIDEO = /\.(mp4|webm|mov)(?:[?#]|$)/i;
/** A YouTube or Vimeo address written without its scheme, such as `youtu.be/…`. */
const BARE_HOST = /^(?:(?:www|m|music|player)\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be|vimeo\.com)\//i;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,}$/;

/** A web address, by its parts; null for relative URLs and other schemes. */
const webUrl = (url: string): URL | null => {
  const text = normalizeUrl(url);
  const absolute = text.startsWith('//') ? `https:${text}` : BARE_HOST.test(text) ? `https://${text}` : text;

  try {
    const parsed = new URL(absolute);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed : null;
  } catch {
    return null;
  }
};

/** Which player a video URL needs, by the site it is on; null when it isn't a video. */
export const detectVideoProvider = (url: string): VideoProvider | null => {
  const parsed = webUrl(url);
  const host = parsed?.hostname.toLowerCase();

  if (host && YOUTUBE_HOSTS.has(host)) {
    return 'youtube';
  }

  if (host && VIMEO_HOSTS.has(host)) {
    return 'vimeo';
  }

  if (NATIVE_VIDEO.test(parsed ? parsed.pathname : url)) {
    return 'native';
  }

  return null;
};

export const isNativeVideoUrl = (url: string): boolean => {
  return NATIVE_VIDEO.test(url);
};

/** The video id in any of YouTube's URL shapes: watch pages, youtu.be, embeds, Shorts and lives. */
export const youtubeVideoId = (url: string): string | null => {
  const parsed = webUrl(url);
  const host = parsed?.hostname.toLowerCase();

  if (!parsed || !host || !YOUTUBE_HOSTS.has(host)) {
    return null;
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  let id: string | null | undefined;

  if (host === 'youtu.be') {
    id = segments[0];
  } else if (segments[0] === 'watch') {
    id = parsed.searchParams.get('v');
  } else if (['embed', 'shorts', 'live', 'v'].includes(segments[0])) {
    id = segments[1];
  }

  return id && YOUTUBE_ID.test(id) ? id : null;
};

/**
 * A Vimeo video's id, and the hash an unlisted video needs, from its page
 * (`vimeo.com/123`, `/123/abc`, channels, groups, showcases) or its player.
 */
export const vimeoVideo = (url: string): { id: string; hash?: string } | null => {
  const parsed = webUrl(url);
  const host = parsed?.hostname.toLowerCase();

  if (!parsed || !host || !VIMEO_HOSTS.has(host)) {
    return null;
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  const hash = (value: string | null | undefined) => (value && /^[0-9a-f]{6,}$/i.test(value) ? value : undefined);

  if (host === 'player.vimeo.com') {
    return segments[0] === 'video' && /^\d+$/.test(segments[1] ?? '') ? { id: segments[1], hash: hash(parsed.searchParams.get('h')) } : null;
  }

  if (/^\d+$/.test(segments[0] ?? '')) {
    return { id: segments[0], hash: hash(segments[1]) };
  }

  let index = -1;

  if (segments[0] === 'video') {
    index = 1;
  } else if (segments[0] === 'channels') {
    index = 2;
  } else if (segments[0] === 'groups' && segments[2] === 'videos') {
    index = 3;
  } else if ((segments[0] === 'album' || segments[0] === 'showcase') && segments[2] === 'video') {
    index = 3;
  }

  const id = index > 0 ? segments[index] : undefined;
  return id && /^\d+$/.test(id) ? { id, hash: hash(segments[index + 1]) } : null;
};

/** The numeric id of a Vimeo video. */
export const vimeoVideoId = (url: string): string | null => {
  return vimeoVideo(url)?.id ?? null;
};

/**
 * Convert a video URL to a frameable embed URL. Returns null when no
 * conversion is known (callers fall back to the original URL).
 */
export const toVideoEmbedUrl = (url: string, provider?: string): string | null => {
  const kind = provider === 'youtube' || provider === 'vimeo' ? provider : detectVideoProvider(url);

  if (kind === 'youtube') {
    const id = youtubeVideoId(url);
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }

  if (kind === 'vimeo') {
    const video = vimeoVideo(url);
    return video ? `https://player.vimeo.com/video/${video.id}${video.hash ? `?h=${video.hash}` : ''}` : null;
  }

  return null;
};

/** Whether a YouTube URL is a Short, a video that plays upright. */
export const isYouTubeShort = (url: string): boolean => {
  const parsed = webUrl(url);
  return parsed !== null && YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase()) && parsed.pathname.split('/').filter(Boolean)[0] === 'shorts';
};

/** Where a video is watched on its site: its YouTube or Vimeo page, or the URL itself. */
export const videoPageUrl = (url: string, provider?: string): string => {
  const kind = provider === 'youtube' || provider === 'vimeo' ? provider : detectVideoProvider(url);

  if (kind === 'youtube') {
    const id = youtubeVideoId(url);

    if (id) {
      return isYouTubeShort(url) ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`;
    }
  }

  if (kind === 'vimeo') {
    const video = vimeoVideo(url);

    if (video) {
      return `https://vimeo.com/${video.id}${video.hash ? `/${video.hash}` : ''}`;
    }
  }

  return url;
};

export const youtubeThumbnailUrl = (url: string): string | null => {
  const id = youtubeVideoId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
};

/** True when an image, video or embed value has a usable `src`. */
export const hasMediaSource = (media: { src?: unknown } | undefined | null): media is { src: string } => {
  return Boolean(media) && typeof media!.src === 'string' && media!.src.trim() !== '';
};
