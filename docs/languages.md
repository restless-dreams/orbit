# Languages

Orbit speaks the language of the page it's on: its buttons, the detail sheet, the media viewer, the list of the map, its messages and everything screen readers hear about the map. English and Spanish are built in. You can add any other language, change single words, or pick a language for one map.

Only Orbit's own words change. The text of a map is the author's, and so are the status words written in it, except the four a file writes for a task's state: `todo`, `active`, `done` and `blocked` are said and shown in the map's language ("En curso" for `status: active` in Spanish, from `statusTodo` and the rest). Any other word, such as `review`, shows as written. Problems Orbit reports about a map's source (in the console, `orbit validate` and diagnostics) stay in English: they're for the map's author and their tools.

## Which language a map speaks

A map speaks the language of the element it's drawn in: the closest `lang` attribute around it, through shadow roots, and then the page's own `<html lang>`. A page in Spanish gets its maps in Spanish with nothing to set:

```html
<html lang="es">
  …
  <orbit-map># Viaje
## Comida
## Lugares</orbit-map>
```

The `language` option picks a language for one map, whatever the page says:

```ts
createOrbitMap(element, markdown, { language: 'es' });
```

```tsx
<OrbitMindMap source={markdown} language="es" />
```

The map then says its language with a `lang` attribute, so screen readers read its words in it. On `<orbit-map>`, set its `lang` attribute, as on any element: `<orbit-map lang="es">`.

Languages are [BCP 47 tags](https://www.rfc-editor.org/info/bcp47). A regional tag speaks its language with the region's numbers and plurals: `es-MX` and `es-ES` both speak Spanish, writing 24,000 and 24.000. A language Orbit doesn't have speaks English, and so does a map on a page that names none.

Changing the language later, with `setOptions({ language })`, the `language` prop or the element's `lang` attribute, writes the map's words again where they are.

## Adding a language

`registerLanguage` adds a language for every map, by its tag. Words it leaves out are English, or, for a regional tag like `pt-BR`, its base language's (`pt`) when Orbit has it:

```ts
import { registerLanguage } from '@restless-dreams/orbit';

registerLanguage('fr', {
  focus: 'Focus',
  overview: 'Vue d’ensemble',
  zoomIn: 'Zoomer',
  zoomOut: 'Dézoomer',
  ideaCount: { one: '{count} idée', many: '{count} d’idées', other: '{count} idées' },
  // …the rest of the words in the table below.
});
```

It returns a function that takes the language away again. Registering a language Orbit already has changes its words for every map: `registerLanguage('es', { video: 'Vídeo' })`. `languageTags()` lists the languages maps can speak.

### Placeholders, plurals and lists

- **Placeholders:** words in braces (`{name}`, `{count}`) are filled in for you. Keep them in a translation, in whatever order the language needs.
- **Plurals:** text with a number is an object of plural forms, one for each [plural category](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules/select) the language uses (`zero`, `one`, `two`, `few`, `many`) and `other`, which is required and covers any form left out.
- **Numbers and lists:** numbers are written the way the language writes them, and lists like "has note, image, and link" are joined the language's way ("tiene nota, imagen y enlace").

## Where long words break

A name too long for its node is cut across lines, and a long word in it breaks with a hyphen where the map's language breaks it: "Pho-to-syn-the-sis", "No-ti-fi-ca-cio-nes", never "Photosy-nthesis". When the name then fits, the word breaks where its lines come out most even ("Electroen- / cephalography", not "Electroencephalogra- / phy"); a name cut short anyway breaks as late as it can, to show the most of it. A long word also breaks rather than shrink its name whole, once, when that shows the name at least 2 px larger: "Investi- / gación" at the planet's own size, not "Investigación" at its smallest. While the map moves, names keep the fit they had; the larger one comes once it's still. Orbit knows where English and Spanish words break, from the hyphenation patterns TeX uses (hyph-utf8's American English and Spanish), and leaves at least two letters before a hyphen and, in English, three after it. The language is the map's, from the `language` option or the page's `lang`, whether Orbit has its words or not.

