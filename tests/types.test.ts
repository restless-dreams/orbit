import { describe, expect, it } from 'bun:test';
import { ORBIT_THEME_PRESETS } from '../src/core';
import type { OrbitNode, OrbitActionEvent, OrbitDocumentOptions, OrbitThemePreset, RendererOptions } from '../src/core/types';

describe('public types', () => {
  it('OrbitNode accepts media + caption + noteFormat', () => {
    const node: OrbitNode = {
      id: 'n1',
      text: 'Demo',
      level: 0,
      children: [],
      image: { src: 'https://example.com/x.png', alt: 'a', caption: 'c' },
      video: { src: 'https://youtu.be/abc', provider: 'youtube', thumbnail: 't.jpg', caption: 'v' },
      embed: { src: 'https://example.com/e', caption: 'e' },
      note: 'multi\nline',
      noteFormat: 'markdown',
    };
    expect(node.image?.caption).toBe('c');
    expect(node.video?.provider).toBe('youtube');
    expect(node.noteFormat).toBe('markdown');
  });

  it('OrbitActionEvent has node, action, sourceEvent', () => {
    const ev: OrbitActionEvent = {
      node: { id: 'n', text: 't', level: 0, children: [] },
      action: 'image',
      sourceEvent: new MouseEvent('click'),
    };
    expect(ev.action).toBe('image');
  });

  it('OrbitDocumentOptions accepts baseUrl + schemaVersion', () => {
    const opts: OrbitDocumentOptions = { baseUrl: '/assets/', schemaVersion: 1 };
    expect(opts.schemaVersion).toBe(1);
  });

  it('RendererOptions accepts action, detail sheet, note and theme options', () => {
    const preset: OrbitThemePreset = 'cosmos';
    const opts: RendererOptions = {
      onAction: () => false,
      onFocusChange: () => undefined,
      showActionButtons: true,
      showDetailSheet: false,
      noteRenderer: (note, ctx) => `${ctx.format}:${note}`,
      baseUrl: 'https://example.com/base/',
      theme: { preset, tokens: { 'ring-dash': 'none' } },
    };
    expect(opts.showDetailSheet).toBe(false);
  });

  it('exports the token values of each built-in theme', () => {
    expect(Object.keys(ORBIT_THEME_PRESETS).sort()).toEqual([
      'blueprint', 'contrast', 'cosmos', 'flat', 'flat-night', 'glass', 'glass-night', 'ink', 'liquid', 'liquid-night', 'material', 'material-night', 'night', 'paper',
    ]);
    expect(ORBIT_THEME_PRESETS.paper.surface).toBe('transparent');
    expect(ORBIT_THEME_PRESETS.night['color-root']).toMatch(/^#/);
  });
});
