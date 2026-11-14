import { afterEach, describe, expect, it } from 'bun:test';
import { browser, overlayTransform } from '../src/core/browser';
import { parseOrbit } from '../src/core/dispatch';
import { assignNodeColors } from '../src/core/engine/scene';
import stylesheet from '../src/core/styles/orbit.scss';
import { themeStylesheet } from '../src/core/themes';

const current = { ...browser };

afterEach(() => {
  Object.assign(browser, current);
});

describe('older browsers', () => {
  it('keeps siblings in their branch color without color-mix()', () => {
    const tree = parseOrbit('# Root\n## A\n- A1\n- A2\n- A3').root;
    const branch = tree.children[0];
    expect(assignNodeColors(tree, ['ROOT', 'ONE']).get(branch.children[1].id)).toContain('color-mix(');

    browser.mixesColors = false;
    const colors = assignNodeColors(tree, ['ROOT', 'ONE']);
    expect(branch.children.map((child) => colors.get(child.id))).toEqual(['ONE', 'ONE', 'ONE']);
  });

  it('draws colors it can\'t read in hex instead, where Orbit reads them', () => {
    const tree = parseOrbit('---\npalette: [hwb(0 0% 0%), lab(15 50 -80)]\n---\n# Root\n## A <!-- orbit color: "color(display-p3 0 0 0.5)" -->\n## B\n## C <!-- orbit color: "var(--brand)" -->').root;
    const [first, second, third] = tree.children;
    expect(assignNodeColors(tree, ['hwb(0 0% 0%)', 'lab(15 50 -80)']).get(first.id)).toBe('color(display-p3 0 0 0.5)');

    // An older WebView: no hwb() (Chromium 101), and no lab() or color() (Chromium 111).
    browser.drawsColor = (color) => !/^(?:hwb|lab|lch|oklab|oklch|color)\(/.test(color);
    browser.mixesColors = false;
    const colors = assignNodeColors(tree, ['hwb(0 0% 0%)', 'lab(15 50 -80)']);
    expect(colors.get(tree.id)).toBe('#ff0000');
    expect(colors.get(first.id)).toBe('#000085');
    expect(colors.get(second.id)).toBe('#00009e');
    // A color only the page can tell is left to it.
    expect(colors.get(third.id)).toBe('var(--brand)');
  });

  it('centers overlays through the transform that places them without the translate property', () => {
    expect(overlayTransform(10, 20, '-50%, 0')).toBe('translate3d(10px, 20px, 0)');

    browser.translates = false;
    expect(overlayTransform(10, 20, '-50%, 0')).toBe('translate3d(10px, 20px, 0) translate(-50%, 0)');
  });

  it('gives the stylesheet plain colors and units to fall back on', () => {
    const fallbacks = stylesheet.slice(stylesheet.indexOf('@supports not (color: color-mix('));
    expect(fallbacks).not.toBe(stylesheet);

    for (const rule of ['.orbit-ring{stroke:var(--_orbit-ring-stroke)}', '.orbit-link{stroke:var(--_orbit-link-stroke)}', '.orbit-node__shadow{fill:var(--_orbit-node-shadow)}']) {
      expect(fallbacks).toContain(rule);
    }

    expect(stylesheet).toContain('@supports not (translate: 1px)');
    // Each dvh height comes after the vh one that older browsers keep.
    expect(stylesheet).toContain('max-height:86vh;max-height:min(86vh,86dvh)');
    expect(stylesheet).toContain('height:100vh;height:100dvh;max-height:100vh;max-height:100dvh');
  });

  it('gives each theme the colors its mixes are mostly made of', () => {
    const themes = themeStylesheet();
    const plain = themes.slice(themes.indexOf('@supports not (color: color-mix('));
    // Paper's rims are mostly the node's own color; ink's are its black.
    expect(plain).toContain('.orbit[data-orbit-theme="paper"] .orbit-node__shade{stroke:var(--orbit-node-color,var(--_orbit-node-stroke))}');
    expect(plain).toContain('.orbit[data-orbit-theme="ink"] .orbit-node__shade{stroke:var(--_orbit-node-stroke)}');
    // Night's shadows glow in the node's color, and paper's sun keeps its darker halo.
    expect(plain).toContain('.orbit[data-orbit-theme="night"] .orbit-node__shadow{fill:var(--orbit-node-color)}');
    expect(plain).toContain('.orbit[data-orbit-theme="paper"] .orbit-node__halo{stroke:var(--_orbit-sun-halo)}');
    // Flat lines take their node's color; Material's orbits are the theme's outline color.
    expect(plain).toContain('.orbit[data-orbit-theme="flat"] .orbit-link{stroke:var(--orbit-link-color,var(--_orbit-link-stroke))}');
    expect(plain).toContain('.orbit[data-orbit-theme="material"] .orbit-ring{stroke:var(--_orbit-ring-stroke)}');
  });
});
