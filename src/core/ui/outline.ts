/**
 * The map as a nested list. Screen readers can always browse it (it is
 * visually hidden but present), the list button shows it to everyone, and
 * a polite live region announces where navigation landed.
 */

import type { OrbitNode } from '../types.js';
import type { OrbitWords } from '../languages.js';
import { overlayTransform } from '../browser.js';

/** An idea's date as the outline shows it, after its name: in the attention color when it's `overdue`. */
export interface OutlineDate {
  text: string;
  overdue: boolean;
}

export class AccessibleOutline {
  readonly element: HTMLElement;
  readonly live: HTMLDivElement;
  private readonly onSelect: (nodeId: string) => void;
  private visible = false;
  private icon: (node: OrbitNode) => string | undefined = (node) => node.icon;
  private date: (node: OrbitNode) => OutlineDate | null = () => null;

  /** Each node's entry, so moving between nodes only moves the current marker. */
  private readonly entries = new Map<string, HTMLElement>();

  private currentId: string | null = null;
  private words: OrbitWords;

  /** Nodes whose children are hidden from view, as of the last `update`. */
  private hidden: ReadonlySet<string> = new Set();

  constructor(onSelect: (nodeId: string) => void, words: OrbitWords) {
    this.onSelect = onSelect;
    this.words = words;
    this.element = document.createElement('nav');
    this.element.className = 'orbit-outline orbit-visually-hidden';
    this.live = document.createElement('div');
    this.live.className = 'orbit__live';
    this.live.setAttribute('aria-live', 'polite');
    this.live.setAttribute('role', 'status');
    this.relabel(words);
  }

  /** Names the list in `words`' language; the next `update` writes its entries in it. */
  relabel(words: OrbitWords): void {
    this.words = words;
    this.element.setAttribute('aria-label', words.text('outline'));
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /**
   * Rebuilds the list. Without `interactive`, entries are plain text instead
   * of buttons. `icon` gives a node's icon, its type's when it has none, and
   * `date` its date, as of now. The children of the nodes in `hidden` are
   * left out, and their node's entry says how many there are.
   */
  update(
    tree: OrbitNode,
    focusId: string | null,
    maxDepth: number | undefined,
    interactive: boolean,
    icon: (node: OrbitNode) => string | undefined = (node) => node.icon,
    hidden: ReadonlySet<string> = new Set(),
    date: (node: OrbitNode) => OutlineDate | null = () => null,
  ): void {
    this.icon = icon;
    this.date = date;
    this.hidden = new Set(hidden);
    this.entries.clear();
    this.currentId = null;
    const list = document.createElement('ul');
    list.appendChild(this.item(tree, maxDepth, interactive));
    this.element.replaceChildren(list);
    this.setCurrent(focusId);
  }

  /** Marks the focused node's entry, without rebuilding the list: a big map's outline has thousands. */
  setCurrent(focusId: string | null): void {
    if (focusId === this.currentId) {
      return;
    }

    if (this.currentId !== null) {
      this.entries.get(this.currentId)?.removeAttribute('aria-current');
    }

    this.currentId = focusId;

    if (focusId !== null) {
      this.entries.get(focusId)?.setAttribute('aria-current', 'true');
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.element.classList.toggle('orbit-visually-hidden', !visible);
    this.element.classList.toggle('orbit-outline--visible', visible);

    for (const button of this.element.querySelectorAll('button')) {
      button.tabIndex = visible ? 0 : -1;
    }

    if (visible) {
      this.element.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus();
    }
  }

  announce(text: string): void {
    // Clear first so repeating the same announcement still speaks.
    this.live.textContent = '';

    setTimeout(() => {
      this.live.textContent = text;
    }, 30);
  }

  private item(node: OrbitNode, maxDepth: number | undefined, interactive: boolean): HTMLLIElement {
    const item = document.createElement('li');
    const entry = document.createElement(interactive ? 'button' : 'span');
    entry.textContent = [this.icon(node), node.text || this.words.text('untitled')].filter(Boolean).join(' ');

    if (node.status) {
      entry.textContent += ` (${node.status})`;
    }

    const hidesChildren = this.hidden.has(node.id) && node.children.length > 0;

    if (hidesChildren) {
      entry.textContent += `, ${this.words.count('hiddenIdeaCount', node.children.length)}`;
    }

    const date = this.date(node);

    if (date) {
      // The name, cut short where it must, then the date, whole: a comma between them for screen readers.
      const name = document.createElement('span');
      name.className = 'orbit-outline__name';
      name.textContent = entry.textContent;
      const comma = document.createElement('span');
      comma.className = 'orbit-visually-hidden';
      comma.textContent = ', ';
      const shown = document.createElement('span');
      shown.className = date.overdue ? 'orbit-outline__date orbit-outline__date--overdue' : 'orbit-outline__date';
      shown.textContent = date.text;
      entry.classList.add('orbit-outline__dated');
      entry.replaceChildren(name, comma, shown);
    }

    if (!this.entries.has(node.id)) {
      this.entries.set(node.id, entry);
    }

    if (entry instanceof HTMLButtonElement) {
      entry.type = 'button';
      entry.tabIndex = this.visible ? 0 : -1;
      entry.addEventListener('click', () => this.onSelect(node.id));
    }

    item.appendChild(entry);
    const showChildren = (maxDepth === undefined || node.level < maxDepth) && !hidesChildren;

    if (showChildren && node.children.length > 0) {
      const children = document.createElement('ul');

      for (const child of node.children) {
        children.appendChild(this.item(child, maxDepth, interactive));
      }

      item.appendChild(children);
    }

    return item;
  }
}

/** A hover and keyboard-focus tooltip for nodes. */
export class Tooltip {
  readonly element: HTMLDivElement;
  private readonly title: HTMLSpanElement;
  private readonly detail: HTMLSpanElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'orbit-tooltip';
    this.element.setAttribute('role', 'tooltip');
    this.element.setAttribute('aria-hidden', 'true');
    this.title = document.createElement('span');
    this.title.className = 'orbit-tooltip__title';
    this.detail = document.createElement('span');
    this.detail.className = 'orbit-tooltip__detail';
    this.element.append(this.title, this.detail);
  }

  get isVisible(): boolean {
    return this.element.classList.contains('orbit-tooltip--visible');
  }

  show(title: string, detail: string, x: number, y: number): void {
    this.title.textContent = title;
    this.detail.textContent = detail;
    this.detail.hidden = detail === '';
    this.place(x, y);
    this.element.classList.add('orbit-tooltip--visible');
  }

  /** Puts the tooltip's tip at `x`, `y`, the tooltip centered above it. */
  place(x: number, y: number): void {
    this.element.style.transform = overlayTransform(Math.round(x), Math.round(y), '-50%, calc(-100% - 10px)');
  }

  hide(): void {
    this.element.classList.remove('orbit-tooltip--visible');
  }
}