`registerHyphenation` adds another language's patterns, such as its `hyph-<language>.pat.txt` and `.hyp.txt` from the [hyph-utf8 package](https://www.hyphenation.org/tex), whose files say each one's license:

```ts
import { registerHyphenation } from '@restless-dreams/orbit';

registerHyphenation('de', germanPatterns, { exceptions: germanExceptions, left: 2, right: 2 });
```

`left` and `right` are the fewest letters a break leaves before and after its hyphen (2 and 3 unless given). It returns a function that takes them away again. Without patterns for its language, a map breaks a long word wherever its line ends, three letters from either end at least.

## Changing single words

The `strings` option changes words on one map, over its language's:

```ts
createOrbitMap(element, markdown, { strings: { zoomIn: 'Closer', zoomOut: 'Further' } });
```

A word Orbit doesn't have, or one of the wrong kind, is skipped with a warning in the console.

## The root Orbit makes up

A map that's just a list, or has several top headings, and has no title gets a root Orbit makes up, named "Untitled map" in the map's language. When you parse maps yourself, `parseOrbit(source, { untitled: 'Mapa sin título' })` gives it that name. Its id is `untitled-map` in every language, so links and saved places keep working, and saving the map writes it as the list it was.

## Without a browser

`renderToSVGString(markdown, { language: 'es' })` writes the drawing's few words in a language: an untitled idea's name, the empty map's message and the map's title when it has none. On the command line: `orbit render map.md --language es`.

## Every word

