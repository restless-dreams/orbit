import { describe, expect, it } from 'bun:test';
import { parseOrbit } from '../src/index';
import { serializeOrbitMarkdown } from '../src/core/serializer-markdown';
import type { OrbitNode } from '../src/index';

const outline = (node: OrbitNode): unknown => {
  return node.children.length === 0 ? node.text : { [node.text]: node.children.map(outline) };
};

describe('lists', () => {
  it('turns numbered lists into children, like bullet lists', () => {
    expect(outline(parseOrbit('# Steps\n1. First\n2. Second\n   1) Detail').root)).toEqual({
      Steps: ['First', { Second: ['Detail'] }],
    });
  });

  it('keeps a number that only starts a sentence inside a paragraph as prose', () => {
    const doc = parseOrbit('# Notes\nWe shipped late in\n2024. It was worth it.');
    expect(doc.root.children).toEqual([]);
    expect(doc.root.note).toBe('We shipped late in\n2024. It was worth it.');
  });

  it('turns task checkboxes into a todo or done status', () => {
    const doc = parseOrbit('# Launch\n- [ ] Write docs\n- [x] Ship\n- [X] Celebrate <!-- orbit status: active -->');
    expect(doc.root.children.map((child) => [child.text, child.status])).toEqual([
      ['Write docs', 'todo'],
      ['Ship', 'done'],
      ['Celebrate', 'active'],
    ]);
  });
});

describe('documents without a single top heading', () => {
  it('uses the only item of a bullet-only document as the root', () => {
    expect(outline(parseOrbit('- Project\n  - Research\n  - Build').root)).toEqual({ Project: ['Research', 'Build'] });
  });

  it('names the root after a single-line paragraph before the list', () => {
    expect(outline(parseOrbit('Project plan\n- Research\n- Build').root)).toEqual({ 'Project plan': ['Research', 'Build'] });
  });

  it('names the root after the frontmatter title', () => {
    expect(outline(parseOrbit('---\ntitle: Roadmap\n---\n- Q1\n- Q2').root)).toEqual({ Roadmap: ['Q1', 'Q2'] });
  });

  it('roots several top-level items in an untitled map and says so', () => {
    const doc = parseOrbit('- Alpha\n- Beta');
    expect(outline(doc.root)).toEqual({ 'Untitled map': ['Alpha', 'Beta'] });
    expect(doc.diagnostics?.[0]).toMatchObject({ code: 'synthetic-root', line: 1 });
  });

  it('keeps sibling second-level headings as siblings', () => {
    expect(outline(parseOrbit('## Alpha\n### A1\n## Beta\n## Gamma').root)).toEqual({
      'Untitled map': [{ Alpha: ['A1'] }, 'Beta', 'Gamma'],
    });
    expect(outline(parseOrbit('Plan\n\n## Alpha\n## Beta').root)).toEqual({ Plan: ['Alpha', 'Beta'] });
  });

  it('still uses a single second-level heading as the root', () => {
    expect(outline(parseOrbit('## Alpha\n### A1').root)).toEqual({ Alpha: ['A1'] });
  });
});

describe('headings', () => {
  it('accepts up to three spaces of indentation and a closing sequence', () => {
    expect(outline(parseOrbit('# Root #\n   ## Child ##').root)).toEqual({ Root: ['Child'] });
  });
});

describe('icons', () => {
  const icon = (title: string) => {
    const root = parseOrbit(`# ${title}`).root;
    return [root.icon, root.text];
  };

  it('recognizes emoji with or without the emoji variation selector', () => {
    expect(icon('🛠 Build')).toEqual(['🛠', 'Build']);
    expect(icon('🛠️ Tools')).toEqual(['🛠️', 'Tools']);
    expect(icon('🏔 Trip')).toEqual(['🏔', 'Trip']);
  });

  it('recognizes flags, keycaps and skin tones', () => {
    expect(icon('🇲🇽 México')).toEqual(['🇲🇽', 'México']);
    expect(icon('1️⃣ First')).toEqual(['1️⃣', 'First']);
    expect(icon('👋🏽 Hello')).toEqual(['👋🏽', 'Hello']);
  });

  it('leaves text symbols in the title', () => {
    expect(icon('© 2026 Report')).toEqual([undefined, '© 2026 Report']);
  });
});

describe('ids', () => {
  it('keeps accented and non-Latin letters', () => {
    const doc = parseOrbit('# Investigación\n## Planificación\n## 研究\n## 한국어\n## ＡＢＣ');
    expect(doc.root.id).toBe('investigacion');
    expect(doc.root.children.map((child) => child.id)).toEqual(['planificacion', '研究', '한국어', 'abc']);
  });
});

describe('serializable trees', () => {
  it('JSON.stringify works and children still know their parent', () => {
    const doc = parseOrbit('# A\n## B\n- C');
    expect(() => JSON.stringify(doc)).not.toThrow();
    const child = doc.root.children[0];
    expect(child.parent).toBe(doc.root);
    expect(child.children[0].parent).toBe(child);
    expect(Object.keys(child)).not.toContain('parent');
  });

  it('round-trips task statuses through the markdown serializer', () => {
    const doc = parseOrbit('# Launch\n- [x] Ship\n- [ ] Docs');
    const again = parseOrbit(serializeOrbitMarkdown(doc));
    expect(again.root.children.map((child) => [child.text, child.status])).toEqual([
      ['Ship', 'done'],
      ['Docs', 'todo'],
    ]);
  });
});
