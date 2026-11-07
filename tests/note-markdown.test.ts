import { describe, expect, it } from 'bun:test';
import { noteCheckboxes, noteToPlainText, renderNoteMarkdown, setNoteCheckbox, type NoteRenderContext } from '../src/core/ui/note-markdown';

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

  it('reads a line indented four spaces that starts with # as text, rather than stalling on it', () => {
    expect(html('    # indented code, 4 spaces\n    def main():')).toBe('<p># indented code, 4 spaces def main():</p>');
    expect(html('Text\n\n\t\t\t\t## Also')).toBe('<p>Text</p><p>## Also</p>');
  }, 5_000);

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

describe('tables in notes', () => {
  const table = (markdown: string): HTMLElement => {
    const container = document.createElement('div');
    container.appendChild(renderNoteMarkdown(markdown));
    return container;
  };

  const cells = (container: HTMLElement, selector: string): string[] => {
    return Array.from(container.querySelectorAll(selector), (cell) => cell.textContent ?? '');
  };

  it('draws a header row, a row of dashes and the rows under them as a table, in a box that scrolls', () => {
    const container = table('| Item | Cost |\n| --- | --- |\n| Hotel | 300 |\n| Train | 85 |');
    const scroller = container.firstElementChild as HTMLElement;
    expect(scroller.className).toBe('orbit-note__table');
    expect(scroller.firstElementChild?.tagName).toBe('TABLE');
    expect(cells(container, 'thead th')).toEqual(['Item', 'Cost']);
    expect(cells(container, 'tbody tr:first-child td')).toEqual(['Hotel', '300']);
    expect(cells(container, 'tbody tr:last-child td')).toEqual(['Train', '85']);
    expect(container.querySelector('th')?.getAttribute('scope')).toBe('col');
  });

  it('aligns each column as its colons say', () => {
    const container = table('| Left | Center | Right | None |\n| :--- | :---: | ---: | --- |\n| a | b | c | d |');
    const aligned = Array.from(container.querySelectorAll('td'), (cell) => (cell as HTMLElement).style.textAlign);
    expect(aligned).toEqual(['left', 'center', 'right', '']);
    expect((container.querySelector('th:nth-child(3)') as HTMLElement).style.textAlign).toBe('right');
  });

  it('formats the text in its cells, links and code included', () => {
    const container = table('| Plan | Notes |\n|---|---|\n| **Fast** | See [the guide](https://example.com/guide) and `npm ci` |');
    expect(container.querySelector('td strong')?.textContent).toBe('Fast');
    expect(container.querySelector('td a')?.getAttribute('href')).toBe('https://example.com/guide');
    expect(container.querySelector('td code')?.textContent).toBe('npm ci');
  });

  it('keeps a pipe written \\| or inside code in its cell', () => {
    const container = table('| Command | Means |\n| --- | --- |\n| `a|b` | either \\| or |\n| `grep x \\| wc` | count |');
    expect(cells(container, 'tbody tr:first-child td')).toEqual(['a|b', 'either | or']);
    expect(container.querySelector('tbody tr:last-child code')?.textContent).toBe('grep x | wc');
    expect(container.querySelectorAll('tbody tr:last-child td')).toHaveLength(2);
  });

  it('works without the pipes at either end, and fills or trims rows to the header\'s cells', () => {
    const container = table('Day | Plan\n:-- | --\nMon\nTue | Hike | extra');
    expect(cells(container, 'thead th')).toEqual(['Day', 'Plan']);
    expect(cells(container, 'tbody tr:first-child td')).toEqual(['Mon', '']);
    expect(cells(container, 'tbody tr:last-child td')).toEqual(['Tue', 'Hike']);
  });

  it('starts right under a paragraph and ends at a blank line, or another block', () => {
    const container = table('Our budget:\n| Item | Cost |\n|---|---|\n| Hotel | 300 |\n\nAfter it.\n\n| A | B |\n|---|---|\n| 1 | 2 |\n> Quoted');
    expect(container.innerHTML.startsWith('<p>Our budget:</p><div class="orbit-note__table">')).toBe(true);
    expect(container.querySelectorAll('table')).toHaveLength(2);
    expect(container.querySelector('p:nth-of-type(2)')?.textContent).toBe('After it.');
    expect(container.querySelector('blockquote')?.textContent).toBe('Quoted');
  });

  it('stays text when the row of dashes doesn\'t match the header, or has no pipe', () => {
    expect(table('| a | b |\n| --- |\n| 1 | 2 |').querySelector('table')).toBeNull();
    expect(table('a | b\nnot dashes | here').querySelector('table')).toBeNull();
    expect(table('Heading\n---').querySelector('table')).toBeNull();
  });

  it('shows in a quote, as orbit-md keeps one in a note', () => {
    expect(table('> | a | b |\n> |---|---|\n> | 1 | 2 |').querySelector('blockquote table')).not.toBeNull();
  });

  it('lets long cells wrap, and keeps short ones to a line', () => {
    const container = table(`| Short | Long |\n|---|---|\n| 12 | ${'A sentence long enough to wrap in a cell. '.repeat(2)} |`);
    expect(Array.from(container.querySelectorAll('td'), (cell) => cell.className)).toEqual(['orbit-note__cell', 'orbit-note__cell orbit-note__cell--long']);
  });
});

