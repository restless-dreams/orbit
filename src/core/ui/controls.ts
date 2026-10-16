/**
 * Map controls: real, themable buttons in an HTML layer over the map.
 * Wide containers show breadcrumbs; narrow ones a back chip with the
 * parent's name (switched by a container query in the stylesheet).
 */

import type { OrbitNode, ViewMode } from '../types.js';
import type { OrbitWords } from '../languages.js';
import { pointsCoarsely } from '../browser.js';
import { createIcon, type IconName } from './icons.js';

export interface ControlsCallbacks {
  onNavigate(nodeId: string): void;
  onViewMode(mode: ViewMode): void;
  onZoom(direction: 1 | -1): void;
  onFit(): void;
  onToggleOutline(): void;
}

export interface ControlsState {
  viewMode: ViewMode;

  /** From the root to the focused node. */
  path: OrbitNode[];

  outlineOpen: boolean;
}

/** Breadcrumbs longer than this collapse their middle into "…". */
const MAXIMUM_CRUMBS = 4;

/**
 * The zoom buttons' panel, as the stylesheet draws it: this far from the
 * map's lower right corner (`.orbit-controls__zoom`), and three icon buttons
 * 2 px apart in 3 px of padding and a 1 px border (`.orbit-panel`), 32 px
 * each, or 40 px where the page is used with a finger (`.orbit-button--icon`).
 */
const ZOOM_PANEL_INSET = 12;
const ZOOM_PANEL = { width: 40, height: 108 };
const COARSE_ZOOM_PANEL = { width: 48, height: 132 };

