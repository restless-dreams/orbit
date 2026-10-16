import { describe, expect, it } from 'bun:test';
import { noteToPlainText, renderNoteMarkdown } from '../src/core/ui/note-markdown';

const html = (markdown: string, baseUrl?: string): string => {
  const container = document.createElement('div');
  container.appendChild(renderNoteMarkdown(markdown, { baseUrl }));
  return container.innerHTML;
};

describe('renderNoteMarkdown', () => {
  it('hides HTML comments, as markdown does, and keeps them in code', () => {
    expect(html('Six weeks. <!-- ask Ana -->\n\nMore <!-- hidden --> text and `<!-- code -->`.')).toBe('<p>Six weeks.</p><p>More  text and <code>&lt;!-- code --&gt;</code>.</p>');
    expect(noteToPlainText('Six weeks <!-- ask Ana --> of research.')).toBe('Six weeks of research.');
  });

  it('renders paragraphs with emphasis, code and links', () => {
    expect(html('We left at **5am** to catch the *sunrise*.\nRead the [park guide](https://example.com/guide) and `pack light`.')).toBe(
      '<p>We left at <strong>5am</strong> to catch the <em>sunrise</em>. Read the <a href="https://example.com/guide" target="_blank" rel="noopener noreferrer">park guide</a> and <code>pack light</code>.</p>',
    );
  });

  it('renders nested lists, headings, quotes and code blocks', () => {
    const output = html('## Gear\n- Boots\n  - Wool socks\n- Jacket\n\n1. First\n2. Second\n\n> Leave no trace\n\n```\nnpm install\n```');
    expect(output).toContain('<h4>Gear</h4>');
    expect(output).toContain('<ul><li>Boots<ul><li>Wool socks</li></ul></li><li>Jacket</li></ul>');
    expect(output).toContain('<ol><li>First</li><li>Second</li></ol>');
    expect(output).toContain('<blockquote><p>Leave no trace</p></blockquote>');
    expect(output).toContain('<pre><code>npm install</code></pre>');
  });

  it('never turns note text into markup', () => {
    const output = html('<img src=x onerror=alert(1)> **<script>alert(1)</script>**');
    expect(output).not.toContain('<img');
    expect(output).not.toContain('<script');
    expect(output).toContain('&lt;script&gt;');
  });

  it('drops links with unsafe schemes and resolves relative ones', () => {
    expect(html('[click](javascript:alert(1))')).toBe('<p>click</p>');
    expect(html('[map](docs/map.pdf)', 'https://example.com/base/')).toContain('href="https://example.com/base/docs/map.pdf"');
  });

  it('keeps balanced parentheses in link URLs', () => {
    expect(html('[Orbit](https://en.wikipedia.org/wiki/Orbit_(film))')).toContain('href="https://en.wikipedia.org/wiki/Orbit_(film)"');
  });

  it('autolinks URLs in angle brackets', () => {
    expect(html('See <https://example.com>.')).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>');
  });

  it('nests quotes within quotes', () => {
    expect(html('> outer\n> > middle\n> > > inner')).toBe(
      '<blockquote><p>outer</p><blockquote><p>middle</p><blockquote><p>inner</p></blockquote></blockquote></blockquote>',
    );
  });

  it('caps quote nesting: deeper quotes show as their text instead of stalling or blowing the stack', () => {
    const container = document.createElement('div');
    container.appendChild(renderNoteMarkdown(`${'>'.repeat(20000)} bottom`));
    expect(container.querySelectorAll('blockquote')).toHaveLength(101);
    expect(container.textContent).toContain('bottom');
  });

  it('caps list nesting the same way', () => {
    const lines: string[] = [];

    for (let level = 0; level < 200; level += 1) {
      lines.push(`${' '.repeat(level)}- item ${level}`);
    }

    const container = document.createElement('div');
    container.appendChild(renderNoteMarkdown(lines.join('\n')));
    expect(container.querySelectorAll('ul')).toHaveLength(101);
    expect(container.textContent).toContain('item 199');
  });
});

describe('links to other nodes in notes', () => {
  const render = (markdown: string, known: string[]): string => {
    const container = document.createElement('div');
    container.appendChild(renderNoteMarkdown(markdown, { baseUrl: 'https://example.com/maps/', resolveLink: (href) => known.includes(href) }));
    return container.innerHTML;
  };

  it('renders a #id link to a node as a link in the page, not a new tab', () => {
    expect(render('After [research](#research).', ['#research'])).toBe('<p>After <a href="#research">research</a>.</p>');
  });

  it('renders a link to a node the map does not have as text', () => {
    expect(render('After [**research**](#reserch).', [])).toBe('<p>After <span><strong>research</strong></span>.</p>');
  });
});

describe('noteToPlainText', () => {
  it('strips markdown syntax for tooltips', () => {
    expect(noteToPlainText('We left at **5am** to catch the *sunrise*.\n\n- Bring a [headlamp](https://x.dev)')).toBe('We left at 5am to catch the sunrise. Bring a headlamp');
  });
});
