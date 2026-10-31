import { describe, expect, it } from 'bun:test';
import { exportWebPage } from '../src/core/web-page/page';
import { startWebPage } from '../src/core/web-page/runtime';

/**
 * tests/setup.ts prints a node as one line when an expect() fails. Bun
 * otherwise walks happy-dom's nodes through the whole page: with an exported
 * web page drawn, a toBe between two different elements took 20 s, and then
 * passed.
 */
describe('a test comparing nodes', () => {
  it('fails at once on two different elements with a map drawn, and names them', () => {
    document.body.innerHTML = new DOMParser().parseFromString(exportWebPage('# Trip\nWhere we go.\n## Summit', { script: '' }), 'text/html').body.innerHTML;
    startWebPage(document);
    const present = document.querySelector('[data-present]')!;
    const title = document.getElementById('page-title')!;
    const started = performance.now();
    expect(() => expect(present).toBe(title)).toThrow('<h1#page-title.page__title>');
    expect(() => expect(present).not.toBe(present)).toThrow('<button.page__present>');
    // Both failures, printed. Without tests/setup.ts's printing, the first took 20 s and then passed.
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('prints a node by its tag, id, classes, node id and label', () => {
    const button = document.createElement('button');
    button.id = 'go';
    button.className = 'orbit-button orbit-button--primary';
    button.setAttribute('aria-label', 'Read note');
    expect(Bun.inspect(button)).toBe('<button#go.orbit-button.orbit-button--primary aria-label="Read note">');
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    node.setAttribute('class', 'orbit-node');
    node.setAttribute('data-orbit-node-id', 'summit');
    expect(Bun.inspect(node)).toBe('<g.orbit-node data-orbit-node-id="summit">');
    expect(Bun.inspect(document.createTextNode('Summit'))).toBe('#text');
  });
});