describe('checklists in notes', () => {
  const draw = (markdown: string, context: NoteRenderContext = {}): HTMLElement => {
    const container = document.createElement('div');
    container.appendChild(renderNoteMarkdown(markdown, context));
    return container;
  };

  const boxes = (container: HTMLElement): HTMLInputElement[] => Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));

  it('draws each item\'s box as a checkbox named by its text', () => {
    const container = draw('- [ ] Book the **hotel**\n- [x] Pack\n- [X] Charge the camera');
    expect(container.innerHTML).toBe(
      '<ul class="orbit-note__checklist">'
        + '<li class="orbit-note__item"><label class="orbit-note__check orbit-note__check--disabled"><input type="checkbox" class="orbit-note__box" data-line="0" disabled=""><span class="orbit-note__label">Book the <strong>hotel</strong></span></label></li>'
        + '<li class="orbit-note__item"><label class="orbit-note__check orbit-note__check--disabled"><input type="checkbox" class="orbit-note__box" checked="" data-line="1" disabled=""><span class="orbit-note__label">Pack</span></label></li>'
        + '<li class="orbit-note__item"><label class="orbit-note__check orbit-note__check--disabled"><input type="checkbox" class="orbit-note__box" checked="" data-line="2" disabled=""><span class="orbit-note__label">Charge the camera</span></label></li>'
        + '</ul>',
    );
    expect(boxes(container).map((box) => box.checked)).toEqual([false, true, true]);
  });

  it('finds boxes at any depth: nested, numbered, among bullets and in quotes, each with its line', () => {
    const note = 'Before we go:\n\n1. [ ] Visa\n   - [x] Photos\n   - Copies of the passport\n2. Tickets\n\n> - [ ] Quoted\n> > - [x] Deeper';
    const container = draw(note);
    expect(boxes(container).map((box) => [box.dataset.line, box.checked])).toEqual([['2', false], ['3', true], ['7', false], ['8', true]]);
    expect(container.querySelector('ol')?.className).toBe('orbit-note__checklist');
    expect(container.querySelectorAll('li:not(.orbit-note__item)')).toHaveLength(2);
    expect(noteCheckboxes(note).map((box) => box.line)).toEqual([2, 3, 7, 8]);
  });

  it('takes a line that goes on with an item into its label', () => {
    const container = draw('- [ ] Call the\n  *guesthouse* about parking');
    expect(container.querySelector('.orbit-note__label')?.innerHTML).toBe('Call the <em>guesthouse</em> about parking');
  });

  it('leaves brackets that aren\'t a box as text: in code, mid-text or without a space', () => {
    const container = draw('```\n- [ ] in code\n```\n\n- see [x] here\n- [x]Not a box\n- [ ]');
    expect(boxes(container).map((box) => box.dataset.line)).toEqual(['6']);
    expect(container.textContent).toContain('- [ ] in code');
    expect(container.textContent).toContain('[x]Not a box');
  });

  it('can be checked only with onCheck, which hears the box\'s line and what it is now', () => {
    const checks: unknown[] = [];
    const container = draw('Trip:\n\n- [ ] Visa\n- [x] Pack', { onCheck: (check) => checks.push(check) });
    document.body.appendChild(container);
    const [visa, pack] = boxes(container);
    expect(visa.disabled).toBe(false);
    expect(container.querySelector('.orbit-note__check--disabled')).toBeNull();
    visa.click();
    pack.click();
    container.remove();
    expect(checks).toEqual([{ line: 2, checked: true }, { line: 3, checked: false }]);
  });
});

