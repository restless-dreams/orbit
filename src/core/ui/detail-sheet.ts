/**
 * The detail sheet: a node's media, note, status, tags and link. A native
 * `<dialog>` opened as a modal, so it sits in the top layer, traps focus,
 * closes with Esc and makes the page behind it inert. Phones get a bottom
 * sheet that can be swiped down to close.
 */

import type { OrbitNode } from '../types.js';
import { OrbitWords } from '../languages.js';
import { guardUrl, resolveUrl } from '../url-guard.js';
import { hasMediaSource, isNativeVideoUrl, toVideoEmbedUrl } from '../media.js';
import { createActionIcon, createIcon } from './icons.js';
import { embedFrame, playerFrame } from './frames.js';
import { renderNoteMarkdown } from './note-markdown.js';
import { isNodeLink } from '../node-links.js';

export type DetailSection = 'details' | 'image' | 'video' | 'embed' | 'note';

/** What the map tells the sheet about the node it shows, beyond its content: its type, actions and status look. */
export interface SheetExtensions {
  icon(node: OrbitNode): string | undefined;
  typeLabel(node: OrbitNode): string | undefined;

  /** Draws the node type's section, if it has one. */
  details(node: OrbitNode): ((element: HTMLElement) => void) | undefined;

  actions(node: OrbitNode): { id: string; label: string; icon?: string }[];
  runAction(node: OrbitNode, action: string, event: MouseEvent): void;
  status(word: string): { tone: string; color?: string };
}

export interface DetailRequest {
  node: OrbitNode;

  /** Ancestors from the root, for the path above the title. */
  path: OrbitNode[];

  /** Siblings to step through with the previous / next buttons and arrow keys. */
  siblings: OrbitNode[];

  section?: DetailSection;
  baseUrl?: string;
  noteRenderer?: (note: string, context: { node: OrbitNode; format: 'markdown' | 'plain' }) => string;

  /** Called when the reader steps to a sibling. */
  onNavigate?: (node: OrbitNode) => void;

  /** The node a `#id` link points at, if the map has it. */
  resolveLink?: (href: string) => OrbitNode | null;

  /** Called, after the sheet closes, when the reader follows a link to another node. */
  onFollowLink?: (node: OrbitNode) => void;

  /** The map's node types, actions and status words. */
  extensions?: SheetExtensions;

  /**
   * Opens the media viewer on the node's picture or video: with it, the
   * picture is a button and the video gets one. `startAt` is where the
   * sheet's own player of a video file was.
   */
  onViewMedia?: (node: OrbitNode, kind: 'image' | 'video', event: MouseEvent, startAt?: number) => void;

  /** The map's words, in its language. Default: English. */
  words?: OrbitWords;
}

const SWIPE_CLOSE_DISTANCE = 80;
const ENGLISH = new OrbitWords('en');

export class DetailSheet {
  private readonly host: HTMLElement;
  private dialog: HTMLDialogElement | null = null;
  private request: DetailRequest | null = null;
  private returnFocus: HTMLElement | SVGElement | null = null;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  get isOpen(): boolean {
    return this.dialog?.open ?? false;
  }

  /** The words of the map that opened the sheet. */
  private get words(): OrbitWords {
    return this.request?.words ?? ENGLISH;
  }

  /** The node being shown, if the sheet is open. */
  get node(): OrbitNode | null {
    return this.isOpen ? this.request?.node ?? null : null;
  }

  open(request: DetailRequest): void {
    const active = (this.host.ownerDocument ?? document).activeElement;

    if (!this.isOpen && (active instanceof HTMLElement || active instanceof SVGElement)) {
      this.returnFocus = active;
    }

    this.request = request;
    const dialog = this.ensureDialog();
    dialog.replaceChildren(...this.buildContent(request));
    dialog.setAttribute('aria-label', request.node.text || this.words.text('details'));

    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    }

