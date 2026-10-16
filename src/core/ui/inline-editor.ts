/**
 * The field for typing a node's text on the map: a textarea laid over the
 * node each frame, in the label's font, size and color. Enter saves, Escape
 * cancels, and leaving the field saves.
 */

import type { NodeRole } from '../engine/scene.js';

export interface InlineEditorCallbacks {
  /** Enter, or the field losing focus: keep `text`. */
  onSave(text: string, how: 'enter' | 'blur'): void;

  /** Escape. */
  onCancel(): void;

  /** Tab (`back` for Shift+Tab), with `text` typed. Returns whether it was used; if not, Tab moves keyboard focus as usual. */
  onTab(text: string, back: boolean): boolean;
}

/** Where the field goes this frame: centered on a node, in screen pixels. */
export interface EditorPlacement {
  x: number;
  y: number;

  /** The width text gets inside the node. */
  width: number;

  /** The label's font size, which the text takes on. */
  fontSize: number;

  /** The tallest the field grows before it scrolls. */
  maxHeight: number;

  role: NodeRole;

  /** Light text, on a dark node. */
  light: boolean;

  /** A new idea, in the + rather than a node. */
  slot: boolean;

  /** Over a node too small to hold it, on a card of its own. */
  floating: boolean;

  /** How far below its center (px) the field may reach: the top of the node's "+N", which the field rises to keep clear of as it grows. */
  lowest?: number;
}

export interface EditorText {
  /** What the field is for, for assistive technology. */
  label: string;

  placeholder: string;

  /** The label of a phone keyboard's Enter key: `next` while ideas keep coming, `done` otherwise. */
  enterKey: 'next' | 'done';
}

/** The field's font size: 16 px or more, so phones don't zoom into it. It is scaled down to the label's size. */
const FIELD_FONT_SIZE = 16;

export class InlineEditor {
  readonly element: HTMLTextAreaElement;
  private readonly callbacks: InlineEditorCallbacks;
  private open = false;

  /** Closing blurs the field: that blur is no save. */
  private closing = false;

  /** One Enter can arrive as a key and as a line break: a second one straight after, with nothing typed between, is ignored. */
  private savedAt = -Infinity;

  private typedSinceSave = true;

  /** The size and style last applied, and the position, so frames that change nothing touch no styles. */
  private look = '';

  private position = '';

  /** Where the field was last placed (null while it's out of sight), to move it again when it grows. */
  private placement: EditorPlacement | null = null;

  /** The field's height (px, unscaled) as it last grew to fit its text. */
  private height = 0;

  constructor(callbacks: InlineEditorCallbacks) {
    this.callbacks = callbacks;
    const field = document.createElement('textarea');
    field.className = 'orbit-editor';
    field.rows = 1;
    field.hidden = true;
    field.setAttribute('autocapitalize', 'sentences');
    field.addEventListener('keydown', this.handleKeyDown);
    field.addEventListener('beforeinput', this.handleBeforeInput);
    field.addEventListener('input', this.handleInput);
    field.addEventListener('blur', this.handleBlur);
    this.element = field;
  }

  get isOpen(): boolean {
    return this.open;
  }

  get value(): string {
    return this.element.value;
  }

  get hasFocus(): boolean {
    return this.element.ownerDocument.activeElement === this.element;
  }

  /** Shows the field holding `value`, all selected, with the cursor in it. */
  show(value: string, text: EditorText): void {
    const field = this.element;
    this.describe(text);
    field.value = value;
    field.hidden = false;
    this.open = true;
    this.look = '';
    this.position = '';
    this.placement = null;
    // Out of sight until `place` puts it over its node: a node flying into view is placed only once it shows.
    field.style.opacity = '0';
    this.fit();
    field.focus({ preventScroll: true });
    field.select();
  }

  /** Empties the field for the next idea. The cursor stays, and with it a phone's keyboard. */
  clear(text: EditorText): void {
    this.describe(text);
    this.element.value = '';
    this.fit();
    this.move();
  }

  hide(): void {
    if (!this.open) {
      return;
    }

    this.open = false;
    this.closing = true;

    if (this.hasFocus) {
      this.element.blur();
    }

    this.closing = false;
    this.element.hidden = true;
  }

  /** Lays the field over its node, or keeps it out of sight (and focused) while the node isn't shown. */
  place(placement: EditorPlacement | null): void {
    const field = this.element;
    this.placement = placement;

    if (!placement) {
      if (this.position !== '') {
        field.style.opacity = '0';
        this.position = '';
      }

      return;
    }

    const scale = placement.fontSize / FIELD_FONT_SIZE;
    const look = [placement.width, placement.fontSize, placement.maxHeight, placement.role, placement.light, placement.slot, placement.floating].join('|');

    if (look !== this.look) {
      this.look = look;
      field.style.width = `${round(placement.width / scale)}px`;
      field.style.maxHeight = `${round(placement.maxHeight / scale)}px`;
      field.classList.toggle('orbit-editor--sun', placement.role === 'sun');
      field.classList.toggle('orbit-editor--light', placement.light);
      field.classList.toggle('orbit-editor--slot', placement.slot);
      field.classList.toggle('orbit-editor--floating', placement.floating);
      this.fit();
    }

    this.move();
  }

  private describe(text: EditorText): void {
    this.element.setAttribute('aria-label', text.label);
    this.element.placeholder = text.placeholder;
    this.element.setAttribute('enterkeyhint', text.enterKey);
  }

  /** Centers the field over its node, risen as far as it must to keep clear of the node's "+N". */
  private move(): void {
    const placement = this.placement;

    if (!placement) {
      return;
    }

    const scale = placement.fontSize / FIELD_FONT_SIZE;
    const height = Math.min(this.height * scale, placement.maxHeight);
    const rise = placement.lowest === undefined ? 0 : Math.max(0, height / 2 - placement.lowest);
    const position = `translate3d(${round(placement.x)}px, ${round(placement.y - rise)}px, 0) translate(-50%, -50%) scale(${round(scale, 4)})`;

    if (position !== this.position) {
      if (this.position === '') {
        this.element.style.opacity = '';
      }

      this.element.style.transform = position;
      this.position = position;
    }
  }

  /** Grows the field with its text. */
  private fit(): void {
    const field = this.element;
    field.style.height = 'auto';
    this.height = field.scrollHeight;
    field.style.height = `${this.height}px`;
  }

  private save(): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    if (!this.typedSinceSave && now - this.savedAt < 50) {
      return;
    }

    this.savedAt = now;
    this.typedSinceSave = false;
    this.callbacks.onSave(this.element.value, 'enter');
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.callbacks.onCancel();
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.save();
      return;
    }

    if (event.key === 'Tab' && !event.isComposing && !event.altKey && !event.ctrlKey && !event.metaKey && this.callbacks.onTab(this.element.value, event.shiftKey)) {
      event.preventDefault();
    }
  };

  // Phone keyboards send their Enter key as a line break.
  private readonly handleBeforeInput = (event: InputEvent): void => {
    if (event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph') {
      event.preventDefault();
      this.save();
    }
  };

  // A title is one line: pasted line breaks become spaces.
  private readonly handleInput = (): void => {
    this.typedSinceSave = true;
    const field = this.element;

    if (/[\r\n]/.test(field.value)) {
      field.value = field.value.replace(/\s*[\r\n]+\s*/g, ' ');
    }

    this.fit();
    this.move();
  };

  private readonly handleBlur = (): void => {
    if (this.open && !this.closing) {
      this.callbacks.onSave(this.element.value, 'blur');
    }
  };
}

const round = (value: number, decimals = 1): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};
