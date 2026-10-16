# Languages

Orbit speaks the language of the page it's on: its buttons, the detail sheet, the media viewer, the list of the map, its messages and everything screen readers hear about the map. English and Spanish are built in. You can add any other language, change single words, or pick a language for one map.

Only Orbit's own words change. The text of a map is the author's, and so are the status words written in it (`status: done` shows as "done"). Problems Orbit reports about a map's source (in the console, `orbit validate` and diagnostics) stay in English: they're for the map's author and their tools.

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

On `<orbit-map>`, set its `lang` attribute, as on any element: `<orbit-map lang="es">`.

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
| `backToParent` | Back to the parent node | Volver a la idea superior |
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
| `added` | Added {name} | Se agregó {name} |
| `removed` | Removed {name} | Se eliminó {name} |
| `moved` | Moved {name} to {parent} | Se movió {name} a {parent} |
| `movedToTop` | Moved {name} to the top | Se movió {name} al nivel superior |
| `anIdea` | a node | una idea |
| `status` | status {status} | estado {status} |
| `statusLabel` | Status: {status} | Estado: {status} |
| `has` | has {list} | tiene {list} |
| `hasDetails` | details | detalles |
| `hasNote` | note | nota |
| `hasImage` | image | imagen |
| `hasVideo` | video | video |
| `hasEmbed` | embed | contenido insertado |
| `hasLink` | link | enlace |
| `textOf` | Text of {name} | Texto de {name} |
| `newIdeaFor` | New idea for {name} | Idea nueva en {name} |
| `newIdea` | New idea | Idea nueva |
| `addIdeaTo` | Add an idea to {name} | Agregar una idea a {name} |
| `moveHere` | Move {name} here | Mover {name} aquí |
| `thisIdea` | this node | esta idea |
| `theIdea` | the idea | la idea |
| `ideaActions` | {name} actions | Acciones de {name} |
| `ideaActionsUntitled` | Node actions | Acciones de la idea |
| `showDetails` | Show details | Ver detalles |
| `viewImage` | View image | Ver imagen |
| `viewImageOf` | View image: {description} | Ver imagen: {description} |
| `playVideo` | Play video | Reproducir video |
| `openEmbed` | Open embed | Abrir contenido insertado |
| `readNote` | Read note | Leer nota |
| `openLink` | Open link | Abrir enlace |
| `goTo` | Go to {name} | Ir a {name} |
| `details` | Details | Detalles |
| `close` | Close | Cerrar |
| `previous` | Previous | Anterior |
| `next` | Next | Siguiente |
| `present` | Present | Presentar |
| `priority` | Priority {priority} | Prioridad {priority} |
| `expand` | Expand | Ampliar |
| `expandVideo` | Expand the video | Ampliar el video |
| `picture` | Picture | Imagen |
| `video` | Video | Video |
| `position` | {index} of {total} | {index} de {total} |
| `fitPicture` | Fit the picture | Ajustar la imagen |
| `pictureUnavailable` | This picture can’t be shown. | No se puede mostrar esta imagen. |
| `videoUnavailable` | This video can’t be played. | No se puede reproducir este video. |
| `videoUnavailableHere` | This video can’t be played here. | Este video no se puede reproducir aquí. |
| `openPictureInNewTab` | Open the picture in a new tab | Abrir la imagen en una pestaña nueva |
| `openVideoInNewTab` | Open the video in a new tab | Abrir el video en una pestaña nueva |
| `watchOn` | Watch on {provider} | Ver en {provider} |

`OrbitStrings` in the [API reference](api/README.md) says where each one shows.
