/**
 * The words Orbit shows and says: the controls, the detail sheet, the
 * outline and what it announces, what a screen reader hears about each
 * idea, the media viewer and the empty map. English and Spanish are built
 * in; `registerLanguage` adds others, or changes words of one Orbit has.
 *
 * A map speaks the language its `language` option names, or else the one
 * its element is in: the closest `lang` attribute around it, through shadow
 * roots, then the document's. A language Orbit doesn't have falls back to
 * its base (es-MX reads es), then to English.
 */

/**
 * Text that depends on a number: one form for each plural category the
 * language uses (see `Intl.PluralRules`), `other` for any it leaves out.
 * `{count}` is the number, written the language's way.
 */
export interface OrbitPluralText {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

/**
 * Everything Orbit says, in one language. `{name}`-style placeholders are
 * filled in as described on each; keep them in a translation, in any order.
 */
export interface OrbitStrings {
  /** The map's name for assistive technology, and an exported SVG's title, when it has no `ariaLabel` and its root no text. */
  mindMap: string;

  /** What assistive technology calls the map (`aria-roledescription`), in lower case. */
  mindMapRole: string;

  /** An idea with no text, wherever its name shows. */
  untitled: string;

  /** The root Orbit makes up for a map that's just a list, or has several top headings, and no title. */
  untitledMap: string;

  /** The message on a map with nothing in it. */
  emptyMap: string;

  /** The hint under it. */
  emptyMapHint: string;

  /** The title of the card shown where a map couldn't be drawn. */
  mapNotDrawn: string;

  /** The card's message when the problem came with none of its own. */
  mapNotDrawnReason: string;

  /** The card's message for a problem on a line of the map's source: `{line}` and `{message}`, which stays as Orbit wrote it. */
  problemOnLine: string;

  /** The breadcrumbs, for assistive technology. */
  mapPath: string;

  /** The back button, when the idea it goes back to has no name. */
  back: string;

  /** The back button's label: `{name}` is the idea it goes back to. */
  backTo: string;

  /** The back button's label when that idea has no text. */
  backToParent: string;

  /** The group of view buttons. */
  view: string;

  /** The button that shows the focused idea with the ideas around it. */
  focus: string;

  /** The button that shows the whole map at once. */
  overview: string;

  /** The button that shows the map as a list. */
  showOutline: string;

  /** The group of zoom buttons. */
  zoom: string;

  zoomIn: string;
  zoomOut: string;

  /** The button that zooms to fit the view. */
  fitMap: string;

  /** Shown when the wheel scrolls the page over a map: `{key}` is Ctrl, or ⌘ on Apple devices. */
  scrollToZoom: string;

  /** The map as a list, for assistive technology. */
  outline: string;

  /** Announced when the overview opens. */
  overviewAnnouncement: string;

  /** How many ideas an idea holds, as announced and in its description: `{count}`. */
  ideaCount: OrbitPluralText;

  /** Announced when an idea is added: `{name}`. */
  added: string;

  /** Announced when an idea is deleted: `{name}`. */
  removed: string;

  /** Announced when an idea moves: `{name}` into `{parent}`. */
  moved: string;

  /** Announced when an idea moves to a parent with no text: `{name}`. */
  movedToTop: string;

  /** `{name}` in those announcements when the idea has no text. */
  anIdea: string;

  /** Part of an idea's description: `{status}` is its status word. */
  status: string;

  /** The status in the tooltip: `{status}`. */
  statusLabel: string;

  /** Part of an idea's description: `{list}` lists what it has, from the words below. */
  has: string;

  hasDetails: string;
  hasNote: string;
  hasImage: string;
  hasVideo: string;
  hasEmbed: string;
  hasLink: string;

  /** The text field over an idea being renamed: `{name}`. */
  textOf: string;

  /** The text field for a new idea: `{name}` is the idea it goes into. */
  newIdeaFor: string;

  /** The empty text field's placeholder for a new idea. */
  newIdea: string;

  /** The + in an orbit: `{name}` is the idea it adds to. */
  addIdeaTo: string;

