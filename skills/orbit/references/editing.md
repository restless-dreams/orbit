<!-- A copy of docs/editing.md, made by scripts/build-llms.ts, with links to other files pointing at the repository. Edit the original. -->

# Editing on the map

People can build a map on the map itself. A **+** in the orbit adds an idea, typed right inside its new planet, a node's text is edited where it is, and a node is dragged to wherever it should go. Each edit animates into place, and the map comes back as orbit-md to save.

## Turn it on

```js
import { createOrbitMap } from '@restless-dreams/orbit';

const map = createOrbitMap(element, markdown, {
  editable: true,
  onEdit: () => save(map.toMarkdown()),
});
```

With `editable`:

- **A + in the orbit.** In focus mode, the orbit keeps a free place after the planets, drawn as a dashed planet with a plus.
  - Press it and type: the text goes inside the new planet.
  - Enter adds the idea right where it was typed and opens the next one after it, so ideas go in one after another, the keyboard staying up.
  - Escape, or Enter with nothing typed, stops.
- **Text edited where it is.** A long press, a right click or F2 on a node turns its label into a field.
  - Enter saves, and Escape leaves the text as it was. Tapping anywhere else saves.
  - A moon flies into its planet's orbit first, so its text has room. In the overview, small nodes get a field floating over them, at a size you can read.
