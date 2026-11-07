<!-- A copy of docs/languages.md, made by scripts/build-llms.ts, with links to other files pointing at the repository. Edit the original. -->

# Languages

Orbit speaks the language of the page it's on: its buttons, the detail sheet, the media viewer, the list of the map, its messages and everything screen readers hear about the map. English, Spanish and Brazilian Portuguese are built in. You can add any other language, change single words, or pick a language for one map.

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

Languages are [BCP 47 tags](https://www.rfc-editor.org/info/bcp47). A regional tag speaks its language with the region's numbers and plurals: `es-MX` and `es-ES` both speak Spanish, writing 24,000 and 24.000. Orbit's Portuguese is Brazil's, `pt-BR`, which `pt` speaks too, and so does `pt-PT`, with Portugal's numbers and plurals, until a page adds Portugal's own words (below). A language Orbit doesn't have speaks English, and so does a map on a page that names none.

Changing the language later, with `setOptions({ language })`, the `language` prop or the element's `lang` attribute, writes the map's words again where they are.

## Adding a language

`registerLanguage` adds a language for every map, by its tag. Words it leaves out are English, or, for a regional tag like `pt-PT`, its base language's (`pt`) when Orbit has it:

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

It returns a function that takes the language away again. Registering a language Orbit already has changes its words for every map: `registerLanguage('es', { video: 'Vídeo' })`. A region of one starts from it and changes only what it gives: `registerLanguage('pt-PT', { overview: 'Vista geral' })` speaks Portugal's word there and Brazil's everywhere else, while `pt-BR` keeps its own. `languageTags()` lists the languages maps can speak.

### Placeholders, plurals and lists

- **Placeholders:** words in braces (`{name}`, `{count}`) are filled in for you. Keep them in a translation, in whatever order the language needs.
- **Plurals:** text with a number is an object of plural forms, one for each [plural category](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules/select) the language uses (`zero`, `one`, `two`, `few`, `many`) and `other`, which is required and covers any form left out.
- **Numbers and lists:** numbers are written the way the language writes them, and lists like "has note, image, and link" are joined the language's way ("tiene nota, imagen y enlace").
- **Dates:** an idea's date is written the language's way too ("Fri, Nov 20", "vie, 20 nov"), with the days of the week, months and times of its region (`en-GB` writes 24-hour times); a tag can ask for an hour cycle of its own (`en-US-u-hc-h23`). Only "Today", "Tomorrow" and "Yesterday", which planets show, are words of Orbit's.

## Where long words break

A name too long for its node is cut across lines, and a long word in it breaks with a hyphen where the map's language breaks it: "Pho-to-syn-the-sis", "No-ti-fi-ca-cio-nes", never "Photosy-nthesis". When the name then fits, the word breaks where its lines come out most even ("Electroen- / cephalography", not "Electroencephalogra- / phy"); a name cut short anyway breaks as late as it can, to show the most of it. A long word also breaks rather than shrink its name whole, once, when that shows the name at least 2 px larger: "Investi- / gación" at the planet's own size, not "Investigación" at its smallest. While the map moves, names keep the fit they had; the larger one comes once it's still. Orbit knows where English, Spanish and Portuguese words break, from the hyphenation patterns TeX uses (hyph-utf8's American English, Spanish and Portuguese), and leaves at least two letters before a hyphen and, in English and Portuguese, three after it: "Con-fi-gu-ra-ções", "Pla-ne-ja-mento". The language is the map's, from the `language` option or the page's `lang`, whether Orbit has its words or not.

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