  /** Where an idea being moved would land: `{name}` is that idea. */
  moveHere: string;

  /** `{name}` in the text fields and the + when the idea has no text. */
  thisIdea: string;

  /** `{name}` in `moveHere` when the idea has no text. */
  theIdea: string;

  /** The buttons under an idea: `{name}`. */
  ideaActions: string;

  /** The buttons under an idea with no text. */
  ideaActionsUntitled: string;

  showDetails: string;
  viewImage: string;

  /** The picture in the detail sheet, which opens the viewer: `{description}` is its alternative text. */
  viewImageOf: string;

  playVideo: string;
  openEmbed: string;
  readNote: string;
  openLink: string;

  /** A link to another idea of the map: `{name}` is that idea, or `theIdea` when it has no text. */
  goTo: string;

  /** The same link printed, where it can't be followed: `{name}` is that idea. */
  seeIdea: string;

  /** The detail sheet's name when the idea has no text. */
  details: string;

  close: string;
  previous: string;
  next: string;

  /** The button that presents a map shared as a web page, one idea at a time with its note as a caption. */
  present: string;

  /** The priority chip: `{priority}`. */
  priority: string;

  /** The button over a video in the detail sheet. */
  expand: string;

  /** That button, for assistive technology. */
  expandVideo: string;

  /** A picture's name in the viewer when it has no description or caption. */
  picture: string;

  /** A video's name in the viewer when it has no caption. */
  video: string;

  /** Where the viewer is among the map's pictures and videos: `{index}` of `{total}`. */
  position: string;

  /** The viewer's button that zooms the picture to fit. */
  fitPicture: string;

  pictureUnavailable: string;
  videoUnavailable: string;

  /** A video its site doesn't let other pages play. */
  videoUnavailableHere: string;

  openPictureInNewTab: string;
  openVideoInNewTab: string;

