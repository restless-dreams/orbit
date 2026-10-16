import { describe, expect, test } from 'bun:test';
import { contrastRatio, mixOklab, parseColor, prefersLightText, resolveColor, splitAlpha, toHex } from '../src/core/engine/colors';
import { Glide, PointVelocityTracker } from '../src/core/engine/glide';
import { COUNT_HEIGHT, COUNT_POSITION, insideFontSize, insideLabelLayout, labelPlacement, measureCount, ringPath, type InsideLabelLayout } from '../src/core/engine/views';
import { INSIDE_ESTIMATE } from '../src/core/engine/text-measure';

/** Names of the lengths maps have: one word or a few, short and long. */
const FIT_NAMES = [
  'Build', 'Branches', 'Research', 'Interviews', 'Acquisitions', 'Maintenance', 'Notifications', 'Infrastructure',
  'Fees & Payments', 'Digital Lending', 'Loans & Returns', 'Staff & Access', 'Marketing budget', 'Customer interviews',
  'Product Roadmap 2027', 'Accessibility review', 'Acknowledgements', 'contact_tec_mail_address_key', 'Supercalifragilisticexpialidocious',
];

/** Lines and icons as the stylesheet draws names inside nodes: line height and icon height in ems, and the gap under the icon (px). */
const LINE_HEIGHT = 1.22;
const ICON_HEIGHT = 1.45;
const ICON_GAP = 2;
/** The space under a line's letters (ems): the tails of g, p and y end this far above its bottom. */
const UNDER_TAILS = 0.15;

/** A line's width (px) in the estimate unit tests measure with: its words, the spaces between them, and an ellipsis at the end of a name cut short. */
const estimatedWidth = (line: string, fontSize: number): number => {
  const ellipsis = line.endsWith('…') ? INSIDE_ESTIMATE.ellipsis(0) : 0;
  const words = line.replace(/…$/, '').split(' ').filter(Boolean);
  const ems = words.reduce((sum, word) => sum + INSIDE_ESTIMATE.ems(word, 0), 0) + Math.max(0, words.length - 1) * INSIDE_ESTIMATE.space(0);
  return (ems + ellipsis) * fontSize;
};

/**
 * Each line of a name fitted inside a node of `screenRadius`, where it's
 * drawn: its width, how far below the node's center its middle is, and the
 * room the circle has there. A name's lines and icon are centered `lift`
 * above the node's center; fits round the radius down in steps of about 6%
 * and keep text a little off the rim, as `insideLabelLayout` says.
 */
const drawnLines = (layout: InsideLabelLayout, screenRadius: number): { text: string; width: number; middle: number; room: number }[] => {
  const step = Math.max(2, Math.round(screenRadius * 0.06));
  const radius = Math.floor(screenRadius / step) * step;
  const room = radius - Math.max(2, radius * 0.05);
  const lineHeight = layout.fontSize * LINE_HEIGHT;
  const iconHeight = layout.icon ? layout.fontSize * ICON_HEIGHT + ICON_GAP : 0;
  const top = -(iconHeight + layout.lines.length * lineHeight) / 2 - layout.lift;

  return layout.lines.map((text, index) => {
    const middle = top + iconHeight + (index + 0.5) * lineHeight;
    return { text, width: estimatedWidth(text, layout.fontSize), middle, room: Math.abs(middle) >= room ? 0 : 2 * Math.sqrt(room * room - middle * middle) };
  });
};

