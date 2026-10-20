---
name: orbit
description: Write, check and embed Orbit mind maps (@restless-dreams/orbit), written in markdown (orbit-md) or YAML and drawn as interactive solar systems you fly through, or as SVG pictures. Use when asked to make, draw or visualize a mind map, or to turn an outline, roadmap or other hierarchy into an interactive map or a picture of one, or when code uses @restless-dreams/orbit, createOrbitMap, the orbit-map element, OrbitMindMap, renderToSVGString or the orbit command. Not for flowcharts, sequence or architecture diagrams, or charts.
---

# Orbit

Orbit draws a tree as a solar system: the node in focus is the sun, its children orbit it as planets, and their children are moons. Readers click a planet to fly into it, zoom, and flick the orbit to spin it. Maps are written in orbit-md, its markdown (headings and lists), or in YAML.

## Write a map

```markdown
---
title: Product roadmap
theme: night
---
# 🚀 Product roadmap
What ships this year.

## Research <!-- orbit status: done -->
Six weeks of interviews before we commit to scope.
- [x] User interviews
- Competitor teardown #market

## Build
<!-- orbit
status: active
color: "#C6B4F2"
-->
### Frontend
- [/] App shell
- Offline sync <!-- orbit status: blocked -->
  Waiting on the [storage review](#storage-review).
### Storage review

## [Launch](https://example.com/launch-plan)
![The launch poster](images/poster.png)
```

- Every heading and every list item is a node; everything else belongs to the node above it. One top heading is the root (several share one named after `title`). Every list under a heading is its children; indent list items to nest them.
- Text under a heading, or indented under a list item, is the node's note (markdown, shown in the detail sheet). Quote a bullet list with `>` to keep it in the note instead of making children.
- An emoji at the start of a title is the node's icon; a link in the title sets its link (`#id` flies to that node); `[ ]` / `[x]` / `[/]` set status `todo` / `done` / `active`; hashtags at the end are tags. `**bold**`, `*italics*` and `` `code` `` show as plain text; a backslash keeps a character literal.
- A line with only `![alt](src)` is the node's image. A line with only a markdown link to a YouTube or Vimeo video, or to an `.mp4`, `.webm` or `.mov` file, is its video: `[Trailer](https://youtu.be/…)` (a bare address stays text in the note). Under a list item, indent them.
- Attributes go in `<!-- orbit key: value -->` (at the end of a line; separate several with commas) or a block `<!-- orbit … -->` (YAML, after a heading or indented under a list item): `color`, `icon`, `status`, `priority` (a number), `tags` (a list, or words separated by commas), `collapsed`, `type`, `link`, `note`, `noteFormat`, `image`, `video`, `embed`, `caption`, `id`. Other keys are kept as your own attributes. Other HTML comments are hidden, as in markdown: `<!-- status: done -->` without `orbit` sets nothing, and `validate` says so.
- Status words with a colored dot: `active`, `done`, `blocked`, `todo` (and synonyms such as `in progress`, `shipped`, `at risk`, `planned`).
- Frontmatter: `title` (the map's accessible name too), `theme`, `view` (`focus` or `all`), `palette`, `maxDepth`, `showRings`, `interactive`, `animation`, `speed` (seconds per turn of the drift), `baseUrl`, `className`, and `height`, which sizes `<orbit-map>` and marked's placeholders only (in code and React, size the container).
- Themes: `paper` (default), `night`, `glass`, `glass-night`, `cosmos`, `blueprint`, `ink`, `contrast`, `flat`, `flat-night`, `material`, `material-night`, `liquid`, `liquid-night`, `auto`. In code, `materialTheme('#0B57D0')` makes a Material theme from any color.
- For everyone: give pictures alt text, keep titles short with the detail in notes, and don't say things with color alone (statuses have words).
- `npx @restless-dreams/orbit example` prints a map with the main features; `npx @restless-dreams/orbit example --yaml` prints it as YAML.

Every rule, with tables of attributes, options and diagnostics: [references/format.md](references/format.md).

## Check it

```bash
npx @restless-dreams/orbit validate --json map.md
```

It prints `valid`, the `flavor`, the `root` text, the number of `nodes`, the `depth`, and `diagnostics`, each with a `code`, a `severity`, a message that says how to fix it ("Did you mean "status"?") and its `line` where it has one. It exits with 1 while the map has a problem: fix them and validate again until `valid` is true. Some diagnostics only note something and leave the map valid: an attribute Orbit doesn't know, kept as your own (`unknown-attribute`: fix it when it's a typo), a root made up for several top-level nodes (`synthetic-root`), a caption with no media and an upgraded format. `validate` doesn't know themes registered in code and reports them as unknown; `--loose` accepts that. Add `--tree` to print the map as Orbit reads it, a node a line with its `#id`: it shows what became a node, and the ids for `#id` links and `--focus`. In code, `parseOrbit(source).diagnostics` holds the same list.

