/**
 * Buttons under the focused node: its type's details, its image, video,
 * embed, note and link, then your own actions.
 */

import type { OrbitContentAction, OrbitNode } from '../types.js';
import { OrbitWords } from '../languages.js';
import { actionLabel, type OrbitAction } from '../extensions.js';
import { hasMediaSource } from '../media.js';
import { isNodeLink } from '../node-links.js';
import { guardUrl } from '../url-guard.js';
import { overlayTransform, pointsCoarsely } from '../browser.js';
import { createActionIcon, createIcon, type IconName } from './icons.js';

export type ActionKind = OrbitContentAction;

/**
 * Where a node's link goes: a page, another node of the map (with the
 * button's label), or a node that isn't in the map, which gets no button.
 */
export type LinkDescription = { kind: 'page' } | { kind: 'node'; label: string } | { kind: 'missing' };

/** Orbit's buttons a node offers, in display order. A video replaces an embed. */
export const activeActions = (node: OrbitNode, hasDetails = false): ActionKind[] => {
  const kinds: ActionKind[] = [];

  if (hasDetails) {
    kinds.push('details');
  }

  if (hasMediaSource(node.image)) {
    kinds.push('image');
  }

  if (hasMediaSource(node.video)) {
    kinds.push('video');
  }

  if (hasMediaSource(node.embed) && !hasMediaSource(node.video)) {
    kinds.push('embed');
  }

  if (node.note) {
    kinds.push('note');
  }

  if (node.link && (isNodeLink(node.link) || guardUrl(node.link, 'link') !== null)) {
    kinds.push('link');
  }

  return kinds;
};

const LABELS = {
  details: 'showDetails',
  image: 'viewImage',
  video: 'playVideo',
  embed: 'openEmbed',
  note: 'readNote',
  link: 'openLink',
} as const satisfies Record<ActionKind, string>;

const ICONS: Record<ActionKind, IconName> = {
  details: 'info',
  image: 'image',
  video: 'video',
  embed: 'embed',
  note: 'note',
  link: 'link',
};

/** What the bar asks the map about a node besides its content. */
export interface ActionBarContext {
  /** Runs a button: one of Orbit's, or the `id` of one of your actions. */
  onAction(node: OrbitNode, action: string, event: MouseEvent): void;

  /** Where the node's link goes. */
  describeLink(node: OrbitNode): LinkDescription;

  /** Your actions the node offers. */
  actions(node: OrbitNode): OrbitAction[];

  /** Whether the node's type adds a section to the detail sheet. */
  hasDetails(node: OrbitNode): boolean;

  /** Puts keyboard focus back on the map's active node, the way closing the inline editor does. */
  returnFocus?(): void;

  /** The map's words, in its language. Default: English. */
  words?(): OrbitWords;
}

const ENGLISH = new OrbitWords('en');

/** A button's width and height (px), as `.orbit-action` draws it: bigger where the page is used with a finger. */
const BUTTON_SIZE = 36;
const COARSE_BUTTON_SIZE = 42;
/** The room between buttons (px), as `.orbit-actions` leaves it. */
const BUTTON_GAP = 8;

/** How a row of buttons lays out in the width it's given: the buttons on each line, and the size of the whole. */
export interface ActionRows {
  perLine: number;
  width: number;
  height: number;
}

/** How `count` buttons `size` px wide lay out in `width` px: on one line where they fit, else wrapped onto more. */
export const actionRows = (count: number, size: number, width = Infinity): ActionRows => {
  const perLine = Math.max(1, Math.min(count, Math.floor((width + BUTTON_GAP) / (size + BUTTON_GAP))));
  const lines = Math.ceil(count / perLine);
  return {
    perLine,
    width: perLine * size + (perLine - 1) * BUTTON_GAP,
    height: lines * size + (lines - 1) * BUTTON_GAP,
  };
};

export class ActionBar {
  readonly element: HTMLDivElement;
  private readonly context: ActionBarContext;
  private node: OrbitNode | null = null;
  private visible = false;

  /** Where the buttons were last put, so a bar that didn't move isn't touched: the map paints every frame while it moves. */
  private transform = '';

