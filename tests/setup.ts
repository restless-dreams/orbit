import { plugin } from 'bun';
import { setDefaultTimeout } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { sassPlugin } from '../scripts/sass-plugin';

// A test may take this long (ms) before it fails: a busy machine, a shared CI
// runner among them, can make a quick test slow. Tests that check timing on
// purpose do it with fake timers, never with this. Bun reads no test timeout
// from bunfig.toml, and with several files it gives this one to the last file
// only, so `bun run test` passes `--timeout 60000` (package.json), which every
// file gets. This covers a file run on its own with `bun test <file>`.
setDefaultTimeout(60_000);

// Stylesheets are imported as compiled CSS strings, as in the build.
plugin(sassPlugin);

if (!('window' in globalThis)) {
  // Tests must never reach the network: iframes (video embeds), scripts and
  // stylesheets stay unloaded.
  GlobalRegistrator.register({
    url: 'http://localhost',
    settings: {
      disableIframePageLoading: true,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
    },
  });
}

/**
 * A node as one short line, `<button#id.class data-orbit-node-id="…">`, for
 * what Bun prints when an expect() fails.
 */
const describeNode = (node: Node): string => {
  if (!(node instanceof Element)) {
    return node.nodeName;
  }

  const id = node.id ? `#${node.id}` : '';
  const classes = Array.from(node.classList, (name) => `.${name}`).join('');
  const attributes = ['data-orbit-node-id', 'aria-label']
    .filter((name) => node.hasAttribute(name))
    .map((name) => ` ${name}="${node.getAttribute(name)!.slice(0, 40)}"`)
    .join('');
  return `<${node.tagName.toLowerCase()}${id}${classes}${attributes}>`;
};

// When an expect() comparing nodes fails, Bun prints them, and happy-dom's
// nodes lead it through the whole page: with a map drawn, that took up to
// 28 s, and on some pages Bun then lost the failure and passed the test.
// Printed as one line each instead, a test comparing elements fails at
// once, naming them (tests/comparing-nodes.test.ts).
Object.defineProperty(Node.prototype, Symbol.for('nodejs.util.inspect.custom'), {
  value(this: Node): string {
    return describeNode(this);
  },
  configurable: true,
});
