# Extending Orbit

Orbit has four ways to make maps your own: **node types**, **actions**, **status words** and **themes**. Each works for one map, through its options, or for every map once registered, which also covers `<orbit-map>` elements and maps in markdown pages, where you don't write code per map. A map's own options win over registered ones.

| | For one map | For every map |
| --- | --- | --- |
| Node types | `nodeTypes: { milestone: { … } }` | `registerNodeType('milestone', { … })` |
| Actions | `actions: [{ id, label, run }]` | `registerAction({ id, label, run })` |
| Status words | `statuses: { review: 'active' }` | `registerStatus('review', 'active')` |
| Themes | `theme: { preset, tokens }` | `registerTheme('brand', { preset, tokens })` |

Each `register…` function returns a function that removes the registration again.

## Node types

A node picks a type with the `type` attribute, in any case:

```markdown
# Launch
## v1.0 beta <!-- orbit type: milestone -->
- Ana Torres <!-- orbit type: person, role: Design -->
```

In YAML it's `type: milestone`. The type decides how those nodes look and behave:

```js
import { createOrbitMap } from '@restless-dreams/orbit';

createOrbitMap(element, markdown, {
  nodeTypes: {
    milestone: {
      label: 'Milestone',
      icon: '🏁',
      color: '#F59E0B',
      tokens: { 'node-stroke': '#B45309', 'node-stroke-width': '3' },
    },
    person: {
      label: 'Person',
      render(node, element) {
        element.textContent = node.text.split(' ').map((word) => word[0]).join('');
      },
      details(node, element) {
        element.textContent = `Role: ${node.attrs?.role ?? 'not set'}`;
      },
      actions: [{ id: 'email', label: 'Email', icon: '✉️', run: (node) => window.open(`mailto:${node.attrs?.email}`) }],
    },
  },
});
```