| Key | English | Spanish |
| --- | --- | --- |
| `mindMap` | Mind map | Mapa mental |
| `mindMapRole` | mind map | mapa mental |
| `untitled` | Untitled | Sin título |
| `untitledMap` | Untitled map | Mapa sin título |
| `emptyMap` | This map is empty | Este mapa está vacío |
| `emptyMapHint` | Start it with a # heading or a bullet list | Empiézalo con un encabezado # o una lista con viñetas |
| `mapNotDrawn` | This map couldn’t be drawn | No se pudo dibujar este mapa |
| `mapNotDrawnReason` | The map could not be drawn. | No se pudo dibujar el mapa. |
| `problemOnLine` | Line {line}: {message} | Línea {line}: {message} |
| `mapPath` | Map path | Ruta del mapa |
| `back` | Back | Atrás |
| `backTo` | Back to {name} | Volver a {name} |
| `backToParent` | Back to the idea above | Volver a la idea superior |
| `view` | View | Vista |
| `focus` | Focus | Enfoque |
| `overview` | Overview | Vista general |
| `showOutline` | Show the map as a list | Mostrar el mapa como lista |
| `zoom` | Zoom | Zoom |
| `zoomIn` | Zoom in | Acercar |
| `zoomOut` | Zoom out | Alejar |
| `fitMap` | Fit the map | Ajustar el mapa |
| `scrollToZoom` | Use {key} + scroll to zoom the map | Usa {key} + desplazamiento para acercar o alejar el mapa |
| `outline` | Map outline | Esquema del mapa |
| `overviewAnnouncement` | Overview of the whole map | Vista general de todo el mapa |
| `ideaCount` | one: {count} item; other: {count} items | one: {count} idea; many: {count} ideas; other: {count} ideas |
| `hiddenIdeaCount` | one: {count} hidden idea; other: {count} hidden ideas | one: {count} idea oculta; many: {count} ideas ocultas; other: {count} ideas ocultas |
| `revealed` | {name}: {list} | {name}: {list} |
| `added` | Added {name} | Se agregó {name} |
| `removed` | Deleted {name} | Se eliminó {name} |
| `moved` | Moved {name} to {parent} | Se movió {name} a {parent} |
| `movedToTop` | Moved {name} to the top | Se movió {name} al nivel superior |
| `anIdea` | an idea | una idea |
| `status` | status: {status} | estado: {status} |
| `statusLabel` | Status: {status} | Estado: {status} |
| `statusTodo` | To do | Por hacer |
| `statusActive` | In progress | En curso |
| `statusDone` | Done | Hecho |
| `statusBlocked` | Blocked | Bloqueado |
| `has` | has {list} | tiene {list} |
| `hasDetails` | details | detalles |
| `hasNote` | note | nota |
| `hasImage` | picture | imagen |
| `hasVideo` | video | video |
| `hasAudio` | sound | audio |
| `hasEmbed` | web page | página web |
| `hasLink` | link | enlace |
| `textOf` | Text of {name} | Texto de {name} |
| `newIdeaFor` | New idea for {name} | Idea nueva en {name} |
| `newIdea` | New idea | Idea nueva |
| `addIdeaTo` | Add an idea to {name} | Agregar una idea a {name} |
| `moveHere` | Move {name} here | Mover {name} aquí |
| `thisIdea` | this idea | esta idea |
| `theIdea` | the idea | la idea |
| `ideaActions` | {name} actions | Acciones de {name} |
| `ideaActionsUntitled` | Idea actions | Acciones de la idea |
| `showDetails` | Show details | Ver detalles |
| `viewImage` | View picture | Ver imagen |
| `viewImageOf` | View picture: {description} | Ver imagen: {description} |
| `viewLivePhoto` | View live photo | Ver foto en vivo |
| `viewLivePhotoOf` | View live photo: {description} | Ver foto en vivo: {description} |
| `playVideo` | Play video | Reproducir video |
| `playAudio` | Play sound | Reproducir audio |
| `openEmbed` | Open web page | Abrir página web |
| `readNote` | Read note | Leer nota |
| `openLink` | Open link | Abrir enlace |
| `goTo` | Go to {name} | Ir a {name} |
| `seeIdea` | See {name} | Ver {name} |
| `details` | Details | Detalles |
| `close` | Close | Cerrar |
| `previous` | Previous | Anterior |
| `next` | Next | Siguiente |
| `present` | Present | Presentar |
| `priority` | Priority {priority} | Prioridad {priority} |
| `expand` | Expand | Ampliar |
| `expandVideo` | Expand the video | Ampliar el video |
| `expandAudio` | Expand the sound | Ampliar el audio |
| `picture` | Picture | Imagen |
| `video` | Video | Video |
| `audio` | Sound | Audio |
| `position` | {index} of {total} | {index} de {total} |
| `fitPicture` | Fit the picture | Ajustar la imagen |
| `live` | Live | En vivo |
| `playLivePhoto` | Play the live photo | Reproducir la foto en vivo |
| `holdToPlay` | Hold to play | Mantén presionado para reproducirla |
| `pictureUnavailable` | This picture can’t be shown. | No se puede mostrar esta imagen. |
| `videoUnavailable` | This video can’t be played. | No se puede reproducir este video. |
| `audioUnavailable` | This sound can’t be played. | No se puede reproducir este audio. |
| `videoUnavailableHere` | This video can’t be played here. | Este video no se puede reproducir aquí. |
| `openPictureInNewTab` | Open the picture in a new tab | Abrir la imagen en una pestaña nueva |
| `openVideoInNewTab` | Open the video in a new tab | Abrir el video en una pestaña nueva |
| `openAudioInNewTab` | Open the sound in a new tab | Abrir el audio en una pestaña nueva |
| `play` | Play | Reproducir |
| `pause` | Pause | Pausar |
| `mute` | Turn the sound off | Silenciar |
| `unmute` | Turn the sound on | Activar el sonido |
| `skipBack` | one: Back {count} second; other: Back {count} seconds | one: Retroceder {count} segundo; many: Retroceder {count} segundos; other: Retroceder {count} segundos |
| `skipForward` | one: Forward {count} second; other: Forward {count} seconds | one: Avanzar {count} segundo; many: Avanzar {count} segundos; other: Avanzar {count} segundos |
| `playbackPosition` | Position | Posición |
| `timeOf` | {time} of {duration} | {time} de {duration} |
| `watchOn` | Watch on {provider} | Ver en {provider} |

`OrbitStrings` in the [API reference](api/README.md) says where each one shows.