- **Nodes dragged somewhere else** (see [Dragging nodes](#dragging-nodes)).

`<orbit-map editable>` and `<OrbitMindMap editable>` turn it on too.

## Your own menu

To offer more than editing text, show your own menu when a node is long-pressed, right-clicked, or chosen with the context menu key:

```js
const map = createOrbitMap(element, markdown, {
  editable: true,
  onNodeContext: ({ node, x, y }) => showMenu(x, y, [
    { label: 'Rename', run: () => map.editNode(node.id) },
    { label: 'Add an idea under it', run: () => map.editNewNode(node.id) },
    { label: 'Mark done', run: () => map.updateNode(node.id, { status: 'done' }) },
    { label: 'Delete', run: () => map.removeNode(node.id) },
  ]),
  onEdit: () => save(map.toMarkdown()),
});
```

- **What `node-context` reports:** a long press (half a second, held still; `longPressDelay` changes it) with a finger or a pen, a right click, or the context menu key or Shift+F10 on the node with keyboard focus. `x` and `y` are where to put your menu, in CSS pixels from the map's top left corner: the press, or the node's center for the keyboard.
- **The press is yours** with an `onNodeContext` callback or a `node-context` listener (`map.on('node-context', …)`). It doesn't open the node, it doesn't start editing the text, and the browser's own menu stays closed. A listener for the `orbit-node-context` DOM event takes it by calling `event.preventDefault()`.
- **Without any of them,** a long press edits the text on an editable map, once it's let go without moving: moving it drags the node instead. On other maps, it is an ordinary tap and a right click opens the browser's menu.
- **The same long press can drag the node.** Your menu opens as the press is held; if the finger then moves, `node-drag` fires with `phase: 'start'`, and that's the moment to close the menu: the node is on its way somewhere else.

## Dragging nodes

On an editable map, a node held still lifts: a long press with a finger or a pen, or the mouse held down half a second. Move it, and it follows the press, its moons with it.

- **Onto another node:** that node grows and takes a ring. Let go, and the dragged node goes into it, after its last child.
- **Along the orbit:** a planet keeps its place held, an empty ring where it was, so nothing slides under the finger. Carried along the ring, the place moves as it passes each planet, and the others make room. A planet catches a drop only near its middle; over its rim, the press is on the orbit, placing the node beside it. A moon or a deeper node carried to the orbit takes the + as its place.
- **Let go anywhere else,** and it lands in the place held for it. One that never left its place goes back down. Escape, or a second finger, puts it back.
- **What can't happen:** a node can't go inside itself or anything under it, the sun and the root don't lift, and a map that isn't editable never lifts a node.

Each drop is a `moveNode`: it fires `edit` with `kind: 'move'`, the node flies from where it was let go to its place, and Orbit announces it. A mouse that's let go without moving still clicks, so a slow click opens the node as usual.

```js
const map = createOrbitMap(element, markdown, {
  editable: true,
  onNodeContext: ({ node, x, y }) => showMenu(x, y, node),
  onNodeDrag: ({ phase }) => {
    if (phase === 'start') {
      closeMenu();
    }
  },
  onEdit: () => save(map.toMarkdown()),
});
```

`node-drag` reports each step: `start` as the node leaves its place (with where it was), `over` whenever where it would go changes (`parent` and `index`, or `null` over no place, for haptics or a hint), and `end` when it's let go (where it went, after the `edit`; `null` when it went back).

## Keys for editing

With `editingKeys` as well as `editable`, the keyboard builds a map the way mind-map apps do:

```js
const map = createOrbitMap(element, markdown, { editable: true, editingKeys: true });
```

| Key | On a node with keyboard focus | While typing |
| --- | --- | --- |
| Tab | Adds an idea under it (Insert does too) | Keeps what was typed and goes on under it. With nothing typed, moves the field under the idea before. |
| Shift+Tab | Leaves the map, as usual | Keeps what was typed and goes on a level up, beside the parent |
| Shift+Enter | Adds an idea beside it, right after it | |
| Enter | Flies into it, as without the keys | Keeps what was typed and goes on beside it |
| Delete | Removes it, with everything under it | |

- **A whole map without the mouse:** Tab on the sun and type. Enter brings the next idea, Tab goes under the one just typed, Shift+Tab comes back up, and Escape stops.
- **Tab stays in the map.** Without the keys the map is one tab stop, and Tab leaves it. With them, Tab on a node adds an idea, and Shift+Tab leaves. Turn them on where the map is the page's main tool, such as an editor, rather than for a map among other controls.
- **After Delete,** keyboard focus moves on to the node after the removed one, or the one before it, or its parent. The root stays. To offer undo, keep the markdown from before each edit (see [Saving](#saving)).

## The editing methods

| Method | What it does |
| --- | --- |
| `editNode(id)` | Opens the field over a node, to type its text where it is. |
| `editNewNode(parentId?, index?)` | Opens the field in the orbit of `parentId` (default: the node in focus), at `index` among its children (default: after the last). It flies there first. |
| `stopEditing(save?)` | Closes the field, keeping what was typed unless `save` is false. |
| `addNode(parentId, { text, …, children }, index?)` | Adds a node under `parentId`, at `index` among its children (default: last), with the nodes `children` lists under it, as many levels down as you like. Returns the new node. |
| `updateNode(id, changes)` | Changes text and attributes: `{ text: 'Budget' }`, `{ status: 'done', color: '#E8A33D' }`. `undefined` removes one: `{ color: undefined }`. Returns the node. |
| `removeNode(id)` | Removes a node and everything under it. The root stays. Returns the removed node. |
| `moveNode(id, parentId, index?)` | Moves a node, with everything under it, under `parentId` at `index`. Under the same parent, it changes the order. Returns the node. |
| `getDocument()` | The map as a document: its tree, and the options its frontmatter set. |
| `toMarkdown()` | The map as orbit-md, frontmatter included. |

To let a language model make these changes, see [Map tools for AI](map-tools.md).

`editNode` and `editNewNode` return false, and the others `null`, when there's nothing to do: an id that isn't in the map, removing or moving the root, or moving a node inside itself. They work on any interactive map. `editable` adds the ways people edit by themselves: the +, editing on a long press, a right click, the context menu key or F2, and dragging.

Besides `text`, `addNode` and `updateNode` take the node's attributes: `icon`, `color`, `status`, `priority`, `tags`, `collapsed`, `type`, `link`, `note`, `noteFormat`, `image`, `video`, `embed`, and `attrs` for your own.

- **Ids come from the text,** as when a map is read from markdown: "Night markets" is `night-markets`, and a second "Ideas" is `ideas-2`. New text gives a node a new id, so the saved file needs no `id` attribute. A node keeps its id when a `#id` link points at it, or when the id was set by hand. Read a node's current id from what the method returns.
- **Titles are one line:** line breaks become spaces, typed or pasted.
- **The reader keeps their place.** When the node in focus, or a node above it, is removed, the nearest node left takes the focus and `focus-change` fires. A node in focus that gets a new id stays in focus.
- **Edits change the tree in place:** `getDocument().root`, which is the tree you passed to `render()` if you passed one.

## Events

| Event | DOM event | Option | Detail |
| --- | --- | --- | --- |
| `edit` | `orbit-edit` | `onEdit` | `{ kind, node, tree }`: `kind` is `add`, `update`, `remove` or `move` |
| `editor-open` | `orbit-editor-open` | `onEditorOpen` | `{ node, parent }`: the node whose text is typed, or `node: null` and the `parent` of a new idea |
| `editor-close` | `orbit-editor-close` | `onEditorClose` | the same |
| `node-context` | `orbit-node-context` | `onNodeContext` | `{ node, x, y }` |
| `node-drag` | `orbit-node-drag` | `onNodeDrag` | `{ phase, node, parent, index }`: `phase` is `start`, `over` or `end` |

The field's events help a page around the map: hide a button that would cover the keyboard, say, or bring a phone's keyboard up when an app opens the field itself.

## Saving

Save the map on every `edit`:

```js
map.on('edit', () => localStorage.setItem('map', map.toMarkdown()));
```

- **`toMarkdown()` reads back as the same map,** ids included, and keeps the file as it was written: only the ideas an edit changed are written again, so a note written by hand or by another app keeps its formatting and everything Orbit doesn't read (see [What saving keeps](format.md#what-saving-keeps)). New ideas are written the way people write maps: headings for the root and its children, lists below them, checkboxes for statuses, hashtags for tags. For YAML, use `serializeOrbitYAML(map.getDocument())`.
- **A map written for a newer version of the format** has an `unsupported-schema-version` diagnostic: open it without `editable`, so nothing is changed that this version doesn't understand.
- **Drawing the saved text again is fine.** When `render()` gets the map as it already is, Orbit keeps the view, and an edit's animation carries on.
- **Undo is yours to keep:** save the markdown before an edit, and `render()` it to go back. Orbit animates to the restored map and keeps the reader's place.

## In React

`<OrbitMindMap>` takes `editable`, `onEdit`, `onNodeContext`, `onNodeDrag`, `onEditorOpen` and `onEditorClose`, and the ref's `renderer` has the methods:

```tsx
import { useRef, useState } from 'react';
import { OrbitMindMap, type OrbitMindMapRef } from '@restless-dreams/orbit/react';

export const Brainstorm = ({ initial }: { initial: string }) => {
  const map = useRef<OrbitMindMapRef>(null);
  const [source, setSource] = useState(initial);
  return (
    <div style={{ height: 480 }}>
      <OrbitMindMap
        ref={map}
        source={source}
        editable
        onEdit={() => setSource(map.current?.renderer?.toMarkdown() ?? source)}
      />
    </div>
  );
};
```

Setting `source` to what the map just wrote doesn't draw it again.

## In `<orbit-map>`

```html
<orbit-map editable>
# Weekend in Lisbon
## Food
## Places
</orbit-map>
```

The element's `renderer` has the same methods, and its events bubble out of it: listen for `orbit-edit` and save `element.renderer.toMarkdown()`. Edits change the map, not the element's text. `<orbit-map editable editing-keys>` turns on the [keys for editing](#keys-for-editing) too.

## Keyboard and screen readers

- **F2** edits the text of the node with keyboard focus. With `editingKeys`, Tab, Shift+Enter and Delete add and remove ideas too (see [Keys for editing](#keys-for-editing)).
- **The +** takes its turn among the planets with `←` and `→`; Enter or Space on it adds an idea.
- **The context menu key** and Shift+F10 open your menu for the node with keyboard focus, so whatever a long press offers works from the keyboard too.
- **The field** is named after what it's for ("Text of Food", "New idea for Trip"), and when it closes with Enter or Escape, keyboard focus returns to the node, or to the +.
- **Announcements:** Orbit announces added, removed and moved nodes in its live region ("Added Night markets").
- **Moving without dragging:** dragging needs a pointer, so offer a way to move nodes in your menu too, with `moveNode` (earlier, later, in, out), as the keyboard can reach it.