  /** A video's link to its site: `{provider}` is YouTube or Vimeo. */
  watchOn: string;
}

type TextKey = { [Key in keyof OrbitStrings]: OrbitStrings[Key] extends string ? Key : never }[keyof OrbitStrings];
type CountKey = { [Key in keyof OrbitStrings]: OrbitStrings[Key] extends OrbitPluralText ? Key : never }[keyof OrbitStrings];
type Values = Record<string, string | number>;

const ENGLISH: OrbitStrings = {
  mindMap: 'Mind map',
  mindMapRole: 'mind map',
  untitled: 'Untitled',
  untitledMap: 'Untitled map',
  emptyMap: 'This map is empty',
  emptyMapHint: 'Start it with a # heading or a bullet list',
  mapNotDrawn: 'This map couldn’t be drawn',
  mapNotDrawnReason: 'The map could not be drawn.',
  problemOnLine: 'Line {line}: {message}',

  mapPath: 'Map path',
  back: 'Back',
  backTo: 'Back to {name}',
  backToParent: 'Back to the parent node',
  view: 'View',
  focus: 'Focus',
  overview: 'Overview',
  showOutline: 'Show the map as a list',
  zoom: 'Zoom',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fitMap: 'Fit the map',
  scrollToZoom: 'Use {key} + scroll to zoom the map',

  outline: 'Map outline',
  overviewAnnouncement: 'Overview of the whole map',
  ideaCount: { one: '{count} item', other: '{count} items' },
  added: 'Added {name}',
  removed: 'Removed {name}',
  moved: 'Moved {name} to {parent}',
  movedToTop: 'Moved {name} to the top',
  anIdea: 'a node',

  status: 'status {status}',
  statusLabel: 'Status: {status}',
  has: 'has {list}',
  hasDetails: 'details',
  hasNote: 'note',
  hasImage: 'image',
  hasVideo: 'video',
  hasEmbed: 'embed',
  hasLink: 'link',

  textOf: 'Text of {name}',
  newIdeaFor: 'New idea for {name}',
  newIdea: 'New idea',
  addIdeaTo: 'Add an idea to {name}',
  moveHere: 'Move {name} here',
  thisIdea: 'this node',
  theIdea: 'the idea',

  ideaActions: '{name} actions',
  ideaActionsUntitled: 'Node actions',
  showDetails: 'Show details',
  viewImage: 'View image',
  viewImageOf: 'View image: {description}',
  playVideo: 'Play video',
  openEmbed: 'Open embed',
  readNote: 'Read note',
  openLink: 'Open link',
  goTo: 'Go to {name}',
  seeIdea: 'See {name}',
  details: 'Details',
  close: 'Close',
  previous: 'Previous',
  next: 'Next',
  present: 'Present',
  priority: 'Priority {priority}',
  expand: 'Expand',
  expandVideo: 'Expand the video',

  picture: 'Picture',
  video: 'Video',
  position: '{index} of {total}',
  fitPicture: 'Fit the picture',
  pictureUnavailable: 'This picture can’t be shown.',
  videoUnavailable: 'This video can’t be played.',
  videoUnavailableHere: 'This video can’t be played here.',
  openPictureInNewTab: 'Open the picture in a new tab',
  openVideoInNewTab: 'Open the video in a new tab',
  watchOn: 'Watch on {provider}',
};

const SPANISH: OrbitStrings = {
  mindMap: 'Mapa mental',
  mindMapRole: 'mapa mental',
  untitled: 'Sin título',
  untitledMap: 'Mapa sin título',
  emptyMap: 'Este mapa está vacío',
  emptyMapHint: 'Empiézalo con un encabezado # o una lista con viñetas',
  mapNotDrawn: 'No se pudo dibujar este mapa',
  mapNotDrawnReason: 'No se pudo dibujar el mapa.',
  problemOnLine: 'Línea {line}: {message}',

  mapPath: 'Ruta del mapa',
  back: 'Atrás',
  backTo: 'Volver a {name}',
  backToParent: 'Volver a la idea superior',
  view: 'Vista',
  focus: 'Enfoque',
  overview: 'Vista general',
  showOutline: 'Mostrar el mapa como lista',
  zoom: 'Zoom',
  zoomIn: 'Acercar',
  zoomOut: 'Alejar',
  fitMap: 'Ajustar el mapa',
  scrollToZoom: 'Usa {key} + desplazamiento para acercar o alejar el mapa',

  outline: 'Esquema del mapa',
  overviewAnnouncement: 'Vista general de todo el mapa',
  ideaCount: { one: '{count} idea', many: '{count} ideas', other: '{count} ideas' },
  added: 'Se agregó {name}',
  removed: 'Se eliminó {name}',
  moved: 'Se movió {name} a {parent}',
  movedToTop: 'Se movió {name} al nivel superior',
  anIdea: 'una idea',

  status: 'estado {status}',
  statusLabel: 'Estado: {status}',
  has: 'tiene {list}',
  hasDetails: 'detalles',
  hasNote: 'nota',
  hasImage: 'imagen',
  hasVideo: 'video',
  hasEmbed: 'contenido insertado',
  hasLink: 'enlace',

  textOf: 'Texto de {name}',
  newIdeaFor: 'Idea nueva en {name}',
  newIdea: 'Idea nueva',
  addIdeaTo: 'Agregar una idea a {name}',
  moveHere: 'Mover {name} aquí',
  thisIdea: 'esta idea',
  theIdea: 'la idea',

  ideaActions: 'Acciones de {name}',
  ideaActionsUntitled: 'Acciones de la idea',
  showDetails: 'Ver detalles',
  viewImage: 'Ver imagen',
  viewImageOf: 'Ver imagen: {description}',
  playVideo: 'Reproducir video',
  openEmbed: 'Abrir contenido insertado',
  readNote: 'Leer nota',
  openLink: 'Abrir enlace',
  goTo: 'Ir a {name}',
  seeIdea: 'Ver {name}',
  details: 'Detalles',
  close: 'Cerrar',
  previous: 'Anterior',
  next: 'Siguiente',
  present: 'Presentar',
  priority: 'Prioridad {priority}',
  expand: 'Ampliar',
  expandVideo: 'Ampliar el video',

  picture: 'Imagen',
  video: 'Video',
  position: '{index} de {total}',
  fitPicture: 'Ajustar la imagen',
  pictureUnavailable: 'No se puede mostrar esta imagen.',
  videoUnavailable: 'No se puede reproducir este video.',
  videoUnavailableHere: 'Este video no se puede reproducir aquí.',
  openPictureInNewTab: 'Abrir la imagen en una pestaña nueva',
  openVideoInNewTab: 'Abrir el video en una pestaña nueva',
  watchOn: 'Ver en {provider}',
};

const BUILT_IN = new Map<string, OrbitStrings>([['en', ENGLISH], ['es', SPANISH]]);
const registered = new Map<string, OrbitStrings>(BUILT_IN);
const KEYS = Object.keys(ENGLISH) as (keyof OrbitStrings)[];
const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

/**
 * Adds a language for every map, by its BCP 47 tag (`fr`, `pt-BR`), or
 * changes some words of one Orbit has. Words it leaves out come from the
 * language it narrows (`pt` for `pt-BR`), then English. Returns a function
 * that puts the language back as it was.
 */
export const registerLanguage = (language: string, strings: Partial<OrbitStrings>): () => void => {
  const tag = canonicalTag(language);

  if (tag === null) {
    throw new Error(`"${language}" isn't a language tag: use one like "fr", "pt-BR" or "zh-Hant".`);
  }

  const previous = registered.get(tag);
  const definition: OrbitStrings = { ...(previous ?? registered.get(baseOf(tag)) ?? ENGLISH), ...validStrings(strings, tag) };
  registered.set(tag, definition);

  return () => {
    if (registered.get(tag) !== definition) {
      return;
    }

    if (previous) {
      registered.set(tag, previous);
    } else {
      registered.delete(tag);
    }
  };
};

/** The tags of the languages every map can speak: the built-in ones and the registered ones. */
export const languageTags = (): string[] => {
  return [...registered.keys()];
};

/**
 * The language an element is in: the closest `lang` attribute around it,
 * through shadow roots, then the document's. Null when none says.
 */
export const languageOf = (element: Element | null | undefined): string | null => {
  let node: Node | null = element ?? null;

  while (node) {
    if (node.nodeType === 1) {
      const lang = (node as Element).getAttribute('lang');

      if (lang) {
        return lang;
      }
    }

    node = node.parentNode ?? ((node as ShadowRoot).host ?? null);
  }

  return element?.ownerDocument?.documentElement?.getAttribute('lang') || null;
};

/** The words of one map: its language's, with the `strings` it was given on top. */
export class OrbitWords {
  /** The tag of the language the words come from: `es` for a map asked for `es-MX`. */
  readonly language: string;