| Key | What it does |
| --- | --- |
| `label` | The type's name for people, shown as a chip in the detail sheet, in the tooltip and to screen readers. |
| `icon` | The icon these nodes get unless they set their own. |
| `color` | The color these nodes get unless they set their own. Their children take shades of it. |
| `tokens` | [Theme tokens](theming.md#custom-properties) for these nodes only, without `--orbit-`: their rim, shadow, glow, label and status colors. |
| `render(node, element)` | Draws inside the node, the way a picture does. `element` is a 100 × 100 px box, clipped to the node's circle and scaled with it, and the label moves outside, onto a pill that shows the node's icon before its name. Return a function to clean up; it runs when the node leaves the map. |
| `details(node, element)` | Adds a section to the detail sheet, above the note. These nodes get a "Show details" button. |
| `actions` | Actions only these nodes offer, after the map's own. |
| `version` | The version of the fields these nodes keep in their attributes, once the type changes them (1 at first). See [Versions](#versions). |
| `upgrade(node, from)` | Brings a node written for an older version of the type up to date. |

- **Custom attributes** like `<!-- orbit role: Design -->` are on `node.attrs`, which makes them handy in `render` and `details`.
- **`render` is for showing:** clicks go through to the node, so use actions for anything to press. It runs when the node comes on the map; navigating away and back draws it again.
- **Errors stay contained:** if a type's `render` or `details`, or an action, throws, the console says which one and the map keeps working.

### Types for display only

`nodeTypeFor(node)` gives a node that names no type one to be drawn as, as if it said `type: name`: that type's look, what it draws inside and its actions. It's for display only: Orbit never writes it to the map, so saving keeps the node as it was, and never upgrades a node for it.

```js
createOrbitMap(element, markdown, {
  nodeTypes: { progress: { label: 'Progress', render: drawProgressRing } },
  // Ideas with to-dos right under them show a ring, unless they have a type of their own.
  nodeTypeFor: (node) => (node.children.some((child) => child.status) ? 'progress' : undefined),
});
```

- **A node's own `type` wins:** `nodeTypeFor` is only asked about nodes without one.
- **It's asked whenever the map draws,** often, so keep it quick, and return `undefined` to draw a node as it is. An answer that changes with the map, after an edit to the node's children say, shows as the map draws the edit; after a change elsewhere that answers depend on, `render()` the map again.
- **The type shows wherever a type does:** in the detail sheet's chip, the tooltip, what screen readers hear, `data-orbit-type`, the label's font and exports (`renderToSVGString(source, { nodeTypes, nodeTypeFor })`).
- **If it throws,** the console says so once, and nodes are drawn as they are.

### Versions

A type's nodes keep their own fields in attributes, so changing those fields changes what older maps say. Give the type a `version` and an `upgrade` that brings older nodes up to date:

```js
registerNodeType('task', {
  label: 'Task',
  version: 2,
  // Version 1 kept the person in `assignee`; version 2 calls it `owner`.
  upgrade(node, from) {
    if (from < 2 && node.attrs?.assignee !== undefined) {
      const { assignee, ...rest } = node.attrs;
      node.attrs = { ...rest, owner: assignee };
    }
  },
});
```

- **Nodes say which version they were written for:** `type: task@2`; none means 1. A map upgrades older nodes when it draws them, and the next save writes them as `task@2` with their new fields, changing nothing else in the file.
- **Nodes written for a newer version** than the type knows are left as they are, and saving keeps everything in them.
- **Without a map** (on a server, in a script), `upgradeNodeTypes(document.root, nodeTypes)` does the same, with the types you pass and the registered ones, and returns how many nodes it upgraded.
- **If `upgrade` throws,** the console says which type failed and the node stays as it was.

## Actions

Actions are buttons under the node in focus, after Orbit's own (details, picture, video, note, link), and in the node's detail sheet.

```js
createOrbitMap(element, markdown, {
  actions: [
    {
      id: 'assign',
      label: 'Assign',
      icon: '👤',
      when: (node) => node.children.length === 0,
      run: (node, event) => openAssignDialog(node),
    },
  ],
});
```

| Key | What it does |
| --- | --- |
| `id` | The action's name in the `action` event. Use ids other than Orbit's own: `details`, `image`, `video`, `embed`, `note` and `link`. |
| `label` | The button's name, read by screen readers, shown as its tooltip and in the detail sheet. A function gets the node: ``(node) => `Assign ${node.text}` ``. |
| `icon` | An emoji or short symbol (`'✏️'`), SVG path data on a 24-unit grid (`'M4 20h4L20 8l-4-4L4 16z'`), or one of Orbit's icons: `note`, `link`, `goto`, `info`, `image`, `video`, `embed`, `list`. Without one, the label's first letter. |
| `when(node)` | Which nodes offer it. Default: every node. |
| `run(node, event)` | What it does. |

- **The `action` event fires first** (`orbit-action` on the element), with `action` set to the id. `preventDefault()` there, or returning `false` from `onAction`, skips `run`.
- **In the detail sheet,** pressing an action closes the sheet first, so a dialog your action opens is in front.
- **One button per id:** a map's own action wins over a registered one with the same id, and a node type's actions come last.

## Status words

`status` is free text, and [some words](format.md#statuses) get a colored dot. Add your own words, as one of the tones or with a color of their own:

```js
createOrbitMap(element, markdown, {
  statuses: {
    review: 'active',
    shipped: 'done',
    'on hold': '#A855F7',
  },
});
```

The tones are `active`, `done`, `blocked`, `todo` and `neutral`; their colors come from the theme (`--orbit-status-active`, …). Words match in any case.

## Themes

Register a theme once to use it by name everywhere: in options, in a document's frontmatter and on `<orbit-map theme="…">`.

```js
import { registerTheme } from '@restless-dreams/orbit';

registerTheme('brand', {
  preset: 'night',
  tokens: { 'color-root': '#FFD166', 'color-1': '#06D6A0', surface: '#0B1020' },
});
```

```markdown
---
theme: brand
---
# Launch
```

- **What a theme is:** it starts from `preset` (a built-in theme or another registered one) and sets its own [tokens](theming.md#custom-properties).
- **Building on it:** a theme object can start from a registered theme too. `{ preset: 'brand', tokens: { … } }` adds its tokens to brand's.
- **Names:** built-in names can't be reused, and `themeNames()` lists every name.
- **Validation:** `orbit validate` doesn't know the themes your code registers, so it reports `theme: brand` as unknown.

## For every map

Register at startup, before maps are created. Maps created earlier pick up registered types, actions and words when they next redraw.

```js
import { defineOrbitMapElement, registerAction, registerNodeType, registerStatus, registerTheme } from '@restless-dreams/orbit';

registerTheme('brand', { preset: 'night', tokens: { 'color-root': '#FFD166' } });
registerNodeType('milestone', { label: 'Milestone', icon: '🏁', color: '#F59E0B' });
registerStatus('review', 'active');
registerAction({ id: 'copy-link', label: 'Copy link', icon: 'link', run: (node) => navigator.clipboard.writeText(`${location.href}#${node.id}`) });
defineOrbitMapElement();
```

```html
<orbit-map theme="brand">
# Launch
## v1.0 beta <!-- orbit type: milestone, status: review -->
</orbit-map>
```

The functions they return remove the registrations again, which helps with hot reloading and tests.

## In React

`<OrbitMindMap>` takes the same options as props. Inline objects are fine: the map compares what node types and actions declare, and calls their latest functions, `nodeTypeFor`'s too.

```tsx
import { OrbitMindMap } from '@restless-dreams/orbit/react';

export const Roadmap = ({ markdown, onAssign }: { markdown: string; onAssign: (id: string) => void }) => {
  return (
    <div style={{ height: 480 }}>
      <OrbitMindMap
        source={markdown}
        nodeTypes={{ milestone: { label: 'Milestone', icon: '🏁', color: '#F59E0B' } }}
        actions={[{ id: 'assign', label: 'Assign', icon: '👤', run: (node) => onAssign(node.id) }]}
        statuses={{ review: 'active' }}
      />
    </div>
  );
};
```

## Styling nodes with CSS

Each node's element and label carry hooks for CSS:
- `data-orbit-type`: the type, lowercase;
- `data-orbit-status`: the status word, lowercase;
- `data-orbit-tags`: the tags, separated by spaces.

Page CSS can target these on maps drawn with `createOrbitMap` or React:

```css
.orbit-node[data-orbit-type='milestone'] .orbit-node__shade {
  stroke-dasharray: 4 3;
}

.orbit-label[data-orbit-tags~='urgent'] {
  font-weight: 800;
}
```

A map inside `<orbit-map>` sits in a shadow root that page CSS can't reach, so use a type's `tokens` there.

## Exports

`toSVGString()`, `renderToSVGString()` and `orbit render` draw node types' icons, colors and tokens, and your status colors. `renderToSVGString(source, { nodeTypes, statuses, nodeTypeFor })` takes them as options too. What `render` draws is HTML, so it isn't part of an exported SVG.