    const target = request.section ? dialog.querySelector(`[data-section="${request.section}"]`) : null;
    target?.scrollIntoView?.({ block: 'nearest' });
    dialog.querySelector<HTMLButtonElement>('.orbit-sheet__close')?.focus();
  }

  close(): void {
    const dialog = this.dialog;

    if (!dialog || !dialog.open) {
      return;
    }

    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }

    this.restoreFocus();
  }

  /** Closes the sheet, then hands the linked node to the map to fly to. */
  private followLink(node: OrbitNode): void {
    const follow = this.request?.onFollowLink;
    this.close();
    follow?.(node);
  }

  destroy(): void {
    this.close();
    this.dialog?.remove();
    this.dialog = null;
    this.request = null;
  }

  private restoreFocus(): void {
    const target = this.returnFocus;
    this.returnFocus = null;

    if (target && target.isConnected) {
      target.focus({ preventScroll: true });
    }
  }

  private ensureDialog(): HTMLDialogElement {
    if (this.dialog) {
      return this.dialog;
    }

    const dialog = document.createElement('dialog');
    dialog.className = 'orbit-sheet';
    dialog.addEventListener('close', () => this.restoreFocus());

    // A click on the dialog box itself (outside its content) is a backdrop click.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        const box = dialog.getBoundingClientRect();
        const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;

        if (!inside || (box.width === 0 && box.height === 0)) {
          this.close();
        }
      }
    });

    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && typeof dialog.showModal !== 'function') {
        this.close();
        return;
      }

      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !isEditable(event.target)) {
        if (this.step(event.key === 'ArrowRight' ? 1 : -1)) {
          event.preventDefault();
        }
      }
    });

    this.enableSwipeToClose(dialog);
    this.host.appendChild(dialog);
    this.dialog = dialog;
    return dialog;
  }

  private step(direction: 1 | -1): boolean {
    const request = this.request;

    if (!request) {
      return false;
    }

    const index = request.siblings.findIndex((sibling) => sibling.id === request.node.id);
    const next = request.siblings[index + direction];

    if (index === -1 || !next) {
      return false;
    }

    request.onNavigate?.(next);
    this.open({ ...request, node: next, section: undefined });
    return true;
  }

  private enableSwipeToClose(dialog: HTMLDialogElement): void {
    let startY: number | null = null;

    dialog.addEventListener('pointerdown', (event) => {
      const handle = (event.target as Element).closest?.('.orbit-sheet__handle, .orbit-sheet__header');

      if (handle && event.pointerType !== 'mouse') {
        startY = event.clientY;
      }
    });

    dialog.addEventListener('pointermove', (event) => {
      if (startY === null) {
        return;
      }

      const distance = Math.max(0, event.clientY - startY);
      dialog.style.transform = distance > 0 ? `translateY(${distance}px)` : '';
    });

    const finish = (event: PointerEvent) => {
      if (startY === null) {
        return;
      }

      const distance = event.clientY - startY;
      startY = null;
      dialog.style.transform = '';

      if (distance > SWIPE_CLOSE_DISTANCE) {
        this.close();
      }
    };

    dialog.addEventListener('pointerup', finish);
    dialog.addEventListener('pointercancel', finish);
  }

  private buildContent(request: DetailRequest): HTMLElement[] {
    const { node } = request;
    const handle = element('div', 'orbit-sheet__handle');

    const header = element('header', 'orbit-sheet__header');
    const heading = element('div', 'orbit-sheet__heading');

    if (request.path.length > 0) {
      const path = element('p', 'orbit-sheet__path');
      path.textContent = request.path.map((ancestor) => ancestor.text).join(' › ');
      heading.appendChild(path);
    }

    const title = element('h2', 'orbit-sheet__title');
    title.textContent = [request.extensions ? request.extensions.icon(node) : node.icon, node.text].filter(Boolean).join(' ');
    heading.appendChild(title);
    const chips = this.buildChips(node, request.extensions);

    if (chips) {
      heading.appendChild(chips);
    }

    const close = element('button', 'orbit-button orbit-button--icon orbit-sheet__close');
    close.type = 'button';
    close.setAttribute('aria-label', this.words.text('close'));
    close.appendChild(createIcon('close'));
    close.addEventListener('click', () => this.close());
    header.append(heading, close);

    const body = element('div', 'orbit-sheet__body');

    for (const media of this.buildMedia(request)) {
      body.appendChild(media);
    }

    const details = request.extensions?.details(node);

    if (details) {
      const section = element('section', 'orbit-sheet__details');
      section.dataset.section = 'details';
      details(section);
      body.appendChild(section);
    }

    if (node.note) {
      const note = element('div', 'orbit-sheet__note');
      note.dataset.section = 'note';
      const format = node.noteFormat ?? 'markdown';

      if (request.noteRenderer) {
        // Documented: a custom renderer's HTML is inserted as-is.
        note.innerHTML = request.noteRenderer(node.note, { node, format });
      } else if (format === 'plain') {
        const paragraph = element('p', '');
        paragraph.style.whiteSpace = 'pre-wrap';
        paragraph.textContent = node.note;
        note.appendChild(paragraph);
      } else {
        note.appendChild(renderNoteMarkdown(node.note, { baseUrl: request.baseUrl, resolveLink: request.resolveLink }));
      }

      // `#id` links, from the markdown or a custom renderer, go to that node.
      note.addEventListener('click', (event) => {
        const anchor = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
        const linked = anchor ? request.resolveLink?.(anchor.getAttribute('href') ?? '') : null;

        if (linked) {
          event.preventDefault();
          this.followLink(linked);
        }
      });

      body.appendChild(note);
    }

    const footer = element('footer', 'orbit-sheet__footer');
    const navigation = element('div', '');
    const index = request.siblings.findIndex((sibling) => sibling.id === node.id);

    if (request.siblings.length > 1 && index !== -1) {
      navigation.append(
        this.stepButton('previous', this.words.text('previous'), index > 0, -1),
        this.stepButton('next', this.words.text('next'), index < request.siblings.length - 1, 1),
      );
    }

    footer.appendChild(navigation);
    const actions = request.extensions?.actions(node) ?? [];

    if (actions.length > 0) {
      const group = element('div', 'orbit-sheet__actions');

      for (const action of actions) {
        const button = element('button', 'orbit-sheet__action');
        button.type = 'button';
        button.dataset.action = action.id;
        button.append(createActionIcon(action.icon, action.label), document.createTextNode(action.label));

        // The sheet closes first, so what the action opens isn't behind it.
        button.addEventListener('click', (event) => {
          const run = request.extensions?.runAction;
          this.close();
          run?.(node, action.id, event);
        });

        group.appendChild(button);
      }

      footer.appendChild(group);
    }

    const linked = isNodeLink(node.link) ? request.resolveLink?.(node.link) ?? null : null;
    const link = node.link && !isNodeLink(node.link) ? guardUrl(node.link, 'link') : null;

    if (linked) {
      const button = element('button', 'orbit-sheet__link');
      button.type = 'button';
      button.textContent = `${this.words.text('goTo', { name: linked.text || this.words.text('theIdea') })} →`;
      button.addEventListener('click', () => this.followLink(linked));
      footer.appendChild(button);
    } else if (link) {
      const anchor = element('a', 'orbit-sheet__link');
      anchor.href = resolveUrl(link, request.baseUrl);
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = `${this.words.text('openLink')} ↗`;
      footer.appendChild(anchor);
    }

    const parts = [handle, header, body];

    if (navigation.childElementCount > 0 || link || linked || actions.length > 0) {
      parts.push(footer);
    }

    return parts;
  }

  private stepButton(icon: 'previous' | 'next', label: string, enabled: boolean, direction: 1 | -1): HTMLButtonElement {
    const button = element('button', 'orbit-button orbit-button--icon');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.disabled = !enabled;
    button.appendChild(createIcon(icon));
    button.addEventListener('click', () => this.step(direction));
    return button;
  }

  private buildChips(node: OrbitNode, extensions: SheetExtensions | undefined): HTMLElement | null {
    const chips: HTMLElement[] = [];
    const typeLabel = extensions?.typeLabel(node);

    if (typeLabel) {
      const chip = element('span', 'orbit-sheet__chip orbit-sheet__chip--type');
      chip.textContent = typeLabel;
      chips.push(chip);
    }

    if (node.status) {
      const chip = element('span', 'orbit-sheet__chip orbit-sheet__chip--status');
      chip.textContent = node.status;
      const look = extensions?.status(node.status) ?? { tone: statusTone(node.status) };
      chip.style.setProperty('--orbit-chip-dot', look.color ?? `var(--_orbit-status-${look.tone})`);
      chips.push(chip);
    }

    if (node.priority !== undefined) {
      const chip = element('span', 'orbit-sheet__chip');
      chip.textContent = this.words.text('priority', { priority: node.priority });
      chips.push(chip);
    }

    for (const tag of node.tags ?? []) {
      const chip = element('span', 'orbit-sheet__chip');
      chip.textContent = `#${tag}`;
      chips.push(chip);
    }

    if (chips.length === 0) {
      return null;
    }

    const container = element('div', 'orbit-sheet__chips');
    container.append(...chips);
    return container;
  }

  private buildMedia(request: DetailRequest): HTMLElement[] {
    const { node, baseUrl, onViewMedia } = request;
    const figures: HTMLElement[] = [];

    if (hasMediaSource(node.image)) {
      const source = guardUrl(node.image.src, 'image');

      if (source) {
        const figure = this.figure('image', node.image.caption);
        const image = document.createElement('img');
        image.src = resolveUrl(source, baseUrl);
        image.alt = node.image.alt ?? '';

        if (onViewMedia) {
          const button = element('button', 'orbit-sheet__picture');
          button.type = 'button';
          button.setAttribute('aria-label', image.alt ? this.words.text('viewImageOf', { description: image.alt }) : this.words.text('viewImage'));
          button.appendChild(image);
          button.addEventListener('click', (event) => onViewMedia(node, 'image', event));
          figure.prepend(button);
        } else {
          figure.prepend(image);
        }

        figures.push(figure);
      }
    }

    if (hasMediaSource(node.video)) {
      const source = guardUrl(node.video.src, 'video');

      if (source) {
        const resolved = resolveUrl(source, baseUrl);
        // The same rule the media viewer's createPlayer applies: files, blob: URLs and provider 'native' play in a <video>.
        let player: HTMLVideoElement | HTMLIFrameElement | null = null;

        if (node.video.provider === 'native' || isNativeVideoUrl(resolved) || /^blob:/i.test(resolved)) {
          const video = document.createElement('video');
          video.src = resolved;
          video.controls = true;
          video.preload = 'metadata';
          player = video;
        } else {
          const embed = toVideoEmbedUrl(resolved, node.video.provider);
          player = embed ? playerFrame(embed, node.text) : embedFrame(resolved, baseUrl, node.text);

          if (player) {
            player.loading = 'lazy';
          }
        }

        if (player) {
          const figure = this.figure('video', node.video.caption);
          figure.prepend(player);

          if (onViewMedia) {
            figure.appendChild(this.expandButton(figure, (event, startAt) => onViewMedia(node, 'video', event, startAt)));
          }

          figures.push(figure);
        }
      }
    }

    if (hasMediaSource(node.embed) && !hasMediaSource(node.video)) {
      const frame = embedFrame(node.embed.src, baseUrl, node.text);

      if (frame) {
        frame.loading = 'lazy';
        const figure = this.figure('embed', node.embed.caption);
        figure.prepend(frame);
        figures.push(figure);
      }
    }

    return figures;
  }

  /**
   * The button that moves a video to the media viewer. The sheet's own
   * player stops first; a video file goes on from where it was.
   */
  private expandButton(figure: HTMLElement, expand: (event: MouseEvent, startAt?: number) => void): HTMLButtonElement {
    const button = element('button', 'orbit-sheet__expand');
    button.type = 'button';
    button.setAttribute('aria-label', this.words.text('expandVideo'));
    button.append(createIcon('expand'), document.createTextNode(this.words.text('expand')));

    button.addEventListener('click', (event) => {
      let startAt: number | undefined;
      const video = figure.querySelector('video');

      if (video) {
        startAt = video.currentTime > 0 ? video.currentTime : undefined;
        video.pause();
      }

      // A frame stops playing only by loading again.
      const frame = figure.querySelector('iframe');
      frame?.replaceWith(frame.cloneNode(true));
      expand(event, startAt);
    });

    return button;
  }

  private figure(section: DetailSection, caption: string | undefined): HTMLElement {
    const figure = element('figure', 'orbit-sheet__media');
    figure.dataset.section = section;

    if (caption) {
      const text = element('figcaption', '');
      text.textContent = caption;
      figure.appendChild(text);
    }

    return figure;
  }
}

/** Maps a free-text status onto a theme color: active, done, blocked, todo or neutral. */
export const statusTone = (status: string): 'active' | 'done' | 'blocked' | 'todo' | 'neutral' => {
  const value = status.trim().toLowerCase();

  if (/^(done|complete|completed|shipped|finished|closed)$/.test(value)) {
    return 'done';
  }

  if (/^(active|doing|in[ -]?progress|wip|started|ongoing)$/.test(value)) {
    return 'active';
  }

  if (/^(blocked|stuck|at[ -]?risk|failed)$/.test(value)) {
    return 'blocked';
  }

  if (/^(todo|to[ -]?do|planned|backlog|next|open)$/.test(value)) {
    return 'todo';
  }

  return 'neutral';
};

const element = <Name extends keyof HTMLElementTagNameMap>(name: Name, className: string): HTMLElementTagNameMap[Name] => {
  const created = document.createElement(name);

  if (className) {
    created.className = className;
  }

  return created;
};

const isEditable = (target: EventTarget | null): boolean => {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|IFRAME|VIDEO)$/.test(target.tagName));
};