  /** The tag numbers, plurals and lists are written for: `es-MX` there. */
  readonly locale: string;

  private readonly table: OrbitStrings;

  constructor(requested?: string | null, strings?: Partial<OrbitStrings>) {
    const tag = requested ? canonicalTag(requested) : null;
    this.language = tag === null ? 'en' : registered.has(tag) ? tag : registered.has(baseOf(tag)) ? baseOf(tag) : 'en';
    this.locale = tag !== null && (tag === this.language || baseOf(tag) === this.language) ? tag : this.language;
    const table = registered.get(this.language) ?? ENGLISH;
    this.table = strings ? { ...table, ...validStrings(strings, 'strings') } : table;
  }

  /** Whether these words are the same as `other`'s: the same language and the same table. */
  sameAs(other: OrbitWords | null): boolean {
    return other !== null && other.locale === this.locale && other.table === this.table;
  }

  text(key: TextKey, values?: Values): string {
    return this.fill(this.table[key], values);
  }

  /** A text with a number in it, in the form the number takes in the language. */
  count(key: CountKey, count: number, values?: Values): string {
    const forms = this.table[key];
    const category = pluralRules(this.locale)?.select(count) ?? (count === 1 ? 'one' : 'other');
    return this.fill(forms[category] ?? forms.other, { ...values, count });
  }