  /** The width they last wrapped at (0 for one line). */
  private wrap = 0;

  /** The last node counted, and its count. */
  private counted: { node: OrbitNode; count: number } | null = null;

  constructor(context: ActionBarContext) {
    this.context = context;
    this.element = document.createElement('div');
    this.element.className = 'orbit-actions';
    this.element.setAttribute('role', 'toolbar');
  }

  /** How many buttons `node` gets: Orbit's, then your actions. The map asks every frame, so each node is counted once. */
  count(node: OrbitNode): number {
    if (this.counted?.node !== node) {
      this.counted = { node, count: this.kinds(node).length + this.context.actions(node).length };
    }

    return this.counted.count;
  }

  /** How wide and tall each button is (px), known without laying them out. */
  size(): number {
    return pointsCoarsely(this.element) ? COARSE_BUTTON_SIZE : BUTTON_SIZE;
  }

  private kinds(node: OrbitNode): ActionKind[] {
    return activeActions(node, this.context.hasDetails(node)).filter((kind) => kind !== 'link' || this.context.describeLink(node).kind !== 'missing');
  }

  /**
   * Shows the buttons of `node` (if it has any) with their top center at
   * (`x`, `y`), wrapped onto lines `wrap` px wide (or on one line, with 0).
   */
  show(node: OrbitNode, x: number, y: number, wrap = 0): void {
    if (node !== this.node) {
      this.node = node;
      this.element.replaceChildren(
        ...this.kinds(node).map((kind) => this.contentButton(node, kind)),
        ...this.context.actions(node).map((action) => this.actionButton(node, action)),
      );
      const words = this.words();
      this.element.setAttribute('aria-label', node.text ? words.text('ideaActions', { name: node.text }) : words.text('ideaActionsUntitled'));
    }

    if (!this.element.hasChildNodes()) {
      this.hide();
      return;
    }

    const transform = overlayTransform(Math.round(x), Math.round(y), '-50%, 0');

    if (transform !== this.transform) {
      this.element.style.transform = transform;
      this.transform = transform;
    }

    if (wrap !== this.wrap) {
      this.element.style.maxWidth = wrap > 0 ? `${wrap}px` : '';
      this.wrap = wrap;
    }

    if (!this.visible) {
      this.element.classList.add('orbit-actions--visible');
      this.visible = true;
    }
  }

  hide(): void {
    if (!this.visible) {
      return;
    }

    // Keep focus on the map if it was on one of the buttons: blurring would drop it to <body>, off the map's keys.
    if (this.element.contains(this.element.ownerDocument.activeElement)) {
      if (this.context.returnFocus) {
        this.context.returnFocus();
      } else {
        (this.element.ownerDocument.activeElement as HTMLElement).blur();
      }
    }

    this.element.classList.remove('orbit-actions--visible');
    this.visible = false;
  }

  private words(): OrbitWords {
    return this.context.words?.() ?? ENGLISH;
  }

  /** Forgets the buttons, so the next `show` rebuilds them. */
  reset(): void {
    this.node = null;
    this.counted = null;
    this.element.replaceChildren();
    this.hide();
  }

  private contentButton(node: OrbitNode, kind: ActionKind): HTMLButtonElement {
    const link = kind === 'link' ? this.context.describeLink(node) : null;
    const label = link?.kind === 'node' ? link.label : this.words().text(LABELS[kind]);
    const button = this.button(node, kind, label);
    button.classList.add(`orbit-action--${kind}`);
    button.appendChild(createIcon(link?.kind === 'node' ? 'goto' : ICONS[kind]));
    return button;
  }

  private actionButton(node: OrbitNode, action: OrbitAction): HTMLButtonElement {
    const label = actionLabel(action, node);
    const button = this.button(node, action.id, label);
    button.classList.add('orbit-action--custom');
    button.dataset.action = action.id;
    button.appendChild(createActionIcon(action.icon, label));
    return button;
  }

  private button(node: OrbitNode, action: string, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'orbit-action';
    button.setAttribute('aria-label', label);
    button.title = label;

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.context.onAction(node, action, event);
    });

    return button;
  }
}
