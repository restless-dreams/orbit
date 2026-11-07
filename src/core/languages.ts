/**
 * The words Orbit shows and says: the controls, the detail sheet, the
 * outline and what it announces, what a screen reader hears about each
 * idea, the media viewer and the empty map. English, Spanish and Brazilian
 * Portuguese are built in; `registerLanguage` adds others, or changes words
 * of one Orbit has.
 *
 * A map speaks the language its `language` option names, or else the one
 * its element is in: the closest `lang` attribute around it, through shadow
 * roots, then the document's. A language Orbit doesn't have falls back to
 * its base (es-MX reads es, pt-PT reads pt), then to English.
 */

import { daysUntil, dueStart, dueText, type OrbitDue } from './dates.js';

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

  /** How many ideas are hidden under an idea (see `hideChildren`), as announced and in the outline: `{count}`. */
  hiddenIdeaCount: OrbitPluralText;

  /** Announced when the ideas hidden under the idea in focus are shown: `{name}` is that idea, and `{list}` names them. */
  revealed: string;

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

  /** Part of an idea's description: `{status}` is its status, as `statusName` says it. */
  status: string;

  /** The status in the tooltip: `{status}`. */
  statusLabel: string;

  /** A status a file writes as `todo`, as people read it. Other status words are said as written. */
  statusTodo: string;

  /** A status written `active`. */
  statusActive: string;

  /** A status written `done`. */
  statusDone: string;

  /** A status written `blocked`. */
  statusBlocked: string;

  /** Part of an idea's description: `{date}` is its date (see `OrbitWords.fullDate`). */
  date: string;

  /** An idea's date in the tooltip and, for assistive technology, in the detail sheet: `{date}`. */
  dateLabel: string;

  /** Part of an idea's description, after its date, once the date is past and the idea isn't done. */
  overdue: string;

  /** `dateLabel` once the date is past and the idea isn't done: `{date}`. */
  overdueLabel: string;

  /** A date on a planet, when it's today (and has no time: one today shows its time). */
  today: string;

  /** A date on a planet, when it's tomorrow. */
  tomorrow: string;

  /** A date on a planet, when it was yesterday. */
  yesterday: string;

  /** Part of an idea's description: `{list}` lists what it has, from the words below. */
  has: string;

  hasDetails: string;
  hasNote: string;
  hasImage: string;
  hasVideo: string;
  hasAudio: string;
  hasEmbed: string;
  hasLink: string;

  /** How many files an idea holds, in its description and the outline: `{count}`. */
  fileCount: OrbitPluralText;

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

  /** A live photo in the detail sheet, which opens the viewer, when it has no alternative text. */
  viewLivePhoto: string;

  /** A live photo in the detail sheet: `{description}` is its alternative text. */
  viewLivePhotoOf: string;

  playVideo: string;
  playAudio: string;
  openEmbed: string;
  readNote: string;
  openLink: string;

  /** The button under an idea that shows its files. */
  showFiles: string;

  /** The heading over an idea's files in the detail sheet and prints. */
  files: string;

  /** A file in the detail sheet, which opens it: `{name}` is its name. */
  openFile: string;

  /** Under the files in the detail sheet when they can't be opened from there (see `openFiles`), as in a web page made without them. */
  filesStayed: string;

  /** The kinds of file the detail sheet and prints name under a file's name, beside its size. A kind Orbit doesn't name is its extension in capitals. */
  filePdf: string;

  fileDocument: string;
  fileSpreadsheet: string;
  filePresentation: string;
  fileImage: string;
  fileVideo: string;
  fileAudio: string;
  fileArchive: string;
  fileText: string;

  /** A file of no kind Orbit names, without an extension. */
  fileOther: string;

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

  /** The button over a video or a sound in the detail sheet, which moves it to the media viewer. */
  expand: string;

  /** That button over a video, for assistive technology. */
  expandVideo: string;

  /** That button over a sound, for assistive technology. */
  expandAudio: string;

  /** A picture's name in the viewer when it has no description or caption. */
  picture: string;

  /** A video's name in the viewer when it has no caption. */
  video: string;

  /** A sound's name in the viewer and the detail sheet when it has no caption. */
  audio: string;

  /** Where the viewer is among the map's pictures and videos: `{index}` of `{total}`. */
  position: string;

  /** The viewer's button that zooms the picture to fit. */
  fitPicture: string;

  /**
   * The mark on a live photo, a picture with the few seconds of video a
   * phone records around it, in the viewer and the detail sheet: a word or
   * two, as phones show it.
   */
  live: string;

  /** A live photo's mark in the viewer, the button that plays its motion, for assistive technology: keep the mark's words (`live`) in it. */
  playLivePhoto: string;

  /** The tooltip of a live photo's mark in the viewer, which screen readers read after its name. */
  holdToPlay: string;

  pictureUnavailable: string;
  videoUnavailable: string;
  audioUnavailable: string;

  /** A video its site doesn't let other pages play. */
  videoUnavailableHere: string;

  openPictureInNewTab: string;
  openVideoInNewTab: string;
  openAudioInNewTab: string;

  /** A sound player's play button, while it's paused. */
  play: string;

  pause: string;
  mute: string;
  unmute: string;

  /** The player's buttons that go back and on: `{count}` seconds. */
  skipBack: OrbitPluralText;

  skipForward: OrbitPluralText;

  /** The slider that moves a sound to another time. */
  playbackPosition: string;

  /** Where a sound is, for screen readers: `{time}` of `{duration}`. */
  timeOf: string;

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
  backToParent: 'Back to the idea above',
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
  hiddenIdeaCount: { one: '{count} hidden idea', other: '{count} hidden ideas' },
  revealed: '{name}: {list}',
  added: 'Added {name}',
  removed: 'Deleted {name}',
  moved: 'Moved {name} to {parent}',
  movedToTop: 'Moved {name} to the top',
  anIdea: 'an idea',

  status: 'status: {status}',
  statusLabel: 'Status: {status}',
  statusTodo: 'To do',
  statusActive: 'In progress',
  statusDone: 'Done',
  statusBlocked: 'Blocked',
  date: 'date: {date}',
  dateLabel: 'Date: {date}',
  overdue: 'overdue',
  overdueLabel: 'Overdue: {date}',
  today: 'Today',
  tomorrow: 'Tomorrow',
  yesterday: 'Yesterday',
  has: 'has {list}',
  hasDetails: 'details',
  hasNote: 'note',
  hasImage: 'picture',
  hasVideo: 'video',
  hasAudio: 'sound',
  hasEmbed: 'web page',
  hasLink: 'link',
  fileCount: { one: '{count} file', other: '{count} files' },

  textOf: 'Text of {name}',
  newIdeaFor: 'New idea for {name}',
  newIdea: 'New idea',
  addIdeaTo: 'Add an idea to {name}',
  moveHere: 'Move {name} here',
  thisIdea: 'this idea',
  theIdea: 'the idea',

  ideaActions: '{name} actions',
  ideaActionsUntitled: 'Idea actions',
  showDetails: 'Show details',
  viewImage: 'View picture',
  viewImageOf: 'View picture: {description}',
  viewLivePhoto: 'View live photo',
  viewLivePhotoOf: 'View live photo: {description}',
  playVideo: 'Play video',
  playAudio: 'Play sound',
  openEmbed: 'Open web page',
  readNote: 'Read note',
  openLink: 'Open link',
  showFiles: 'Show files',
  files: 'Files',
  openFile: 'Open {name}',
  filesStayed: 'The files stayed with the map: they aren’t in this page.',
  filePdf: 'PDF',
  fileDocument: 'Document',
  fileSpreadsheet: 'Spreadsheet',
  filePresentation: 'Presentation',
  fileImage: 'Picture',
  fileVideo: 'Video',
  fileAudio: 'Sound',
  fileArchive: 'Archive',
  fileText: 'Text',
  fileOther: 'File',
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
  expandAudio: 'Expand the sound',

  picture: 'Picture',
  video: 'Video',
  audio: 'Sound',
  position: '{index} of {total}',
  fitPicture: 'Fit the picture',
  live: 'Live',
  playLivePhoto: 'Play the live photo',
  holdToPlay: 'Hold to play',
  pictureUnavailable: 'This picture can’t be shown.',
  videoUnavailable: 'This video can’t be played.',
  audioUnavailable: 'This sound can’t be played.',
  videoUnavailableHere: 'This video can’t be played here.',
  openPictureInNewTab: 'Open the picture in a new tab',
  openVideoInNewTab: 'Open the video in a new tab',
  openAudioInNewTab: 'Open the sound in a new tab',
  play: 'Play',
  pause: 'Pause',
  mute: 'Turn the sound off',
  unmute: 'Turn the sound on',
  skipBack: { one: 'Back {count} second', other: 'Back {count} seconds' },
  skipForward: { one: 'Forward {count} second', other: 'Forward {count} seconds' },
  playbackPosition: 'Position',
  timeOf: '{time} of {duration}',
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
  hiddenIdeaCount: { one: '{count} idea oculta', many: '{count} ideas ocultas', other: '{count} ideas ocultas' },
  revealed: '{name}: {list}',
  added: 'Se agregó {name}',
  removed: 'Se eliminó {name}',
  moved: 'Se movió {name} a {parent}',
  movedToTop: 'Se movió {name} al nivel superior',
  anIdea: 'una idea',

  status: 'estado: {status}',
  statusLabel: 'Estado: {status}',
  statusTodo: 'Por hacer',
  statusActive: 'En curso',
  statusDone: 'Hecho',
  statusBlocked: 'Bloqueado',
  date: 'fecha: {date}',
  dateLabel: 'Fecha: {date}',
  overdue: 'vencida',
  overdueLabel: 'Vencida: {date}',
  today: 'Hoy',
  tomorrow: 'Mañana',
  yesterday: 'Ayer',
  has: 'tiene {list}',
  hasDetails: 'detalles',
  hasNote: 'nota',
  hasImage: 'imagen',
  hasVideo: 'video',
  hasAudio: 'audio',
  hasEmbed: 'página web',
  hasLink: 'enlace',
  fileCount: { one: '{count} archivo', many: '{count} archivos', other: '{count} archivos' },

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
  viewLivePhoto: 'Ver foto en vivo',
  viewLivePhotoOf: 'Ver foto en vivo: {description}',
  playVideo: 'Reproducir video',
  playAudio: 'Reproducir audio',
  openEmbed: 'Abrir página web',
  readNote: 'Leer nota',
  openLink: 'Abrir enlace',
  showFiles: 'Ver archivos',
  files: 'Archivos',
  openFile: 'Abrir {name}',
  filesStayed: 'Los archivos se quedaron con el mapa: no están en esta página.',
  filePdf: 'PDF',
  fileDocument: 'Documento',
  fileSpreadsheet: 'Hoja de cálculo',
  filePresentation: 'Presentación',
  fileImage: 'Imagen',
  fileVideo: 'Video',
  fileAudio: 'Audio',
  fileArchive: 'Archivo comprimido',
  fileText: 'Texto',
  fileOther: 'Archivo',
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
  expandAudio: 'Ampliar el audio',

  picture: 'Imagen',
  video: 'Video',
  audio: 'Audio',
  position: '{index} de {total}',
  fitPicture: 'Ajustar la imagen',
  live: 'En vivo',
  playLivePhoto: 'Reproducir la foto en vivo',
  holdToPlay: 'Mantén presionado para reproducirla',
  pictureUnavailable: 'No se puede mostrar esta imagen.',
  videoUnavailable: 'No se puede reproducir este video.',
  audioUnavailable: 'No se puede reproducir este audio.',
  videoUnavailableHere: 'Este video no se puede reproducir aquí.',
  openPictureInNewTab: 'Abrir la imagen en una pestaña nueva',
  openVideoInNewTab: 'Abrir el video en una pestaña nueva',
  openAudioInNewTab: 'Abrir el audio en una pestaña nueva',
  play: 'Reproducir',
  pause: 'Pausar',
  mute: 'Silenciar',
  unmute: 'Activar el sonido',
  skipBack: { one: 'Retroceder {count} segundo', many: 'Retroceder {count} segundos', other: 'Retroceder {count} segundos' },
  skipForward: { one: 'Avanzar {count} segundo', many: 'Avanzar {count} segundos', other: 'Avanzar {count} segundos' },
  playbackPosition: 'Posición',
  timeOf: '{time} de {duration}',
  watchOn: 'Ver en {provider}',
};

