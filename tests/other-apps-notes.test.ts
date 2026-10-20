import { describe, expect, test } from 'bun:test';
import { joinNotes, keptAddress, noteFromHtml, noteFromPlainText, titleFromHtml } from '../src/core/other-apps/notes';
import { renderNoteMarkdown } from '../src/core/ui/note-markdown';

/** What Orbit's note renderer shows for a markdown note, as text. */
const shown = (markdown: string): string => {
  const container = document.createElement('div');
  container.appendChild(renderNoteMarkdown(markdown));
  return container.textContent ?? '';
};

describe('HTML notes', () => {
  test('become markdown: paragraphs, emphasis, links and lists', () => {
    const note = noteFromHtml('<html><head><title>x</title></head><body><p>Talk to <b>five</b> customers, <i>soon</i>.</p><ul><li>Two from <s>retail</s></li><li>Three from <a href="https://example.com/w">wholesale</a></li></ul></body></html>');
    expect(note).toEqual({
      format: 'markdown',
      text: 'Talk to **five** customers, *soon*.\n\n- Two from ~~retail~~\n- Three from [wholesale](https://example.com/w)',
    });
  });

  test('keep headings, numbered and nested lists, quotes and code', () => {
    const note = noteFromHtml('<h2>Plan</h2><ol><li>First<ul><li>Inner</li></ul></li><li>Second</li></ol><blockquote><p>Quoted</p></blockquote><pre>let x = 1;\n  x += 1;</pre>');
    expect(note?.format).toBe('markdown');
    expect(note?.text).toBe('## Plan\n\n1. First\n   - Inner\n2. Second\n\n> Quoted\n\n```\nlet x = 1;\n  x += 1;\n```');
  });

  test('turn line breaks into paragraphs, which notes show as lines of their own', () => {
    expect(noteFromHtml('<div>hello<br><br></div><div>line one<br>line two</div>')?.text).toBe('hello\n\nline one\n\nline two');
  });

  test('collapse the spaces HTML collapses, and keep the ones between words', () => {
    expect(noteFromHtml('<p>\n   Talk   to\n  <b> five </b>customers\n</p>')?.text).toBe('Talk to **five** customers');
  });

  test('join emphasis side by side, which markdown would misread', () => {
    expect(noteFromHtml('<p><i>Help &gt; </i><i>Tutorial</i> spelling</p>')?.text).toBe('*Help > Tutorial* spelling');
  });

  test('keep pictures from the web, and only the description of others', () => {
    expect(noteFromHtml('<p><img src="https://example.com/a.png" alt="A chart"> and <img src="file:///C:/b.png" alt="local"></p>')?.text)
      .toBe('![A chart](https://example.com/a.png) and local');
  });

  test('keep only web, mail and in-map links; others keep their text', () => {
    expect(noteFromHtml('<p><a href="javascript:alert(1)">click</a>, <a href="mailto:a@example.com">mail</a>, <a href="#ID_4">there</a>, <a href="www.example.com/x">site</a></p>')?.text)
      .toBe('click, [mail](mailto:a@example.com), [there](#ID_4), [site](https://www.example.com/x)');
  });

  test('ask how to keep addresses, when the reader knows', () => {
    const note = noteFromHtml('<p><a href="#ID_4">there</a> <img src="xap:resources/a.png" alt="pic"></p>', {
      link: (href) => `#mapped-${href.slice(1)}`,
      picture: (src) => src.replace('xap:resources/', 'media/'),
    });
    expect(note?.text).toBe('[there](#mapped-ID_4) ![pic](media/a.png)');
  });

  test('read tables a row a line', () => {
    expect(noteFromHtml('<table><tr><th>Key</th><th>Action</th></tr><tr><td>Ctrl+N</td><td>New map</td></tr></table>')?.text)
      .toBe('Key · Action\n\nCtrl+N · New map');
  });

  test('stay plain text, exactly, when markdown would show their words differently', () => {
    const cases = [
      '<p>Files are named like_this_one.</p>',
      '<p>Use *stars* or `ticks`</p>',
      '<p># not a heading</p>',
      '<p>- not a list</p>',
      '<p>1. not a list either</p>',
      '<p>a [link](https://x) written out</p>',
      '<p>a &amp;copy; reference</p>',
    ];

    for (const html of cases) {
      const note = noteFromHtml(html);
      expect(note?.format).toBe('plain');
    }

    expect(noteFromHtml('<p><b>Bold</b> and like_this</p><ul><li>one</li></ul><p><a href="https://example.com">site</a></p>')).toEqual({
      format: 'plain',
      text: 'Bold and like_this\n\n- one\n\nsite (https://example.com)',
    });
  });

  test('are nothing when they hold no text', () => {
    expect(noteFromHtml('<html><head></head><body><p>  </p><br></body></html>')).toBeUndefined();
  });

  test('show their words, every one, in Orbit\'s notes', () => {
    const html = '<p>Talk to <b>five</b> customers, <i>soon</i>. Ask <a href="https://example.com">here</a>.</p><ul><li>One <code>code</code></li></ul>';
    expect(shown(noteFromHtml(html)!.text).replace(/\s+/g, ' ').trim()).toBe('Talk to five customers, soon. Ask here.One code');
  });
});

describe('plain notes', () => {
  test('are markdown when they read the same that way', () => {
    expect(noteFromPlainText('Five days in May.\n\nFlights booked.')).toEqual({ text: 'Five days in May.\n\nFlights booked.', format: 'markdown' });
  });

  test('stay plain when markdown would join their lines or read their symbols', () => {
    expect(noteFromPlainText('Line one\nLine two')).toEqual({ text: 'Line one\nLine two', format: 'plain' });
    expect(noteFromPlainText('Ask *Ana*')?.format).toBe('plain');
    expect(noteFromPlainText('- one\n- two')?.format).toBe('plain');
    expect(noteFromPlainText('    indented code')?.format).toBe('plain');
  });

  test('lose trailing spaces and blank lines at the ends, and nothing else', () => {
    expect(noteFromPlainText('\r\n\r\nFirst   \r\nsecond\r\n\r\n')).toEqual({ text: 'First\nsecond', format: 'plain' });
    expect(noteFromPlainText('   ')).toBeUndefined();
    expect(noteFromPlainText(undefined)).toBeUndefined();
  });
});

describe('titles and notes together', () => {
  test('a title from HTML is its text on one line, with its first link', () => {
    expect(titleFromHtml('<html><body><p><b>Launch</b> day<br/><small>- <a href="https://example.com">site</a> -</small></p></body></html>'))
      .toEqual({ text: 'Launch day - site -', link: 'https://example.com' });
  });

  test('notes join as markdown when all are, otherwise as plain text', () => {
    expect(joinNotes([{ text: 'One', format: 'markdown' }, undefined, { text: 'Two', format: 'markdown' }])).toEqual({ text: 'One\n\nTwo', format: 'markdown' });
    expect(joinNotes([{ text: 'One', format: 'markdown' }, { text: 'a\nb', format: 'plain' }])).toEqual({ text: 'One\n\na\nb', format: 'plain' });
    expect(joinNotes([])).toBeUndefined();
  });

  test('addresses: web pages without their scheme are web addresses; files are not kept', () => {
    expect(keptAddress('www.example.com/page')).toBe('https://www.example.com/page');
    expect(keptAddress('https://example.com')).toBe('https://example.com');
    expect(keptAddress('#ID_1')).toBe('#ID_1');
    expect(keptAddress('file:///etc/hosts')).toBeNull();
    expect(keptAddress('../other.mm')).toBeNull();
    expect(keptAddress('javascript:alert(1)')).toBeNull();
  });
});
