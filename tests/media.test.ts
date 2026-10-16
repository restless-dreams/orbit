import { describe, expect, it } from 'bun:test';
import {
  detectVideoProvider,
  isNativeVideoUrl,
  toVideoEmbedUrl,
  youtubeThumbnailUrl,
  youtubeVideoId,
  vimeoVideoId,
} from '../src/core/media';

describe('video provider detection', () => {
  it('detects youtube, vimeo, and native urls', () => {
    expect(detectVideoProvider('https://www.youtube.com/watch?v=abc123xyz')).toBe('youtube');
    expect(detectVideoProvider('https://youtu.be/abc123xyz')).toBe('youtube');
    expect(detectVideoProvider('https://vimeo.com/12345')).toBe('vimeo');
    expect(detectVideoProvider('https://cdn.example.com/clip.mp4')).toBe('native');
    expect(detectVideoProvider('https://example.com/page')).toBeNull();
    expect(isNativeVideoUrl('https://x.com/v.webm?sig=1')).toBe(true);
  });
});

describe('youtube id extraction', () => {
  it('handles watch, short, embed, shorts, and live urls', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://www.youtube.com/watch?list=PL1&v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=42')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://example.com/watch?v=x')).toBeNull();
  });
});

describe('vimeo id extraction', () => {
  it('handles page and player urls', () => {
    expect(vimeoVideoId('https://vimeo.com/76979871')).toBe('76979871');
    expect(vimeoVideoId('https://vimeo.com/video/76979871')).toBe('76979871');
    expect(vimeoVideoId('https://player.vimeo.com/video/76979871')).toBe('76979871');
    expect(vimeoVideoId('https://vimeo.com/about')).toBeNull();
  });
});

describe('embed url conversion', () => {
  it('converts youtube watch urls to the frameable embed endpoint', () => {
    expect(toVideoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    expect(toVideoEmbedUrl('https://youtu.be/dQw4w9WgXcQ', 'youtube')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
  });

  it('converts vimeo page urls to the player endpoint', () => {
    expect(toVideoEmbedUrl('https://vimeo.com/76979871')).toBe('https://player.vimeo.com/video/76979871');
  });

  it('returns null when no conversion is known', () => {
    expect(toVideoEmbedUrl('https://example.com/stream')).toBeNull();
    expect(toVideoEmbedUrl('https://cdn.example.com/clip.mp4')).toBeNull();
  });

  it('derives youtube thumbnails from any url shape', () => {
    expect(youtubeThumbnailUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    );
    expect(youtubeThumbnailUrl('https://example.com/x')).toBeNull();
  });
});

describe('videos by the site they are on', () => {
  it('only YouTube and Vimeo addresses are their videos', () => {
    expect(detectVideoProvider('https://evil.example/?next=youtube.com')).toBeNull();
    expect(detectVideoProvider('https://cdn.example.com/youtube.com/clip.mp4')).toBe('native');
    expect(detectVideoProvider('https://notvimeo.com/123')).toBeNull();
    expect(detectVideoProvider('HTTPS://WWW.YOUTUBE.COM/watch?v=dQw4w9WgXcQ')).toBe('youtube');
    expect(detectVideoProvider('youtu.be/dQw4w9WgXcQ')).toBe('youtube');
    expect(detectVideoProvider('//player.vimeo.com/video/76979871')).toBe('vimeo');
    expect(detectVideoProvider('media/clip.webm')).toBe('native');
  });

  it('reads YouTube ids whatever the case of the address', () => {
    expect(youtubeVideoId('HTTPS://WWW.YOUTUBE.COM/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://evil.example/youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('reads Vimeo channels, groups, showcases and unlisted videos', () => {
    expect(vimeoVideoId('https://vimeo.com/channels/staffpicks/76979871')).toBe('76979871');
    expect(vimeoVideoId('https://vimeo.com/groups/shortfilms/videos/76979871')).toBe('76979871');
    expect(vimeoVideoId('https://vimeo.com/showcase/1234/video/76979871')).toBe('76979871');
    expect(vimeoVideoId('https://vimeo.com/album/1234/video/76979871')).toBe('76979871');
    expect(vimeoVideoId('https://vimeo.com/channels/staffpicks')).toBeNull();
    expect(toVideoEmbedUrl('https://vimeo.com/76979871/2a3b4c5d6e')).toBe('https://player.vimeo.com/video/76979871?h=2a3b4c5d6e');
    expect(toVideoEmbedUrl('https://player.vimeo.com/video/76979871?h=2a3b4c5d6e')).toBe('https://player.vimeo.com/video/76979871?h=2a3b4c5d6e');
  });
});