/** Brazilian Portuguese, which is also Portuguese's: a page in `pt` or `pt-PT` reads it too. */
const PORTUGUESE: OrbitStrings = {
  mindMap: 'Mapa mental',
  mindMapRole: 'mapa mental',
  untitled: 'Sem título',
  untitledMap: 'Mapa sem título',
  emptyMap: 'Este mapa está vazio',
  emptyMapHint: 'Comece com um título # ou uma lista com marcadores',
  mapNotDrawn: 'Não foi possível desenhar este mapa',
  mapNotDrawnReason: 'Não foi possível desenhar o mapa.',
  problemOnLine: 'Linha {line}: {message}',

  mapPath: 'Caminho do mapa',
  back: 'Voltar',
  backTo: 'Voltar para {name}',
  backToParent: 'Voltar para a ideia acima',
  view: 'Visualização',
  focus: 'Foco',
  overview: 'Visão geral',
  showOutline: 'Mostrar o mapa como lista',
  zoom: 'Zoom',
  zoomIn: 'Aumentar o zoom',
  zoomOut: 'Diminuir o zoom',
  fitMap: 'Ajustar o mapa',
  scrollToZoom: 'Use {key} + rolagem para aplicar zoom ao mapa',

  outline: 'Tópicos do mapa',
  overviewAnnouncement: 'Visão geral do mapa inteiro',
  ideaCount: { one: '{count} ideia', many: '{count} ideias', other: '{count} ideias' },
  hiddenIdeaCount: { one: '{count} ideia oculta', many: '{count} ideias ocultas', other: '{count} ideias ocultas' },
  revealed: '{name}: {list}',
  added: 'Ideia adicionada: {name}',
  removed: 'Ideia excluída: {name}',
  moved: 'Ideia movida para {parent}: {name}',
  movedToTop: 'Ideia movida para o nível superior: {name}',
  anIdea: 'sem título',

  status: 'status: {status}',
  statusLabel: 'Status: {status}',
  statusTodo: 'A fazer',
  statusActive: 'Em andamento',
  statusDone: 'Concluído',
  statusBlocked: 'Bloqueado',
  date: 'data: {date}',
  dateLabel: 'Data: {date}',
  overdue: 'atrasada',
  overdueLabel: 'Atrasada: {date}',
  today: 'Hoje',
  tomorrow: 'Amanhã',
  yesterday: 'Ontem',
  has: 'tem {list}',
  hasDetails: 'detalhes',
  hasNote: 'nota',
  hasImage: 'imagem',
  hasVideo: 'vídeo',
  hasAudio: 'áudio',
  hasEmbed: 'página da web',
  hasLink: 'link',
  fileCount: { one: '{count} arquivo', many: '{count} arquivos', other: '{count} arquivos' },

  textOf: 'Texto de {name}',
  newIdeaFor: 'Nova ideia em {name}',
  newIdea: 'Nova ideia',
  addIdeaTo: 'Adicionar uma ideia a {name}',
  moveHere: 'Mover {name} para cá',
  thisIdea: 'esta ideia',
  theIdea: 'a ideia',

  ideaActions: 'Ações de {name}',
  ideaActionsUntitled: 'Ações da ideia',
  showDetails: 'Ver detalhes',
  viewImage: 'Ver imagem',
  viewImageOf: 'Ver imagem: {description}',
  viewLivePhoto: 'Ver foto ao vivo',
  viewLivePhotoOf: 'Ver foto ao vivo: {description}',
  playVideo: 'Reproduzir vídeo',
  playAudio: 'Reproduzir áudio',
  openEmbed: 'Abrir página da web',
  readNote: 'Ler nota',
  openLink: 'Abrir link',
  showFiles: 'Ver arquivos',
  files: 'Arquivos',
  openFile: 'Abrir {name}',
  filesStayed: 'Os arquivos ficaram com o mapa: eles não estão nesta página.',
  filePdf: 'PDF',
  fileDocument: 'Documento',
  fileSpreadsheet: 'Planilha',
  filePresentation: 'Apresentação',
  fileImage: 'Imagem',
  fileVideo: 'Vídeo',
  fileAudio: 'Áudio',
  fileArchive: 'Arquivo compactado',
  fileText: 'Texto',
  fileOther: 'Arquivo',
  goTo: 'Ir para {name}',
  seeIdea: 'Veja {name}',
  details: 'Detalhes',
  close: 'Fechar',
  previous: 'Anterior',
  next: 'Próximo',
  present: 'Apresentar',
  priority: 'Prioridade {priority}',
  expand: 'Expandir',
  expandVideo: 'Expandir o vídeo',
  expandAudio: 'Expandir o áudio',

  picture: 'Imagem',
  video: 'Vídeo',
  audio: 'Áudio',
  position: '{index} de {total}',
  fitPicture: 'Ajustar a imagem',
  live: 'Ao vivo',
  playLivePhoto: 'Reproduzir a foto ao vivo',
  holdToPlay: 'Mantenha pressionado para reproduzir',
  pictureUnavailable: 'Não é possível mostrar esta imagem.',
  videoUnavailable: 'Não é possível reproduzir este vídeo.',
  audioUnavailable: 'Não é possível reproduzir este áudio.',
  videoUnavailableHere: 'Este vídeo não pode ser reproduzido aqui.',
  openPictureInNewTab: 'Abrir a imagem em uma nova guia',
  openVideoInNewTab: 'Abrir o vídeo em uma nova guia',
  openAudioInNewTab: 'Abrir o áudio em uma nova guia',
  play: 'Reproduzir',
  pause: 'Pausar',
  mute: 'Desativar o som',
  unmute: 'Ativar o som',
  skipBack: { one: 'Voltar {count} segundo', many: 'Voltar {count} segundos', other: 'Voltar {count} segundos' },
  skipForward: { one: 'Avançar {count} segundo', many: 'Avançar {count} segundos', other: 'Avançar {count} segundos' },
  playbackPosition: 'Posição',
  timeOf: '{time} de {duration}',
  watchOn: 'Assistir no {provider}',
};