describe('colors', () => {
  test('parses the formats browsers report for computed colors', () => {
    expect(toHex(parseColor('#abc')!)).toBe('#aabbcc');
    expect(toHex(parseColor('rgb(255, 128, 0)')!)).toBe('#ff8000');
    expect(toHex(parseColor('rgba(255 128 0 / 50%)')!)).toBe('#ff800080');
    expect(toHex(parseColor('color(srgb 1 0.5 0)')!)).toBe('#ff8000');
    expect(toHex(parseColor('oklab(1 0 0)')!)).toBe('#ffffff');
    expect(toHex(parseColor('oklch(0% 0 0)')!)).toBe('#000000');
    expect(parseColor('tomato')).toBeNull();
  });

  test('reads signed, leading-dot and exponent numbers, as browsers and people write them', () => {
    // How Chromium reports the fill of a mixed node: blues and greens have a negative a or b.
    expect(toHex(parseColor('oklab(0.62 -0.05 0.1)')!)).toBe('#828e38');
    expect(toHex(parseColor('oklab(0.5 0.1 -0.12)')!)).toBe('#7e43a4');
    expect(toHex(parseColor('color(srgb -0.01 0.5 0.8)')!)).toBe('#0080cc');
    expect(toHex(parseColor('color(srgb 1e-5 0.5 0.5)')!)).toBe('#008080');
    expect(toHex(parseColor('rgba(0, 0, 0, .5)')!)).toBe('#00000080');
    expect(toHex(parseColor('oklch(0.7 0.1 -110)')!)).toBe(toHex(parseColor('oklch(0.7 0.1 250)')!));
    // A dark blue moon in focus: light text reads better on it.
    expect(prefersLightText('oklab(0.32889 -0.022848 -0.0792233)', '#ffffff', '#0b1120')).toBe(true);
  });

  test('reads rgb() channels given as percentages out of 100', () => {
    expect(toHex(parseColor('rgb(50%, 0%, 100%)')!)).toBe('#8000ff');
    expect(toHex(parseColor('rgb(50% 0% 100% / 50%)')!)).toBe('#8000ff80');
    expect(toHex(parseColor('rgb(100%, 128, 0)')!)).toBe('#ff8000');
  });

  test('rejects malformed numbers instead of returning NaN colors', () => {
    for (const malformed of ['rgb(1.2.3, 4, 5)', 'rgba(1, 2, 3, 0.5.6)', 'color(srgb 1.2.3 0 0)', 'oklab(1.2.3 0 0)', 'oklch(0.7 0.1 1.2.3)', 'oklab(0.62 1-2 0.1)', 'color(srgb 1e 0 0)', 'rgb(1., 2, 3)']) {
      expect(parseColor(malformed)).toBeNull();
    }

    expect(resolveColor('color-mix(in oklab, #ffffff 1.2.3%, #000000)', {})).toBe('color-mix(in oklab, #ffffff 1.2.3%, #000000)');
    expect(toHex(parseColor('rgb(1.5, 4, 5)')!)).toBe('#020405');
    expect(toHex(parseColor('rgba(255, 128, 0, 0.5)')!)).toBe('#ff800080');
    expect(toHex(parseColor('oklch(62.8% 0.25 29.2)')!)).toBe('#fc1710');
  });

  test('mixes in OKLab like color-mix()', () => {
    const white = parseColor('#ffffff')!;
    const black = parseColor('#000000')!;
    expect(toHex(mixOklab(white, black, 1))).toBe('#ffffff');
    expect(toHex(mixOklab(white, black, 0))).toBe('#000000');
    // OKLab's middle grey is lighter than sRGB's #808080.
    expect(toHex(mixOklab(white, black, 0.5))).toBe('#636363');
  });

  test('resolves theme tokens and color-mix() into plain hex', () => {
    const tokens = { 'color-1': '#F5A3A8' };
    expect(resolveColor('var(--_orbit-color-1)', tokens)).toBe('#f5a3a8');
    expect(resolveColor('color-mix(in oklab, var(--_orbit-color-1) 100%, white)', tokens)).toBe('#f5a3a8');
    expect(resolveColor('color-mix(in oklab, var(--_orbit-color-1) 0%, black)', tokens)).toBe('#000000');
    expect(resolveColor('var(--orbit-missing, #123456)', tokens)).toBe('#123456');
    expect(resolveColor('tomato', tokens)).toBe('tomato');
  });

  test('measures WCAG contrast', () => {
    expect(contrastRatio(parseColor('#ffffff')!, parseColor('#000000')!)).toBeCloseTo(21, 5);
    expect(contrastRatio(parseColor('#777777')!, parseColor('#ffffff')!)).toBeCloseTo(4.48, 2);
    expect(contrastRatio(parseColor('#123456')!, parseColor('#123456')!)).toBe(1);
  });

  test('picks the label color with more contrast', () => {
    expect(prefersLightText('#F8D978', '#ffffff', '#1F2733')).toBe(false);
    expect(prefersLightText('#0D844C', '#ffffff', '#1F2733')).toBe(true);
    // Equal choices go to the light text; unreadable fills keep the dark text.
    expect(prefersLightText('#C1E3FC', '#F4F6FF', '#F4F6FF')).toBe(true);
    expect(prefersLightText('', '#ffffff', '#000000')).toBe(false);
    // Text colors it can't read: light text on fills darker than mid-gray.
    expect(prefersLightText('#222222', 'var(--x)', 'tomato')).toBe(true);
  });

  test('splits a color into an opaque value and an opacity', () => {
    expect(splitAlpha('rgba(255, 255, 255, 0.5)')).toEqual({ color: '#ffffff', opacity: 0.5 });
    expect(splitAlpha('#1F2733')).toEqual({ color: '#1f2733', opacity: 1 });
    expect(splitAlpha('not a color')).toEqual({ color: 'not a color', opacity: 1 });
  });
});

