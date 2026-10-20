# Maps from other apps

Orbit reads the maps people already have in other apps: OPML, which outliners and most mind map apps write, FreeMind and Freeplane's `.mm` files, and XMind's `.xmind` workbooks. They become ordinary Orbit maps, with their notes, links, folded branches and pictures. Orbit writes OPML too, so a map moves out as easily as it came in.

## Bring a map in

`importMap` reads a file's bytes (OPML and `.mm` files work as text too) and tells the format from what the file holds, then from its name:

```ts
import { importMap, serializeOrbitMarkdown } from '@restless-dreams/orbit';

const bytes = new Uint8Array(await file.arrayBuffer());
const { format, maps } = importMap(bytes, { name: file.name });

for (const map of maps) {
  const markdown = serializeOrbitMarkdown(map.document);

  for (const [path, data] of Object.entries(map.media)) {
    // Save each picture at this path next to the map: `media/sunrise.png`.
  }

  for (const warning of map.warnings) {
    console.warn(`${warning.message} [${warning.code}]`);
  }
}
```

- `maps` holds one map, or one for each sheet of an XMind workbook.
- Each map's `document` is what `parseOrbit` would give for the markdown `serializeOrbitMarkdown` writes for it, ids included: draw it, edit it or save it as you would any map.
- `media` holds the pictures inside the file, by the address the map gives them. Only XMind workbooks carry pictures; the others point at files on the computer they were made on, which can't come along.
- `warnings` say what the other app had that Orbit keeps another way, or couldn't keep (see [Warnings](#warnings)).
- Options: `name`, the file's name, which also names a map with several top ideas and no title; `format`, to skip telling the format (`opml`, `freemind` or `xmind`); and `untitled`, the name for a map with several top ideas and nothing to name it after (default "Untitled map").

`detectImportFormat(bytes, name)` tells the format without reading the map: `opml`, `freemind`, `xmind`, or `null` for anything else, Orbit's own markdown, YAML and zips included. `importOPML`, `importFreeMind` and `importXMind` read one format each and take the same options.

A file Orbit can't read at all throws an `OrbitImportError`, whose `code` says why:

| Code | Why |
| --- | --- |
| `unknown-format` | It's none of the formats Orbit reads. |
| `unreadable` | It's damaged, or not what its name says: the message says where. |
| `empty` | It holds no ideas. |
| `password-protected` | An XMind workbook with a password. Open it in XMind and save it without one first. |
| `too-large` | More than 100,000 ideas, or more than 500 levels deep. |

## From the command line

```bash
npx @restless-dreams/orbit convert --to md Garden.xmind --out garden.md   # every sheet, its pictures in media/
npx @restless-dreams/orbit convert --to md outline.opml > outline.md
npx @restless-dreams/orbit convert --to opml my-map.md --out my-map.opml
```

Warnings go to stderr. With `--out`, a workbook's other sheets go next to the first (`garden-2.md`, `garden-3.md`) and its pictures in `media/` beside them; without it, Orbit writes the first sheet and says what it left out.

## What comes over

Everything a reader would miss comes over, as Orbit says it. Titles keep every word on one line, and an emoji at the start of a title becomes its icon, as in Orbit's own markdown. Notes in HTML become markdown: paragraphs, headings, lists, quotes, code, bold, italics, strikethrough, links and pictures. When markdown would show a note's words any other way (a `*` or `_` in it, or a line that starts like a list), the note stays plain text instead, exactly as written, without its formatting.

| | OPML | FreeMind and Freeplane | XMind |
| --- | --- | --- | --- |
| Note | `_note` (also `note`, and a feed's `description`) | the note and Freeplane's details, in HTML or plain text, and attributes as a list | the note, in HTML or plain text; XMind 8's comments, with their authors |
| Link | `type="link"`'s or an include's `url`, a feed's `htmlUrl` or `xmlUrl` | `LINK` | the topic's link |
| Links between ideas | `#id` | links to other nodes, and arrow links | links to other topics, and relationships |
| Status | `_status` (`checked`, `unchecked`, `indeterminate`), `_complete`, `complete` | Freeplane's progress icons and checkboxes | task markers |
| Priority | | priority icons (`full-1` to `full-9`) | priority markers |
| Icon | an emoji at the start of the text | built-in icons, as emoji, and Freeplane's emoji | markers and stickers, as emoji |
| Tags | `category` | | labels |
| Color | | the background color | the fill color a topic was given |
| Folded | | `FOLDED` | folded branches |
| Picture | | a picture on the web | pictures inside the workbook, and on the web |

An idea with a link of its own keeps it, and a second link, or a link between ideas with a label, becomes a line of its note: `→ [builds on](#chapter-2)`.

## Warnings

What has no place in a tree of ideas keeps its content where it can, and each kind gets one warning that counts the places and names a few:

| Code | What changed |
| --- | --- |
| `floating-ideas-moved` | XMind's floating topics are ideas under the center. |
| `summaries-moved` | XMind's summaries are ideas beside the ideas they sum up. |
| `callouts-moved` | XMind's callouts are ideas under the topic they point at. |
| `boundaries-in-notes` | A titled boundary's title is in the note of the idea whose ideas it surrounds. |
| `links-in-notes` | A link beyond an idea's first, or a labeled link between ideas, is a line of its note. |
| `missing-link-targets` | A link to an idea that isn't in the map (another sheet's, or one deleted) was left out. |
| `icons-not-kept` | An icon with no emoji like it, or one past an idea's first, was left out. |
| `pictures-not-kept` | A picture that isn't in the file was left out. |
| `attachments-not-kept` | A file attached to an idea was left out; the idea keeps its name. |
| `local-links-not-kept` | A link to a file on the computer the map was made on was left out. |
| `encrypted-branches-not-read` | A branch FreeMind or Freeplane encrypted with a password couldn't be read; its ideas were left out. |
| `formatting-not-kept` | A note is plain text, without its formatting, because markdown would have shown its words differently. |

Styles (fonts, shapes, line colors) and positions are left out without a warning: Orbit draws every map its own way.

## Write OPML

`exportOPML` writes a map, as markdown or YAML text or a document, as OPML 2.0:

```ts
import { exportOPML } from '@restless-dreams/orbit';

const opml = exportOPML(markdown, { title: 'Launch plan' });
```

- The root is the one top outline, and each node an outline with its icon and text in `text`.
- A note goes in `_note`, as its markdown or plain text.
- A link is `type="link"` with its `url`, a link between ideas included (`#research`).
- A status is `_status`: `checked`, `unchecked` and `indeterminate` for `done`, `todo` and `active`, which outliners show as checkboxes; any other word as it is. Done statuses add `_complete="true"`, which Workflowy reads.
- Tags are `category`, separated by commas.
- `title` names the outline in its head. Default: the map's `title`, or its root's text.

Two attributes only Orbit reads say what the text alone can't: `_noteFormat` when a note would read the other way (a markdown note with a line break, which OPML readers show as two lines, or a plain one that looks like markdown), and `_textFormat="plain"` when a title looks like HTML. With them, a map Orbit writes reads back the same: its text, icons, notes, statuses, links, tags and tree. Pictures, videos, colors, priorities and folds have no place in OPML; the map's own file, or a zip of it and its pictures, keeps them.