const BUILT_IN = new Map<string, OrbitStrings>([['en', ENGLISH], ['es', SPANISH], ['pt', PORTUGUESE], ['pt-BR', PORTUGUESE]]);
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
/** The statuses a file writes with the words for them (see `OrbitWords.statusName`). */
const STATUS_NAMES: Record<string, TextKey> = { todo: 'statusTodo', active: 'statusActive', done: 'statusDone', blocked: 'statusBlocked' };

export class OrbitWords {
  /** The tag of the language the words come from: `es` for a map asked for `es-MX`. */
  readonly language: string;

  /** The tag numbers, plurals and lists are written for: `es-MX` there. */
  readonly locale: string;

  /**
   * The language the map is asked to be in, even one with no words of its
   * own here (English when none is): the one its names are written in, which
   * long words break by (see `hyphenation.ts`).
   */
  readonly asked: string;

  private readonly table: OrbitStrings;

  constructor(requested?: string | null, strings?: Partial<OrbitStrings>) {
    const tag = requested ? canonicalTag(requested) : null;
    this.language = tag === null ? 'en' : registered.has(tag) ? tag : registered.has(baseOf(tag)) ? baseOf(tag) : 'en';
    this.locale = tag !== null && (tag === this.language || baseOf(tag) === this.language) ? tag : this.language;
    this.asked = tag ?? 'en';
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

  /**
   * A node's status as people read it: the four a file writes as `todo`,
   * `active`, `done` and `blocked` in the map's language ("En curso"), any
   * other word as written.
   */
  statusName(status: string): string {
    const key = STATUS_NAMES[status.trim().toLowerCase()];
    return key ? this.text(key) : status;
  }

  /** Items as the language lists them: "a, b and c". */
  list(items: string[]): string {
    const format = listFormat(this.locale);
    return format ? format.format(items) : items.join(', ');
  }

  number(value: number): string {
    return numberFormat(this.locale)?.format(value) ?? String(value);
  }

  /**
   * A file's size in the language's way, in the units phones show them in
   * (a kilobyte is 1,000 bytes): "820 bytes", "48 kB", "1.2 MB".
   */
  fileSize(bytes: number): string {
    const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const;
    // Whole numbers from 10 up, as phones show them ("48 kB", "1.2 MB"), and the next unit up once one rounds to 1,000.
    const shown = (value: number, unit: number): number => Number(value.toFixed(unit === 0 || value >= 9.95 ? 0 : 1));
    let unit = 0;
    let value = bytes;

    while (shown(value, unit) >= 1000 && unit < units.length - 1) {
      value /= 1000;
      unit += 1;
    }

    const digits = unit === 0 || value >= 9.95 ? 0 : 1;
    const format = sizeFormat(this.locale, units[unit], digits);
    return format ? format.format(value) : `${value.toFixed(digits)} ${['B', 'kB', 'MB', 'GB', 'TB'][unit]}`;
  }

  /**
   * An idea's date as its planet shows it, small: "Today" (its time instead,
   * when it has one), "Tomorrow" or "Yesterday", the day of the week in the
   * coming week ("Fri"), or the month and day ("Nov 20"), with the year when
   * it's another year's. In the language's own way, at `now`.
   */
  shortDate(due: OrbitDue, now: Date): string {
    const days = daysUntil(due, now);

    if (days === 0) {
      return due.hours === undefined ? this.text('today') : this.formatDate(due, TIME);
    }

    if (days === 1 || days === -1) {
      return this.text(days === 1 ? 'tomorrow' : 'yesterday');
    }

    if (days > 1 && days < 7) {
      return this.formatDate(due, { weekday: 'short' });
    }

    return this.formatDate(due, due.year === now.getFullYear() ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' });
  }

  /**
   * An idea's date with its weekday and time, as the detail sheet's chip
   * shows it: "Fri, Nov 20, 9:30 AM", with the year when it's another
   * year's than `now`'s, or always without `now`.
   */
  mediumDate(due: OrbitDue, now?: Date): string {
    const day: Intl.DateTimeFormatOptions = due.year === now?.getFullYear()
      ? { weekday: 'short', month: 'short', day: 'numeric' }
      : { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
    return this.formatDate(due, due.hours === undefined ? day : { ...day, ...TIME });
  }

  /** An idea's date in full, its time included, for screen readers and tooltips: "Friday, November 20, 2026 at 9:30 AM". */
  fullDate(due: OrbitDue): string {
    const day: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return this.formatDate(due, due.hours === undefined ? day : { ...day, ...TIME });
  }

  /** A date written by the language's own rules; as Orbit writes it in a file where it has none. */
  private formatDate(due: OrbitDue, options: Intl.DateTimeFormatOptions): string {
    return dateFormat(this.locale, options)?.format(dueStart(due)) ?? dueText(due);
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

const sizeFormatCache = new Map<string, Intl.NumberFormat | null>();

const sizeFormat = (locale: string, unit: string, digits: number): Intl.NumberFormat | null => {
  return cached(sizeFormatCache, `${locale} ${unit} ${digits}`, () => new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: unit === 'byte' ? 'long' : 'short', maximumFractionDigits: digits }));
};

/** A time of day, as the language writes one: "9:30 AM", "9:30". */
const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

const dateFormatCache = new Map<string, Intl.DateTimeFormat | null>();

const dateFormat = (locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat | null => {
  return cached(dateFormatCache, `${locale} ${JSON.stringify(options)}`, () => new Intl.DateTimeFormat(locale, options));
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
