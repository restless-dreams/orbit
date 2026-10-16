[**@restless-dreams/orbit**](README.md)

***

[@restless-dreams/orbit](README.md) / react

# react

## Interfaces

### OrbitMindMapProps

#### Extends

- [`RendererOptions`](index.md#rendereroptions).`Omit`\<`HTMLAttributes`\<`HTMLDivElement`\>, `"children"`\>

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-actions"></a> `actions?` | [`OrbitAction`](index.md#orbitaction)[] | Your own buttons under the focused node and in its detail sheet, before the registered ones. | [`RendererOptions`](index.md#rendereroptions).[`actions`](index.md#property-actions-3) |
| <a id="property-arialabel"></a> `ariaLabel?` | `string` | The map's accessible name. Default: the document's `title`. | [`RendererOptions`](index.md#rendereroptions).[`ariaLabel`](index.md#property-arialabel-2) |
| <a id="property-baseurl"></a> `baseUrl?` | `string` | Resolves relative image, video and link URLs. | [`RendererOptions`](index.md#rendereroptions).[`baseUrl`](index.md#property-baseurl-4) |
| <a id="property-data"></a> `data?` | [`OrbitNode`](index.md#orbitnode) | A node tree, for maps built in code. | - |
| <a id="property-document"></a> `document?` | [`OrbitDocument`](index.md#orbitdocument) | A parsed document. Its frontmatter options apply unless a prop overrides them. | - |
| <a id="property-editable"></a> `editable?` | `boolean` | Build the map on the map: a + in the orbit adds an idea, typed right in its new planet, and a long press, a right click or F2 edits a node's text where it is. A node held still, by a long press or the mouse, lifts: drag it onto another node to move it there, or to a place in the orbit to put it there. Default false. | [`RendererOptions`](index.md#rendereroptions).[`editable`](index.md#property-editable-2) |
| <a id="property-editingkeys"></a> `editingKeys?` | `boolean` | Keys for building an editable map at speed, as in mind-map apps. On a node with keyboard focus, Tab (or Insert) adds an idea under it, Shift+Enter adds one beside it, and Delete removes it. While typing, Tab keeps what was typed and goes on a level down, under it; with nothing typed, it moves the field under the idea before. Shift+Tab goes on a level up, beside the parent. Tab then stays in the map; Shift+Tab from a node still leaves it. Default false. | [`RendererOptions`](index.md#rendereroptions).[`editingKeys`](index.md#property-editingkeys-2) |
| <a id="property-focus"></a> `focus?` | `string` | The node in focus when the map first draws, by id: to open a map where the reader left it. Default: the root. Later renders keep the reader's place. | [`RendererOptions`](index.md#rendereroptions).[`focus`](index.md#property-focus-4) |
| <a id="property-focusedid"></a> `focusedId?` | `string` | The focused node's id, to control focus from your state. The map flies to it when it changes; pair it with `onFocusChange` to follow the reader. | - |
| <a id="property-insets"></a> `insets?` | [`OrbitInsets`](index.md#orbitinsets) | The parts of the map the page covers with its own controls, such as a toolbar floating over its bottom edge, in px from each edge. Views are fitted into what's left, and the map still draws under the controls. Changing them glides a fitted view to its new place. | [`RendererOptions`](index.md#rendereroptions).[`insets`](index.md#property-insets-2) |
| <a id="property-interactive"></a> `interactive?` | `boolean` | `false` draws a still picture: no clicks, drags, zoom or keyboard. Default true. | [`RendererOptions`](index.md#rendereroptions).[`interactive`](index.md#property-interactive-3) |
| <a id="property-language"></a> `language?` | `string` | The language of the map's controls, sheets and announcements: a BCP 47 tag such as `es` or `pt-BR`. Default: the language the map's element is in (the closest `lang` attribute), then English. Orbit speaks English and Spanish; `registerLanguage` adds others. | [`RendererOptions`](index.md#rendereroptions).[`language`](index.md#property-language-3) |
| <a id="property-longpressdelay"></a> `longPressDelay?` | `number` | How long (ms) a finger or pen holds still on a node before it counts as a long press (see `onNodeContext`). Default 500; apps can pass their platform's own, such as Android's 400. | [`RendererOptions`](index.md#rendereroptions).[`longPressDelay`](index.md#property-longpressdelay-2) |
| <a id="property-maxdepth"></a> `maxDepth?` | `number` | Levels below the root to render (1 = root + direct children). | [`RendererOptions`](index.md#rendereroptions).[`maxDepth`](index.md#property-maxdepth-3) |
| <a id="property-mediaviewer"></a> `mediaViewer?` | `boolean` | Show pictures and videos in the media viewer, over the whole window: "View image" and "Play video" open it, and so do the pictures and videos in the detail sheet. Default true. With `false`, those buttons open the detail sheet instead (unless `showDetailSheet` is `false` too). `openMedia` opens the viewer either way. | [`RendererOptions`](index.md#rendereroptions).[`mediaViewer`](index.md#property-mediaviewer-2) |
| <a id="property-nodetypefor"></a> `nodeTypeFor?` | (`node`) => `string` \| `undefined` | The type a node that names none is drawn as, for display only: as if it said `type: name`, with that type's look, content and actions. Orbit never writes it to the map, and asks again whenever it draws; return undefined to draw the node as it is. Called often: keep it quick. | [`RendererOptions`](index.md#rendereroptions).[`nodeTypeFor`](index.md#property-nodetypefor-2) |
| <a id="property-nodetypes"></a> `nodeTypes?` | `Record`\<`string`, [`OrbitNodeType`](index.md#orbitnodetype)\> | Node types by name: what nodes with `type: name` look like, draw inside them, show in the detail sheet and offer as actions. They come before the ones registered with `registerNodeType`. | [`RendererOptions`](index.md#rendereroptions).[`nodeTypes`](index.md#property-nodetypes-2) |
| <a id="property-noterenderer"></a> `noteRenderer?` | (`note`, `context`) => `string` | Renders a note to HTML yourself. The HTML is used as-is: sanitize untrusted notes. | [`RendererOptions`](index.md#rendereroptions).[`noteRenderer`](index.md#property-noterenderer-2) |
| <a id="property-onaction"></a> `onAction?` | (`event`) => `false` \| `void` | A button was pressed. Return `false` to skip what it does (the detail sheet, the link, or your action's `run`). | [`RendererOptions`](index.md#rendereroptions).[`onAction`](index.md#property-onaction-2) |
| <a id="property-onedit"></a> `onEdit?` | (`edit`) => `void` | The map was edited with `addNode`, `updateNode`, `removeNode` or `moveNode`; save `renderer.toMarkdown()` to keep it. | [`RendererOptions`](index.md#rendereroptions).[`onEdit`](index.md#property-onedit-2) |
| <a id="property-oneditorclose"></a> `onEditorClose?` | (`event`) => `void` | The field for typing on the map closed. | [`RendererOptions`](index.md#rendereroptions).[`onEditorClose`](index.md#property-oneditorclose-2) |
| <a id="property-oneditoropen"></a> `onEditorOpen?` | (`event`) => `void` | The field for typing on the map opened. | [`RendererOptions`](index.md#rendereroptions).[`onEditorOpen`](index.md#property-oneditoropen-2) |
| <a id="property-onfocuschange"></a> `onFocusChange?` | (`node`) => `void` | A new node is in focus. | [`RendererOptions`](index.md#rendereroptions).[`onFocusChange`](index.md#property-onfocuschange-2) |
| <a id="property-onmediaclose"></a> `onMediaClose?` | (`event`) => `void` | The media viewer closed. | [`RendererOptions`](index.md#rendereroptions).[`onMediaClose`](index.md#property-onmediaclose-2) |
| <a id="property-onmediaopen"></a> `onMediaOpen?` | (`event`) => `void` | The media viewer opened, or stepped to another picture or video. | [`RendererOptions`](index.md#rendereroptions).[`onMediaOpen`](index.md#property-onmediaopen-2) |
| <a id="property-onmediastate"></a> `onMediaState?` | (`state`) => `void` | The video in the media viewer started, paused, moved on, ended or was muted; while it plays, its time a few times a second. | [`RendererOptions`](index.md#rendereroptions).[`onMediaState`](index.md#property-onmediastate-2) |
| <a id="property-onnodeclick"></a> `onNodeClick?` | (`node`) => `void` | A node was clicked or activated with the keyboard, before the map reacts. | [`RendererOptions`](index.md#rendereroptions).[`onNodeClick`](index.md#property-onnodeclick-2) |
| <a id="property-onnodecontext"></a> `onNodeContext?` | (`event`) => `void` | A node was long-pressed, right-clicked or chosen with the context menu key: show a menu of things to do with it at (`x`, `y`). With this callback or a `node-context` listener, the press is yours: it doesn't open the node, and the browser's own menu stays closed. | [`RendererOptions`](index.md#rendereroptions).[`onNodeContext`](index.md#property-onnodecontext-2) |
| <a id="property-onnodedrag"></a> `onNodeDrag?` | (`event`) => `void` | A node is dragged somewhere else (see `editable` and the `node-drag` event). | [`RendererOptions`](index.md#rendereroptions).[`onNodeDrag`](index.md#property-onnodedrag-2) |
| <a id="property-onspinsettle"></a> `onSpinSettle?` | (`planet`) => `void` | Called when a flicked orbit comes to rest, with the planet nearest the top. | [`RendererOptions`](index.md#rendereroptions).[`onSpinSettle`](index.md#property-onspinsettle-2) |
| <a id="property-onviewmodechange"></a> `onViewModeChange?` | (`mode`) => `void` | - | [`RendererOptions`](index.md#rendereroptions).[`onViewModeChange`](index.md#property-onviewmodechange-2) |
| <a id="property-orbitanimation"></a> `orbitAnimation?` | `boolean` | Keep the orbit turning slowly on its own. | [`RendererOptions`](index.md#rendereroptions).[`orbitAnimation`](index.md#property-orbitanimation-3) |
| <a id="property-orbitspeed"></a> `orbitSpeed?` | `number` | Seconds per revolution of `orbitAnimation`. | [`RendererOptions`](index.md#rendereroptions).[`orbitSpeed`](index.md#property-orbitspeed-3) |
| <a id="property-palette"></a> `palette?` | `string`[] | Node colors: the first for the root, then one per top-level branch (cycling). Default: the theme's. | [`RendererOptions`](index.md#rendereroptions).[`palette`](index.md#property-palette-3) |
| <a id="property-showactionbuttons"></a> `showActionButtons?` | `boolean` | Buttons under the focused node for its note, media, link and actions. Default true. | [`RendererOptions`](index.md#rendereroptions).[`showActionButtons`](index.md#property-showactionbuttons-2) |
| <a id="property-showcontrols"></a> `showControls?` | `boolean` | Breadcrumbs, the view switch, the list button and zoom buttons. Default true. | [`RendererOptions`](index.md#rendereroptions).[`showControls`](index.md#property-showcontrols-2) |
| <a id="property-showdetailsheet"></a> `showDetailSheet?` | `boolean` | Open the built-in detail sheet for notes, embeds and the details of a node's type. Default true. | [`RendererOptions`](index.md#rendereroptions).[`showDetailSheet`](index.md#property-showdetailsheet-2) |
| <a id="property-showrings"></a> `showRings?` | `boolean` | Draw the dashed orbit rings. Default true. | [`RendererOptions`](index.md#rendereroptions).[`showRings`](index.md#property-showrings-3) |
| <a id="property-source"></a> `source?` | `string` | Markdown or YAML source, parsed with `parseOrbit`. Its frontmatter options apply unless a prop overrides them. | - |
| <a id="property-spin"></a> `spin?` | [`OrbitSpinOptions`](index.md#orbitspinoptions) | How a flicked orbit spins. | [`RendererOptions`](index.md#rendereroptions).[`spin`](index.md#property-spin-2) |
| <a id="property-staticfallback"></a> `staticFallback?` | `boolean` | Render a static SVG of the map until the live one mounts, so server rendering and slow connections show the map right away. Default true. | - |
| <a id="property-statuses"></a> `statuses?` | `Record`\<`string`, [`OrbitStatusStyle`](index.md#orbitstatusstyle)\> | Status words and how they look: a dot tone (`active`, `done`, `blocked`, `todo`, `neutral`) or any CSS color, as in `{ review: 'active', 'on hold': '#A855F7' }`. | [`RendererOptions`](index.md#rendereroptions).[`statuses`](index.md#property-statuses-2) |
| <a id="property-strings"></a> `strings?` | `Partial`\<[`OrbitStrings`](index.md#orbitstrings)\> | Words to change on this map only, over its language's: `{ zoomIn: 'Closer' }`. | [`RendererOptions`](index.md#rendereroptions).[`strings`](index.md#property-strings-3) |
| <a id="property-theme"></a> `theme?` | \| [`OrbitThemePreset`](index.md#orbitthemepreset) \| [`OrbitRendererTheme`](index.md#orbitrenderertheme) \| `string` & `object` | A theme name (`'night'`, `'cosmos'`, or one registered with `registerTheme`) or a theme object. An object without a `preset` keeps the document's theme and changes the tokens it names. | [`RendererOptions`](index.md#rendereroptions).[`theme`](index.md#property-theme-4) |
| <a id="property-transitionduration"></a> `transitionDuration?` | `number` \| `"auto"` | Navigation flight length in milliseconds, or `auto` to scale with the distance travelled. | [`RendererOptions`](index.md#rendereroptions).[`transitionDuration`](index.md#property-transitionduration-2) |
| <a id="property-viewmode"></a> `viewMode?` | [`ViewMode`](index.md#viewmode) | The first view: `focus` (default) or `all`, the overview. | [`RendererOptions`](index.md#rendereroptions).[`viewMode`](index.md#property-viewmode-4) |
| <a id="property-zoom"></a> `zoom?` | [`OrbitZoomOptions`](index.md#orbitzoomoptions) | How the wheel, trackpads and pinches zoom. | [`RendererOptions`](index.md#rendereroptions).[`zoom`](index.md#property-zoom-3) |

***

### OrbitMindMapRef

#### Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-renderer"></a> `renderer` | `readonly` | [`OrbitSVGRenderer`](index.md#orbitsvgrenderer) \| `null` | The renderer, once the map has mounted. |

#### Methods

##### fit()

```ts
fit(): void;
```

Returns the camera to the fitted view.

###### Returns

`void`

##### flyTo()

```ts
flyTo(nodeId): boolean;
```

Flies to a node by id, in focus mode. Returns false when there's no such node.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `nodeId` | `string` |

###### Returns

`boolean`

##### getViewMode()

```ts
getViewMode(): ViewMode | null;
```

###### Returns

[`ViewMode`](index.md#viewmode) \| `null`

##### overview()

```ts
overview(): void;
```

Flies out to the overview of the whole map.

###### Returns

`void`

##### setViewMode()

```ts
setViewMode(mode): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `mode` | [`ViewMode`](index.md#viewmode) |

###### Returns

`void`

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

## Variables

### OrbitMindMap

```ts
const OrbitMindMap: ForwardRefExoticComponent<OrbitMindMapProps & RefAttributes<OrbitMindMapRef>>;
```

Renders an orbit map that fills its parent element, so give the parent a
size. Pass the map as `source` (markdown or YAML), `document` or `data`.

Callback props can be inline functions and `theme` / `palette` can be
inline objects: they never rebuild the map unless their values change.

#### Example

```tsx
import { OrbitMindMap } from '@restless-dreams/orbit/react';

<div style={{ height: 480 }}>
  <OrbitMindMap source={'# Launch\n## Research\n## Build'} theme="night" onFocusChange={(node) => console.log(node.text)} />
</div>
```
