import { describe, expect, it } from 'bun:test';
import { guardUrl, resolveBaseUrl, resolveUrl } from '../src/core/url-guard';

describe('url-guard scheme allowlist', () => {
  it('http/https accepted on every surface', () => {
    expect(guardUrl('https://example.com', 'image')).toBe('https://example.com');
    expect(guardUrl('http://example.com', 'video')).toBe('http://example.com');
    expect(guardUrl('https://example.com', 'embed')).toBe('https://example.com');
    expect(guardUrl('https://example.com', 'link')).toBe('https://example.com');
  });

  it('relative URLs pass through unchanged on media surfaces', () => {
    expect(guardUrl('./foo.jpg', 'image')).toBe('./foo.jpg');
    expect(guardUrl('media/x.png', 'image')).toBe('media/x.png');
    expect(guardUrl('/assets/v.mp4', 'video')).toBe('/assets/v.mp4');
  });

  it('data: image MIME accepted only on image', () => {
    expect(guardUrl('data:image/png;base64,xyz', 'image')).toBe('data:image/png;base64,xyz');
    expect(guardUrl('data:image/png;base64,xyz', 'video')).toBeNull();
  });

  it('data:text rejected even on image', () => {
    expect(guardUrl('data:text/html,<script>alert(1)</script>', 'image')).toBeNull();
  });

  it('mailto/tel/sms accepted on link only', () => {
    expect(guardUrl('mailto:a@b', 'link')).toBe('mailto:a@b');
    expect(guardUrl('tel:+15551234', 'link')).toBe('tel:+15551234');
    expect(guardUrl('sms:+15551234', 'link')).toBe('sms:+15551234');
    expect(guardUrl('mailto:a@b', 'image')).toBeNull();
  });

  it('checks a URL the way browsers read it: spaces and controls at the ends, tabs and line breaks anywhere', () => {
    // The URL standard strips these before reading the scheme, so each of these runs script in a browser.
    const disguised = [
      ' javascript:alert(1)',
      '\u0000javascript:alert(1)',
      '\u001fjavascript:alert(1)',
      '\njavascript:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      'java\rscript:alert(1)',
      'javascript\t:alert(1)',
      '  JaVaScRiPt:alert(1)  ',
      ' vbscript:msgbox',
      ' data:text/html,<script>alert(1)</script>',
    ];

    for (const url of disguised) {
      for (const surface of ['link', 'embed', 'image', 'video'] as const) {
        expect(guardUrl(url, surface)).toBeNull();
      }
    }
  });

  it('hands back the URL in the form it was checked in', () => {
    expect(guardUrl('  https://example.com/a b  ', 'link')).toBe('https://example.com/a b');
    expect(guardUrl('https://exa\nmple.com/', 'link')).toBe('https://example.com/');
    expect(guardUrl(' media/photo.png\n', 'image')).toBe('media/photo.png');
    expect(guardUrl('\t//cdn.example.com/x.png', 'image')).toBe('//cdn.example.com/x.png');
  });

  it('javascript / file / vbscript / unknown rejected', () => {
    expect(guardUrl('javascript:alert(1)', 'link')).toBeNull();
    expect(guardUrl('file:///etc/passwd', 'image')).toBeNull();
    expect(guardUrl('vbscript:msgbox', 'link')).toBeNull();
    expect(guardUrl('weird:protocol', 'link')).toBeNull();
  });
});

describe('url-guard edge cases', () => {
  it('data:image/svg+xml is rejected', () => {
    expect(guardUrl('data:image/svg+xml,<svg/>', 'image')).toBeNull();
  });

  it('data:image/png is accepted', () => {
    expect(guardUrl('data:image/png;base64,iVBOR', 'image')).toBe('data:image/png;base64,iVBOR');
  });

  it('protocol-relative URL is treated as absolute and passes for image', () => {
    expect(guardUrl('//cdn.example.com/x.png', 'image')).toBe('//cdn.example.com/x.png');
  });

  it('blob: rejected on embed surface', () => {
    expect(guardUrl('blob:https://example.com/abc', 'embed')).toBeNull();
  });

  it('blob: accepted on image and video', () => {
    expect(guardUrl('blob:https://example.com/abc', 'image')).toBe('blob:https://example.com/abc');
    expect(guardUrl('blob:https://example.com/abc', 'video')).toBe('blob:https://example.com/abc');
  });

  it('unparseable URL returns null', () => {
    expect(guardUrl('http://%invalid', 'image')).toBeNull();
  });

  it('warnOnce dedupes repeated blocks of the same URL', () => {
    const unique = `javascript:warnOnceTest_${Date.now()}_${Math.random()}`;
    const calls: unknown[][] = [];
    const orig = console.warn;
    console.warn = (...args: unknown[]) => { calls.push(args); };

    try {
      guardUrl(unique, 'link');
      guardUrl(unique, 'link');
      guardUrl(unique, 'image');
    } finally {
      console.warn = orig;
    }

    expect(calls.length).toBe(1);
  });
});

describe('url-guard baseUrl resolution', () => {
  it('absolute baseUrl used directly', () => {
    expect(resolveBaseUrl('https://example.com/assets/')).toBe('https://example.com/assets/');
  });

  it('relative URL resolved against absolute base', () => {
    expect(resolveUrl('foo.jpg', 'https://example.com/assets/')).toBe('https://example.com/assets/foo.jpg');
  });

  it('absolute URL passes through resolveUrl unchanged', () => {
    expect(resolveUrl('https://other.com/x.png', 'https://example.com/assets/')).toBe('https://other.com/x.png');
  });

  it('relative baseUrl with document.baseURI in browser', () => {
    // happy-dom provides document.baseURI as http://localhost/ by default
    const resolved = resolveBaseUrl('/assets/');
    expect(resolved).toMatch(/^https?:\/\/.+\/assets\/$/);
  });

  it('without a baseUrl, resolveUrl passes the URL through', () => {
    expect(resolveUrl('foo.jpg', undefined)).toBe('foo.jpg');
  });

  it('resolveUrl passes protocol-relative URL through unchanged', () => {
    expect(resolveUrl('//cdn.example.com/x.png', 'https://base.example/assets/')).toBe('//cdn.example.com/x.png');
  });

  it('baseUrl without trailing slash drops the last segment (documented behavior)', () => {
    // As the WHATWG URL spec has it: callers give a baseUrl that ends in /.
    expect(resolveUrl('foo.jpg', 'https://example.com/dir')).toBe('https://example.com/foo.jpg');
  });
});