  /** Items as the language lists them: "a, b and c". */
  list(items: string[]): string {
    const format = listFormat(this.locale);
    return format ? format.format(items) : items.join(', ');
  }

  number(value: number): string {
    return numberFormat(this.locale)?.format(value) ?? String(value);
  }

  private fill(template: string, values?: Values): string {
    if (!values) {
      return template;
    }

    return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
      const value = values[name];

      if (value === undefined) {
        return placeholder;
      }

      return typeof value === 'number' ? this.number(value) : value;
    });
  }
}

/** The words a map speaks when it's asked for `requested`, or for the language around `element`. */
export const wordsFor = (requested: string | undefined, element: Element | null | undefined, strings?: Partial<OrbitStrings>): OrbitWords => {
  return new OrbitWords(requested ?? languageOf(element), strings);
};

/** Only known keys with the right kind of value: a mistake in one word shouldn't break the map. */
const validStrings = (strings: Partial<OrbitStrings>, source: string): Partial<OrbitStrings> => {
  const valid: Partial<Record<keyof OrbitStrings, unknown>> = {};

  if (!strings || typeof strings !== 'object') {
    return valid as Partial<OrbitStrings>;
  }

  for (const [key, value] of Object.entries(strings)) {
    if (!KEYS.includes(key as keyof OrbitStrings)) {
      warnOnce(`${source}: Orbit has no words called "${key}".`);
      continue;
    }

    const plural = typeof ENGLISH[key as keyof OrbitStrings] !== 'string';

    if (!plural && typeof value === 'string') {
      valid[key as keyof OrbitStrings] = value;
    } else if (plural && isPluralText(value)) {
      valid[key as keyof OrbitStrings] = pluralText(value);
    } else if (plural && typeof value === 'string') {
      valid[key as keyof OrbitStrings] = { other: value };
    } else {
      warnOnce(`${source}: "${key}" should be ${plural ? 'an object of plural forms with at least "other"' : 'a string'}.`);
    }
  }

  return valid as Partial<OrbitStrings>;
};

const isPluralText = (value: unknown): value is OrbitPluralText => {
  return typeof value === 'object' && value !== null && typeof (value as OrbitPluralText).other === 'string';
};

const pluralText = (value: OrbitPluralText): OrbitPluralText => {
  const forms: OrbitPluralText = { other: value.other };

  for (const category of PLURAL_CATEGORIES) {
    if (typeof value[category] === 'string') {
      forms[category] = value[category];
    }
  }

  return forms;
};

const canonicalTag = (language: string): string | null => {
  if (typeof language !== 'string' || language.trim() === '') {
    return null;
  }

  try {
    const [tag] = Intl.getCanonicalLocales(language.trim().replace(/_/g, '-'));
    return tag ?? null;
  } catch {
    return null;
  }
};

const baseOf = (tag: string): string => {
  return tag.split('-')[0];
};

const warned = new Set<string>();

const warnOnce = (message: string): void => {
  if (!warned.has(message)) {
    warned.add(message);
    console.warn(`[orbit] ${message}`);
  }
};

const pluralRulesCache = new Map<string, Intl.PluralRules | null>();
const numberFormatCache = new Map<string, Intl.NumberFormat | null>();
const listFormatCache = new Map<string, Intl.ListFormat | null>();

const pluralRules = (locale: string): Intl.PluralRules | null => {
  return cached(pluralRulesCache, locale, () => new Intl.PluralRules(locale));
};

const numberFormat = (locale: string): Intl.NumberFormat | null => {
  return cached(numberFormatCache, locale, () => new Intl.NumberFormat(locale));
};

const listFormat = (locale: string): Intl.ListFormat | null => {
  return cached(listFormatCache, locale, () => (typeof Intl.ListFormat === 'function' ? new Intl.ListFormat(locale, { type: 'conjunction' }) : null));
};

const cached = <Value>(cache: Map<string, Value | null>, locale: string, make: () => Value | null): Value | null => {
  if (!cache.has(locale)) {
    try {
      cache.set(locale, make());
    } catch {
      cache.set(locale, null);
    }
  }

  return cache.get(locale) ?? null;
};
