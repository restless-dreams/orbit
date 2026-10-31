# Map format

The complete reference for writing Orbit maps. A map is a tree: one root, and nodes with children. Write it in **orbit-md**, Orbit's markdown (the default, for maps people write), or in **YAML** (for maps programs write). `npx @restless-dreams/orbit example` prints a map with the main features, and `npx @restless-dreams/orbit validate map.md` checks one.

- [Markdown](#markdown)
  - [The tree](#the-tree)
  - [Node titles](#node-titles)
  - [Notes](#notes)
  - [Links between nodes](#links-between-nodes)
  - [Media](#media)
  - [Attributes](#attributes)
  - [Statuses](#statuses)
- [Document options](#document-options)
- [YAML](#yaml)
- [Which flavor a document is](#which-flavor-a-document-is)
- [Node ids](#node-ids)
- [Checking a map](#checking-a-map)

## Markdown

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
### Frontend
- [/] App shell
- Offline sync <!-- orbit status: blocked -->
  Waits on the [backend](#backend) sync API.
### Backend

## [Launch](https://example.com/launch-plan)
![The launch poster](images/poster.png)
```

### The tree

**Every heading and every list item is a node.** Everything else belongs to the node above it.

- **Headings** (`#` to `######`) nest by level: a heading's children are the headings below it, up to the next heading at its own level or higher. A line underlined with `===` is a `#` heading, and with `---` a `##` heading. Headings may be indented up to three spaces and end with closing `#`s.
- **Lists** are children of the heading above them, every list, in the order written next to that heading's subheadings. Bullets (`-`, `*`, `+`) and numbered items (`1.`, `1)`) work the same. Indent an item further than the one above it to nest it under that item; lists go as deep as you like, past the six heading levels. A tab counts as four spaces.
- **The root** is the single top heading: the only heading at the highest level used, usually `#`. Several top headings share a root, as do the top items of a document that is just a list: it's named after the frontmatter `title`, a one-line paragraph above them, or "Untitled map". A list with a single top item is rooted at that item. Text before the root heading belongs to the root.
- A ```` ```orbit ```` or `~~~orbit` fence around the whole map is fine: `parseOrbit` unwraps it.

### Node titles

A heading's text, or a list item's first line, is the node's title, read in this order:

| Written | Becomes |
| --- | --- |
| `[ ] Draft` / `[x] Ship` / `[/] Build` | status `todo` / `done` / `active` |
| `🚀 Launch` (emoji first) | icon `🚀`, text `Launch` |
| `Offline sync #frontend #sprint-3` | tags `frontend` and `sprint-3`, text `Offline sync` |
| `Launch [plan](https://…)` | text `Launch plan`, link `https://…` |
| `**Frontend**`, `*Docs*`, `` `api` ``, `~~Old idea~~` | the text without the symbols |
| `Launch <!-- orbit status: active -->` | an attribute, inline (see [Attributes](#attributes)) |

- **Hashtags** count at the end of a title, after a space, and need a letter: `C# rewrite` and `Fix #42` stay as written.
- **Links:** a title that is all link works the same; with several links, the first is the node's link.
- **A backslash** keeps a character as written: `\*not bold\*`, `ship \#notatag`, `\[x] not a task`.

They combine: `## 📈 [Growth](https://example.com/growth) #q3 <!-- orbit status: active -->`.

### Notes

A note is longer text shown in the detail sheet, as markdown. Everything under a heading or list item that isn't a heading or list item is its note: paragraphs, `>` quotes, code blocks and tables.

- Under a list item, indent the note under it, as you would write anything under a heading. A line right after the item, with no blank line between, continues the item too.
- To keep a list inside a note, instead of making it children, quote it with `>`: headings and bullets inside a quote stay note text.

```markdown
# Launch
## Research
Questions to answer:
> - Who buys it?
> - Why now?

- Frontend
  Vite and React. Ships behind the beta flag.
- Backend
```

### Links between nodes

A link to `#id` points at another node of the map, the way `#heading` links point at headings in a page: a note link like `[Research](#research)`, or a node whose link is `#research`. It flies to that node instead of opening a page.

```markdown
# Launch
## Build
Starts when [Research](#research) is done.
## [Read the research](#research)
## Research
```

The id is the node's text in lowercase with dashes (see [Node ids](#node-ids)); `#Research` and GitHub-style `#-research` find it too. A link to a node the map doesn't have is reported. Link-like text in code or an HTML comment isn't a link, as the note doesn't show it as one: a note can show how to write a link, `` `[Research](#research)` ``.

### Media

A node shows its image (or its video's thumbnail) inside it. Its image, video and sound open over the whole window, in the media viewer ([Pictures, videos and sounds](media.md)), and its embed in the detail sheet. Put pictures and videos each on a line of its own under the heading, or indented under the list item:

| Line | Becomes |
| --- | --- |
| `![Alt text](images/photo.jpg)` | the image |
| `[Trailer](https://www.youtube.com/watch?v=…)` | the video: YouTube, Vimeo, or a `.mp4`, `.webm` or `.mov` file |
| `[![Alt text](thumbnail.jpg)](https://vimeo.com/…)` | the video, with that thumbnail |
| `[Any other link](https://…)` | note text |
| `<!-- orbit image: { src: photo.jpg, motion: photo.mp4 } -->` | a live photo: the picture and its motion, only ever written as an attribute |

A node has at most one image, one video and one embed; extra media lines stay in the note. Embeds (a page shown in a frame) are set with the `embed` attribute. To read a media line differently, follow it with `<!-- orbit contentType: image -->` (or `video`, `embed`, or `none` to keep it as note text), and caption it the same way, with `<!-- orbit caption: The summit at dawn -->` right under it. Relative URLs resolve against `baseUrl`.

```markdown
# Trip
- Summit
  ![The summit at dawn](images/summit.jpg)
- Trail
  [Walkthrough](https://www.youtube.com/watch?v=aqz-KE-bpKQ)
```

Attributes set media too: `<!-- orbit image: images/photo.jpg -->`.

A live photo is a picture with its motion, the few seconds of video a phone records around it. The motion goes in the picture's own value: its address, or `{ src, still }`, with where in it the picture was taken, in seconds, when the phone says so:

```markdown
# Trip
- Summit
  <!-- orbit
  image:
    src: media/summit.jpg
    motion: media/summit-motion.mp4
  -->
- Lake
  <!-- orbit
  image:
    src: media/lake.jpg
    motion:
      src: media/lake-motion.mp4
      still: 1.5
    alt: Mist on the lake at dawn
  -->
```

The map and the detail sheet show the picture still, and the media viewer plays the motion over it ([Live photos](media.md#live-photos)). A picture with a motion is always written as an attribute, never as a `![]()` line. A `motion` that isn't an address or `{ src }`, or a `still` that isn't a number of seconds, is kept as written and not used. Versions from before live photos read these maps as they read any picture with fields they don't use: they show the still, keep `motion`, and write it back as it was (see [Changing the format](#changing-the-format)).

A sound (a voice memo, music, a recording) is only ever an attribute, with its caption in its own value:

```markdown
# Trip
- Kickoff <!-- orbit audio: memos/kickoff.m4a -->
- Interview
  <!-- orbit
  audio:
    src: https://example.com/interview.mp3
    caption: The first interview
  -->
```

Sounds have no line of their own: a link to an `.mp3` on its own line stays note text, as it always has, and a `caption` beside `audio` stays with the node's video, embed or picture. So versions from before sounds read every map exactly as they did: they keep `audio` as a custom attribute, write it back as it was, and play nothing (see [Changing the format](#changing-the-format)).

### Attributes

Attributes go in an HTML comment that starts with `orbit` (in any case, with or without a colon after it), written as YAML:

```markdown
## Build
<!-- orbit
color: "#F5A3A8"
status: active
priority: 1
tags: [frontend, sprint-3]
-->

- Frontend <!-- orbit status: active -->
- Backend
  <!-- orbit
  image: diagrams/backend.png
  note: Talks to the billing service.
  -->
```

- **Block form**: on the lines after a heading, or indented under a list item. Any number of keys. A block written right under a list item without its indent still belongs to the heading above the list, and an `attributes-after-list` note says so: indent it to set the list item's.
- **Inline form**: at the end of a heading or list item's line. Separate several with commas: `<!-- orbit status: active, priority: 1 -->`.
- **Other HTML comments** are hidden, as markdown hides them: Orbit keeps them in the file, out of titles, ids and notes as they're shown, and a renamed idea keeps the ones at the end of its title. One that reads like attributes but doesn't start with `orbit` (`<!-- status: done -->`) sets nothing, and a `comment-without-orbit` note says how to write it.

| Key | Value | Example | Effect |
| --- | --- | --- | --- |
| `color` | any CSS color | `"#F5A3A8"`, `tomato` | The node's color, instead of its branch's. Its children take shades of it. |
| `paletteColor` | number | `3` | Which of the palette's colors the node takes when it has no `color`: `1` is the first after the root's, cycling. Its children take shades of it. Editing on the map writes it to keep an idea's color (see [Colors](#colors)). |
| `icon` | emoji or short symbol | `🚀`, `"★"` | Shown before the text. Same as an emoji at the start of the title. |
| `status` | text | `active`, `done`, `blocked` | Shown in the detail sheet; some words get a colored dot (see [Statuses](#statuses)). |
| `priority` | number | `1` | Shown in the detail sheet. |
| `tags` | list of text | `[frontend, sprint-3]` | Shown in the detail sheet. A single word works too, and so do words separated by commas: `tags: frontend, sprint-3`. Hashtags at the end of the title add to them. |
| `collapsed` | `true` / `false` | `true` | Hides the node's children (they show as a "+N" count) until you fly into it. |
| `link` | URL, or `#id` | `https://example.com` | Offered as a button when the node is in focus. Same as a link in the title. `#id` goes to another node (see [Links between nodes](#links-between-nodes)). |
| `note` | text | `Ships in May.` | The node's note. Same as a paragraph or blockquote. |
| `noteFormat` | `markdown` / `plain` | `plain` | How the note is shown. Default `markdown`. |
| `image` | URL, or `{ src, alt, caption, motion }` | `images/photo.jpg` | The node's image. With `motion`, a URL or `{ src, still }`, it's a live photo: the picture is the still, and `motion` the video around it (see [Media](#media)). |
| `video` | URL, or `{ src, provider, thumbnail, caption }` | `https://youtu.be/…` | The node's video. `provider`: `youtube`, `vimeo` or `native`. |
| `audio` | URL, or `{ src, caption }` | `memos/kickoff.m4a` | The node's sound: a voice memo, music or a recording, played in the detail sheet and the media viewer. Its caption goes in its own value. |
| `embed` | URL, or `{ src, caption }` | `https://example.com/demo` | A page shown in a frame in the detail sheet. |
| `caption` | text | `The summit at dawn.` | Caption for the media line just above it, or for the one image, video or embed set next to it. Anywhere else, for the node's video, embed or image (in that order). Never a sound's: that goes in its `audio` value. |
| `id` | text | `launch` | The node's id, instead of one made from its text (see [Node ids](#node-ids)). |
| `type` | text | `milestone` | The node's type. A type your code defines sets its look, content and actions (see [Extending](extending.md#node-types)). Any case. |
| `contentType` | `image` / `video` / `embed` / `none` | `embed` | Markdown only: how to read the media line just above. |

Any other key is kept as a **custom attribute** in `node.attrs`, for your own code (`<!-- orbit owner: Ana -->`). A key that looks like a misspelled attribute (`colour`, `stauts`) is kept too, with a warning that suggests the right one.

### Statuses

`status` is free text, shown as written. These words (any case) also get a colored dot on the node and in the detail sheet:

| Dot | Words |
| --- | --- |
| active (blue) | `active`, `doing`, `in progress`, `wip`, `started`, `ongoing` |
| done (green) | `done`, `complete`, `completed`, `shipped`, `finished`, `closed` |
| blocked (red) | `blocked`, `stuck`, `at risk`, `failed` |
| todo (gray) | `todo`, `to do`, `planned`, `backlog`, `next`, `open` |

Other words get a neutral dot. Checkboxes set `todo` (`[ ]`), `done` (`[x]`) and `active` (`[/]`).

### Colors

The root takes the palette's first color: the theme's, or the frontmatter's `palette`. The top-level nodes take the others in turn, cycling, and deeper nodes take shades of their branch's color, so siblings stay apart. A node's own `color` wins, then its type's.

`paletteColor` gives a node one of the palette's colors by number, so it still changes with the theme. The top-level nodes without one take turns with the colors no top-level node has by number: give two nodes the same number for them to share a color.

Edits keep the colors of the nodes around them, on screen and through the map tools: adding, moving or removing a top-level node writes `paletteColor` where a color would change otherwise, as few times as it can.

- A moved node keeps its color, and a new one takes a color no other top-level node has, while there is one.
- A node moved under another one drops its `paletteColor` and takes its new branch's shade.
- Where the top level has more nodes than the palette has colors, colors repeat, and an edit that would write more numbers than there are colors writes none.

## Document options

Set in the frontmatter (markdown) or as top-level keys (YAML). Options passed in code win over these.

| Key | Value | Default | |
| --- | --- | --- | --- |
| `title` | text | the root's text | The map's accessible name and SVG title. Names the root when a document has no single top heading. |
| `theme` | `paper`, `night`, `glass`, `glass-night`, `cosmos`, `blueprint`, `ink`, `contrast`, `flat`, `flat-night`, `material`, `material-night`, `liquid`, `liquid-night` or `auto` | `paper` | See [Theming](theming.md). |
| `view` | `focus` or `all` | `focus` | The first view: one node with its children around it, or the overview of the whole tree. |
| `palette` | list of colors | the theme's | The root's color, then one per top-level branch, cycling. A comma-separated string works too. |
| `maxDepth` | number | all levels | Levels below the root to draw: `1` is the root and its children. |
| `showRings` | `true` / `false` | `true` | Draw the orbit rings. |
| `interactive` | `true` / `false` | `true` | `false` draws a still picture. |
| `animation` | `true` / `false` | `false` | Let the orbit drift slowly on its own. |
| `speed` | seconds | `90` | Seconds per turn of that drift. |
| `height` | pixels | `420` | Height of `<orbit-map>` elements and marked placeholders. |
| `baseUrl` | URL | | Resolves relative image, video and link URLs: a web address (`http` or `https`) or a relative path. Any other is reported and ignored. |
| `className` | text | | Class names added to the map's element. |
| `schemaVersion` | number | | The version of the format the document is written for: `1`. See [Versions](#versions). |
| `flavor` | `markdown` or `yaml` | | Forces the flavor (see [Which flavor a document is](#which-flavor-a-document-is)). |

Flags also read `yes`, `no`, `on` and `off`.

## YAML

For maps that programs generate:

```yaml
title: Product roadmap
theme: night
nodes:
  - text: Product roadmap
    icon: 🚀
    note: What ships this year.
    children:
      - text: Research
        status: done
        children: [User interviews, Competitor teardown]
      - text: Build
        status: active
        children:
          - text: Frontend
            children:
              - App shell
              - text: Offline sync
                status: blocked
      - text: Launch
        link: https://example.com/launch-plan
        image: images/poster.png
```

- `nodes` is a list with the root node. Several top-level nodes share a root named after `title`, as in markdown.
- A node is a map with `text` and optionally `children`, plus any [attribute](#attributes) (`icon`, `color`, `status`, `link`, `note`, `image`, …) as a key. Custom keys are kept in `node.attrs`. A node without `text` but with `title`, `name` or `label`, or without `children` but with `items`, `nodes` or `subnodes`, is read with those as its text and children, and reported (`misnamed-node-key`) until they're renamed.
- A plain string in `children` is a node with just that text.
- Document options go at the top level, next to `nodes`.

## Which flavor a document is

`parseOrbit` reads a document as YAML when its frontmatter says `flavor: yaml`, its first line is `nodes:`, or the whole text reads as a YAML map: one with a `nodes:` list, or one that starts with a document option (`title:`, `theme:`, `view:`, …). Anything else is markdown, so a first line like `Status: draft`, or a note that starts with `nodes:`, stays markdown. `parseOrbitMarkdown` and `parseOrbitYAML` skip the detection.

## What saving keeps

Orbit never drops what a document says, even what it doesn't read:

- **Saving keeps the file as it was written.** `serializeOrbitMarkdown` (and a map's `toMarkdown()`) write a document parsed from markdown back line for line, and only the ideas an edit changed are written again: a renamed idea gets a new title line, a checked-off item a new checkbox, a moved idea takes its lines along. So a note written by hand or by another app keeps its formatting, its frontmatter keys, its HTML comments and rules, and its link definitions at the end. `{ keepSource: false }` writes the whole map in Orbit's own form instead; so does `orbit convert`.
- **Keys and values Orbit doesn't read are kept.** Frontmatter and top-level YAML keys it doesn't know are on `document.extra`, and both serializers write them back, with any changes an app makes to them: an app can keep a setting of its own there. A document without `extra` changes none of them, so no key another app wrote is lost; an `extra` object, even `{}`, changes or removes them. An attribute Orbit doesn't know is a custom attribute on `node.attrs`; a value it can't read for one of its own (a list for `status`, a word for `priority`) is reported and kept there under its own name. A picture, video, sound or embed keeps fields Orbit doesn't use (`width`, a `provider` it doesn't know), and so does a live photo's motion: also when `updateNode` or `addNode` is given a new value for the same file (`src`), as an app does to change a caption.
- **A file that isn't a map yet** (only paragraphs) is a root with the text as its note: adding the first idea gives it a heading and keeps the text.
- **What's kept stays with the objects Orbit read,** so documents stay plain data: the file as it was written, and the fields of pictures, videos, sounds and embeds that Orbit doesn't use. Edits change the tree in place and keep them, and so does a copy of the document object (`{ ...document, options }`), which shares its tree. A copy of the tree doesn't: one made with `structuredClone` or JSON, sent with `postMessage` (to a worker, a frame or a WebView), or made by a state store that copies the nodes it changes. Saved, it's written in Orbit's own form, as with `keepSource: false`: every idea, everything Orbit reads and `extra`, but none of the file's own comments and formatting, and a picture, video, sound or embed copied with it loses the fields Orbit doesn't use. To copy a map or send it somewhere, use its text: `parseOrbitMarkdown(serializeOrbitMarkdown(document))` is a copy that saves as the original does.

## Versions

A document says which version of the format it's written for with `schemaVersion`; none means `1`, the current one.

- **Older documents are upgraded as they're read.** When the format changes, Orbit brings documents written for the version before up to date as it reads them (a `format-upgraded` note says so), and the next save writes them as the new version, changing only what the upgrade changed.
- **Newer documents are read as well as they can be,** and reported with `unsupported-schema-version`, an error: apps should open them without letting them be edited. Nothing in them is lost by saving, in either flavor: they're written back as they were, and an edit writes again only the ideas and options it changes. An edit that would replace what this version can't read is refused instead, with an error, so an idea can't be added under one whose ideas are written in a newer version's form. What this version doesn't know of them isn't understood, though. A map on screen has the report in `getDocument().diagnostics`, and isn't edited on the map even when it's `editable` (a console warning says why). Its editing methods still work, for an app that knows what it's changing, and [map tools](map-tools.md) refuse to change it.
- **Node types have versions of their own,** for the fields their nodes keep in attributes: `type: task@2` says a node was written for version 2 of `task`, and none means 1. A type that changes its fields says so with `version` and brings older nodes up to date with `upgrade` (see [Extending Orbit](extending.md#versions)); a node written for a newer version of its type is left as it is.

### Changing the format

Maps outlive the version of Orbit that wrote them. Older and newer versions read them, and so do apps that bundle a copy of their own. So each change to the format is one of three kinds:

- **Something older versions can do without:** a new attribute (like `paletteColor`, or `audio`, for which a sound has no media line of its own) or a new document option. An older version keeps the attribute as a custom one, and the option as an unknown frontmatter key, which it reports. It writes both back unchanged and draws the map as it did before. No new version of the format is needed.
  - The same goes for a new field in a picture, video, sound or embed (like a picture's `motion`, which makes it a live photo): every version keeps the fields it doesn't read in those, says nothing about them, and writes them back with the value, as an attribute. It writes them right after `src` in markdown, and first in YAML, so Orbit writes a new field there too, and a map reads back the same in every version. Orbit 0.3.0, and every Orbit that Orbit for Android has bundled, read a map with live photos without a word, show their stills, and write each motion back byte for byte: as it is, after they rename or color the live photo and change other ideas, and through their YAML. Up to 0.3.0, though, an edit to the value itself (a new caption through `updateNode`) drops the fields a version doesn't read, a live photo's motion included; later versions keep them.
- **Something an older version would misread:**
  - a new kind of value for an attribute it already reads: Orbit 0.1.0 takes `color: 3` for a color and draws it wrong, without a word;
  - new syntax in titles or notes: it shows `==First==` as text;
  - an attribute renamed, removed, or given a new meaning.

  These raise `schemaVersion`, with a step in `FORMAT_UPGRADES` (`src/core/format-upgrades.ts`) that brings documents written for the version before up to date. From then on, every map Orbit writes says the version it's written for: a map upgraded as it's read, and a map made in code, in both flavors. So a map written by the new version never reads back as an older one, to be upgraded again. Older versions report `unsupported-schema-version`, and open those maps without editing them.
- **A change to a node type's own fields:** the type gets a new `version` and an `upgrade` (see [Extending Orbit](extending.md#versions)), not a new version of the format.

`tests/fixtures/releases/` holds maps as each released version wrote them. Every version must read each one without errors, write it back exactly, and understand it the same way, after its upgrades.

## Node ids

Each node gets an id from its text: lowercase, accents folded, other letters kept (`Investigación` → `investigacion`, `研究` → `研究`, `Q3 plan` → `q3-plan`). Repeated ids get `-2`, `-3`, … in tree order. Set `id` to choose one; ids are what `renderer.flyTo(id)`, the `focus` export option and the React `focusedId` prop take.

## Checking a map

Parsing is forgiving: when something is wrong but the map can still be drawn, the parser works around it and records a diagnostic with a `code`, a `severity`, a message that says how to fix it and the `line` where it has one. `{ strict: true }` throws an `OrbitParseError` on the first one instead, except for the few that only note something and leave the map valid: `unknown-attribute` (kept as your own attribute), `synthetic-root`, `caption-without-media`, `format-upgraded`, `ignored-node-entry`, `comment-without-orbit` and `attributes-after-list`.

```bash
npx @restless-dreams/orbit validate map.md          # every problem as map.md:line: severity: message [code]
npx @restless-dreams/orbit validate --json map.md   # the same as JSON: valid, flavor, root, nodes, depth, diagnostics
npx @restless-dreams/orbit validate --tree map.md   # the map as Orbit reads it, a node a line with its #id
```

`validate` exits with 1 while the map has a problem that makes it invalid, and lists the notes too (add `--loose` to accept the problems the map works around, but never a map it can't read).

| Code | Meaning |
| --- | --- |
| `empty-document` | Nothing to draw. |
| `no-structure` | No headings or lists (markdown), or no `nodes:` list (YAML). |
| `synthetic-root` | Several top headings, items or YAML nodes and no title, so the root is called "Untitled map". |
| `invalid-frontmatter` | The frontmatter isn't valid YAML `key: value` pairs. |
| `unknown-frontmatter-key` | A frontmatter key Orbit doesn't know: kept and written back, but not used. The message names the one you probably meant. |
| `unknown-yaml-key` | The same, for a YAML document's top-level keys. |
| `invalid-option-value` | A document option with a value Orbit can't use, such as an unknown theme or a `flavor` other than `markdown` or `yaml`. |
| `unsupported-schema-version` | The document is written for a newer version of the format (an error: open it without editing it). |
| `format-upgraded` | The document was written for an older version of the format and read as the current one; saving writes it in the current one. |
| `invalid-attributes` | An attribute block isn't valid YAML, or a value has the wrong type: kept as written, but not used. |
| `unknown-attribute` | A key that looks like a misspelled attribute, kept as a custom one. |
| `media-missing-source` | An `image`, `video` or `embed` without a URL: kept as written, as a custom attribute, but not shown. |
| `unknown-content-type` | `contentType` isn't `image`, `video`, `embed` or `none`. |
| `caption-without-media` | A `caption` on a node with no image, video or embed. |
| `unknown-link-target` | A `#id` link points at no node of the map; the message suggests the id you probably meant. |
| `invalid-yaml` | The YAML document can't be read. |
| `ignored-node-entry` | A YAML node that is neither a map nor text. |
| `comment-without-orbit` | An HTML comment that reads like attributes (`<!-- status: done -->`) but doesn't start with `orbit`, so it sets nothing. |
| `attributes-after-list` | An attribute block right under a list item, without its indent: it sets the heading's attributes, not the item's. |
| `misnamed-node-key` | A YAML node's text under `title`, `name` or `label`, or its children under `items`, `nodes` or `subnodes`: read as them, but write `text` and `children`. |