| Key | English | Spanish | Portuguese (Brazil) |
| --- | --- | --- | --- |
| `mindMap` | Mind map | Mapa mental | Mapa mental |
| `mindMapRole` | mind map | mapa mental | mapa mental |
| `untitled` | Untitled | Sin título | Sem título |
| `untitledMap` | Untitled map | Mapa sin título | Mapa sem título |
| `emptyMap` | This map is empty | Este mapa está vacío | Este mapa está vazio |
| `emptyMapHint` | Start it with a # heading or a bullet list | Empiézalo con un encabezado # o una lista con viñetas | Comece com um título # ou uma lista com marcadores |
| `mapNotDrawn` | This map couldn’t be drawn | No se pudo dibujar este mapa | Não foi possível desenhar este mapa |
| `mapNotDrawnReason` | The map could not be drawn. | No se pudo dibujar el mapa. | Não foi possível desenhar o mapa. |
| `problemOnLine` | Line {line}: {message} | Línea {line}: {message} | Linha {line}: {message} |
| `mapPath` | Map path | Ruta del mapa | Caminho do mapa |
| `back` | Back | Atrás | Voltar |
| `backTo` | Back to {name} | Volver a {name} | Voltar para {name} |
| `backToParent` | Back to the idea above | Volver a la idea superior | Voltar para a ideia acima |
| `view` | View | Vista | Visualização |
| `focus` | Focus | Enfoque | Foco |
| `overview` | Overview | Vista general | Visão geral |
| `showOutline` | Show the map as a list | Mostrar el mapa como lista | Mostrar o mapa como lista |
| `zoom` | Zoom | Zoom | Zoom |
| `zoomIn` | Zoom in | Acercar | Aumentar o zoom |
| `zoomOut` | Zoom out | Alejar | Diminuir o zoom |
| `fitMap` | Fit the map | Ajustar el mapa | Ajustar o mapa |
| `scrollToZoom` | Use {key} + scroll to zoom the map | Usa {key} + desplazamiento para acercar o alejar el mapa | Use {key} + rolagem para aplicar zoom ao mapa |
| `outline` | Map outline | Esquema del mapa | Tópicos do mapa |
| `overviewAnnouncement` | Overview of the whole map | Vista general de todo el mapa | Visão geral do mapa inteiro |
| `ideaCount` | one: {count} item; other: {count} items | one: {count} idea; many: {count} ideas; other: {count} ideas | one: {count} ideia; many: {count} ideias; other: {count} ideias |
| `hiddenIdeaCount` | one: {count} hidden idea; other: {count} hidden ideas | one: {count} idea oculta; many: {count} ideas ocultas; other: {count} ideas ocultas | one: {count} ideia oculta; many: {count} ideias ocultas; other: {count} ideias ocultas |
| `revealed` | {name}: {list} | {name}: {list} | {name}: {list} |
| `added` | Added {name} | Se agregó {name} | Ideia adicionada: {name} |
| `removed` | Deleted {name} | Se eliminó {name} | Ideia excluída: {name} |
| `moved` | Moved {name} to {parent} | Se movió {name} a {parent} | Ideia movida para {parent}: {name} |
| `movedToTop` | Moved {name} to the top | Se movió {name} al nivel superior | Ideia movida para o nível superior: {name} |
| `anIdea` | an idea | una idea | sem título |
| `status` | status: {status} | estado: {status} | status: {status} |
| `statusLabel` | Status: {status} | Estado: {status} | Status: {status} |
| `statusTodo` | To do | Por hacer | A fazer |
| `statusActive` | In progress | En curso | Em andamento |
| `statusDone` | Done | Hecho | Concluído |
| `statusBlocked` | Blocked | Bloqueado | Bloqueado |
| `date` | date: {date} | fecha: {date} | data: {date} |
| `dateLabel` | Date: {date} | Fecha: {date} | Data: {date} |
| `overdue` | overdue | vencida | atrasada |
| `overdueLabel` | Overdue: {date} | Vencida: {date} | Atrasada: {date} |
| `today` | Today | Hoy | Hoje |
| `tomorrow` | Tomorrow | Mañana | Amanhã |
| `yesterday` | Yesterday | Ayer | Ontem |
| `has` | has {list} | tiene {list} | tem {list} |
| `hasDetails` | details | detalles | detalhes |
| `hasNote` | note | nota | nota |
| `hasImage` | picture | imagen | imagem |
| `hasVideo` | video | video | vídeo |
| `hasAudio` | sound | audio | áudio |
| `hasEmbed` | web page | página web | página da web |
| `hasLink` | link | enlace | link |
| `fileCount` | one: {count} file; other: {count} files | one: {count} archivo; many: {count} archivos; other: {count} archivos | one: {count} arquivo; many: {count} arquivos; other: {count} arquivos |
| `textOf` | Text of {name} | Texto de {name} | Texto de {name} |
| `newIdeaFor` | New idea for {name} | Idea nueva en {name} | Nova ideia em {name} |
| `newIdea` | New idea | Idea nueva | Nova ideia |
| `addIdeaTo` | Add an idea to {name} | Agregar una idea a {name} | Adicionar uma ideia a {name} |
| `moveHere` | Move {name} here | Mover {name} aquí | Mover {name} para cá |
| `thisIdea` | this idea | esta idea | esta ideia |
| `theIdea` | the idea | la idea | a ideia |
| `ideaActions` | {name} actions | Acciones de {name} | Ações de {name} |
| `ideaActionsUntitled` | Idea actions | Acciones de la idea | Ações da ideia |
| `showDetails` | Show details | Ver detalles | Ver detalhes |
| `viewImage` | View picture | Ver imagen | Ver imagem |
| `viewImageOf` | View picture: {description} | Ver imagen: {description} | Ver imagem: {description} |
| `viewLivePhoto` | View live photo | Ver foto en vivo | Ver foto ao vivo |
| `viewLivePhotoOf` | View live photo: {description} | Ver foto en vivo: {description} | Ver foto ao vivo: {description} |
| `playVideo` | Play video | Reproducir video | Reproduzir vídeo |
| `playAudio` | Play sound | Reproducir audio | Reproduzir áudio |
| `openEmbed` | Open web page | Abrir página web | Abrir página da web |
| `readNote` | Read note | Leer nota | Ler nota |
| `openLink` | Open link | Abrir enlace | Abrir link |
| `showFiles` | Show files | Ver archivos | Ver arquivos |
| `files` | Files | Archivos | Arquivos |
| `openFile` | Open {name} | Abrir {name} | Abrir {name} |
| `filesStayed` | The files stayed with the map: they aren’t in this page. | Los archivos se quedaron con el mapa: no están en esta página. | Os arquivos ficaram com o mapa: eles não estão nesta página. |
| `filePdf` | PDF | PDF | PDF |
| `fileDocument` | Document | Documento | Documento |
| `fileSpreadsheet` | Spreadsheet | Hoja de cálculo | Planilha |
| `filePresentation` | Presentation | Presentación | Apresentação |
| `fileImage` | Picture | Imagen | Imagem |
| `fileVideo` | Video | Video | Vídeo |
| `fileAudio` | Sound | Audio | Áudio |
| `fileArchive` | Archive | Archivo comprimido | Arquivo compactado |
| `fileText` | Text | Texto | Texto |
| `fileOther` | File | Archivo | Arquivo |
| `goTo` | Go to {name} | Ir a {name} | Ir para {name} |
| `seeIdea` | See {name} | Ver {name} | Veja {name} |
| `details` | Details | Detalles | Detalhes |
| `close` | Close | Cerrar | Fechar |
| `previous` | Previous | Anterior | Anterior |
| `next` | Next | Siguiente | Próximo |
| `present` | Present | Presentar | Apresentar |
| `priority` | Priority {priority} | Prioridad {priority} | Prioridade {priority} |
| `expand` | Expand | Ampliar | Expandir |
| `expandVideo` | Expand the video | Ampliar el video | Expandir o vídeo |
| `expandAudio` | Expand the sound | Ampliar el audio | Expandir o áudio |
| `picture` | Picture | Imagen | Imagem |
| `video` | Video | Video | Vídeo |
| `audio` | Sound | Audio | Áudio |
| `position` | {index} of {total} | {index} de {total} | {index} de {total} |
| `fitPicture` | Fit the picture | Ajustar la imagen | Ajustar a imagem |
| `live` | Live | En vivo | Ao vivo |
| `playLivePhoto` | Play the live photo | Reproducir la foto en vivo | Reproduzir a foto ao vivo |
| `holdToPlay` | Hold to play | Mantén presionado para reproducirla | Mantenha pressionado para reproduzir |
| `pictureUnavailable` | This picture can’t be shown. | No se puede mostrar esta imagen. | Não é possível mostrar esta imagem. |
| `videoUnavailable` | This video can’t be played. | No se puede reproducir este video. | Não é possível reproduzir este vídeo. |
| `audioUnavailable` | This sound can’t be played. | No se puede reproducir este audio. | Não é possível reproduzir este áudio. |
| `videoUnavailableHere` | This video can’t be played here. | Este video no se puede reproducir aquí. | Este vídeo não pode ser reproduzido aqui. |
| `openPictureInNewTab` | Open the picture in a new tab | Abrir la imagen en una pestaña nueva | Abrir a imagem em uma nova guia |
| `openVideoInNewTab` | Open the video in a new tab | Abrir el video en una pestaña nueva | Abrir o vídeo em uma nova guia |
| `openAudioInNewTab` | Open the sound in a new tab | Abrir el audio en una pestaña nueva | Abrir o áudio em uma nova guia |
| `play` | Play | Reproducir | Reproduzir |
| `pause` | Pause | Pausar | Pausar |
| `mute` | Turn the sound off | Silenciar | Desativar o som |
| `unmute` | Turn the sound on | Activar el sonido | Ativar o som |
| `skipBack` | one: Back {count} second; other: Back {count} seconds | one: Retroceder {count} segundo; many: Retroceder {count} segundos; other: Retroceder {count} segundos | one: Voltar {count} segundo; many: Voltar {count} segundos; other: Voltar {count} segundos |
| `skipForward` | one: Forward {count} second; other: Forward {count} seconds | one: Avanzar {count} segundo; many: Avanzar {count} segundos; other: Avanzar {count} segundos | one: Avançar {count} segundo; many: Avançar {count} segundos; other: Avançar {count} segundos |
| `playbackPosition` | Position | Posición | Posição |
| `timeOf` | {time} of {duration} | {time} de {duration} | {time} de {duration} |
| `watchOn` | Watch on {provider} | Ver en {provider} | Assistir no {provider} |

`OrbitStrings` in the [API reference](https://github.com/restless-dreams/orbit/blob/main/docs/api/README.md) says where each one shows.
