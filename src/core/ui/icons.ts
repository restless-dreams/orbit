/**
 * One icon set for every control: a 24 px grid, 1.75 px strokes with round
 * caps and joins. Each icon is a list of SVG path commands.
 */

export type IconName =
  | 'back' | 'home' | 'chevron' | 'focus' | 'overview' | 'zoom-in' | 'zoom-out' | 'fit'
  | 'image' | 'video' | 'embed' | 'note' | 'link' | 'goto' | 'info' | 'close' | 'previous' | 'next' | 'list' | 'expand';

const ICONS: Record<IconName, string[]> = {
  back: ['M19 12H5', 'M11 6l-6 6 6 6'],
  home: ['M4 11l8-7 8 7', 'M6 9.5V20h4.5v-5h3v5H18V9.5'],
  chevron: ['M9.5 6l6 6-6 6'],
  focus: ['M4 9V6a2 2 0 0 1 2-2h3', 'M15 4h3a2 2 0 0 1 2 2v3', 'M20 15v3a2 2 0 0 1-2 2h-3', 'M9 20H6a2 2 0 0 1-2-2v-3', 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5z'],
  overview: ['M12 4.5a2 2 0 1 0 0 4 2 2 0 1 0 0-4z', 'M5.5 15.5a2 2 0 1 0 0 4 2 2 0 1 0 0-4z', 'M18.5 15.5a2 2 0 1 0 0 4 2 2 0 1 0 0-4z', 'M10.9 8.3l-4.3 7.4', 'M13.1 8.3l4.3 7.4', 'M7.5 17.5h9'],
  'zoom-in': ['M12 5v14', 'M5 12h14'],
  'zoom-out': ['M5 12h14'],
  fit: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  image: ['M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'M20 15l-4.5-4.5L6 20', 'M9 7.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3z'],
  video: ['M8 5.5v13l10.5-6.5z'],
  embed: ['M8.5 8l-4 4 4 4', 'M15.5 8l4 4-4 4', 'M13.5 5l-3 14'],
  note: ['M6 4h9l4 4v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'M15 4v4h4', 'M8.5 12.5h7', 'M8.5 16h5'],
  link: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4'],
  goto: ['M4 12h12', 'M12 7l5 5-5 5', 'M20 5v14'],
  info: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 1 0 0-17z', 'M12 11v5.5', 'M12 7.75h.01'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  previous: ['M14.5 6l-6 6 6 6'],
  next: ['M9.5 6l6 6-6 6'],
  list: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4.5 6h.01', 'M4.5 12h.01', 'M4.5 18h.01'],
  expand: ['M14.5 4H20v5.5', 'M20 4l-6.5 6.5', 'M9.5 20H4v-5.5', 'M4 20l6.5-6.5'],
};

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** An inline, decorative icon element for HTML controls. */
export const createIcon = (name: IconName): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('orbit-icon');

  for (const commands of ICONS[name]) {
    const path = document.createElementNS(SVG_NAMESPACE, 'path');
    path.setAttribute('d', commands);
    svg.appendChild(path);
  }

  if (name === 'video') {
    svg.classList.add('orbit-icon--filled');
  }

  return svg;
};

export const iconPaths = (name: IconName): readonly string[] => {
  return ICONS[name];
};

const isIconName = (name: string): name is IconName => {
  return Object.prototype.hasOwnProperty.call(ICONS, name);
};

/**
 * The icon for one of your actions: one of these icons by name, SVG path
 * data on the same 24-unit grid (`'M4 20h4L20 8l-4-4L4 16z'`), or an emoji
 * or short symbol. Without one, the label's first letter.
 */
export const createActionIcon = (icon: string | undefined, label: string): Element => {
  if (icon && isIconName(icon)) {
    return createIcon(icon);
  }

  if (icon && /^[Mm]\s*-?[\d.]/.test(icon)) {
    const svg = createIcon('note');
    svg.replaceChildren();
    const path = document.createElementNS(SVG_NAMESPACE, 'path');
    path.setAttribute('d', icon);
    svg.appendChild(path);
    return svg;
  }

  const glyph = document.createElement('span');
  glyph.className = 'orbit-icon orbit-icon--glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = icon || Array.from(label.trim())[0]?.toUpperCase() || '•';
  return glyph;
};