/** A rectangle on the map, in px from its top left corner. */
export interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export class Controls {
  readonly element: HTMLDivElement;
  private readonly callbacks: ControlsCallbacks;
  private readonly back: HTMLButtonElement;
  private readonly backLabel: HTMLSpanElement;
  private readonly breadcrumbs: HTMLElement;
  private readonly breadcrumbPanel: HTMLDivElement;
  private readonly viewGroup: HTMLDivElement;
  private readonly focusButton: HTMLButtonElement;
  private readonly overviewButton: HTMLButtonElement;
  private readonly outlineButton: HTMLButtonElement;
  private readonly zoomPanel: HTMLDivElement;
  private readonly zoomInButton: HTMLButtonElement;
  private readonly fitButton: HTMLButtonElement;
  private readonly zoomOutButton: HTMLButtonElement;
  private readonly hint: HTMLDivElement;
  private hintTimer: ReturnType<typeof setTimeout> | null = null;
  private parentId: string | null = null;
  private words: OrbitWords;
  private state: ControlsState | null = null;

  constructor(callbacks: ControlsCallbacks, words: OrbitWords) {
    this.callbacks = callbacks;
    this.words = words;
    this.element = element('div', 'orbit-controls');

    const top = element('div', 'orbit-controls__top');
    const start = element('div', 'orbit-controls__start');

    this.back = button('orbit-button orbit-panel orbit-back', 'back');
    this.backLabel = element('span', '');
    this.back.appendChild(this.backLabel);

    this.back.addEventListener('click', () => {
      if (this.parentId) {
        this.callbacks.onNavigate(this.parentId);
      }
    });

    this.breadcrumbPanel = element('div', 'orbit-panel orbit-controls__crumbs');
    this.breadcrumbs = element('nav', 'orbit-breadcrumbs');
    this.breadcrumbPanel.appendChild(this.breadcrumbs);
    start.append(this.back, this.breadcrumbPanel);

    this.viewGroup = element('div', 'orbit-panel');
    this.viewGroup.setAttribute('role', 'group');
    this.focusButton = labelledButton('focus');
    this.focusButton.addEventListener('click', () => this.callbacks.onViewMode('focus'));
    this.overviewButton = labelledButton('overview');
    this.overviewButton.addEventListener('click', () => this.callbacks.onViewMode('all'));
    this.outlineButton = iconButton('list', () => this.callbacks.onToggleOutline());
    this.viewGroup.append(this.focusButton, this.overviewButton, this.outlineButton);
    top.append(start, this.viewGroup);

    const zoom = element('div', 'orbit-controls__zoom');
    this.zoomPanel = element('div', 'orbit-panel orbit-panel--vertical');
    this.zoomPanel.setAttribute('role', 'group');
    this.zoomInButton = iconButton('zoom-in', () => this.callbacks.onZoom(1));
    this.fitButton = iconButton('fit', () => this.callbacks.onFit());
    this.zoomOutButton = iconButton('zoom-out', () => this.callbacks.onZoom(-1));
    this.zoomPanel.append(this.zoomInButton, this.fitButton, this.zoomOutButton);
    zoom.appendChild(this.zoomPanel);

    this.hint = element('div', 'orbit-hint');
    this.hint.setAttribute('role', 'status');

    this.element.append(top, zoom, this.hint);
    this.relabel(words);
  }

  /** Writes every label in `words`' language. */
  relabel(words: OrbitWords): void {
    this.words = words;
    this.breadcrumbs.setAttribute('aria-label', words.text('mapPath'));
    this.viewGroup.setAttribute('aria-label', words.text('view'));
    setLabel(this.focusButton, words.text('focus'));
    setLabel(this.overviewButton, words.text('overview'));
    setLabel(this.outlineButton, words.text('showOutline'));
    this.zoomPanel.setAttribute('aria-label', words.text('zoom'));
    setLabel(this.zoomInButton, words.text('zoomIn'));
    setLabel(this.fitButton, words.text('fitMap'));
    setLabel(this.zoomOutButton, words.text('zoomOut'));

    if (this.state) {
      this.update(this.state);
    }
  }

  update(state: ControlsState): void {
    this.state = state;
    this.focusButton.setAttribute('aria-pressed', String(state.viewMode === 'focus'));
    this.overviewButton.setAttribute('aria-pressed', String(state.viewMode === 'all'));
    this.outlineButton.setAttribute('aria-pressed', String(state.outlineOpen));

    const showPath = state.viewMode === 'focus' && state.path.length > 1;
    const parent = showPath ? state.path[state.path.length - 2] : null;
    this.parentId = parent?.id ?? null;
    this.back.hidden = !parent;
    this.backLabel.textContent = parent ? parent.text || this.words.text('back') : '';
    this.back.setAttribute('aria-label', parent?.text ? this.words.text('backTo', { name: parent.text }) : parent ? this.words.text('backToParent') : this.words.text('back'));
    this.breadcrumbPanel.hidden = !showPath;
    this.breadcrumbs.replaceChildren(...(showPath ? this.crumbs(state.path) : []));
  }

  /**
   * Where the zoom buttons are on a map `width` by `height` px, known
   * without laying them out, or null while the controls are hidden.
   */
  zoomBox(width: number, height: number): ScreenBox | null {
    if (this.element.hidden) {
      return null;
    }

    const panel = pointsCoarsely(this.element) ? COARSE_ZOOM_PANEL : ZOOM_PANEL;
    const right = width - ZOOM_PANEL_INSET;
    const bottom = height - ZOOM_PANEL_INSET;
    return { left: right - panel.width, top: bottom - panel.height, right, bottom };
  }

  /** Shows a short message at the bottom of the map. */
  showHint(text: string, duration = 1800): void {
    this.hint.textContent = text;
    this.hint.classList.add('orbit-hint--visible');

    if (this.hintTimer) {
      clearTimeout(this.hintTimer);
    }

    this.hintTimer = setTimeout(() => {
      this.hint.classList.remove('orbit-hint--visible');
      this.hintTimer = null;
    }, duration);
  }

  destroy(): void {
    if (this.hintTimer) {
      clearTimeout(this.hintTimer);
    }

    this.element.remove();
  }

  private crumbs(path: OrbitNode[]): HTMLElement[] {
    const indexes = path.length > MAXIMUM_CRUMBS
      ? [0, -1, path.length - 2, path.length - 1]
      : path.map((_, index) => index);
    const items: HTMLElement[] = [];

    indexes.forEach((pathIndex, position) => {
      if (position > 0) {
        const separator = createIcon('chevron');
        separator.classList.add('orbit-breadcrumbs__separator');
        items.push(separator as unknown as HTMLElement);
      }

      if (pathIndex === -1) {
        const ellipsis = element('span', 'orbit-button orbit-breadcrumbs__item');
        ellipsis.textContent = '…';
        ellipsis.title = path.slice(1, path.length - 2).map((node) => node.text).join(' › ');
        items.push(ellipsis);
        return;
      }

      const node = path[pathIndex];
      const isCurrent = pathIndex === path.length - 1;
      const crumb = element('button', 'orbit-button orbit-breadcrumbs__item');
      crumb.type = 'button';

      if (pathIndex === 0) {
        crumb.appendChild(createIcon('home'));
      }

      const label = element('span', '');
      label.textContent = node.text || this.words.text('untitled');
      crumb.appendChild(label);
      crumb.title = node.text;

      if (isCurrent) {
        crumb.setAttribute('aria-current', 'location');
        crumb.disabled = true;
      } else {
        crumb.addEventListener('click', () => this.callbacks.onNavigate(node.id));
      }

      items.push(crumb);
    });

    return items;
  }
}

const element = <Name extends keyof HTMLElementTagNameMap>(name: Name, className: string): HTMLElementTagNameMap[Name] => {
  const created = document.createElement(name);

  if (className) {
    created.className = className;
  }

  return created;
};

const button = (className: string, icon: IconName): HTMLButtonElement => {
  const created = element('button', className);
  created.type = 'button';
  created.appendChild(createIcon(icon));
  return created;
};

/** A button with its icon and its label beside it, which `setLabel` writes. */
const labelledButton = (icon: IconName): HTMLButtonElement => {
  const created = button('orbit-button', icon);
  created.appendChild(element('span', 'orbit-segmented__label'));
  return created;
};

const iconButton = (icon: IconName, onClick: () => void): HTMLButtonElement => {
  const created = button('orbit-button orbit-button--icon', icon);
  created.addEventListener('click', onClick);
  return created;
};

/** A button's name, its tooltip and the label beside its icon, if it has one. */
const setLabel = (target: HTMLButtonElement, label: string): void => {
  target.setAttribute('aria-label', label);
  target.title = label;
  const text = target.querySelector('.orbit-segmented__label');

  if (text) {
    text.textContent = label;
  }
};