describe('setNoteCheckbox', () => {
  it('checks or unchecks the box on a line, and changes nothing else', () => {
    const note = 'Packing:\n\n- [ ] Boots\n- [x] Map\n- [X] Water';
    expect(setNoteCheckbox(note, 2, true)).toBe('Packing:\n\n- [x] Boots\n- [x] Map\n- [X] Water');
    expect(setNoteCheckbox(note, 3, false)).toBe('Packing:\n\n- [ ] Boots\n- [ ] Map\n- [X] Water');
    expect(setNoteCheckbox(note, 4, false)).toBe('Packing:\n\n- [ ] Boots\n- [x] Map\n- [ ] Water');
  });

  it('gives the note back as it was when the box already is that way', () => {
    expect(setNoteCheckbox('- [x] Done', 0, true)).toBe('- [x] Done');
  });

  it('finds the box in quotes and nested lists, and keeps the note\'s line breaks', () => {
    expect(setNoteCheckbox('Plan\r\n> - [ ] One\r\n>   * [ ] Two\r\n', 2, true)).toBe('Plan\r\n> - [ ] One\r\n>   * [x] Two\r\n');
    expect(setNoteCheckbox('> > 3) [ ] Deep', 0, true)).toBe('> > 3) [x] Deep');
  });

  it('counts lines as the note has them, with comments that span lines', () => {
    const note = '<!-- a comment\nover two lines -->\n- [ ] Visa <!-- urgent -->';
    expect(noteCheckboxes(note).map((box) => box.line)).toEqual([2]);
    expect(setNoteCheckbox(note, 2, true)).toBe('<!-- a comment\nover two lines -->\n- [x] Visa <!-- urgent -->');
  });

  it('returns null for a line without a box: text, code, a table, a box after a comment, or past the end', () => {
    const note = 'Text\n```\n- [ ] code\n```\n| [ ] | b |\n|---|---|\n<!-- c --> - [ ] after a comment\n- [ ] Real';
    expect([0, 2, 4, 6, 8, 99].map((line) => setNoteCheckbox(note, line, true))).toEqual([null, null, null, null, null, null]);
    expect(setNoteCheckbox(note, 7, true)).toBe(note.replace('- [ ] Real', '- [x] Real'));
  });
});

describe('noteToPlainText', () => {
  it('strips markdown syntax for tooltips', () => {
    expect(noteToPlainText('We left at **5am** to catch the *sunrise*.\n\n- Bring a [headlamp](https://x.dev)')).toBe('We left at 5am to catch the sunrise. Bring a headlamp');
  });

  it('reads a table\'s cells and a checklist\'s items without their pipes, dashes and boxes', () => {
    expect(noteToPlainText('| Item | Cost |\n| :--- | ---: |\n| Hotel \\| tax | 300 |\n\n- [ ] Book it\n- [x] Pay')).toBe('Item Cost Hotel | tax 300 Book it Pay');
  });
});
