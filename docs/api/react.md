[**@restless-dreams/orbit**](README.md)

***

[@restless-dreams/orbit](README.md) / react

# react

## Interfaces

### OrbitMindMapProps

What `<OrbitMindMap>` takes: the map, the renderer's options as props, and a `<div>`'s own attributes.

#### Extends

- [`OrbitRendererOptions`](index.md#orbitrendereroptions).`Omit`\<`HTMLAttributes`\<`HTMLDivElement`\>, `"children"`\>

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-actions"></a> `actions?` | [`OrbitAction`](index.md#orbitaction)[] | Your own buttons under the focused node and in its detail sheet, before the registered ones. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`actions`](index.md#property-actions-3) |
| <a id="property-animation"></a> `animation?` | `boolean` | Keep the orbit turning slowly on its own. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`animation`](index.md#property-animation-3) |
| <a id="property-arialabel"></a> `ariaLabel?` | `string` | The map's accessible name. Default: the document's `title`. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`ariaLabel`](index.md#property-arialabel-2) |
| <a id="property-baseurl"></a> `baseUrl?` | `string` | Resolves relative image, video, sound and link URLs: an http, https or file address, or a relative one, which the page's address completes. Joined to a base of any other kind, such as `javascript:`, they'd take its scheme, so they stay relative instead. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`baseUrl`](index.md#property-baseurl-5) |
| <a id="property-data"></a> `data?` | [`OrbitNode`](index.md#orbitnode) | A node tree, for maps built in code. | - |
| <a id="property-document"></a> `document?` | [`OrbitDocument`](index.md#orbitdocument) | A parsed document. Its frontmatter options apply unless a prop overrides them. | - |
| <a id="property-editable"></a> `editable?` | `boolean` | Build the map on the map: a + in the orbit adds an idea, typed right in its new planet, and a long press, a right click or F2 edits a node's text where it is. A node held still, by a long press or the mouse, lifts: drag it onto another node to move it there, or to a place in the orbit to put it there. Default false. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`editable`](index.md#property-editable-2) |
| <a id="property-editingkeys"></a> `editingKeys?` | `boolean` | Keys for building an editable map at speed, as in mind-map apps. On a node with keyboard focus, Tab (or Insert) adds an idea under it, Shift+Enter adds one beside it, and Delete removes it. While typing, Tab keeps what was typed and goes on a level down, under it; with nothing typed, it moves the field under the idea before. Shift+Tab goes on a level up, beside the parent. Tab then stays in the map; Shift+Tab from a node still leaves it. Default false. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`editingKeys`](index.md#property-editingkeys-2) |
| <a id="property-focus"></a> `focus?` | `string` | The node in focus when the map first draws, by id: to open a map where the reader left it. Default: the root. Later renders keep the reader's place. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`focus`](index.md#property-focus-3) |
| <a id="property-focusedid"></a> `focusedId?` | `string` | The focused node's id, to control focus from your state. The map flies to it when it changes; pair it with `onFocusChange` to follow the reader. | - |
| <a id="property-insets"></a> `insets?` | [`OrbitInsets`](index.md#orbitinsets) | The parts of the map the page covers with its own controls, such as a toolbar floating over its bottom edge, in px from each edge. Views are fitted into what's left, and the map still draws under the controls. Changing them moves a fitted view to its new place (see `insetsTransition`). | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`insets`](index.md#property-insets-2) |
| <a id="property-insetstransition"></a> `insetsTransition?` | `"instant"` \| `"glide"` | How the insets a `setOptions` call brings take effect, for that call alone. By default (`'instant'`) a fitted view is kept within its new room at once, as it has to be while the keyboard slides or a sheet is dragged and the insets change every frame. `'glide'` glides it all the way from where it was, with the camera, for a change made once, such as a panel coming or going. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`insetsTransition`](index.md#property-insetstransition-2) |
| <a id="property-interactive"></a> `interactive?` | `boolean` | `false` draws a still picture: no clicks, drags, zoom or keyboard. Default true. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`interactive`](index.md#property-interactive-3) |
| <a id="property-language"></a> `language?` | `string` | The language of the map's controls, sheets and announcements: a BCP 47 tag such as `es` or `pt-BR`. Default: the language the map's element is in (the closest `lang` attribute), then English. Orbit speaks English and Spanish; `registerLanguage` adds others. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`language`](index.md#property-language-3) |
| <a id="property-longpressdelay"></a> `longPressDelay?` | `number` | How long (ms) a finger or pen holds still on a node before it counts as a long press (see `onNodeContext`). Default 500; apps can pass their platform's own, such as Android's 400. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`longPressDelay`](index.md#property-longpressdelay-2) |
| <a id="property-maxdepth"></a> `maxDepth?` | `number` | Levels below the root to render (1 = root + direct children). | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`maxDepth`](index.md#property-maxdepth-3) |
| <a id="property-mediaviewer"></a> ~~`mediaViewer?`~~ | `boolean` | **Deprecated** Use `showMediaViewer`, named as `showRings` and the other switches are: this name goes in Orbit 1.0. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`mediaViewer`](index.md#property-mediaviewer-2) |
| <a id="property-nodetypefor"></a> `nodeTypeFor?` | (`node`) => `string` \| `undefined` | The type a node that names none is drawn as, for display only: as if it said `type: name`, with that type's look, content and actions. Orbit never writes it to the map, and asks again whenever it draws; return undefined to draw the node as it is. Called often: keep it quick. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`nodeTypeFor`](index.md#property-nodetypefor-3) |
| <a id="property-nodetypes"></a> `nodeTypes?` | `Record`\<`string`, [`OrbitNodeType`](index.md#orbitnodetype)\> | Node types by name: what nodes with `type: name` look like, draw inside them, show in the detail sheet and offer as actions. They come before the ones registered with `registerNodeType`. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`nodeTypes`](index.md#property-nodetypes-3) |
| <a id="property-noterenderer"></a> `noteRenderer?` | (`note`, `context`) => `string` | Renders a note to HTML yourself. The HTML is used as-is: sanitize untrusted notes. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`noteRenderer`](index.md#property-noterenderer-2) |
| <a id="property-onaction"></a> `onAction?` | (`event`) => `false` \| `void` | A button was pressed. Return `false` to skip what it does (the detail sheet, the link, or your action's `run`). | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`onAction`](index.md#property-onaction-2) |
| <a id="property-onedit"></a> `onEdit?` | (`edit`) => `void` | The map was edited with `addNode`, `updateNode`, `removeNode` or `moveNode`; save `renderer.toMarkdown()` to keep it. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`onEdit`](index.md#property-onedit-2) |
| <a id="property-oneditorclose"></a> `onEditorClose?` | (`event`) => `void` | The field for typing on the map closed. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`onEditorClose`](index.md#property-oneditorclose-2) |
| <a id="property-oneditoropen"></a> `onEditorOpen?` | (`event`) => `void` | The field for typing on the map opened. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`onEditorOpen`](index.md#property-oneditoropen-2) |
| <a id="property-onfocuschange"></a> `onFocusChange?` | (`node`, `path`) => `void` | A new node is in focus, with the `path` from the root to it, as `focus-change` has them. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`onFocusChange`](index.md#property-onfocuschange-2) |
| <a id="property-onmediaclose"></a> `onMediaClose?` | (`event`) => `void` | The media viewer closed. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`onMediaClose`](index.md#property-onmediaclose-2) |
| <a id="property-onmediaopen"></a> `onMediaOpen?` | (`event`) => `void` | The media viewer opened, or stepped to another picture, video or sound. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`onMediaOpen`](index.md#property-onmediaopen-2) |
| <a id="property-onmediastate"></a> `onMediaState?` | (`state`) => `void` | The video, sound or live photo's motion in the media viewer started, paused, moved on, ended or was muted; while it plays, its time a few times a second. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`onMediaState`](index.md#property-onmediastate-2) |
| <a id="property-onnodeclick"></a> `onNodeClick?` | (`node`) => `void` | A node was clicked or activated with the keyboard, before the map reacts. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`onNodeClick`](index.md#property-onnodeclick-2) |
| <a id="property-onnodecontext"></a> `onNodeContext?` | (`event`) => `void` | A node was long-pressed, right-clicked or chosen with the context menu key: show a menu of things to do with it at (`x`, `y`). With this callback or a `node-context` listener, the press is yours: it doesn't open the node, and the browser's own menu stays closed. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`onNodeContext`](index.md#property-onnodecontext-2) |
| <a id="property-onnodedrag"></a> `onNodeDrag?` | (`event`) => `void` | A node is dragged somewhere else (see `editable` and the `node-drag` event). | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`onNodeDrag`](index.md#property-onnodedrag-2) |
| <a id="property-onspinsettle"></a> `onSpinSettle?` | (`node`) => `void` | Called when a flicked orbit comes to rest, with the planet nearest the top. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`onSpinSettle`](index.md#property-onspinsettle-2) |
| <a id="property-onviewmodechange"></a> `onViewModeChange?` | (`mode`) => `void` | - | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`onViewModeChange`](index.md#property-onviewmodechange-2) |
| <a id="property-orbitanimation"></a> ~~`orbitAnimation?`~~ | `boolean` | **Deprecated** Use `animation`, as a document writes it: this name goes in Orbit 1.0. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`orbitAnimation`](index.md#property-orbitanimation-3) |
| <a id="property-orbitspeed"></a> ~~`orbitSpeed?`~~ | `number` | **Deprecated** Use `speed`, as a document writes it: this name goes in Orbit 1.0. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`orbitSpeed`](index.md#property-orbitspeed-3) |
| <a id="property-palette"></a> `palette?` | `string`[] | Node colors: the first for the root, then one per top-level branch (cycling). Default: the theme's. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`palette`](index.md#property-palette-4) |
| <a id="property-showactionbuttons"></a> `showActionButtons?` | `boolean` | Buttons under the focused node for its note, media, link and actions. Default true. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`showActionButtons`](index.md#property-showactionbuttons-2) |
| <a id="property-showcontrols"></a> `showControls?` | `boolean` | Breadcrumbs, the view switch, the list button and zoom buttons. Default true. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`showControls`](index.md#property-showcontrols-2) |
| <a id="property-showdetailsheet"></a> `showDetailSheet?` | `boolean` | Open the built-in detail sheet for notes, embeds and the details of a node's type. Default true. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`showDetailSheet`](index.md#property-showdetailsheet-2) |
| <a id="property-showmediaviewer"></a> `showMediaViewer?` | `boolean` | Show pictures, videos and sounds in the media viewer, over the whole window: "View picture", "Play video" and "Play sound" open it, and so do the detail sheet's pictures and its videos' and sounds' Expand buttons. Default true. With `false`, those buttons open the detail sheet instead (unless `showDetailSheet` is `false` too), whose videos and sounds then have no Expand button. `openMedia` opens the viewer either way. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`showMediaViewer`](index.md#property-showmediaviewer-2) |
| <a id="property-showrings"></a> `showRings?` | `boolean` | Draw the dashed orbit rings. Default true. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`showRings`](index.md#property-showrings-3) |
| <a id="property-source"></a> `source?` | `string` | Markdown or YAML source, parsed with `parseOrbit`. Its frontmatter options apply unless a prop overrides them. | - |
| <a id="property-speed"></a> `speed?` | `number` | Seconds per turn of `animation`'s drift: bigger is slower. Default 90. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`speed`](index.md#property-speed-3) |
| <a id="property-spin"></a> `spin?` | [`OrbitSpinOptions`](index.md#orbitspinoptions) | How a flicked orbit spins. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`spin`](index.md#property-spin-2) |
| <a id="property-staticfallback"></a> `staticFallback?` | `boolean` | Render a static SVG of the map until the live one mounts, so server rendering and slow connections show the map right away. Default true. | - |
| <a id="property-statuses"></a> `statuses?` | `Record`\<`string`, [`OrbitStatusStyle`](index.md#orbitstatusstyle)\> | Status words and how they look: a dot tone (`active`, `done`, `blocked`, `todo`, `neutral`) or any CSS color, as in `{ review: 'active', 'on hold': '#A855F7' }`. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`statuses`](index.md#property-statuses-3) |
| <a id="property-strings"></a> `strings?` | `Partial`\<[`OrbitStrings`](index.md#orbitstrings)\> | Words to change on this map only, over its language's: `{ zoomIn: 'Closer' }`. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`strings`](index.md#property-strings-3) |
| <a id="property-theme"></a> `theme?` | \| [`OrbitThemePreset`](index.md#orbitthemepreset) \| [`OrbitRendererTheme`](index.md#orbitrenderertheme) \| `string` & `object` | A theme name (`'night'`, `'cosmos'`, or one registered with `registerTheme`) or a theme object. An object without a `preset` keeps the document's theme and changes the tokens it names. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`theme`](index.md#property-theme-4) |
| <a id="property-transitionduration"></a> `transitionDuration?` | `number` \| `"auto"` | Navigation flight length in milliseconds, or `auto` to scale with the distance travelled. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`transitionDuration`](index.md#property-transitionduration-2) |
| <a id="property-view"></a> `view?` | [`OrbitViewMode`](index.md#orbitviewmode) | The first view: `focus` (default) or `all`, the overview. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`view`](index.md#property-view-4) |
| <a id="property-viewmode"></a> ~~`viewMode?`~~ | [`OrbitViewMode`](index.md#orbitviewmode) | **Deprecated** Use `view`, as a document writes it: this name goes in Orbit 1.0. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`viewMode`](index.md#property-viewmode-4) |
| <a id="property-zoom"></a> `zoom?` | [`OrbitZoomOptions`](index.md#orbitzoomoptions) | How the wheel, trackpads and pinches zoom. | [`OrbitRendererOptions`](index.md#orbitrendereroptions).[`zoom`](index.md#property-zoom-2) |

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
getViewMode(): OrbitViewMode | null;
```

###### Returns

[`OrbitViewMode`](index.md#orbitviewmode) \| `null`

##### hideChildren()

```ts
hideChildren(ids): boolean;
```

Hides the ideas under nodes, to show later (see `OrbitSVGRenderer.hideChildren`). Returns whether any were newly hidden.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ids` | `string` \| readonly `string`[] |

###### Returns

`boolean`

##### overview()

```ts
overview(): void;
```

Flies out to the overview of the whole map.

###### Returns

`void`

##### revealChildren()

```ts
revealChildren(ids?): boolean;
```

Shows ideas hidden under `ids`, or under every node (see `OrbitSVGRenderer.revealChildren`). Returns whether any were shown.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ids?` | `string` \| readonly `string`[] |

###### Returns

`boolean`

##### setViewMode()

```ts
setViewMode(mode): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `mode` | [`OrbitViewMode`](index.md#orbitviewmode) |

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