describe('pan glide', () => {
  test('release velocity is the slope of the last 80 ms', () => {
    const tracker = new PointVelocityTracker();
    tracker.reset(0);

    for (let time = 10; time <= 200; time += 10) {
      tracker.add(time, time < 120 ? 1 : 3, 0);
    }

    expect(tracker.velocityAt(200).x).toBeCloseTo(0.3, 5);
    expect(tracker.velocityAt(260).x).toBe(0);
  });

  test('a glide travels speed × time constant in total, whatever the frame rate', () => {
    const distance = (frame: number) => {
      const glide = new Glide(325);
      glide.start({ x: 1, y: 0 });
      let travelled = 0;

      while (glide.isMoving) {
        travelled += glide.step(frame).x;
      }

      return travelled;
    };

    expect(distance(1000 / 60)).toBeCloseTo(325 - 0.02 * 325, -1);
    expect(distance(1000 / 120)).toBeCloseTo(distance(1000 / 60), 0);
  });

  test('a glide is capped at a sane speed', () => {
    const glide = new Glide();
    glide.start({ x: 300, y: 400 });
    expect(Math.hypot(glide.velocity.x, glide.velocity.y)).toBeCloseTo(6, 5);
  });
});

describe('label layout', () => {
  test('short text sits inside the node at the role’s size, on one line', () => {
    expect(labelPlacement('planet', 50, 'Build', false)).toBe('inside');
    expect(insideLabelLayout('planet', 50, 'Build')).toMatchObject({ fontSize: 13, lines: ['Build'], icon: false, truncated: false });
  });

  test('names shrink to fit, no smaller than 9 px (10 px in the overview, where pills take the rest)', () => {
    for (const role of ['sun', 'planet', 'node', 'moon'] as const) {
      for (const radius of [14, 20, 30, 60, 120]) {
        const layout = insideLabelLayout(role, radius, 'Supercalifragilistic expialidocious words');
        expect(layout === null || layout.fontSize >= (role === 'node' ? 10 : 9)).toBe(true);
      }
    }

    // A small focused node, at the middle of a crowded orbit, still shows its whole name.
    expect(insideLabelLayout('sun', 22, 'author_links_2')).toMatchObject({ lines: ['author_', 'links_2'], truncated: false });
  });

  test('long identifiers wrap where they read before they are cut short', () => {
    const layout = insideLabelLayout('planet', 40, 'contact_tec_mail_address_key');
    expect(layout).toMatchObject({ truncated: false });
    expect(layout!.lines.length).toBeGreaterThan(1);
    expect(layout!.lines.join('')).toBe('contact_tec_mail_address_key');
    expect(layout!.lines.slice(0, -1).every((line) => line.endsWith('_'))).toBe(true);
    expect(labelPlacement('planet', 40, 'contact_tec_mail_address_key', false)).toBe('inside');
  });

  test('a name too long for its node is cut short inside, when enough of it shows', () => {
    expect(insideLabelLayout('planet', 30, 'contact_tec_mail_address_key')).toMatchObject({
      fontSize: 9,
      truncated: true,
      lines: ['contact_', 'tec_mail_', 'address_…'],
    });
    // A few letters wouldn't say what the node is: no name until you zoom in.
    expect(insideLabelLayout('planet', 20, 'contact_tec_mail_address_key')).toBeNull();
    expect(labelPlacement('planet', 20, 'contact_tec_mail_address_key', false)).toBe('hidden');
  });

  test('a long word hyphenated across lines that then fit shows whole, with no ellipsis', () => {
    const layout = insideLabelLayout('planet', 40, 'Supercalifragilisticexpialidocious');
    expect(layout).toMatchObject({ truncated: false });
    expect(layout!.lines.length).toBeGreaterThan(1);
    expect(layout!.lines.some((line) => line.endsWith('-'))).toBe(true);
    expect(layout!.lines.every((line) => !line.endsWith('…'))).toBe(true);
    // Every letter shows: dropping the hyphens the breaks added gives the name back.
    expect(layout!.lines.map((line) => line.replace(/-$/, '')).join('')).toBe('Supercalifragilisticexpialidocious');
  });

  test('a focused node keeps its icon above a title of a few words, wrapped one word to a line', () => {
    expect(insideLabelLayout('sun', 44, 'Product Roadmap 2027', true)).toMatchObject({
      icon: true,
      lines: ['Product', 'Roadmap', '2027'],
      truncated: false,
    });
  });

  test('the icon shows above the name when there is room, and goes before the name gets smaller', () => {
    expect(insideLabelLayout('planet', 50, 'Interviews', true)).toMatchObject({ icon: true, fontSize: 13 });
    expect(insideLabelLayout('planet', 30, 'Interviews', true)).toMatchObject({ icon: false, truncated: false });
  });

  test('every line of a name fits the circle where it is drawn, however many lines the fit tried', () => {
    const overflows: string[] = [];

    for (const role of ['sun', 'planet', 'node', 'moon'] as const) {
      for (let radius = 14; radius <= 90; radius += 0.5) {
        for (const icon of [false, true]) {
          for (const name of FIT_NAMES) {
            const layout = insideLabelLayout(role, radius, name, icon);

            if (!layout) {
              continue;
            }

            for (const line of drawnLines(layout, radius)) {
              if (line.width > line.room + 0.01) {
                overflows.push(`${role} ${radius}${icon ? ' with its icon' : ''}: "${line.text}" is ${line.width.toFixed(1)} px in ${line.room.toFixed(1)}`);
              }
            }
          }
        }
      }
    }

    expect(overflows).toEqual([]);
  });

  test('a name inside a node keeps clear of its "+N"', () => {
    const under: string[] = [];
    let raised = 0;

    for (const role of ['sun', 'planet', 'node'] as const) {
      for (let radius = 14; radius <= 90; radius += 0.5) {
        for (const hiddenChildren of [3, 12, 140]) {
          // The count's box, from the node's center (px).
          const width = measureCount(hiddenChildren);
          const left = COUNT_POSITION * radius - width / 2;
          const top = COUNT_POSITION * radius - COUNT_HEIGHT / 2;

          for (const icon of [false, true]) {
            for (const name of FIT_NAMES) {
              const layout = insideLabelLayout(role, radius, name, icon, INSIDE_ESTIMATE, true, width);

              if (!layout) {
                continue;
              }

              raised += layout.lift > 0 ? 1 : 0;

              for (const line of drawnLines(layout, radius)) {
                // Letters end, tails and all, a little above the bottom of their line.
                const letters = line.middle + (LINE_HEIGHT / 2 - UNDER_TAILS) * layout.fontSize;

                if (letters > top && line.width / 2 > left) {
                  under.push(`${role} ${radius}${icon ? ' with its icon' : ''}, +${hiddenChildren}: "${line.text}"`);
                }
              }
            }
          }
        }
      }
    }

    expect(under).toEqual([]);
    expect(raised).toBeGreaterThan(0);

    // The large map's areas at the size the website draws them: whole, with their icons, raised above their counts.
    const areas: [string, string[]][] = [
      ['Fees & Payments', ['Fees &', 'Payments']],
      ['Digital Lending', ['Digital', 'Lending']],
      ['Loans & Returns', ['Loans &', 'Returns']],
      ['Staff & Access', ['Staff &', 'Access']],
    ];

    for (const [name, lines] of areas) {
      const layout = insideLabelLayout('planet', 32, name, true, INSIDE_ESTIMATE, true, measureCount(7));
      expect(layout).toMatchObject({ icon: true, truncated: false, lines });
      expect(layout!.lift).toBeGreaterThan(0);
    }

    // A node without a count keeps its name centered.
    expect(insideLabelLayout('planet', 32, 'Fees & Payments', true)).toMatchObject({ lift: 0 });
  });

  test('measures CJK text as full-width characters that can wrap anywhere', () => {
    expect(insideFontSize('planet', 84, '研究開発計画')).toBe(13);
    expect(insideLabelLayout('planet', 50, '研究開発計画')).toMatchObject({ fontSize: 13, lines: ['研究開発計画'] });
    const long = insideLabelLayout('planet', 50, '研究開発計画研究開発計画研究');
    expect(long).toMatchObject({ truncated: false });
    expect(long!.lines.length).toBeGreaterThan(1);
    expect(long!.lines.join('')).toBe('研究開発計画研究開発計画研究');
  });

  test('only nodes that need one get a pill: pictures, the focused node, and the overview’s small nodes', () => {
    expect(labelPlacement('planet', 60, 'Photo', true)).toBe('outside');
    expect(labelPlacement('node', 20, 'contact_tec_mail_address_key', false)).toBe('outside');
    expect(labelPlacement('sun', 8, 'Plan', false)).toBe('outside');
    expect(labelPlacement('moon', 9, 'A moon with a long name', false)).toBe('hidden');
  });

  test('pictures push labels outside; tiny nodes have none', () => {
    expect(labelPlacement('planet', 60, 'Photo', true)).toBe('outside');
    expect(labelPlacement('node', 3, 'Tiny', false)).toBe('hidden');
    expect(labelPlacement('moon', 6, 'Moon', false)).toBe('hidden');
  });
});

describe('ring paths', () => {
  test('a ring without bodies is a full circle', () => {
    expect(ringPath(100, [])).toBe('M 100 0 A 100 100 0 1 1 -100 0 A 100 100 0 1 1 100 0');
  });

  test('a ring opens around each body on it', () => {
    const path = ringPath(100, [{ angle: 0, halfWidth: 10 }, { angle: 180, halfWidth: 10 }]);
    expect(path.match(/M /g)).toHaveLength(2);
    // Clockwise from just past the body at 180° to just before the one at 0°, and back.
    expect(path.startsWith('M -98.48 -17.36 A 100 100 0 0 1 98.48 -17.36')).toBe(true);
  });
});
