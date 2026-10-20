[**@restless-dreams/orbit**](README.md)

***

[@restless-dreams/orbit](README.md) / index

# index

## Classes

### OrbitImportError

A file that can't be read as a map at all.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new OrbitImportError(code, message): OrbitImportError;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `code` | \| `"empty"` \| `"unknown-format"` \| `"unreadable"` \| `"password-protected"` \| `"too-large"` |
| `message` | `string` |

###### Returns

[`OrbitImportError`](#orbitimporterror)

###### Overrides

```ts
Error.constructor
```

#### Properties

##### code

```ts
readonly code: 
  | "empty"
  | "unknown-format"
  | "unreadable"
  | "password-protected"
  | "too-large";
```

***

### OrbitParseError

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new OrbitParseError(
   message, 
   line, 
   code?
): OrbitParseError;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `message` | `string` | `undefined` |
| `line` | `number` | `undefined` |
| `code` | \| `"empty-document"` \| `"no-structure"` \| `"synthetic-root"` \| `"invalid-frontmatter"` \| `"unknown-frontmatter-key"` \| `"unsupported-schema-version"` \| `"format-upgraded"` \| `"invalid-attributes"` \| `"unknown-attribute"` \| `"invalid-option-value"` \| `"media-missing-source"` \| `"unknown-content-type"` \| `"caption-without-media"` \| `"unknown-link-target"` \| `"invalid-yaml"` \| `"unknown-yaml-key"` \| `"ignored-node-entry"` \| `"misnamed-node-key"` \| `"comment-without-orbit"` \| `"attributes-after-list"` | `'invalid-yaml'` |

###### Returns

[`OrbitParseError`](#orbitparseerror)

###### Overrides

```ts
Error.constructor
```

#### Properties

##### code

```ts
readonly code: 
  | "empty-document"
  | "no-structure"
  | "synthetic-root"
  | "invalid-frontmatter"
  | "unknown-frontmatter-key"
  | "unsupported-schema-version"
  | "format-upgraded"
  | "invalid-attributes"
  | "unknown-attribute"
  | "invalid-option-value"
  | "media-missing-source"
  | "unknown-content-type"
  | "caption-without-media"
  | "unknown-link-target"
  | "invalid-yaml"
  | "unknown-yaml-key"
  | "ignored-node-entry"
  | "misnamed-node-key"
  | "comment-without-orbit"
  | "attributes-after-list";
```

##### line

```ts
readonly line: number;
```

***

### OrbitSVGRenderer

#### Constructors

##### Constructor

```ts
new OrbitSVGRenderer(container, options?): OrbitSVGRenderer;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `container` | `HTMLElement` |
| `options` | [`RendererOptions`](#rendereroptions) |

###### Returns

[`OrbitSVGRenderer`](#orbitsvgrenderer)

#### Methods

##### addNode()

```ts
addNode(
   parentId, 
   input, 
   index?
): OrbitNode | null;
```

Adds a node under `parentId`, at `index` among its children (default:
last), with any `children` it lists under it; it flies out of its parent
into place. Ids come from the text, as when the map is read from
markdown. Fires `edit` once. Returns the new node, or null when there's
no such parent.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `parentId` | `string` |
| `input` | [`OrbitNewNode`](#orbitnewnode) |
| `index?` | `number` |

###### Returns

[`OrbitNode`](#orbitnode) \| `null`

##### closeMedia()

```ts
closeMedia(): void;
```

Closes the media viewer, if it's open (fires `media-close`).

###### Returns

`void`

##### destroy()

```ts
destroy(): void;
```

###### Returns

`void`

##### editNewNode()

```ts
editNewNode(parentId?, index?): boolean;
```

Adds an idea by typing it on the map: a field opens in the orbit of
`parentId` (default: the node in focus), at `index` among its children
(default: after the last), flying there first. Enter adds the idea
where it was typed and opens the next one after it; Escape, or Enter
with nothing typed, stops. Fires `editor-open`, `edit` for each idea,
then `editor-close`. Returns false when there's no such node.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `parentId?` | `string` |
| `index?` | `number` |

###### Returns

`boolean`

##### editNode()

```ts
editNode(id): boolean;
```

Opens a field over a node to type its text where it is: Enter saves,
Escape cancels, and leaving the field saves. A moon, or a node out of
view, flies into view first. Fires `editor-open`, then `editor-close`.
Returns false when there's no such node.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`boolean`

##### fit()

```ts
fit(): void;
```

Returns the camera to the fitted view.

###### Returns

`void`

##### flyTo()

```ts
flyTo(id): boolean;
```

Flies to a node by id, switching to focus mode if needed (fires
onFocusChange and onViewModeChange). Returns false when there's no such node.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`boolean`

##### focusNode()

```ts
focusNode(id): boolean;
```

Focuses a node by id and flies to it (fires onFocusChange). In the
overview, the camera moves to the node instead. Returns false when the
id isn't in the map.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`boolean`

##### getDocument()

```ts
getDocument(): OrbitDocument | null;
```

The map as a document: its tree, and the options its source set in
frontmatter. Edits change this tree in place.

###### Returns

[`OrbitDocument`](#orbitdocument) \| `null`

##### getFocusedNode()

```ts
getFocusedNode(): OrbitNode | null;
```

The node focused in focus mode (the sun).

###### Returns

[`OrbitNode`](#orbitnode) \| `null`

##### getFocusPath()

```ts
getFocusPath(): string[];
```

Ids from the root to the focused node.

###### Returns

`string`[]

##### getNodeColor()

```ts
getNodeColor(id): string | null;
```

The color a node is drawn with: its own, its type's, or its branch's
from the palette and theme. For lists and legends next to the map. A hex
color, or the CSS color as written when Orbit can't read it; `null` when
the id isn't in the map.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`string` \| `null`

##### getSVGElement()

```ts
getSVGElement(): SVGSVGElement;
```

###### Returns

`SVGSVGElement`

##### getViewMode()

```ts
getViewMode(): ViewMode;
```

###### Returns

[`ViewMode`](#viewmode)

##### moveNode()

```ts
moveNode(
   id, 
   parentId, 
   index?
): OrbitNode | null;
```

Moves a node, with everything under it, under `parentId` at `index`
among its children (default: last). Fires `edit`. Returns the node,
or null when either node is missing, the node is the root, or
`parentId` is inside the node.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `parentId` | `string` |
| `index?` | `number` |

###### Returns

[`OrbitNode`](#orbitnode) \| `null`

##### on()

```ts
on<Name>(name, listener): () => void;
```

Listens for a map event; returns a function that stops listening. The
same events are dispatched on the container as `orbit-<name>` DOM events.

###### Type Parameters

| Type Parameter |
| ------ |
| `Name` *extends* keyof [`OrbitEventMap`](#orbiteventmap) |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `Name` |
| `listener` | (`detail`) => `void` |

###### Returns

() => `void`

##### openMedia()

```ts
openMedia(nodeId, options?): boolean;
```

Shows a node's picture or video in the media viewer, over the whole
window, opening it if it's closed: to show a picture big, or play a
video, from your own controls. A node with both shows its picture
unless `kind` is `video`, and a video starts playing unless `autoplay`
is `false`, from the start or `startAt` seconds in. It opens whatever
`mediaViewer`, `showDetailSheet` and `interactive` say; on a map that
isn't interactive, the viewer takes no input of its own and has no
buttons. Fires `media-open`. Returns false when the map has no such
node, or the node no such picture or video.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `nodeId` | `string` |
| `options` | [`OrbitMediaOptions`](#orbitmediaoptions) |

###### Returns

`boolean`

##### overview()

```ts
overview(): void;
```

Flies out to the overview of the whole map (fires onViewModeChange).

###### Returns

`void`

##### pauseMedia()

```ts
pauseMedia(): boolean;
```

Pauses the video in the media viewer. Returns false when it shows no video it can pause.

###### Returns

`boolean`

##### playMedia()

```ts
playMedia(): boolean;
```

Plays the video in the media viewer. Returns false when it shows no
video, or one on a site Orbit has no player for. Files, YouTube and
Vimeo play.

###### Returns

`boolean`

##### removeNode()

```ts
removeNode(id): OrbitNode | null;
```

Removes a node and everything under it. When the node in focus goes,
the nearest node left takes the focus. The root stays. Fires `edit`.
Returns the removed node, or null.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

[`OrbitNode`](#orbitnode) \| `null`

##### render()

```ts
render(input): void;
```

Draws a map: markdown or YAML source (parsed forgivingly), a parsed
document, or a node tree. A document's frontmatter options apply, though
options given to the renderer win. Drawing a new version of the same map
keeps the reader's place: the focused node, or its closest ancestor that
still exists.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | `string` \| [`OrbitDocument`](#orbitdocument) \| [`OrbitNode`](#orbitnode) |

###### Returns

`void`

##### seekMedia()

```ts
seekMedia(seconds): boolean;
```

Moves the video in the media viewer to `seconds` from its start. Returns false when it shows no video it can move.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `seconds` | `number` |

###### Returns

`boolean`

##### setOptions()

```ts
setOptions(options): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`RendererOptions`](#rendereroptions) |

###### Returns

`void`

##### setViewMode()

```ts
setViewMode(mode): void;
```

Switches between focus mode and the overview (fires onViewModeChange).

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `mode` | [`ViewMode`](#viewmode) |

###### Returns

`void`

##### spin()

```ts
spin(speed): void;
```

Flicks the orbit at `speed` degrees per second; negative speeds turn it
counterclockwise. Only in focus mode.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `speed` | `number` |

###### Returns

`void`

##### stopEditing()

```ts
stopEditing(save?): void;
```

Closes the field for typing on the map, keeping what was typed unless `save` is false.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `save` | `boolean` | `true` |

###### Returns

`void`

##### toMarkdown()

```ts
toMarkdown(): string;
```

The map as orbit-md, frontmatter included: what to save after an edit.
A map read from markdown comes back as it was written, with only what
the edits changed written again, so a file written by hand or by
another app keeps its formatting and everything Orbit doesn't read.

###### Returns

`string`

##### toSVGString()

```ts
toSVGString(): string;
```

The current view as a standalone SVG document: colors resolved, labels
as SVG text, nothing that depends on the page's stylesheet.

###### Returns

`string`

##### unmount()

```ts
static unmount(target): boolean;
```

Destroys the renderer drawing into `target`, if there is one. Returns whether there was.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `target` | `HTMLElement` |

###### Returns

`boolean`

##### unmuteMedia()

```ts
unmuteMedia(): boolean;
```

Turns on the sound of the video in the media viewer: one a browser
started muted, say. Browsers allow sound only once the reader has
interacted with the page, so call it from a press, such as a "Tap for
sound" button's. Returns false when it shows no video it can drive.

###### Returns

`boolean`

##### updateNode()

```ts
updateNode(id, changes): OrbitNode | null;
```

Changes a node's text or attributes: `{ text: 'Budget' }`, `{ status:
'done' }`, or `{ color: undefined }` to remove one. New text gives the
node a new id when its id came from its text and no link points at it,
so the saved map needs no id attribute. Fires `edit`. Returns the
node, or null when there's no such node.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `changes` | [`OrbitNodeInput`](#orbitnodeinput) |

###### Returns

[`OrbitNode`](#orbitnode) \| `null`

##### zoomBy()

```ts
zoomBy(factor): void;
```

Zooms by `factor` around the middle of the map (above 1 zooms in).

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `factor` | `number` |

###### Returns

`void`

## Interfaces

### AutoRenderOptions

#### Extends

- [`RendererOptions`](#rendereroptions)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-actions"></a> `actions?` | [`OrbitAction`](#orbitaction)[] | Your own buttons under the focused node and in its detail sheet, before the registered ones. | [`RendererOptions`](#rendereroptions).[`actions`](#property-actions-3) |
| <a id="property-arialabel"></a> `ariaLabel?` | `string` | The map's accessible name. Default: the document's `title`. | [`RendererOptions`](#rendereroptions).[`ariaLabel`](#property-arialabel-2) |
| <a id="property-baseurl"></a> `baseUrl?` | `string` | Resolves relative image, video and link URLs. | [`RendererOptions`](#rendereroptions).[`baseUrl`](#property-baseurl-5) |
| <a id="property-classname"></a> `className?` | `string` | - | - |
| <a id="property-editable"></a> `editable?` | `boolean` | Build the map on the map: a + in the orbit adds an idea, typed right in its new planet, and a long press, a right click or F2 edits a node's text where it is. A node held still, by a long press or the mouse, lifts: drag it onto another node to move it there, or to a place in the orbit to put it there. Default false. | [`RendererOptions`](#rendereroptions).[`editable`](#property-editable-2) |
| <a id="property-editingkeys"></a> `editingKeys?` | `boolean` | Keys for building an editable map at speed, as in mind-map apps. On a node with keyboard focus, Tab (or Insert) adds an idea under it, Shift+Enter adds one beside it, and Delete removes it. While typing, Tab keeps what was typed and goes on a level down, under it; with nothing typed, it moves the field under the idea before. Shift+Tab goes on a level up, beside the parent. Tab then stays in the map; Shift+Tab from a node still leaves it. Default false. | [`RendererOptions`](#rendereroptions).[`editingKeys`](#property-editingkeys-2) |
| <a id="property-focus"></a> `focus?` | `string` | The node in focus when the map first draws, by id: to open a map where the reader left it. Default: the root. Later renders keep the reader's place. | [`RendererOptions`](#rendereroptions).[`focus`](#property-focus-5) |
| <a id="property-height"></a> `height?` | `number` | - | - |
| <a id="property-insets"></a> `insets?` | [`OrbitInsets`](#orbitinsets) | The parts of the map the page covers with its own controls, such as a toolbar floating over its bottom edge, in px from each edge. Views are fitted into what's left, and the map still draws under the controls. Changing them glides a fitted view to its new place. | [`RendererOptions`](#rendereroptions).[`insets`](#property-insets-2) |
| <a id="property-interactive"></a> `interactive?` | `boolean` | `false` draws a still picture: no clicks, drags, zoom or keyboard. Default true. | [`RendererOptions`](#rendereroptions).[`interactive`](#property-interactive-3) |
| <a id="property-language"></a> `language?` | `string` | The language of the map's controls, sheets and announcements: a BCP 47 tag such as `es` or `pt-BR`. Default: the language the map's element is in (the closest `lang` attribute), then English. Orbit speaks English and Spanish; `registerLanguage` adds others. | [`RendererOptions`](#rendereroptions).[`language`](#property-language-4) |
| <a id="property-longpressdelay"></a> `longPressDelay?` | `number` | How long (ms) a finger or pen holds still on a node before it counts as a long press (see `onNodeContext`). Default 500; apps can pass their platform's own, such as Android's 400. | [`RendererOptions`](#rendereroptions).[`longPressDelay`](#property-longpressdelay-2) |
| <a id="property-maxdepth"></a> `maxDepth?` | `number` | Levels below the root to render (1 = root + direct children). | [`RendererOptions`](#rendereroptions).[`maxDepth`](#property-maxdepth-3) |
| <a id="property-mediaviewer"></a> `mediaViewer?` | `boolean` | Show pictures and videos in the media viewer, over the whole window: "View image" and "Play video" open it, and so do the pictures and videos in the detail sheet. Default true. With `false`, those buttons open the detail sheet instead (unless `showDetailSheet` is `false` too). `openMedia` opens the viewer either way. | [`RendererOptions`](#rendereroptions).[`mediaViewer`](#property-mediaviewer-2) |
| <a id="property-nodetypefor"></a> `nodeTypeFor?` | (`node`) => `string` \| `undefined` | The type a node that names none is drawn as, for display only: as if it said `type: name`, with that type's look, content and actions. Orbit never writes it to the map, and asks again whenever it draws; return undefined to draw the node as it is. Called often: keep it quick. | [`RendererOptions`](#rendereroptions).[`nodeTypeFor`](#property-nodetypefor-3) |
| <a id="property-nodetypes"></a> `nodeTypes?` | `Record`\<`string`, [`OrbitNodeType`](#orbitnodetype)\> | Node types by name: what nodes with `type: name` look like, draw inside them, show in the detail sheet and offer as actions. They come before the ones registered with `registerNodeType`. | [`RendererOptions`](#rendereroptions).[`nodeTypes`](#property-nodetypes-3) |
| <a id="property-noterenderer"></a> `noteRenderer?` | (`note`, `context`) => `string` | Renders a note to HTML yourself. The HTML is used as-is: sanitize untrusted notes. | [`RendererOptions`](#rendereroptions).[`noteRenderer`](#property-noterenderer-2) |
| <a id="property-onaction"></a> `onAction?` | (`event`) => `false` \| `void` | A button was pressed. Return `false` to skip what it does (the detail sheet, the link, or your action's `run`). | [`RendererOptions`](#rendereroptions).[`onAction`](#property-onaction-2) |
| <a id="property-onedit"></a> `onEdit?` | (`edit`) => `void` | The map was edited with `addNode`, `updateNode`, `removeNode` or `moveNode`; save `renderer.toMarkdown()` to keep it. | [`RendererOptions`](#rendereroptions).[`onEdit`](#property-onedit-2) |
| <a id="property-oneditorclose"></a> `onEditorClose?` | (`event`) => `void` | The field for typing on the map closed. | [`RendererOptions`](#rendereroptions).[`onEditorClose`](#property-oneditorclose-2) |
| <a id="property-oneditoropen"></a> `onEditorOpen?` | (`event`) => `void` | The field for typing on the map opened. | [`RendererOptions`](#rendereroptions).[`onEditorOpen`](#property-oneditoropen-2) |
| <a id="property-onfocuschange"></a> `onFocusChange?` | (`node`) => `void` | A new node is in focus. | [`RendererOptions`](#rendereroptions).[`onFocusChange`](#property-onfocuschange-2) |
| <a id="property-onmediaclose"></a> `onMediaClose?` | (`event`) => `void` | The media viewer closed. | [`RendererOptions`](#rendereroptions).[`onMediaClose`](#property-onmediaclose-2) |
| <a id="property-onmediaopen"></a> `onMediaOpen?` | (`event`) => `void` | The media viewer opened, or stepped to another picture or video. | [`RendererOptions`](#rendereroptions).[`onMediaOpen`](#property-onmediaopen-2) |
| <a id="property-onmediastate"></a> `onMediaState?` | (`state`) => `void` | The video in the media viewer started, paused, moved on, ended or was muted; while it plays, its time a few times a second. | [`RendererOptions`](#rendereroptions).[`onMediaState`](#property-onmediastate-2) |
| <a id="property-onnodeclick"></a> `onNodeClick?` | (`node`) => `void` | A node was clicked or activated with the keyboard, before the map reacts. | [`RendererOptions`](#rendereroptions).[`onNodeClick`](#property-onnodeclick-2) |
| <a id="property-onnodecontext"></a> `onNodeContext?` | (`event`) => `void` | A node was long-pressed, right-clicked or chosen with the context menu key: show a menu of things to do with it at (`x`, `y`). With this callback or a `node-context` listener, the press is yours: it doesn't open the node, and the browser's own menu stays closed. | [`RendererOptions`](#rendereroptions).[`onNodeContext`](#property-onnodecontext-2) |
| <a id="property-onnodedrag"></a> `onNodeDrag?` | (`event`) => `void` | A node is dragged somewhere else (see `editable` and the `node-drag` event). | [`RendererOptions`](#rendereroptions).[`onNodeDrag`](#property-onnodedrag-2) |
| <a id="property-onspinsettle"></a> `onSpinSettle?` | (`planet`) => `void` | Called when a flicked orbit comes to rest, with the planet nearest the top. | [`RendererOptions`](#rendereroptions).[`onSpinSettle`](#property-onspinsettle-2) |
| <a id="property-onviewmodechange"></a> `onViewModeChange?` | (`mode`) => `void` | - | [`RendererOptions`](#rendereroptions).[`onViewModeChange`](#property-onviewmodechange-2) |
| <a id="property-orbitanimation"></a> `orbitAnimation?` | `boolean` | Keep the orbit turning slowly on its own. | [`RendererOptions`](#rendereroptions).[`orbitAnimation`](#property-orbitanimation-3) |
| <a id="property-orbitspeed"></a> `orbitSpeed?` | `number` | Seconds per revolution of `orbitAnimation`. | [`RendererOptions`](#rendereroptions).[`orbitSpeed`](#property-orbitspeed-3) |
| <a id="property-palette"></a> `palette?` | `string`[] | Node colors: the first for the root, then one per top-level branch (cycling). Default: the theme's. | [`RendererOptions`](#rendereroptions).[`palette`](#property-palette-4) |
| <a id="property-selector"></a> `selector?` | `string` | - | - |
| <a id="property-showactionbuttons"></a> `showActionButtons?` | `boolean` | Buttons under the focused node for its note, media, link and actions. Default true. | [`RendererOptions`](#rendereroptions).[`showActionButtons`](#property-showactionbuttons-2) |
| <a id="property-showcontrols"></a> `showControls?` | `boolean` | Breadcrumbs, the view switch, the list button and zoom buttons. Default true. | [`RendererOptions`](#rendereroptions).[`showControls`](#property-showcontrols-2) |
| <a id="property-showdetailsheet"></a> `showDetailSheet?` | `boolean` | Open the built-in detail sheet for notes, embeds and the details of a node's type. Default true. | [`RendererOptions`](#rendereroptions).[`showDetailSheet`](#property-showdetailsheet-2) |
| <a id="property-showrings"></a> `showRings?` | `boolean` | Draw the dashed orbit rings. Default true. | [`RendererOptions`](#rendereroptions).[`showRings`](#property-showrings-3) |
| <a id="property-spin"></a> `spin?` | [`OrbitSpinOptions`](#orbitspinoptions) | How a flicked orbit spins. | [`RendererOptions`](#rendereroptions).[`spin`](#property-spin-2) |
| <a id="property-statuses"></a> `statuses?` | `Record`\<`string`, [`OrbitStatusStyle`](#orbitstatusstyle)\> | Status words and how they look: a dot tone (`active`, `done`, `blocked`, `todo`, `neutral`) or any CSS color, as in `{ review: 'active', 'on hold': '#A855F7' }`. | [`RendererOptions`](#rendereroptions).[`statuses`](#property-statuses-3) |
| <a id="property-strict"></a> `strict?` | `boolean` | - | - |
| <a id="property-strings"></a> `strings?` | `Partial`\<[`OrbitStrings`](#orbitstrings)\> | Words to change on this map only, over its language's: `{ zoomIn: 'Closer' }`. | [`RendererOptions`](#rendereroptions).[`strings`](#property-strings-4) |
| <a id="property-theme"></a> `theme?` | \| [`OrbitThemePreset`](#orbitthemepreset) \| [`OrbitRendererTheme`](#orbitrenderertheme) \| `string` & `object` | A theme name (`'night'`, `'cosmos'`, or one registered with `registerTheme`) or a theme object. An object without a `preset` keeps the document's theme and changes the tokens it names. | [`RendererOptions`](#rendereroptions).[`theme`](#property-theme-5) |
| <a id="property-transitionduration"></a> `transitionDuration?` | `number` \| `"auto"` | Navigation flight length in milliseconds, or `auto` to scale with the distance travelled. | [`RendererOptions`](#rendereroptions).[`transitionDuration`](#property-transitionduration-2) |
| <a id="property-viewmode"></a> `viewMode?` | [`ViewMode`](#viewmode) | The first view: `focus` (default) or `all`, the overview. | [`RendererOptions`](#rendereroptions).[`viewMode`](#property-viewmode-5) |
| <a id="property-zoom"></a> `zoom?` | [`OrbitZoomOptions`](#orbitzoomoptions) | How the wheel, trackpads and pinches zoom. | [`RendererOptions`](#rendereroptions).[`zoom`](#property-zoom-3) |

***

### CreateOrbitMapOptions

#### Extends

- [`RendererOptions`](#rendereroptions)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-actions-1"></a> `actions?` | [`OrbitAction`](#orbitaction)[] | Your own buttons under the focused node and in its detail sheet, before the registered ones. | [`RendererOptions`](#rendereroptions).[`actions`](#property-actions-3) |
| <a id="property-arialabel-1"></a> `ariaLabel?` | `string` | The map's accessible name. Default: the document's `title`. | [`RendererOptions`](#rendereroptions).[`ariaLabel`](#property-arialabel-2) |
| <a id="property-baseurl-1"></a> `baseUrl?` | `string` | Resolves relative image, video and link URLs. | [`RendererOptions`](#rendereroptions).[`baseUrl`](#property-baseurl-5) |
| <a id="property-editable-1"></a> `editable?` | `boolean` | Build the map on the map: a + in the orbit adds an idea, typed right in its new planet, and a long press, a right click or F2 edits a node's text where it is. A node held still, by a long press or the mouse, lifts: drag it onto another node to move it there, or to a place in the orbit to put it there. Default false. | [`RendererOptions`](#rendereroptions).[`editable`](#property-editable-2) |
| <a id="property-editingkeys-1"></a> `editingKeys?` | `boolean` | Keys for building an editable map at speed, as in mind-map apps. On a node with keyboard focus, Tab (or Insert) adds an idea under it, Shift+Enter adds one beside it, and Delete removes it. While typing, Tab keeps what was typed and goes on a level down, under it; with nothing typed, it moves the field under the idea before. Shift+Tab goes on a level up, beside the parent. Tab then stays in the map; Shift+Tab from a node still leaves it. Default false. | [`RendererOptions`](#rendereroptions).[`editingKeys`](#property-editingkeys-2) |
| <a id="property-focus-1"></a> `focus?` | `string` | The node in focus when the map first draws, by id: to open a map where the reader left it. Default: the root. Later renders keep the reader's place. | [`RendererOptions`](#rendereroptions).[`focus`](#property-focus-5) |
| <a id="property-insets-1"></a> `insets?` | [`OrbitInsets`](#orbitinsets) | The parts of the map the page covers with its own controls, such as a toolbar floating over its bottom edge, in px from each edge. Views are fitted into what's left, and the map still draws under the controls. Changing them glides a fitted view to its new place. | [`RendererOptions`](#rendereroptions).[`insets`](#property-insets-2) |
| <a id="property-interactive-1"></a> `interactive?` | `boolean` | `false` draws a still picture: no clicks, drags, zoom or keyboard. Default true. | [`RendererOptions`](#rendereroptions).[`interactive`](#property-interactive-3) |
| <a id="property-language-1"></a> `language?` | `string` | The language of the map's controls, sheets and announcements: a BCP 47 tag such as `es` or `pt-BR`. Default: the language the map's element is in (the closest `lang` attribute), then English. Orbit speaks English and Spanish; `registerLanguage` adds others. | [`RendererOptions`](#rendereroptions).[`language`](#property-language-4) |
| <a id="property-longpressdelay-1"></a> `longPressDelay?` | `number` | How long (ms) a finger or pen holds still on a node before it counts as a long press (see `onNodeContext`). Default 500; apps can pass their platform's own, such as Android's 400. | [`RendererOptions`](#rendereroptions).[`longPressDelay`](#property-longpressdelay-2) |
| <a id="property-maxdepth-1"></a> `maxDepth?` | `number` | Levels below the root to render (1 = root + direct children). | [`RendererOptions`](#rendereroptions).[`maxDepth`](#property-maxdepth-3) |
| <a id="property-mediaviewer-1"></a> `mediaViewer?` | `boolean` | Show pictures and videos in the media viewer, over the whole window: "View image" and "Play video" open it, and so do the pictures and videos in the detail sheet. Default true. With `false`, those buttons open the detail sheet instead (unless `showDetailSheet` is `false` too). `openMedia` opens the viewer either way. | [`RendererOptions`](#rendereroptions).[`mediaViewer`](#property-mediaviewer-2) |
| <a id="property-nodetypefor-1"></a> `nodeTypeFor?` | (`node`) => `string` \| `undefined` | The type a node that names none is drawn as, for display only: as if it said `type: name`, with that type's look, content and actions. Orbit never writes it to the map, and asks again whenever it draws; return undefined to draw the node as it is. Called often: keep it quick. | [`RendererOptions`](#rendereroptions).[`nodeTypeFor`](#property-nodetypefor-3) |
| <a id="property-nodetypes-1"></a> `nodeTypes?` | `Record`\<`string`, [`OrbitNodeType`](#orbitnodetype)\> | Node types by name: what nodes with `type: name` look like, draw inside them, show in the detail sheet and offer as actions. They come before the ones registered with `registerNodeType`. | [`RendererOptions`](#rendereroptions).[`nodeTypes`](#property-nodetypes-3) |
| <a id="property-noterenderer-1"></a> `noteRenderer?` | (`note`, `context`) => `string` | Renders a note to HTML yourself. The HTML is used as-is: sanitize untrusted notes. | [`RendererOptions`](#rendereroptions).[`noteRenderer`](#property-noterenderer-2) |
| <a id="property-onaction-1"></a> `onAction?` | (`event`) => `false` \| `void` | A button was pressed. Return `false` to skip what it does (the detail sheet, the link, or your action's `run`). | [`RendererOptions`](#rendereroptions).[`onAction`](#property-onaction-2) |
| <a id="property-onedit-1"></a> `onEdit?` | (`edit`) => `void` | The map was edited with `addNode`, `updateNode`, `removeNode` or `moveNode`; save `renderer.toMarkdown()` to keep it. | [`RendererOptions`](#rendereroptions).[`onEdit`](#property-onedit-2) |
| <a id="property-oneditorclose-1"></a> `onEditorClose?` | (`event`) => `void` | The field for typing on the map closed. | [`RendererOptions`](#rendereroptions).[`onEditorClose`](#property-oneditorclose-2) |
| <a id="property-oneditoropen-1"></a> `onEditorOpen?` | (`event`) => `void` | The field for typing on the map opened. | [`RendererOptions`](#rendereroptions).[`onEditorOpen`](#property-oneditoropen-2) |
| <a id="property-onfocuschange-1"></a> `onFocusChange?` | (`node`) => `void` | A new node is in focus. | [`RendererOptions`](#rendereroptions).[`onFocusChange`](#property-onfocuschange-2) |
| <a id="property-onmediaclose-1"></a> `onMediaClose?` | (`event`) => `void` | The media viewer closed. | [`RendererOptions`](#rendereroptions).[`onMediaClose`](#property-onmediaclose-2) |
| <a id="property-onmediaopen-1"></a> `onMediaOpen?` | (`event`) => `void` | The media viewer opened, or stepped to another picture or video. | [`RendererOptions`](#rendereroptions).[`onMediaOpen`](#property-onmediaopen-2) |
| <a id="property-onmediastate-1"></a> `onMediaState?` | (`state`) => `void` | The video in the media viewer started, paused, moved on, ended or was muted; while it plays, its time a few times a second. | [`RendererOptions`](#rendereroptions).[`onMediaState`](#property-onmediastate-2) |
| <a id="property-onnodeclick-1"></a> `onNodeClick?` | (`node`) => `void` | A node was clicked or activated with the keyboard, before the map reacts. | [`RendererOptions`](#rendereroptions).[`onNodeClick`](#property-onnodeclick-2) |
| <a id="property-onnodecontext-1"></a> `onNodeContext?` | (`event`) => `void` | A node was long-pressed, right-clicked or chosen with the context menu key: show a menu of things to do with it at (`x`, `y`). With this callback or a `node-context` listener, the press is yours: it doesn't open the node, and the browser's own menu stays closed. | [`RendererOptions`](#rendereroptions).[`onNodeContext`](#property-onnodecontext-2) |
| <a id="property-onnodedrag-1"></a> `onNodeDrag?` | (`event`) => `void` | A node is dragged somewhere else (see `editable` and the `node-drag` event). | [`RendererOptions`](#rendereroptions).[`onNodeDrag`](#property-onnodedrag-2) |
| <a id="property-onspinsettle-1"></a> `onSpinSettle?` | (`planet`) => `void` | Called when a flicked orbit comes to rest, with the planet nearest the top. | [`RendererOptions`](#rendereroptions).[`onSpinSettle`](#property-onspinsettle-2) |
| <a id="property-onviewmodechange-1"></a> `onViewModeChange?` | (`mode`) => `void` | - | [`RendererOptions`](#rendereroptions).[`onViewModeChange`](#property-onviewmodechange-2) |
| <a id="property-orbitanimation-1"></a> `orbitAnimation?` | `boolean` | Keep the orbit turning slowly on its own. | [`RendererOptions`](#rendereroptions).[`orbitAnimation`](#property-orbitanimation-3) |
| <a id="property-orbitspeed-1"></a> `orbitSpeed?` | `number` | Seconds per revolution of `orbitAnimation`. | [`RendererOptions`](#rendereroptions).[`orbitSpeed`](#property-orbitspeed-3) |
| <a id="property-palette-1"></a> `palette?` | `string`[] | Node colors: the first for the root, then one per top-level branch (cycling). Default: the theme's. | [`RendererOptions`](#rendereroptions).[`palette`](#property-palette-4) |
| <a id="property-showactionbuttons-1"></a> `showActionButtons?` | `boolean` | Buttons under the focused node for its note, media, link and actions. Default true. | [`RendererOptions`](#rendereroptions).[`showActionButtons`](#property-showactionbuttons-2) |
| <a id="property-showcontrols-1"></a> `showControls?` | `boolean` | Breadcrumbs, the view switch, the list button and zoom buttons. Default true. | [`RendererOptions`](#rendereroptions).[`showControls`](#property-showcontrols-2) |
| <a id="property-showdetailsheet-1"></a> `showDetailSheet?` | `boolean` | Open the built-in detail sheet for notes, embeds and the details of a node's type. Default true. | [`RendererOptions`](#rendereroptions).[`showDetailSheet`](#property-showdetailsheet-2) |
| <a id="property-showrings-1"></a> `showRings?` | `boolean` | Draw the dashed orbit rings. Default true. | [`RendererOptions`](#rendereroptions).[`showRings`](#property-showrings-3) |
| <a id="property-spin-1"></a> `spin?` | [`OrbitSpinOptions`](#orbitspinoptions) | How a flicked orbit spins. | [`RendererOptions`](#rendereroptions).[`spin`](#property-spin-2) |
| <a id="property-statuses-1"></a> `statuses?` | `Record`\<`string`, [`OrbitStatusStyle`](#orbitstatusstyle)\> | Status words and how they look: a dot tone (`active`, `done`, `blocked`, `todo`, `neutral`) or any CSS color, as in `{ review: 'active', 'on hold': '#A855F7' }`. | [`RendererOptions`](#rendereroptions).[`statuses`](#property-statuses-3) |
| <a id="property-strict-1"></a> `strict?` | `boolean` | Throw on the first problem in the source instead of working around it. | - |
| <a id="property-strings-1"></a> `strings?` | `Partial`\<[`OrbitStrings`](#orbitstrings)\> | Words to change on this map only, over its language's: `{ zoomIn: 'Closer' }`. | [`RendererOptions`](#rendereroptions).[`strings`](#property-strings-4) |
| <a id="property-theme-1"></a> `theme?` | \| [`OrbitThemePreset`](#orbitthemepreset) \| [`OrbitRendererTheme`](#orbitrenderertheme) \| `string` & `object` | A theme name (`'night'`, `'cosmos'`, or one registered with `registerTheme`) or a theme object. An object without a `preset` keeps the document's theme and changes the tokens it names. | [`RendererOptions`](#rendereroptions).[`theme`](#property-theme-5) |
| <a id="property-transitionduration-1"></a> `transitionDuration?` | `number` \| `"auto"` | Navigation flight length in milliseconds, or `auto` to scale with the distance travelled. | [`RendererOptions`](#rendereroptions).[`transitionDuration`](#property-transitionduration-2) |
| <a id="property-viewmode-1"></a> `viewMode?` | [`ViewMode`](#viewmode) | The first view: `focus` (default) or `all`, the overview. | [`RendererOptions`](#rendereroptions).[`viewMode`](#property-viewmode-5) |
| <a id="property-zoom-1"></a> `zoom?` | [`OrbitZoomOptions`](#orbitzoomoptions) | How the wheel, trackpads and pinches zoom. | [`RendererOptions`](#rendereroptions).[`zoom`](#property-zoom-3) |

***

### MapToolResult

What a tool call did, to send back to the model.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-changed"></a> `changed` | `boolean` | Whether the map changed. |
| <a id="property-ok"></a> `ok` | `boolean` | False when the call couldn't be carried out: nothing changed, and `text` says why and what to send instead. |
| <a id="property-text"></a> `text` | `string` | What happened, for the model, with the ids to use next. |

***

### MapTools

Map tools for one map (see `createMapTools`).

#### Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-definitions"></a> `definitions` | `readonly` | [`MapToolDefinition`](#maptooldefinition)[] | The tools: name, description, input as JSON Schema, and hints. The shape MCP takes, and the data for any other. |
| <a id="property-document"></a> `document` | `readonly` | [`OrbitDocument`](#orbitdocument) \| `null` | The map as it is now. Edits change it in place. |
| <a id="property-instructions"></a> `instructions` | `readonly` | `string` | How to use the tools, to add to the model's system prompt. |

#### Methods

##### for()

```ts
for<Provider>(provider): MapToolFormats[Provider];
```

The tools in the shape a provider's API takes: `anthropic`, `openai` (Responses), `openai-chat` (Chat Completions, and most other providers) or `gemini`.

###### Type Parameters

| Type Parameter |
| ------ |
| `Provider` *extends* keyof [`MapToolFormats`](#maptoolformats) |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `provider` | `Provider` |

###### Returns

[`MapToolFormats`](#maptoolformats)\[`Provider`\]

##### run()

```ts
run(name, input?): MapToolResult;
```

Carries out a tool call: its name, and its input as an object or as
the JSON text OpenAI sends. Never throws for a call a model gets wrong:
the result says what went wrong instead.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `input?` | `unknown` |

###### Returns

[`MapToolResult`](#maptoolresult)

***

### MapToolsOptions

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-readlimit"></a> `readLimit?` | `number` | The most nodes `read_map` shows at once; a bigger map is cut short, whole levels first. Default 250. |
| <a id="property-readonly"></a> `readOnly?` | `boolean` | Offer only the tools that read the map, for an assistant that answers questions about it. Default false. |

***

### MaterialThemeOptions

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-dark"></a> `dark?` | `boolean` | Dark surfaces with light text, like `material-night`, instead of light ones. |

***

### OrbitAction

A button under the focused node and in its detail sheet.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-icon"></a> `icon?` | `string` | The icon: an emoji or short symbol (`'✏️'`), SVG path data on a 24-unit grid (`'M4 20h4L20 8l-4-4L4 16z'`), or one of Orbit's icons (`'note'`, `'link'`, `'goto'`, `'image'`, `'video'`, `'list'`). Default: the label's first letter. |
| <a id="property-id"></a> `id` | `string` | Names the action in the `action` event: `event.action === 'assign'`. |
| <a id="property-label"></a> `label` | `string` \| ((`node`) => `string`) | The button's name, read by screen readers, shown as its tooltip and in the detail sheet. |
| <a id="property-run"></a> `run` | (`node`, `event`) => `void` | Runs when the button is pressed, unless an `action` listener prevents it. |
| <a id="property-when"></a> `when?` | (`node`) => `boolean` | Which nodes offer the action. Default: every node. |

***

### OrbitActionDetail

The `action` event: call `preventDefault()` to skip what the button does (the detail sheet, the link, or your action's `run`).

#### Extends

- [`OrbitActionEvent`](#orbitactionevent)

#### Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="property-action"></a> `action` | `public` | `string` & `object` \| [`OrbitContentAction`](#orbitcontentaction) | One of Orbit's buttons, or the `id` of one of your actions. | [`OrbitActionEvent`](#orbitactionevent).[`action`](#property-action-1) |
| <a id="property-defaultprevented"></a> `defaultPrevented` | `readonly` | `boolean` | - | - |
| <a id="property-node"></a> `node` | `public` | [`OrbitNode`](#orbitnode) | - | [`OrbitActionEvent`](#orbitactionevent).[`node`](#property-node-1) |
| <a id="property-sourceevent"></a> `sourceEvent` | `public` | `MouseEvent` \| `KeyboardEvent` | - | [`OrbitActionEvent`](#orbitactionevent).[`sourceEvent`](#property-sourceevent-1) |

#### Methods

##### preventDefault()

```ts
preventDefault(): void;
```

###### Returns

`void`

***

### OrbitActionEvent

A button pressed under the focused node or in its detail sheet.

#### Extended by

- [`OrbitActionDetail`](#orbitactiondetail)

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-action-1"></a> `action` | `string` & `object` \| [`OrbitContentAction`](#orbitcontentaction) | One of Orbit's buttons, or the `id` of one of your actions. |
| <a id="property-node-1"></a> `node` | [`OrbitNode`](#orbitnode) | - |
| <a id="property-sourceevent-1"></a> `sourceEvent` | `MouseEvent` \| `KeyboardEvent` | - |

***

### OrbitDiagnostic

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-code"></a> `code` | \| `"empty-document"` \| `"no-structure"` \| `"synthetic-root"` \| `"invalid-frontmatter"` \| `"unknown-frontmatter-key"` \| `"unsupported-schema-version"` \| `"format-upgraded"` \| `"invalid-attributes"` \| `"unknown-attribute"` \| `"invalid-option-value"` \| `"media-missing-source"` \| `"unknown-content-type"` \| `"caption-without-media"` \| `"unknown-link-target"` \| `"invalid-yaml"` \| `"unknown-yaml-key"` \| `"ignored-node-entry"` \| `"misnamed-node-key"` \| `"comment-without-orbit"` \| `"attributes-after-list"` | - |
| <a id="property-line"></a> `line?` | `number` | 1-based line in the source passed to the parser, when known. |
| <a id="property-message"></a> `message` | `string` | - |
| <a id="property-severity"></a> `severity` | [`OrbitDiagnosticSeverity`](#orbitdiagnosticseverity) | - |

***

### OrbitDocument

A parsed map: its tree, its options and the problems the parser worked around.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-diagnostics"></a> `diagnostics?` | [`OrbitDiagnostic`](#orbitdiagnostic)[] | The same problems with a code, line and severity. Always set on parse results. |
| <a id="property-extra"></a> `extra?` | `Record`\<`string`, `unknown`\> | Frontmatter or top-level YAML keys Orbit doesn't read (another app's, or a newer Orbit's), as written. Both serializers write them back, so nothing a document says is lost by reading and saving it. |
| <a id="property-options"></a> `options` | [`OrbitDocumentOptions`](#orbitdocumentoptions) | - |
| <a id="property-root"></a> `root` | [`OrbitNode`](#orbitnode) | - |
| <a id="property-warnings"></a> `warnings` | `string`[] | Problems the parser recovered from, one line each ("Line 4: …"). |

***

### OrbitDocumentOptions

Options a document sets in its frontmatter (markdown) or top-level keys (YAML).

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-baseurl-2"></a> `baseUrl?` | `string` | - |
| <a id="property-classname-1"></a> `className?` | `string` | - |
| <a id="property-height-1"></a> `height?` | `number` | Height in pixels, used by `<orbit-map>` elements and marked placeholders. |
| <a id="property-interactive-2"></a> `interactive?` | `boolean` | - |
| <a id="property-maxdepth-2"></a> `maxDepth?` | `number` | - |
| <a id="property-orbitanimation-2"></a> `orbitAnimation?` | `boolean` | Written `animation:` in the document. |
| <a id="property-orbitspeed-2"></a> `orbitSpeed?` | `number` | Written `speed:` in the document: seconds per turn of the orbit's drift. |
| <a id="property-palette-2"></a> `palette?` | `string`[] | - |
| <a id="property-schemaversion"></a> `schemaVersion?` | `number` | The format version the document is written for. |
| <a id="property-showrings-2"></a> `showRings?` | `boolean` | - |
| <a id="property-theme-2"></a> `theme?` | `string` | A theme name, as written (unknown names are reported and ignored). |
| <a id="property-title"></a> `title?` | `string` | The map's accessible name and SVG title. |
| <a id="property-viewmode-2"></a> `viewMode?` | [`ViewMode`](#viewmode) | Written `view:` in the document. |

***

### OrbitEdit

An edit to the map, as the `edit` event and `onEdit` report it.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-kind"></a> `kind` | `"remove"` \| `"add"` \| `"update"` \| `"move"` | - |
| <a id="property-node-2"></a> `node` | [`OrbitNode`](#orbitnode) | The node added, changed, removed or moved. |
| <a id="property-tree"></a> `tree` | [`OrbitNode`](#orbitnode) | The whole tree after the edit. `renderer.toMarkdown()` writes it as orbit-md. |

***

### OrbitEditorEvent

The field for typing a node's text on the map (see `editable`, `editNode` and `editNewNode`).

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-node-3"></a> `node` | [`OrbitNode`](#orbitnode) \| `null` | The node whose text is typed, or null for a new idea. |
| <a id="property-parent"></a> `parent` | [`OrbitNode`](#orbitnode) \| `null` | For a new idea, the node it goes under. |

***

### OrbitEventMap

What a map reports, by event name. Listen with `renderer.on(name, listener)`,
or for `orbit-<name>` DOM events, which bubble from the map's container
(and out of `<orbit-map>`).

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-action-2"></a> `action` | [`OrbitActionDetail`](#orbitactiondetail) | A content button under the focused node was pressed. |
| <a id="property-edit"></a> `edit` | [`OrbitEdit`](#orbitedit) | The map was edited with `addNode`, `updateNode`, `removeNode` or `moveNode`. |
| <a id="property-editor-close"></a> `editor-close` | [`OrbitEditorEvent`](#orbiteditorevent) | The field for typing on the map closed. |
| <a id="property-editor-open"></a> `editor-open` | [`OrbitEditorEvent`](#orbiteditorevent) | The field for typing on the map opened: on a node, or in the orbit for a new idea. |
| <a id="property-focus-change"></a> `focus-change` | `object` | The focused node changed. `path` runs from the root to `node`. |
| `focus-change.node` | [`OrbitNode`](#orbitnode) | - |
| `focus-change.path` | [`OrbitNode`](#orbitnode)[] | - |
| <a id="property-media-close"></a> `media-close` | [`OrbitMediaEvent`](#orbitmediaevent) | The media viewer closed. |
| <a id="property-media-open"></a> `media-open` | [`OrbitMediaEvent`](#orbitmediaevent) | The media viewer opened, or stepped to another picture or video. |
| <a id="property-media-state"></a> `media-state` | [`OrbitMediaState`](#orbitmediastate) | The video in the media viewer started, paused, moved on, ended or was muted; while it plays, its time a few times a second. |
| <a id="property-node-click"></a> `node-click` | `object` | A node was clicked or activated with the keyboard, before the map reacts. |
| `node-click.node` | [`OrbitNode`](#orbitnode) | - |
| <a id="property-node-context"></a> `node-context` | [`OrbitNodeContextEvent`](#orbitnodecontextevent) | A node was long-pressed, right-clicked, or chosen with the context menu key: the place for a menu of things to do with it. A DOM listener calls `preventDefault()` to take the press (see `onNodeContext`). |
| <a id="property-node-drag"></a> `node-drag` | [`OrbitNodeDragEvent`](#orbitnodedragevent) | A node is dragged somewhere else on an editable map: lifted, carried over a place, or let go (see `phase`). |
| <a id="property-spin-settle"></a> `spin-settle` | `object` | A spun orbit came to rest, with this planet on top. |
| `spin-settle.planet` | [`OrbitNode`](#orbitnode) | - |
| <a id="property-view-mode-change"></a> `view-mode-change` | `object` | The map switched between focus mode and the overview. |
| `view-mode-change.mode` | [`ViewMode`](#viewmode) | - |

***

### OrbitImport

What reading another app's file gives.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-format"></a> `format` | [`OrbitImportFormat`](#orbitimportformat) | - |
| <a id="property-maps"></a> `maps` | [`OrbitImportedMap`](#orbitimportedmap)[] | The file's maps: one, or one for each sheet of an XMind workbook. |

***

### OrbitImportedMap

One map read from another app's file.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-document-1"></a> `document` | [`OrbitDocument`](#orbitdocument) | - |
| <a id="property-media"></a> `media` | `Record`\<`string`, `Uint8Array`\> | Pictures from inside the file, by the address the map gives them: `media/sunrise.png`. Save them next to the map. |
| <a id="property-warnings-1"></a> `warnings` | [`OrbitImportWarning`](#orbitimportwarning)[] | What the other app had that Orbit keeps another way, or couldn't keep. |

***

### OrbitImportOptions

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-format-1"></a> `format?` | [`OrbitImportFormat`](#orbitimportformat) | The file's format, when you know it. Default: from the name, then from what the file holds. |
| <a id="property-name"></a> `name?` | `string` | The file's name: its extension tells the format, and a map with no single center is named after it. |
| <a id="property-untitled"></a> `untitled?` | `string` | The name of the center Orbit adds to a map with several top ideas and nothing to name it after. Default "Untitled map". |

***

### OrbitImportWarning

Something the other app's map had that Orbit keeps another way, or can't keep.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-code-1"></a> `code` | \| `"floating-ideas-moved"` \| `"summaries-moved"` \| `"callouts-moved"` \| `"boundaries-in-notes"` \| `"links-in-notes"` \| `"missing-link-targets"` \| `"icons-not-kept"` \| `"pictures-not-kept"` \| `"attachments-not-kept"` \| `"local-links-not-kept"` \| `"encrypted-branches-not-read"` \| `"formatting-not-kept"` | - |
| <a id="property-count"></a> `count` | `number` | How many places in the map it's about. |
| <a id="property-message-1"></a> `message` | `string` | - |

***

### OrbitInsets

Room the page's own controls take at the map's edges, in px (see `RendererOptions.insets`).

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-bottom"></a> `bottom?` | `number` |
| <a id="property-left"></a> `left?` | `number` |
| <a id="property-right"></a> `right?` | `number` |
| <a id="property-top"></a> `top?` | `number` |

***

### OrbitMapElement

The `<orbit-map>` element's API, for code that holds a reference to one.
It also dispatches the map's events (`orbit-focus-change`,
`orbit-view-mode-change`, `orbit-node-click`, `orbit-action`,
`orbit-spin-settle`, `orbit-media-open`, `orbit-media-close`,
`orbit-media-state` and the rest) and `orbit-error`.

#### Extends

- `HTMLElement`

#### Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-renderer"></a> `renderer` | `readonly` | [`OrbitSVGRenderer`](#orbitsvgrenderer) \| `null` | The renderer drawing the map, or null before the first render or after an error. |
| <a id="property-source"></a> `source` | `public` | `string` | The markdown or YAML the map is drawn from. Setting it updates the `source` attribute. |

#### Methods

##### closeMedia()

```ts
closeMedia(): void;
```

Closes the media viewer.

###### Returns

`void`

##### flyTo()

```ts
flyTo(nodeId): boolean;
```

Flies to a node by id, in focus mode. Returns false when the map has no such node.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `nodeId` | `string` |

###### Returns

`boolean`

##### openMedia()

```ts
openMedia(nodeId, options?): boolean;
```

Shows a node's picture or video in the media viewer (see `OrbitSVGRenderer.openMedia`). Returns false when there's nothing to show.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `nodeId` | `string` |
| `options?` | [`OrbitMediaOptions`](#orbitmediaoptions) |

###### Returns

`boolean`

##### overview()

```ts
overview(): void;
```

Flies out to the overview of the whole map.

###### Returns

`void`

##### pauseMedia()

```ts
pauseMedia(): boolean;
```

Pauses the video in the media viewer. Returns false when it shows none it can pause.

###### Returns

`boolean`

##### playMedia()

```ts
playMedia(): boolean;
```

Plays the video in the media viewer. Returns false when it shows none it can play.

###### Returns

`boolean`

##### refresh()

```ts
refresh(): void;
```

Re-reads the source and redraws the map, keeping the reader's place when it can.

###### Returns

`void`

##### seekMedia()

```ts
seekMedia(seconds): boolean;
```

Moves the video in the media viewer to `seconds` from its start. Returns false when it shows none it can move.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `seconds` | `number` |

###### Returns

`boolean`

##### unmuteMedia()

```ts
unmuteMedia(): boolean;
```

Turns on the sound of the video in the media viewer, from a press. Returns false when it shows none it can drive.

###### Returns

`boolean`

***

### OrbitMediaEvent

A node's picture or video in the media viewer.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-index"></a> `index` | `number` | Its place among the map's pictures and videos, in reading order, from 0. |
| <a id="property-kind-1"></a> `kind` | `"video"` \| `"image"` | `image`, the node's picture, or `video`, its video. |
| <a id="property-node-4"></a> `node` | [`OrbitNode`](#orbitnode) | - |
| <a id="property-total"></a> `total` | `number` | How many pictures and videos the viewer steps through. |

***

### OrbitMediaOptions

What `openMedia` shows.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-autoplay"></a> `autoplay?` | `boolean` | Start a video playing as it opens. Default true. |
| <a id="property-kind-2"></a> `kind?` | `"video"` \| `"image"` | For a node with a picture and a video: which to show. Default: the picture. |
| <a id="property-startat"></a> `startAt?` | `number` | Start a video this many seconds in. YouTube and Vimeo start at the whole second. Default 0. |

***

### OrbitMediaState

The video in the media viewer, as it plays (see the `media-state` event).

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-duration"></a> `duration` | `number` \| `null` | How long it is, in seconds, once known. |
| <a id="property-ended"></a> `ended` | `boolean` | It played to the end. |
| <a id="property-muted"></a> `muted` | `boolean` | Its sound is off. Browsers let a video start with sound only once the reader has interacted with the page; a video started before that plays muted. |
| <a id="property-node-5"></a> `node` | [`OrbitNode`](#orbitnode) | - |
| <a id="property-playing"></a> `playing` | `boolean` | Playing, rather than paused, not started yet, or ended. |
| <a id="property-time"></a> `time` | `number` | Where it is, in seconds from the start. |

***

### OrbitNode

One node of a map, as the parsers produce it.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-attrs"></a> `attrs?` | `Record`\<`string`, `unknown`\> | Attributes Orbit doesn't use itself, kept for your own code (`<!-- orbit owner: Ana -->`). |
| <a id="property-children"></a> `children` | [`OrbitNode`](#orbitnode)[] | - |
| <a id="property-collapsed"></a> `collapsed?` | `boolean` | Hide the node's children until it is opened. |
| <a id="property-color"></a> `color?` | `string` | Any CSS color. Without one, the node takes its branch's color from the theme or `palette`. |
| <a id="property-embed"></a> `embed?` | `object` | A page shown in a frame in the detail sheet. |
| `embed.caption?` | `string` | - |
| `embed.src` | `string` | - |
| <a id="property-icon-1"></a> `icon?` | `string` | An emoji (or any short symbol) shown before the text. |
| <a id="property-id-1"></a> `id` | `string` | Unique within the map: a slug of the text (`Product roadmap` becomes `product-roadmap`), or the `id` attribute. |
| <a id="property-image"></a> `image?` | `object` | A picture shown inside the node and in the detail sheet. |
| `image.alt?` | `string` | - |
| `image.caption?` | `string` | - |
| `image.src` | `string` | - |
| <a id="property-level"></a> `level` | `number` | Depth in the tree: 0 for the root. |
| <a id="property-link"></a> `link?` | `string` | A URL the node links to, offered as a button when the node is in focus. `#id` links to another node of the map: the button flies there. |
| <a id="property-note"></a> `note?` | `string` | Longer text, shown in the detail sheet: markdown unless `noteFormat` is `plain`. |
| <a id="property-noteformat"></a> `noteFormat?` | `"markdown"` \| `"plain"` | - |
| <a id="property-palettecolor"></a> `paletteColor?` | `number` | Which of the palette's colors the node takes when it has no `color` of its own: `1` is the first after the root's, cycling. Without one, a top-level node takes the next in turn and a deeper node a shade of its branch's. Edits on the map write it to keep a top-level node's color when the nodes around it change. |
| <a id="property-parent-1"></a> `parent?` | [`OrbitNode`](#orbitnode) | The parent node. Set by the parsers as a non-enumerable property, so trees stay JSON-serializable. |
| <a id="property-priority"></a> `priority?` | `number` | - |
| <a id="property-source-1"></a> `source?` | `object` | Where the node comes from in a markdown source. |
| `source.line` | `number` | - |
| `source.raw` | `string` | - |
| <a id="property-status"></a> `status?` | `string` | Free text. Some words get a colored dot: `active` (also `doing`, `in progress`), `done` (`complete`, `shipped`), `blocked` (`stuck`, `at risk`), `todo` (`planned`, `next`). |
| <a id="property-tags"></a> `tags?` | `string`[] | - |
| <a id="property-text-1"></a> `text` | `string` | The node's label, without its icon. |
| <a id="property-type"></a> `type?` | `string` | The node's type, such as `milestone`. A type defined in the `nodeTypes` option or with `registerNodeType` sets its look, content and actions. |
| <a id="property-typeversion"></a> `typeVersion?` | `number` | The version of its type the node was written for, when the type has changed its fields since its first one: `type: task@2`. Not written means 1. See `OrbitNodeType.version`. |
| <a id="property-video"></a> `video?` | `object` | A video (YouTube, Vimeo or a file) played in the detail sheet. |
| `video.caption?` | `string` | - |
| `video.provider?` | `"youtube"` \| `"vimeo"` \| `"native"` | - |
| `video.src` | `string` | - |
| `video.thumbnail?` | `string` | - |

***

### OrbitNodeContextEvent

A long press, right click or context menu key on a node.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-node-6"></a> `node` | [`OrbitNode`](#orbitnode) | - |
| <a id="property-x"></a> `x` | `number` | Where, in CSS pixels from the map's top left corner: the press, or the node's center for the keyboard. |
| <a id="property-y"></a> `y` | `number` | - |

***

### OrbitNodeDragEvent

A node dragged somewhere else (see `editable`). `start` as it leaves its
place under the finger, the moment to close a menu the long press opened;
`over` whenever where it would go changes; `end` when it's let go, after
the `edit` that moved it, if it moved.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-index-1"></a> `index` | `number` \| `null` | - |
| <a id="property-node-7"></a> `node` | [`OrbitNode`](#orbitnode) | - |
| <a id="property-parent-2"></a> `parent` | [`OrbitNode`](#orbitnode) \| `null` | Where it would go, or (on `end`) went: into `parent`, at `index` among its children (null: after the last). On `start`, where it was; null over no place, and on an `end` that put it back. |
| <a id="property-phase"></a> `phase` | `"end"` \| `"start"` \| `"over"` | - |

***

### OrbitNodeType

How nodes of one type look and behave. Nodes pick a type with `type: name`.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-actions-2"></a> `actions?` | [`OrbitAction`](#orbitaction)[] | Actions only nodes of this type offer, after the map's own. |
| <a id="property-color-1"></a> `color?` | `string` | The color these nodes get unless they set their own; their children take shades of it. |
| <a id="property-details"></a> `details?` | (`node`, `element`) => `void` | Adds a section to the detail sheet, above the note; the node gets a "Details" button. |
| <a id="property-icon-2"></a> `icon?` | `string` | The icon these nodes get unless they set their own. |
| <a id="property-label-1"></a> `label?` | `string` | The type's name for people, shown in the detail sheet and the tooltip: `'Milestone'`. |
| <a id="property-render"></a> `render?` | (`node`, `element`) => `void` \| (() => `void`) | Draws inside the node, the way a picture does: `element` is a 100 × 100 px box clipped to the node's circle and scaled with it, and the label moves outside. Return a function to clean up when the node leaves the map. |
| <a id="property-tokens"></a> `tokens?` | `Partial`\<`Record`\< \| `"sans-font"` \| `"serif-font"` \| `"mono-font"` \| `"font-family"` \| `"label-font"` \| `"display-font"` \| `"label-weight"` \| `"display-weight"` \| `"label-letter-spacing"` \| `"label-shadow"` \| `"surface"` \| `"surface-pattern"` \| `"text"` \| `"muted-text"` \| `"root-text"` \| `"node-text"` \| `"node-text-inverse"` \| `"color-root"` \| `"color-1"` \| `"color-2"` \| `"color-3"` \| `"color-4"` \| `"color-5"` \| `"color-6"` \| `"color-7"` \| `"shade-light"` \| `"shade-dark"` \| `"node-fill-opacity"` \| `"moon-opacity"` \| `"node-highlight"` \| `"node-terminator"` \| `"node-shading"` \| `"node-shade-circle"` \| `"node-stroke"` \| `"node-stroke-tint"` \| `"node-stroke-width"` \| `"badge-stroke"` \| `"node-shadow"` \| `"node-shadow-tint"` \| `"node-shadow-opacity"` \| `"node-shadow-offset"` \| `"node-shadow-size"` \| `"sun-shadow-opacity"` \| `"sun-shadow-size"` \| `"sun-halo"` \| `"sun-halo-tint"` \| `"sun-halo-opacity"` \| `"sun-halo-width"` \| `"sun-halo-dash"` \| `"sun-halo-size"` \| `"ring-stroke"` \| `"ring-tint"` \| `"ring-opacity"` \| `"ring-width"` \| `"ring-dash"` \| `"link-stroke"` \| `"link-tint"` \| `"link-opacity"` \| `"link-width"` \| `"link-dash"` \| `"focus-ring"` \| `"note-indicator"` \| `"control-background"` \| `"control-border"` \| `"control-text"` \| `"control-muted-text"` \| `"control-active-background"` \| `"control-active-text"` \| `"control-shadow"` \| `"control-blur"` \| `"tooltip-background"` \| `"tooltip-text"` \| `"action-background"` \| `"action-border"` \| `"action-text"` \| `"action-shadow"` \| `"sheet-background"` \| `"sheet-text"` \| `"sheet-muted-text"` \| `"sheet-border"` \| `"sheet-backdrop"` \| `"sheet-shadow"` \| `"sheet-blur"` \| `"chip-background"` \| `"chip-text"` \| `"link-text"` \| `"status-active"` \| `"status-done"` \| `"status-blocked"` \| `"status-todo"` \| `"status-neutral"` \| `"error-background"` \| `"error-border"` \| `"error-text"`, `string`\>\> | Theme tokens for these nodes only, without `--orbit-`: their rim, shadow, glow, label and status colors, such as `{ 'node-stroke': '#B45309', 'node-stroke-width': '3' }`. |
| <a id="property-upgrade"></a> `upgrade?` | (`node`, `from`) => `void` | Brings a node written for an older version of the type up to date: renames or reshapes its attributes, in place. `from` is the version it was written for. Runs once per node when a map is drawn (or with `upgradeNodeTypes`), and the next save writes the node as upgraded. Nodes written for a newer version than this one are left as they are. |
| <a id="property-version"></a> `version?` | `number` | The version of the fields these nodes keep in their attributes, once the type changes them: 1 at first. Nodes say which version they were written for (`type: task@2`; none means 1), and older ones are brought up to date with `upgrade` when a map is drawn. |

***

### OrbitNoteOptions

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-baseurl-3"></a> `baseUrl?` | `string` | Where relative links and pictures resolve from: the map's `baseUrl`. |
| <a id="property-resolvelink"></a> `resolveLink?` | (`href`) => `unknown` | Whether a `#id` link points at a node of the map; links to missing nodes show as text. |

***

### OrbitOPMLOptions

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-title-1"></a> `title?` | `string` | The outline's title, in its head. Default: the map's `title`, or its root's text. |

***

### OrbitPluralText

Text that depends on a number: one form for each plural category the
language uses (see `Intl.PluralRules`), `other` for any it leaves out.
`{count}` is the number, written the language's way.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-few"></a> `few?` | `string` |
| <a id="property-many"></a> `many?` | `string` |
| <a id="property-one"></a> `one?` | `string` |
| <a id="property-other"></a> `other` | `string` |
| <a id="property-two"></a> `two?` | `string` |
| <a id="property-zero"></a> `zero?` | `string` |

***

### OrbitPrintOptions

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-baseurl-4"></a> `baseUrl?` | `string` | Resolves relative picture, video and link URLs. Default: the document's `baseUrl`. |
| <a id="property-focus-2"></a> `focus?` | `string` | The node in the middle of the picture in focus mode, by id. Default: the root. |
| <a id="property-idprefix"></a> `idPrefix?` | `string` | Prefix for the picture's SVG ids; give each layout in one page its own. Default: `orbit-print`. |
| <a id="property-language-2"></a> `language?` | `string` | The language of the few words the layout has: a BCP 47 tag. Default: English. |
| <a id="property-nodetypefor-2"></a> `nodeTypeFor?` | (`node`) => `string` \| `undefined` | The type a node that names none is laid out as (see `RendererOptions.nodeTypeFor`). |
| <a id="property-nodetypes-2"></a> `nodeTypes?` | `Record`\<`string`, [`OrbitNodeType`](#orbitnodetype)\> | Node types by name, before the registered ones: their icons, colors, labels and details. |
| <a id="property-palette-3"></a> `palette?` | `string`[] | The map's colors: the root's, then one per top-level branch. Default: the document's, or the theme's. |
| <a id="property-picture"></a> `picture?` | `boolean` | Whether the map's picture comes before the outline. Default: true. |
| <a id="property-statuses-2"></a> `statuses?` | `Record`\<`string`, [`OrbitStatusStyle`](#orbitstatusstyle)\> | Status words and how they look, before the registered ones. |
| <a id="property-strings-2"></a> `strings?` | `Partial`\<[`OrbitStrings`](#orbitstrings)\> | Words to change, over the language's. |
| <a id="property-theme-3"></a> `theme?` | \| [`OrbitThemePreset`](#orbitthemepreset) \| [`OrbitRendererTheme`](#orbitrenderertheme) \| `string` & `object` | The map's theme: a theme name or `{ preset, tokens }`. Default: the document's. Paper is light, so a dark theme prints as its light counterpart (see `printTheme`), and nothing prints a background. |
| <a id="property-title-2"></a> `title?` | `string` | The heading at the top. Default: the map's `title`, or its root's text. |
| <a id="property-viewmode-3"></a> `viewMode?` | [`ViewMode`](#viewmode) | What the picture shows: `focus`, a node with its orbit, or `all`, the whole map. Default: the map's `view`, or `focus`. |

***

### OrbitRenderErrorDetail

Detail of the `orbit-error` event dispatched on an element whose map couldn't be drawn.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-diagnostics-1"></a> `diagnostics` | [`OrbitDiagnostic`](#orbitdiagnostic)[] |
| <a id="property-error"></a> `error` | `Error` \| `null` |
| <a id="property-line-1"></a> `line?` | `number` |
| <a id="property-message-2"></a> `message` | `string` |

***

### OrbitRendererTheme

A theme with your own values: `{ preset: 'night', tokens: { surface: '#0b1020', 'ring-dash': 'none' } }`.
Each token sets the matching `--orbit-*` CSS custom property on the map,
so a value the page sets in its own CSS still wins.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-preset"></a> `preset?` | [`OrbitThemePreset`](#orbitthemepreset) \| `string` & `object` | The theme to start from: a built-in one or one registered with `registerTheme`. Without one, the document's theme (or `paper`). |
| <a id="property-tokens-1"></a> `tokens?` | `Partial`\<`Record`\< \| `"sans-font"` \| `"serif-font"` \| `"mono-font"` \| `"font-family"` \| `"label-font"` \| `"display-font"` \| `"label-weight"` \| `"display-weight"` \| `"label-letter-spacing"` \| `"label-shadow"` \| `"surface"` \| `"surface-pattern"` \| `"text"` \| `"muted-text"` \| `"root-text"` \| `"node-text"` \| `"node-text-inverse"` \| `"color-root"` \| `"color-1"` \| `"color-2"` \| `"color-3"` \| `"color-4"` \| `"color-5"` \| `"color-6"` \| `"color-7"` \| `"shade-light"` \| `"shade-dark"` \| `"node-fill-opacity"` \| `"moon-opacity"` \| `"node-highlight"` \| `"node-terminator"` \| `"node-shading"` \| `"node-shade-circle"` \| `"node-stroke"` \| `"node-stroke-tint"` \| `"node-stroke-width"` \| `"badge-stroke"` \| `"node-shadow"` \| `"node-shadow-tint"` \| `"node-shadow-opacity"` \| `"node-shadow-offset"` \| `"node-shadow-size"` \| `"sun-shadow-opacity"` \| `"sun-shadow-size"` \| `"sun-halo"` \| `"sun-halo-tint"` \| `"sun-halo-opacity"` \| `"sun-halo-width"` \| `"sun-halo-dash"` \| `"sun-halo-size"` \| `"ring-stroke"` \| `"ring-tint"` \| `"ring-opacity"` \| `"ring-width"` \| `"ring-dash"` \| `"link-stroke"` \| `"link-tint"` \| `"link-opacity"` \| `"link-width"` \| `"link-dash"` \| `"focus-ring"` \| `"note-indicator"` \| `"control-background"` \| `"control-border"` \| `"control-text"` \| `"control-muted-text"` \| `"control-active-background"` \| `"control-active-text"` \| `"control-shadow"` \| `"control-blur"` \| `"tooltip-background"` \| `"tooltip-text"` \| `"action-background"` \| `"action-border"` \| `"action-text"` \| `"action-shadow"` \| `"sheet-background"` \| `"sheet-text"` \| `"sheet-muted-text"` \| `"sheet-border"` \| `"sheet-backdrop"` \| `"sheet-shadow"` \| `"sheet-blur"` \| `"chip-background"` \| `"chip-text"` \| `"link-text"` \| `"status-active"` \| `"status-done"` \| `"status-blocked"` \| `"status-todo"` \| `"status-neutral"` \| `"error-background"` \| `"error-border"` \| `"error-text"`, `string`\>\> | Token values by name, as listed in `THEME_TOKENS` (`surface`, `color-1`, `ring-dash`, …). |

***

### OrbitSpinOptions

How a flicked orbit spins in focus mode.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-decay"></a> `decay?` | `number` | Seconds for a free spin to lose about two thirds of its speed. Default 1.4. |
| <a id="property-haptics"></a> `haptics?` | `boolean` | Vibrate briefly as planets pass the top, on devices that support it. Off by default. |
| <a id="property-maxspeed"></a> `maxSpeed?` | `number` | Fastest spin, in degrees per second. Default 1440 (four turns a second). |
| <a id="property-snap"></a> `snap?` | `false` \| `"planet"` | Bring the nearest planet to the top as a spin comes to rest. Off by default. |

***

### OrbitStrings

Everything Orbit says, in one language. `{name}`-style placeholders are
filled in as described on each; keep them in a translation, in any order.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-added"></a> `added` | `string` | Announced when an idea is added: `{name}`. |
| <a id="property-addideato"></a> `addIdeaTo` | `string` | The + in an orbit: `{name}` is the idea it adds to. |
| <a id="property-anidea"></a> `anIdea` | `string` | `{name}` in those announcements when the idea has no text. |
| <a id="property-back"></a> `back` | `string` | The back button, when the idea it goes back to has no name. |
| <a id="property-backto"></a> `backTo` | `string` | The back button's label: `{name}` is the idea it goes back to. |
| <a id="property-backtoparent"></a> `backToParent` | `string` | The back button's label when that idea has no text. |
| <a id="property-close"></a> `close` | `string` | - |
| <a id="property-details-1"></a> `details` | `string` | The detail sheet's name when the idea has no text. |
| <a id="property-emptymap"></a> `emptyMap` | `string` | The message on a map with nothing in it. |
| <a id="property-emptymaphint"></a> `emptyMapHint` | `string` | The hint under it. |
| <a id="property-expand"></a> `expand` | `string` | The button over a video in the detail sheet. |
| <a id="property-expandvideo"></a> `expandVideo` | `string` | That button, for assistive technology. |
| <a id="property-fitmap"></a> `fitMap` | `string` | The button that zooms to fit the view. |
| <a id="property-fitpicture"></a> `fitPicture` | `string` | The viewer's button that zooms the picture to fit. |
| <a id="property-focus-3"></a> `focus` | `string` | The button that shows the focused idea with the ideas around it. |
| <a id="property-goto"></a> `goTo` | `string` | A link to another idea of the map: `{name}` is that idea, or `theIdea` when it has no text. |
| <a id="property-has"></a> `has` | `string` | Part of an idea's description: `{list}` lists what it has, from the words below. |
| <a id="property-hasdetails"></a> `hasDetails` | `string` | - |
| <a id="property-hasembed"></a> `hasEmbed` | `string` | - |
| <a id="property-hasimage"></a> `hasImage` | `string` | - |
| <a id="property-haslink"></a> `hasLink` | `string` | - |
| <a id="property-hasnote"></a> `hasNote` | `string` | - |
| <a id="property-hasvideo"></a> `hasVideo` | `string` | - |
| <a id="property-ideaactions"></a> `ideaActions` | `string` | The buttons under an idea: `{name}`. |
| <a id="property-ideaactionsuntitled"></a> `ideaActionsUntitled` | `string` | The buttons under an idea with no text. |
| <a id="property-ideacount"></a> `ideaCount` | [`OrbitPluralText`](#orbitpluraltext) | How many ideas an idea holds, as announced and in its description: `{count}`. |
| <a id="property-mapnotdrawn"></a> `mapNotDrawn` | `string` | The title of the card shown where a map couldn't be drawn. |
| <a id="property-mapnotdrawnreason"></a> `mapNotDrawnReason` | `string` | The card's message when the problem came with none of its own. |
| <a id="property-mappath"></a> `mapPath` | `string` | The breadcrumbs, for assistive technology. |
| <a id="property-mindmap"></a> `mindMap` | `string` | The map's name for assistive technology, and an exported SVG's title, when it has no `ariaLabel` and its root no text. |
| <a id="property-mindmaprole"></a> `mindMapRole` | `string` | What assistive technology calls the map (`aria-roledescription`), in lower case. |
| <a id="property-moved"></a> `moved` | `string` | Announced when an idea moves: `{name}` into `{parent}`. |
| <a id="property-movedtotop"></a> `movedToTop` | `string` | Announced when an idea moves to a parent with no text: `{name}`. |
| <a id="property-movehere"></a> `moveHere` | `string` | Where an idea being moved would land: `{name}` is that idea. |
| <a id="property-newidea"></a> `newIdea` | `string` | The empty text field's placeholder for a new idea. |
| <a id="property-newideafor"></a> `newIdeaFor` | `string` | The text field for a new idea: `{name}` is the idea it goes into. |
| <a id="property-next"></a> `next` | `string` | - |
| <a id="property-openembed"></a> `openEmbed` | `string` | - |
| <a id="property-openlink"></a> `openLink` | `string` | - |
| <a id="property-openpictureinnewtab"></a> `openPictureInNewTab` | `string` | - |
| <a id="property-openvideoinnewtab"></a> `openVideoInNewTab` | `string` | - |
| <a id="property-outline"></a> `outline` | `string` | The map as a list, for assistive technology. |
| <a id="property-overview"></a> `overview` | `string` | The button that shows the whole map at once. |
| <a id="property-overviewannouncement"></a> `overviewAnnouncement` | `string` | Announced when the overview opens. |
| <a id="property-picture-1"></a> `picture` | `string` | A picture's name in the viewer when it has no description or caption. |
| <a id="property-pictureunavailable"></a> `pictureUnavailable` | `string` | - |
| <a id="property-playvideo"></a> `playVideo` | `string` | - |
| <a id="property-position"></a> `position` | `string` | Where the viewer is among the map's pictures and videos: `{index}` of `{total}`. |
| <a id="property-present"></a> `present` | `string` | The button that presents a map shared as a web page, one idea at a time with its note as a caption. |
| <a id="property-previous"></a> `previous` | `string` | - |
| <a id="property-priority-1"></a> `priority` | `string` | The priority chip: `{priority}`. |
| <a id="property-problemonline"></a> `problemOnLine` | `string` | The card's message for a problem on a line of the map's source: `{line}` and `{message}`, which stays as Orbit wrote it. |
| <a id="property-readnote"></a> `readNote` | `string` | - |
| <a id="property-removed"></a> `removed` | `string` | Announced when an idea is deleted: `{name}`. |
| <a id="property-scrolltozoom"></a> `scrollToZoom` | `string` | Shown when the wheel scrolls the page over a map: `{key}` is Ctrl, or ⌘ on Apple devices. |
| <a id="property-seeidea"></a> `seeIdea` | `string` | The same link printed, where it can't be followed: `{name}` is that idea. |
| <a id="property-showdetails"></a> `showDetails` | `string` | - |
| <a id="property-showoutline"></a> `showOutline` | `string` | The button that shows the map as a list. |
| <a id="property-status-1"></a> `status` | `string` | Part of an idea's description: `{status}` is its status word. |
| <a id="property-statuslabel"></a> `statusLabel` | `string` | The status in the tooltip: `{status}`. |
| <a id="property-textof"></a> `textOf` | `string` | The text field over an idea being renamed: `{name}`. |
| <a id="property-theidea"></a> `theIdea` | `string` | `{name}` in `moveHere` when the idea has no text. |
| <a id="property-thisidea"></a> `thisIdea` | `string` | `{name}` in the text fields and the + when the idea has no text. |
| <a id="property-untitled-1"></a> `untitled` | `string` | An idea with no text, wherever its name shows. |
| <a id="property-untitledmap"></a> `untitledMap` | `string` | The root Orbit makes up for a map that's just a list, or has several top headings, and no title. |
| <a id="property-video-1"></a> `video` | `string` | A video's name in the viewer when it has no caption. |
| <a id="property-videounavailable"></a> `videoUnavailable` | `string` | - |
| <a id="property-videounavailablehere"></a> `videoUnavailableHere` | `string` | A video its site doesn't let other pages play. |
| <a id="property-view"></a> `view` | `string` | The group of view buttons. |
| <a id="property-viewimage"></a> `viewImage` | `string` | - |
| <a id="property-viewimageof"></a> `viewImageOf` | `string` | The picture in the detail sheet, which opens the viewer: `{description}` is its alternative text. |
| <a id="property-watchon"></a> `watchOn` | `string` | A video's link to its site: `{provider}` is YouTube or Vimeo. |
| <a id="property-zoom-2"></a> `zoom` | `string` | The group of zoom buttons. |
| <a id="property-zoomin"></a> `zoomIn` | `string` | - |
| <a id="property-zoomout"></a> `zoomOut` | `string` | - |

***

### OrbitWebPageOptions

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-focus-4"></a> `focus?` | `string` | The node in focus when the map opens, by id. Default: the root. |
| <a id="property-language-3"></a> `language?` | `string` | The language of the page and the map's words: a tag like `es`. Default: English. |
| <a id="property-media-1"></a> `media?` | `Record`\<`string`, `string`\> | Pictures to put inside the page, by the address the map gives them: `{ 'photos/summit.jpg': 'data:image/jpeg;base64,…' }`. A node's picture, a video's thumbnail and pictures in notes are swapped for them, so they show wherever the page goes. |
| <a id="property-script"></a> `script` | `string` | Orbit's web page script, the file `@restless-dreams/orbit/web-page.js`, as text. It goes inside the page, so the page needs nothing else. |
| <a id="property-strings-3"></a> `strings?` | `Partial`\<[`OrbitStrings`](#orbitstrings)\> | Single words to change: `{ present: 'Show' }`. |
| <a id="property-theme-4"></a> `theme?` | `string` \| [`OrbitRendererTheme`](#orbitrenderertheme) | The map's theme, instead of its frontmatter's: a theme name or `{ preset, tokens }`. |
| <a id="property-title-3"></a> `title?` | `string` | The page's title. Default: the map's `title`, or its root's text. |
| <a id="property-viewmode-4"></a> `viewMode?` | [`ViewMode`](#viewmode) | How the map opens: `focus` (default) or `all`, the overview. |

***

### OrbitZoomOptions

How the map responds to the wheel, trackpads and pinches.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-maximum"></a> `maximum?` | `number` | Largest zoom, relative to the fitted view. Default 6. |
| <a id="property-minimum"></a> `minimum?` | `number` | Smallest zoom, relative to the fitted view. Default 0.4. |
| <a id="property-wheel"></a> `wheel?` | `false` \| `"auto"` \| `"always"` \| `"modifier"` | `auto` (default): the wheel zooms freely when the map is the whole page and needs Ctrl or ⌘ when the page scrolls; `always`; `modifier`; or `false` to ignore the wheel. |

***

### ParseOptions

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-strict-2"></a> `strict?` | `boolean` | Throw an `OrbitParseError` on the first problem instead of recording a diagnostic and carrying on. Off by default; `orbit validate` turns it on. |
| <a id="property-untitled-2"></a> `untitled?` | `string` | The name of the root Orbit makes up for a document with no single top heading and no title, in the reader's language. Default "Untitled map". Its id is `untitled-map` whatever its name. |

***

### ParseYamlOptions

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-strict-3"></a> `strict?` | `boolean` | Throw on the first problem instead of recording a diagnostic. Off by default. |
| <a id="property-untitled-3"></a> `untitled?` | `string` | The name of the root Orbit makes up for several top-level nodes and no title. Default "Untitled map"; its id is `untitled-map` whatever its name. |

***

### RendererOptions

#### Extended by

- [`OrbitMindMapProps`](react.md#orbitmindmapprops)
- [`CreateOrbitMapOptions`](#createorbitmapoptions)
- [`AutoRenderOptions`](#autorenderoptions)

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-actions-3"></a> `actions?` | [`OrbitAction`](#orbitaction)[] | Your own buttons under the focused node and in its detail sheet, before the registered ones. |
| <a id="property-arialabel-2"></a> `ariaLabel?` | `string` | The map's accessible name. Default: the document's `title`. |
| <a id="property-baseurl-5"></a> `baseUrl?` | `string` | Resolves relative image, video and link URLs. |
| <a id="property-editable-2"></a> `editable?` | `boolean` | Build the map on the map: a + in the orbit adds an idea, typed right in its new planet, and a long press, a right click or F2 edits a node's text where it is. A node held still, by a long press or the mouse, lifts: drag it onto another node to move it there, or to a place in the orbit to put it there. Default false. |
| <a id="property-editingkeys-2"></a> `editingKeys?` | `boolean` | Keys for building an editable map at speed, as in mind-map apps. On a node with keyboard focus, Tab (or Insert) adds an idea under it, Shift+Enter adds one beside it, and Delete removes it. While typing, Tab keeps what was typed and goes on a level down, under it; with nothing typed, it moves the field under the idea before. Shift+Tab goes on a level up, beside the parent. Tab then stays in the map; Shift+Tab from a node still leaves it. Default false. |
| <a id="property-focus-5"></a> `focus?` | `string` | The node in focus when the map first draws, by id: to open a map where the reader left it. Default: the root. Later renders keep the reader's place. |
| <a id="property-insets-2"></a> `insets?` | [`OrbitInsets`](#orbitinsets) | The parts of the map the page covers with its own controls, such as a toolbar floating over its bottom edge, in px from each edge. Views are fitted into what's left, and the map still draws under the controls. Changing them glides a fitted view to its new place. |
| <a id="property-interactive-3"></a> `interactive?` | `boolean` | `false` draws a still picture: no clicks, drags, zoom or keyboard. Default true. |
| <a id="property-language-4"></a> `language?` | `string` | The language of the map's controls, sheets and announcements: a BCP 47 tag such as `es` or `pt-BR`. Default: the language the map's element is in (the closest `lang` attribute), then English. Orbit speaks English and Spanish; `registerLanguage` adds others. |
| <a id="property-longpressdelay-2"></a> `longPressDelay?` | `number` | How long (ms) a finger or pen holds still on a node before it counts as a long press (see `onNodeContext`). Default 500; apps can pass their platform's own, such as Android's 400. |
| <a id="property-maxdepth-3"></a> `maxDepth?` | `number` | Levels below the root to render (1 = root + direct children). |
| <a id="property-mediaviewer-2"></a> `mediaViewer?` | `boolean` | Show pictures and videos in the media viewer, over the whole window: "View image" and "Play video" open it, and so do the pictures and videos in the detail sheet. Default true. With `false`, those buttons open the detail sheet instead (unless `showDetailSheet` is `false` too). `openMedia` opens the viewer either way. |
| <a id="property-nodetypefor-3"></a> `nodeTypeFor?` | (`node`) => `string` \| `undefined` | The type a node that names none is drawn as, for display only: as if it said `type: name`, with that type's look, content and actions. Orbit never writes it to the map, and asks again whenever it draws; return undefined to draw the node as it is. Called often: keep it quick. |
| <a id="property-nodetypes-3"></a> `nodeTypes?` | `Record`\<`string`, [`OrbitNodeType`](#orbitnodetype)\> | Node types by name: what nodes with `type: name` look like, draw inside them, show in the detail sheet and offer as actions. They come before the ones registered with `registerNodeType`. |
| <a id="property-noterenderer-2"></a> `noteRenderer?` | (`note`, `context`) => `string` | Renders a note to HTML yourself. The HTML is used as-is: sanitize untrusted notes. |
| <a id="property-onaction-2"></a> `onAction?` | (`event`) => `false` \| `void` | A button was pressed. Return `false` to skip what it does (the detail sheet, the link, or your action's `run`). |
| <a id="property-onedit-2"></a> `onEdit?` | (`edit`) => `void` | The map was edited with `addNode`, `updateNode`, `removeNode` or `moveNode`; save `renderer.toMarkdown()` to keep it. |
| <a id="property-oneditorclose-2"></a> `onEditorClose?` | (`event`) => `void` | The field for typing on the map closed. |
| <a id="property-oneditoropen-2"></a> `onEditorOpen?` | (`event`) => `void` | The field for typing on the map opened. |
| <a id="property-onfocuschange-2"></a> `onFocusChange?` | (`node`) => `void` | A new node is in focus. |
| <a id="property-onmediaclose-2"></a> `onMediaClose?` | (`event`) => `void` | The media viewer closed. |
| <a id="property-onmediaopen-2"></a> `onMediaOpen?` | (`event`) => `void` | The media viewer opened, or stepped to another picture or video. |
| <a id="property-onmediastate-2"></a> `onMediaState?` | (`state`) => `void` | The video in the media viewer started, paused, moved on, ended or was muted; while it plays, its time a few times a second. |
| <a id="property-onnodeclick-2"></a> `onNodeClick?` | (`node`) => `void` | A node was clicked or activated with the keyboard, before the map reacts. |
| <a id="property-onnodecontext-2"></a> `onNodeContext?` | (`event`) => `void` | A node was long-pressed, right-clicked or chosen with the context menu key: show a menu of things to do with it at (`x`, `y`). With this callback or a `node-context` listener, the press is yours: it doesn't open the node, and the browser's own menu stays closed. |
| <a id="property-onnodedrag-2"></a> `onNodeDrag?` | (`event`) => `void` | A node is dragged somewhere else (see `editable` and the `node-drag` event). |
| <a id="property-onspinsettle-2"></a> `onSpinSettle?` | (`planet`) => `void` | Called when a flicked orbit comes to rest, with the planet nearest the top. |
| <a id="property-onviewmodechange-2"></a> `onViewModeChange?` | (`mode`) => `void` | - |
| <a id="property-orbitanimation-3"></a> `orbitAnimation?` | `boolean` | Keep the orbit turning slowly on its own. |
| <a id="property-orbitspeed-3"></a> `orbitSpeed?` | `number` | Seconds per revolution of `orbitAnimation`. |
| <a id="property-palette-4"></a> `palette?` | `string`[] | Node colors: the first for the root, then one per top-level branch (cycling). Default: the theme's. |
| <a id="property-showactionbuttons-2"></a> `showActionButtons?` | `boolean` | Buttons under the focused node for its note, media, link and actions. Default true. |
| <a id="property-showcontrols-2"></a> `showControls?` | `boolean` | Breadcrumbs, the view switch, the list button and zoom buttons. Default true. |
| <a id="property-showdetailsheet-2"></a> `showDetailSheet?` | `boolean` | Open the built-in detail sheet for notes, embeds and the details of a node's type. Default true. |
| <a id="property-showrings-3"></a> `showRings?` | `boolean` | Draw the dashed orbit rings. Default true. |
| <a id="property-spin-2"></a> `spin?` | [`OrbitSpinOptions`](#orbitspinoptions) | How a flicked orbit spins. |
| <a id="property-statuses-3"></a> `statuses?` | `Record`\<`string`, [`OrbitStatusStyle`](#orbitstatusstyle)\> | Status words and how they look: a dot tone (`active`, `done`, `blocked`, `todo`, `neutral`) or any CSS color, as in `{ review: 'active', 'on hold': '#A855F7' }`. |
| <a id="property-strings-4"></a> `strings?` | `Partial`\<[`OrbitStrings`](#orbitstrings)\> | Words to change on this map only, over its language's: `{ zoomIn: 'Closer' }`. |
| <a id="property-theme-5"></a> `theme?` | \| [`OrbitThemePreset`](#orbitthemepreset) \| [`OrbitRendererTheme`](#orbitrenderertheme) \| `string` & `object` | A theme name (`'night'`, `'cosmos'`, or one registered with `registerTheme`) or a theme object. An object without a `preset` keeps the document's theme and changes the tokens it names. |
| <a id="property-transitionduration-2"></a> `transitionDuration?` | `number` \| `"auto"` | Navigation flight length in milliseconds, or `auto` to scale with the distance travelled. |
| <a id="property-viewmode-5"></a> `viewMode?` | [`ViewMode`](#viewmode) | The first view: `focus` (default) or `all`, the overview. |
| <a id="property-zoom-3"></a> `zoom?` | [`OrbitZoomOptions`](#orbitzoomoptions) | How the wheel, trackpads and pinches zoom. |

***

### RenderToSVGOptions

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-baseurl-6"></a> `baseUrl?` | `string` | Resolves relative image URLs. |
| <a id="property-focus-6"></a> `focus?` | `string` | The node at the center in focus mode, by id. Default: the root. |
| <a id="property-height-2"></a> `height?` | `number` | Height of the drawing, in pixels: positive, at most `MAX_SVG_EXPORT_SIZE`. Default 600. |
| <a id="property-idprefix-1"></a> `idPrefix?` | `string` | Prefix for the SVG's ids; give each SVG inlined in one page its own. |
| <a id="property-language-5"></a> `language?` | `string` | The language of the few words the drawing has (an untitled idea, the empty map): a BCP 47 tag. Default: English. |
| <a id="property-maxdepth-4"></a> `maxDepth?` | `number` | - |
| <a id="property-nodetypefor-4"></a> `nodeTypeFor?` | (`node`) => `string` \| `undefined` | The type a node that names none is drawn as, for display only (see `RendererOptions.nodeTypeFor`). |
| <a id="property-nodetypes-4"></a> `nodeTypes?` | `Record`\<`string`, [`OrbitNodeType`](#orbitnodetype)\> | Node types by name, before the registered ones: their icons, colors and tokens. |
| <a id="property-palette-5"></a> `palette?` | `string`[] | - |
| <a id="property-responsive"></a> `responsive?` | `boolean` | Size the SVG to its container (100% wide and tall) instead of in pixels. |
| <a id="property-showrings-4"></a> `showRings?` | `boolean` | - |
| <a id="property-statuses-4"></a> `statuses?` | `Record`\<`string`, [`OrbitStatusStyle`](#orbitstatusstyle)\> | Status words and how they look, before the registered ones. |
| <a id="property-strings-5"></a> `strings?` | `Partial`\<[`OrbitStrings`](#orbitstrings)\> | Words to change, over the language's. |
| <a id="property-theme-6"></a> `theme?` | \| [`OrbitThemePreset`](#orbitthemepreset) \| [`OrbitRendererTheme`](#orbitrenderertheme) \| `string` & `object` | A theme name or an object of theme values. Default: the document's theme, or `paper`. |
| <a id="property-title-4"></a> `title?` | `string` | The SVG's title and accessible name. Default: the document's title, or the root's text. |
| <a id="property-viewmode-6"></a> `viewMode?` | [`ViewMode`](#viewmode) | `focus` (default) or `all` for the overview. |
| <a id="property-width"></a> `width?` | `number` | Width of the drawing, in pixels: positive, at most `MAX_SVG_EXPORT_SIZE`. Default 800. |

***

### SerializeOptions

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-keepsource"></a> `keepSource?` | `boolean` | Keep the source's own lines for everything an edit didn't change (the default, for a document parsed from markdown): its formatting, and the text Orbit doesn't read, such as other HTML comments or frontmatter keys of other apps. `false` writes the whole map in Orbit's own form. |

## Type Aliases

### MapToolDefinition

```ts
type MapToolDefinition = object;
```

A tool as `MapTools.definitions` lists it: the shape MCP uses, and the data to build any other.

#### Properties

##### annotations

```ts
annotations: object;
```

Hints for clients that ask before running some tools: whether it only reads, and whether it can remove or overwrite what's there.

###### destructiveHint

```ts
destructiveHint: boolean;
```

###### readOnlyHint

```ts
readOnlyHint: boolean;
```

##### description

```ts
description: string;
```

##### inputSchema

```ts
inputSchema: MapToolSchema;
```

The tool's input, as JSON Schema.

##### name

```ts
name: MapToolName;
```

***

### MapToolFormats

```ts
type MapToolFormats = object;
```

The tools in the shape each provider's API takes them.

#### Properties

##### anthropic

```ts
anthropic: object[];
```

Anthropic's Messages API (`tools`).

###### description

```ts
description: string;
```

###### input\_schema

```ts
input_schema: MapToolSchema;
```

###### name

```ts
name: string;
```

##### gemini

```ts
gemini: object[];
```

Google's Gemini API (`config.tools` in `@google/genai`).

###### functionDeclarations

```ts
functionDeclarations: object[];
```

##### openai

```ts
openai: object[];
```

OpenAI's Responses API (`tools`).

###### description

```ts
description: string;
```

###### name

```ts
name: string;
```

###### parameters

```ts
parameters: MapToolSchema;
```

###### strict

```ts
strict: false;
```

###### type

```ts
type: "function";
```

##### openai-chat

```ts
openai-chat: object[];
```

OpenAI's Chat Completions API (`tools`), which most other providers and local servers take too.

###### function

```ts
function: object;
```

###### function.description

```ts
description: string;
```

###### function.name

```ts
name: string;
```

###### function.parameters

```ts
parameters: MapToolSchema;
```

###### type

```ts
type: "function";
```

***

### MapToolName

```ts
type MapToolName = 
  | "read_map"
  | "find_nodes"
  | "read_node"
  | "add_nodes"
  | "update_node"
  | "move_node"
  | "reorder_children"
  | "remove_node"
  | "show_node";
```

***

### MapToolProperty

```ts
type MapToolProperty = object;
```

A property of a tool's input, as JSON Schema.

#### Properties

##### description

```ts
description: string;
```

##### items?

```ts
optional items?: object;
```

###### enum?

```ts
optional enum?: string[];
```

###### type

```ts
type: "string";
```

##### minimum?

```ts
optional minimum?: number;
```

##### properties?

```ts
optional properties?: Record<string, MapToolProperty>;
```

##### required?

```ts
optional required?: string[];
```

##### type

```ts
type: "string" | "integer" | "number" | "boolean" | "array" | "object";
```

***

### MapToolProvider

```ts
type MapToolProvider = keyof MapToolFormats;
```

***

### MapToolSchema

```ts
type MapToolSchema = object;
```

A tool's input, as JSON Schema: an object with the tool's fields.

#### Properties

##### properties

```ts
properties: Record<string, MapToolProperty>;
```

##### required?

```ts
optional required?: string[];
```

##### type

```ts
type: "object";
```

***

### OrbitContentAction

```ts
type OrbitContentAction = "image" | "video" | "embed" | "note" | "link" | "details";
```

Orbit's own buttons for a node: its picture, video, embed, note, link, and its type's details.

***

### OrbitDiagnosticCode

```ts
type OrbitDiagnosticCode = typeof DIAGNOSTIC_CODES[number];
```

***

### OrbitDiagnosticSeverity

```ts
type OrbitDiagnosticSeverity = "error" | "warning";
```

***

### OrbitEventName

```ts
type OrbitEventName = keyof OrbitEventMap;
```

***

### OrbitImportErrorCode

```ts
type OrbitImportErrorCode = typeof IMPORT_ERROR_CODES[number];
```

***

### OrbitImportFormat

```ts
type OrbitImportFormat = "opml" | "freemind" | "xmind";
```

The other apps' formats Orbit reads.

***

### OrbitImportWarningCode

```ts
type OrbitImportWarningCode = typeof IMPORT_WARNING_CODES[number];
```

***

### OrbitNewNode

```ts
type OrbitNewNode = OrbitNodeInput & object;
```

What `addNode` takes: a node's text and attributes, and the nodes to add under it, as many levels down as you like.

#### Type Declaration

| Name | Type |
| ------ | ------ |
| `children?` | [`OrbitNewNode`](#orbitnewnode)[] |
| `text` | `string` |

***

### OrbitNodeInput

```ts
type OrbitNodeInput = Partial<Pick<OrbitNode, 
  | "text"
  | "icon"
  | "color"
  | "paletteColor"
  | "status"
  | "priority"
  | "tags"
  | "collapsed"
  | "link"
  | "note"
  | "noteFormat"
  | "image"
  | "video"
  | "embed"
  | "type"
  | "typeVersion"
| "attrs">>;
```

What `addNode` and `updateNode` take: a node's text and attributes.

***

### OrbitStatusStyle

```ts
type OrbitStatusStyle = OrbitStatusTone | string & object;
```

How a status word looks: one of the dot tones, or any CSS color.

***

### OrbitStatusTone

```ts
type OrbitStatusTone = "active" | "done" | "blocked" | "todo" | "neutral";
```

The colored dots statuses get.

***

### OrbitThemeName

```ts
type OrbitThemeName = 
  | "paper"
  | "night"
  | "glass"
  | "glass-night"
  | "cosmos"
  | "blueprint"
  | "ink"
  | "contrast"
  | "flat"
  | "flat-night"
  | "material"
  | "material-night"
  | "liquid"
  | "liquid-night";
```

***

### OrbitThemePreset

```ts
type OrbitThemePreset = OrbitThemeName | "auto";
```

A built-in theme, or `auto` for `paper` or `night` following the reader's light or dark preference.

***

### OrbitThemeToken

```ts
type OrbitThemeToken = typeof THEME_TOKENS[number];
```

***

### OrbitThemeTokens

```ts
type OrbitThemeTokens = Record<OrbitThemeToken, string>;
```

***

### ParsedOrbitDocument

```ts
type ParsedOrbitDocument = OrbitDocument & object;
```

A document as the parsers return it, with its diagnostics always set.

#### Type Declaration

| Name | Type |
| ------ | ------ |
| `diagnostics` | [`OrbitDiagnostic`](#orbitdiagnostic)[] |

***

### ViewMode

```ts
type ViewMode = "focus" | "all";
```

`focus`: one node at the center with its children around it. `all`: the overview of the whole tree.

## Variables

### DIAGNOSTIC\_CODES

```ts
const DIAGNOSTIC_CODES: readonly ["empty-document", "no-structure", "synthetic-root", "invalid-frontmatter", "unknown-frontmatter-key", "unsupported-schema-version", "format-upgraded", "invalid-attributes", "unknown-attribute", "invalid-option-value", "media-missing-source", "unknown-content-type", "caption-without-media", "unknown-link-target", "invalid-yaml", "unknown-yaml-key", "ignored-node-entry", "misnamed-node-key", "comment-without-orbit", "attributes-after-list"];
```

Every kind of problem the parsers report.

***

### IMPORT\_ERROR\_CODES

```ts
const IMPORT_ERROR_CODES: readonly ["unknown-format", "unreadable", "empty", "password-protected", "too-large"];
```

Every reason a file can't be read as a map.

***

### IMPORT\_WARNING\_CODES

```ts
const IMPORT_WARNING_CODES: readonly ["floating-ideas-moved", "summaries-moved", "callouts-moved", "boundaries-in-notes", "links-in-notes", "missing-link-targets", "icons-not-kept", "pictures-not-kept", "attachments-not-kept", "local-links-not-kept", "encrypted-branches-not-read", "formatting-not-kept"];
```

Every kind of warning reading another app's map gives.

***

### MATERIAL\_SEED

```ts
const MATERIAL_SEED: "#6750A4" = '#6750A4';
```

Material's baseline color: the `material` and `material-night` themes are built from it.

***

### ORBIT\_THEME\_PRESETS

```ts
const ORBIT_THEME_PRESETS: Readonly<Record<OrbitThemeName, Readonly<OrbitThemeTokens>>>;
```

***

### PRINT\_THEMES

```ts
const PRINT_THEMES: Readonly<Partial<Record<OrbitThemePreset, OrbitThemeName>>>;
```

The light theme each dark built-in theme prints as. Light themes print as themselves.

***

### SUPPORTED\_SCHEMA\_VERSION

```ts
const SUPPORTED_SCHEMA_VERSION: 1 = 1;
```

The newest `schemaVersion` this version of Orbit reads and writes.

***

### THEME\_TOKENS

```ts
const THEME_TOKENS: readonly ["sans-font", "serif-font", "mono-font", "font-family", "label-font", "display-font", "label-weight", "display-weight", "label-letter-spacing", "label-shadow", "surface", "surface-pattern", "text", "muted-text", "root-text", "node-text", "node-text-inverse", "color-root", "color-1", "color-2", "color-3", "color-4", "color-5", "color-6", "color-7", "shade-light", "shade-dark", "node-fill-opacity", "moon-opacity", "node-highlight", "node-terminator", "node-shading", "node-shade-circle", "node-stroke", "node-stroke-tint", "node-stroke-width", "badge-stroke", "node-shadow", "node-shadow-tint", "node-shadow-opacity", "node-shadow-offset", "node-shadow-size", "sun-shadow-opacity", "sun-shadow-size", "sun-halo", "sun-halo-tint", "sun-halo-opacity", "sun-halo-width", "sun-halo-dash", "sun-halo-size", "ring-stroke", "ring-tint", "ring-opacity", "ring-width", "ring-dash", "link-stroke", "link-tint", "link-opacity", "link-width", "link-dash", "focus-ring", "note-indicator", "control-background", "control-border", "control-text", "control-muted-text", "control-active-background", "control-active-text", "control-shadow", "control-blur", "tooltip-background", "tooltip-text", "action-background", "action-border", "action-text", "action-shadow", "sheet-background", "sheet-text", "sheet-muted-text", "sheet-border", "sheet-backdrop", "sheet-shadow", "sheet-blur", "chip-background", "chip-text", "link-text", "status-active", "status-done", "status-blocked", "status-todo", "status-neutral", "error-background", "error-border", "error-text"];
```

Theme tokens. Each token is a CSS custom property: set `--orbit-<token>` on
the map or any ancestor to override it. Presets only provide defaults:
internally every token resolves as `var(--orbit-<token>, <preset value>)`.

## Functions

### createMapTools()

```ts
function createMapTools(map, options?): MapTools;
```

Tools a language model calls to read and edit a map: on screen (an
`OrbitSVGRenderer`, such as `createOrbitMap` returns or `<orbit-map>`'s
`renderer`), where each change animates and fires `edit`, or a document
(or its markdown or YAML), which they change in place.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `map` | \| `string` \| [`OrbitDocument`](#orbitdocument) \| [`OrbitSVGRenderer`](#orbitsvgrenderer) |
| `options` | [`MapToolsOptions`](#maptoolsoptions) |

#### Returns

[`MapTools`](#maptools)

***

### createOrbitMap()

```ts
function createOrbitMap(
   target, 
   source, 
   options?
): OrbitSVGRenderer;
```

Draws a map into `target` in one call: markdown or YAML source, a parsed
document or a node tree. Returns the renderer, to listen for events
(`renderer.on('focus-change', …)`), draw new versions (`renderer.render(source)`)
and clean up (`renderer.destroy()`).

The map fills `target`, so give it a height.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `target` | `HTMLElement` |
| `source` | `string` \| [`OrbitDocument`](#orbitdocument) \| [`OrbitNode`](#orbitnode) |
| `options` | [`CreateOrbitMapOptions`](#createorbitmapoptions) |

#### Returns

[`OrbitSVGRenderer`](#orbitsvgrenderer)

#### Example

```ts
import { createOrbitMap } from '@restless-dreams/orbit';

const map = createOrbitMap(document.querySelector('#map')!, '# Launch\n## Research\n## Build', { theme: 'auto' });
map.on('focus-change', ({ node }) => console.log(node.text));
```

***

### defineOrbitMapElement()

```ts
function defineOrbitMapElement(tagName?): void;
```

Registers the `<orbit-map>` element. Write the map as the element's
content (indent it however you like, `<!-- orbit … -->` comments included),
inside a `<script type="text/orbit">` child, or in a `source` attribute.
The map renders in a shadow root, so the raw markdown is never displayed,
and it redraws when the content or an attribute changes.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `tagName` | `string` | `'orbit-map'` |

#### Returns

`void`

#### Example

```html
<script type="module">
  import { defineOrbitMapElement } from '@restless-dreams/orbit';
  defineOrbitMapElement();
</script>

<orbit-map height="420" theme="night">
  # Launch
  ## Research <!-- orbit status: active -->
  ## Build
</orbit-map>
```

***

### detectImportFormat()

```ts
function detectImportFormat(data, name?): OrbitImportFormat | null;
```

The format of another app's map, from what the file holds, then from its
name; null when it's none Orbit reads. Orbit's own markdown and YAML, and
its zips, are null too: read those with `parseOrbit`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | `string` \| `Uint8Array`\<`ArrayBufferLike`\> |
| `name?` | `string` |

#### Returns

[`OrbitImportFormat`](#orbitimportformat) \| `null`

***

### documentToRendererOptions()

```ts
function documentToRendererOptions(options): RendererOptions;
```

The renderer options a document asks for in its frontmatter (or YAML
top-level keys). `title` becomes the map's accessible label. Container
concerns (`height`, `className`) are left to the caller.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`OrbitDocumentOptions`](#orbitdocumentoptions) |

#### Returns

[`RendererOptions`](#rendereroptions)

***

### exportOPML()

```ts
function exportOPML(input, options?): string;
```

A map as OPML: the root is the one top outline, each node an outline
with its icon and text, its note in `_note`, its link as `type="link"`
with a `url`, its status in `_status` (`checked`, `unchecked` and
`indeterminate` for done, todo and active; any other word as it is) and
`_complete`, and its tags as `category`. Pictures, videos, colors and
priorities have no place in OPML: a zip or the map's own file keeps them.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | `string` \| [`OrbitDocument`](#orbitdocument) |
| `options` | [`OrbitOPMLOptions`](#orbitopmloptions) |

#### Returns

`string`

***

### exportWebPage()

```ts
function exportWebPage(input, options): string;
```

The map as one HTML page, with Orbit inside (`options.script`): open it in
any browser, offline, to explore the map or present it.

```ts
import { readFileSync } from 'node:fs';
import { exportWebPage } from '@restless-dreams/orbit';

const script = readFileSync(new URL(import.meta.resolve('@restless-dreams/orbit/web-page.js')), 'utf8');
const html = exportWebPage(markdown, { script, theme: 'night' });
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | `string` \| [`OrbitDocument`](#orbitdocument) |
| `options` | [`OrbitWebPageOptions`](#orbitwebpageoptions) |

#### Returns

`string`

***

### findNodeById()

```ts
function findNodeById(root, id): OrbitNode | null;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `root` | [`OrbitNode`](#orbitnode) |
| `id` | `string` |

#### Returns

[`OrbitNode`](#orbitnode) \| `null`

***

### formatDiagnostic()

```ts
function formatDiagnostic(diagnostic): string;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `diagnostic` | [`OrbitDiagnostic`](#orbitdiagnostic) |

#### Returns

`string`

***

### getNodePath()

```ts
function getNodePath(root, id): OrbitNode[];
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `root` | [`OrbitNode`](#orbitnode) |
| `id` | `string` |

#### Returns

[`OrbitNode`](#orbitnode)[]

***

### importFreeMind()

```ts
function importFreeMind(data, options?): OrbitImport;
```

A FreeMind or Freeplane map, from its file's bytes or text.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | `string` \| `Uint8Array`\<`ArrayBufferLike`\> |
| `options` | [`OrbitImportOptions`](#orbitimportoptions) |

#### Returns

[`OrbitImport`](#orbitimport)

***

### importMap()

```ts
function importMap(data, options?): OrbitImport;
```

Another app's map as Orbit maps: OPML, FreeMind and Freeplane, or XMind.
Pass the file's bytes (its text works for OPML and `.mm`) and its name.
Throws an `OrbitImportError` for a file it can't read: one in no format it
knows (`unknown-format`), a damaged one (`unreadable`), one with no ideas
(`empty`), an XMind workbook with a password (`password-protected`), or one
past its limits (`too-large`).

```ts
const { maps } = importMap(bytes, { name: 'Trip.xmind' });
const markdown = serializeOrbitMarkdown(maps[0].document);
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | `string` \| `Uint8Array`\<`ArrayBufferLike`\> |
| `options` | [`OrbitImportOptions`](#orbitimportoptions) |

#### Returns

[`OrbitImport`](#orbitimport)

***

### importOPML()

```ts
function importOPML(data, options?): OrbitImport;
```

An OPML file, from its bytes or text.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | `string` \| `Uint8Array`\<`ArrayBufferLike`\> |
| `options` | [`OrbitImportOptions`](#orbitimportoptions) |

#### Returns

[`OrbitImport`](#orbitimport)

***

### importXMind()

```ts
function importXMind(data, options?): OrbitImport;
```

An XMind workbook, from its bytes; or its `content.json` or `content.xml`
as text, which reads without pictures.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | `string` \| `Uint8Array`\<`ArrayBufferLike`\> |
| `options` | [`OrbitImportOptions`](#orbitimportoptions) |

#### Returns

[`OrbitImport`](#orbitimport)

***

### isOrbitThemePreset()

```ts
function isOrbitThemePreset(value): value is OrbitThemePreset;
```

Whether `value` names a built-in theme: one of the presets or `auto`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `unknown` |

#### Returns

`value is OrbitThemePreset`

***

### isThemeName()

```ts
function isThemeName(value): value is string;
```

Whether `value` names a theme: a built-in one, `auto`, or a registered one.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `unknown` |

#### Returns

`value is string`

***

### languageTags()

```ts
function languageTags(): string[];
```

The tags of the languages every map can speak: the built-in ones and the registered ones.

#### Returns

`string`[]

***

### materialTheme()

```ts
function materialTheme(seed, options?): OrbitRendererTheme;
```

A Material 3 theme built from `seed`, any CSS color Orbit reads (hex,
`rgb()`, `oklch()`…). Use it as the `theme` option, or name it for every
map: `registerTheme('brand', materialTheme('#0B57D0'))`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `seed` | `string` |
| `options` | [`MaterialThemeOptions`](#materialthemeoptions) |

#### Returns

[`OrbitRendererTheme`](#orbitrenderertheme)

***

### parseOrbit()

```ts
function parseOrbit(input, options?): ParsedOrbitDocument;
```

Parses an orbit document in either flavor. Markdown is the default; a
document is read as YAML when its first line is a top-level YAML key
(`nodes:`, `title:`, `view:`, …), it has a top-level `nodes:` list, or its
frontmatter says `flavor: yaml`. A fenced ```orbit block is unwrapped first.

Problems the parser can work around are listed in `diagnostics` (each with
a `code`, `line`, `severity` and a message that says how to fix it); pass
`{ strict: true }` to throw an `OrbitParseError` on the first one instead.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | `string` |
| `options` | [`ParseOptions`](#parseoptions) |

#### Returns

[`ParsedOrbitDocument`](#parsedorbitdocument)

#### Example

```ts
import { parseOrbit } from '@restless-dreams/orbit';

const { root, diagnostics } = parseOrbit('# Launch\n## Research <!-- orbit status: active -->');
for (const problem of diagnostics ?? []) console.warn(`line ${problem.line}: ${problem.message}`);
```

***

### parseOrbitMarkdown()

```ts
function parseOrbitMarkdown(input, options?): ParsedOrbitDocument;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | `string` |
| `options` | [`ParseOptions`](#parseoptions) |

#### Returns

[`ParsedOrbitDocument`](#parsedorbitdocument)

***

### parseOrbitYAML()

```ts
function parseOrbitYAML(input, options?): ParsedOrbitDocument;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | `string` |
| `options` | [`ParseYamlOptions`](#parseyamloptions) |

#### Returns

[`ParsedOrbitDocument`](#parsedorbitdocument)

***

### printTheme()

```ts
function printTheme(theme): OrbitRendererTheme;
```

The theme a map prints in: the map's own when it's light, otherwise its
light counterpart (`PRINT_THEMES`), always without a background. A dark
theme of your own keeps only its colors (`color-root` to `color-7`).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `theme` | `string` \| [`OrbitRendererTheme`](#orbitrenderertheme) \| `undefined` |

#### Returns

[`OrbitRendererTheme`](#orbitrenderertheme)

***

### registerAction()

```ts
function registerAction(action): () => void;
```

Adds an action to every map. Returns a function that removes it again.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `action` | [`OrbitAction`](#orbitaction) |

#### Returns

() => `void`

***

### registerLanguage()

```ts
function registerLanguage(language, strings): () => void;
```

Adds a language for every map, by its BCP 47 tag (`fr`, `pt-BR`), or
changes some words of one Orbit has. Words it leaves out come from the
language it narrows (`pt` for `pt-BR`), then English. Returns a function
that puts the language back as it was.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `language` | `string` |
| `strings` | `Partial`\<[`OrbitStrings`](#orbitstrings)\> |

#### Returns

() => `void`

***

### registerNodeType()

```ts
function registerNodeType(name, definition): () => void;
```

Defines a node type for every map: nodes with `type: name` (any case) take
it. Returns a function that removes it again.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `definition` | [`OrbitNodeType`](#orbitnodetype) |

#### Returns

() => `void`

***

### registerStatus()

```ts
function registerStatus(word, style): () => void;
```

Gives a status word its look on every map: one of the tones (`active`,
`done`, `blocked`, `todo`, `neutral`) or any CSS color. Returns a function
that removes it again.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `word` | `string` |
| `style` | [`OrbitStatusStyle`](#orbitstatusstyle) |

#### Returns

() => `void`

***

### registerTheme()

```ts
function registerTheme(name, theme): () => void;
```

Names a theme for every map, so `theme: 'brand'` works in options, in a
document's frontmatter and on `<orbit-map theme="brand">`. It starts from
`preset` (a built-in theme or another registered one) and sets its own
tokens. Returns a function that removes it again.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `theme` | [`OrbitRendererTheme`](#orbitrenderertheme) |

#### Returns

() => `void`

***

### renderNoteMarkdown()

```ts
function renderNoteMarkdown(markdown, context?): DocumentFragment;
```

A note as DOM nodes, the way the detail sheet shows it: for pages that show notes in their own UI.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `markdown` | `string` |
| `context` | [`OrbitNoteOptions`](#orbitnoteoptions) |

#### Returns

`DocumentFragment`

***

### renderOrbitElement()

```ts
function renderOrbitElement(element, options?): OrbitSVGRenderer | null;
```

Renders an orbit map into the given element. Problems in the document never
throw: parse warnings go to the console, and a map that can't be drawn is
replaced by an error card and an `orbit-error` event on the element.

Callers who later detach the element should invoke
`OrbitSVGRenderer.unmount(element)` to release RAF loops and the
ResizeObserver. The `<orbit-map>` web component does this automatically.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `element` | `Element` |
| `options` | [`AutoRenderOptions`](#autorenderoptions) |

#### Returns

[`OrbitSVGRenderer`](#orbitsvgrenderer) \| `null`

***

### renderOrbitMarkdownBlocks()

```ts
function renderOrbitMarkdownBlocks(root?, options?): OrbitSVGRenderer[];
```

Renders every orbit block under `root` (default: the whole document). Each
block is independent: one that fails shows its error card and the rest
still render.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `root?` | `ParentNode` |
| `options?` | [`AutoRenderOptions`](#autorenderoptions) |

#### Returns

[`OrbitSVGRenderer`](#orbitsvgrenderer)[]

***

### renderPrintLayout()

```ts
function renderPrintLayout(
   container, 
   input, 
   options?
): HTMLElement;
```

Lays a map out for print in `container`, replacing what it held, and
returns the layout: the title, the map as a picture that fits the page,
then every idea in reading order, nested by depth, with its icon, status,
priority, tags, link (its address printed), note, picture and video. An
idea stays whole across page breaks, and a heading stays with what
follows it.

It's laid out on screen like any element: hide it there and show it in
print, as Orbit's web pages do.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `container` | `HTMLElement` |
| `input` | `string` \| [`OrbitDocument`](#orbitdocument) |
| `options` | [`OrbitPrintOptions`](#orbitprintoptions) |

#### Returns

`HTMLElement`

#### Example

```ts
import { renderPrintLayout } from '@restless-dreams/orbit';

renderPrintLayout(document.querySelector('#print'), markdown, { viewMode: 'all' });
// #print { display: none } @media print { #print { display: block } #app { display: none } }
```

***

### renderToSVGString()

```ts
function renderToSVGString(input, options?): string;
```

Renders a map to a standalone SVG string, without a browser: for files,
the command line, static sites and server rendering. It draws what the
renderer shows at rest, with the theme's colors resolved to plain values
and the labels as SVG text.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | `string` \| [`OrbitDocument`](#orbitdocument) \| [`OrbitNode`](#orbitnode) |
| `options` | [`RenderToSVGOptions`](#rendertosvgoptions) |

#### Returns

`string`

#### Example

```ts
import { renderToSVGString } from '@restless-dreams/orbit';

const svg = renderToSVGString('# Launch\n## Research\n## Build', { width: 1200, height: 800, theme: 'cosmos' });
```

***

### serializeOrbitMarkdown()

```ts
function serializeOrbitMarkdown(doc, options?): string;
```

A map as orbit-md. A document parsed from markdown comes back as it was
written, with only what changed since rewritten, so maps written by hand
or by other apps keep their formatting and everything Orbit doesn't read.
Other documents (built in code, or read from YAML) are written in Orbit's
own form: headings for the root and its children, lists below them.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `doc` | [`OrbitDocument`](#orbitdocument) |
| `options` | [`SerializeOptions`](#serializeoptions) |

#### Returns

`string`

***

### serializeOrbitYAML()

```ts
function serializeOrbitYAML(doc): string;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `doc` | [`OrbitDocument`](#orbitdocument) |

#### Returns

`string`

***

### themeNames()

```ts
function themeNames(): string[];
```

Every theme name: the built-in ones, `auto`, then the registered ones.

#### Returns

`string`[]

***

### themeTokens()

```ts
function themeTokens(name): OrbitThemeTokens;
```

Concrete token values for a theme name, built in or registered, e.g. for exports outside a page. `auto` resolves to `paper`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` \| `undefined` |

#### Returns

[`OrbitThemeTokens`](#orbitthemetokens)

***

### upgradeNodeTypes()

```ts
function upgradeNodeTypes(root, nodeTypes?): number;
```

Brings nodes written for older versions of their types up to date (see
`OrbitNodeType.version`), with the types `nodeTypes` defines or the
registered ones. Maps do this when they're drawn; this is for documents
read without one, on a server or in a script. Returns how many nodes
were upgraded.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `root` | [`OrbitNode`](#orbitnode) |
| `nodeTypes?` | `Record`\<`string`, [`OrbitNodeType`](#orbitnodetype)\> |

#### Returns

`number`