## Show it

The map fills its container: **always give the container a height**, or nothing shows (the console says so).

```ts
// Any page: one call
import { createOrbitMap } from '@restless-dreams/orbit';
const map = createOrbitMap(document.querySelector('#map')!, markdown, { theme: 'auto' });
map.on('focus-change', ({ node }) => console.log(node.text));
```

```html
<!-- No build step: the web component -->
<script type="module">
  import { defineOrbitMapElement } from 'https://cdn.jsdelivr.net/npm/@restless-dreams/orbit/+esm';
  defineOrbitMapElement();
</script>
<orbit-map height="420" theme="night">
  # Launch
  ## Research
  ## Build
</orbit-map>
```

```tsx
// React and Next.js ("use client" is built in; it renders a static SVG on the server)
import { OrbitMindMap } from '@restless-dreams/orbit/react';
<div style={{ height: 480 }}><OrbitMindMap source={markdown} theme="cosmos" /></div>
```

```ts
// No browser: static SVG for files, emails, server rendering
import { renderToSVGString } from '@restless-dreams/orbit';
const svg = renderToSVGString(markdown, { width: 1200, height: 800, theme: 'paper', viewMode: 'all' });
```

- **Afterwards:** `map.render(source)` redraws and keeps the reader's place, `map.setOptions({ … })` changes options, `map.flyTo(id)` and `map.overview()` move, and `map.destroy()` cleans up. Events come through `map.on(name, listener)`, or as `orbit-<name>` DOM events that bubble out of `<orbit-map>` (details in `event.detail`).
- **Your own controls over the map:** `insets: { bottom: 72 }` fits each view into what a toolbar floating over the map leaves.
- **From the command line:** `npx @restless-dreams/orbit render map.md --view all --out map.svg --theme night` draws the whole map; without `--view all` it draws it as it opens, where only the root and its children have labels. `orbit convert --to yaml map.md` (or `--to md`) turns one flavor into the other, and `orbit convert --to md Plan.xmind --out plan.md` brings in a map from XMind, FreeMind, Freeplane or OPML (`importMap` in code; [references/import-export.md](references/import-export.md)).
- **To share a map for review** (with someone, or to the user's own phone): `npx @restless-dreams/orbit export --html map.md --out map.html` makes one web page with Orbit, the map and its pictures inside, which opens in any browser, offline, to explore or present.
- **marked:** `new Marked(orbitMarked())` (from `@restless-dreams/orbit/marked`) turns ```` ```orbit ```` fences into placeholders, and `hydrateOrbitBlocks(container)` makes them maps. Fences take display options: ```` ```orbit height=480 view=all ````.

Every option, event and method: [references/guide.md](references/guide.md). Vue, Svelte, Astro and markdown pipelines: [references/recipes.md](references/recipes.md).

## Style it

`theme` takes a name or `{ preset, tokens }`, where tokens are the CSS custom properties without `--orbit-`: `{ preset: 'night', tokens: { surface: '#0b1020', 'ring-dash': 'none' } }`. In CSS, set `--orbit-*` properties on the container; they win over the theme. All properties: [references/theming.md](references/theming.md).

## Pictures, videos and languages

- Pictures and videos open in a viewer over the whole window, to zoom into and to play, stepping through the map's media. `mediaViewer: false` shows them in the detail sheet instead, an `onAction` that returns `false` handles them yourself, and `map.openMedia(id)` opens one from code. YouTube's videos don't play in a page opened from a file: serve it. All of it: [references/media.md](references/media.md).
- Maps speak the language of the closest `lang` around them: English and Spanish are built in, and other languages fall back to English. `language: 'es'` picks one, `strings: { … }` changes single words, `registerLanguage(tag, strings)` adds a language, and `orbit render --language es` draws in one. Every word: [references/languages.md](references/languages.md).

## Extend it

- **Node types:** a node picks one with `<!-- orbit type: milestone -->`. The `nodeTypes` option, or `registerNodeType(name, …)` for every map, sets the type's `label`, default `icon` and `color`, theme `tokens`, `render(node, element)` to draw inside the node, `details(node, element)` for the detail sheet, and its own `actions`.
- **Actions:** `actions: [{ id, label, icon, when, run }]` (or `registerAction`) adds buttons under the focused node and in its detail sheet. They fire the `action` event with `action` set to the id.
- **Status words and themes:** `statuses: { review: 'active', 'on hold': '#A855F7' }` (or `registerStatus`) colors status words. `registerTheme('brand', { preset, tokens })` makes `theme: brand` work in options, frontmatter and `<orbit-map theme>`.

Every option, with examples: [references/extending.md](references/extending.md).

## Edit it on the map

- `editable: true` (or `<orbit-map editable>`): a + in the orbit adds ideas, typed inside their new planet, one after another; a long press, a right click or F2 edits a node's text in place, and a node held still lifts and can be dragged onto another node or along the orbit. Save on `edit` (its `kind` is `add`, `update`, `remove` or `move`) with `map.toMarkdown()`, or `serializeOrbitYAML(map.getDocument())` for a YAML map.
- `editingKeys: true` as well (`<orbit-map editable editing-keys>`): Tab adds an idea under the node with keyboard focus, Shift+Enter one beside it, Delete removes it; while typing, Tab and Shift+Tab go a level down and up.
- `onNodeContext: ({ node, x, y }) => …` (or `map.on('node-context', …)`) fires for a long press, a right click or the context menu key on a node: show your own menu at `x`, `y` (CSS pixels from the map's top left corner), and call `map.editNode(id)` or `map.editNewNode(parentId)` from it.
- `map.addNode(parentId, { text, … }, index?)`, `map.updateNode(id, changes)` (`undefined` removes an attribute), `map.removeNode(id)` and `map.moveNode(id, parentId, index?)` change the map with an animation, fire `edit` (`onEdit`), and return the node, or `null` when there's nothing to do.
- Ids follow the text: read a node's current id from what the method returns.
- For an AI assistant in an app, `createMapTools(map)` gives a language model tools to read the map and change it: `tools.for('anthropic' | 'openai' | 'openai-chat' | 'gemini')` for its API (`tools.definitions` for MCP), `tools.instructions` for its system prompt, and `tools.run(call.name, call.input).text` as each call's result. Don't write tools of your own for this: these check every call, animate each change, and say what to fix when a call is wrong.

Ids, focus, saving, React and `<orbit-map>`: [references/editing.md](references/editing.md). The map tools, with the loop for each provider: [references/map-tools.md](references/map-tools.md).

## Mistakes to avoid

- A container without a height: the map is 0 px tall.
- `view: overview`: the overview is `view: all`. In code it's `viewMode: 'all'`, and `view-mode="all"` on `<orbit-map>`; the frontmatter's `animation`, `speed` and `title` are `orbitAnimation`, `orbitSpeed` and `ariaLabel` in code.
- A bullet list meant as part of a note, written without `>`: it becomes child nodes.
- A `#id` link to a node that isn't in the map: `validate` reports it and suggests the id you meant.
- YAML nodes use `text` and `children` (not `title`, `name` or `items`, which `validate` reports); `nodes:` holds the root (several share one named after `title`).
- Inventing options: every option and prop is typed in the package's declarations (`RendererOptions`). TypeScript rejects one that doesn't exist; plain JavaScript ignores it without a word. `validate` checks the map file only.
