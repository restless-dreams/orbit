# Accessibility

Orbit maps are built to work with a keyboard, a screen reader, a phone and a preference for less motion.

## Keyboard

The map is one tab stop: Tab moves into the map and out of it again, and the arrow keys move inside it.

| Key | Focus mode | Overview |
| --- | --- | --- |
| `←` `→` | Previous or next planet, and the + on editable maps; the orbit turns so the chosen planet is on top | Previous or next sibling |
| `↓` | From the sun into the orbit | First child |
| `↑` | Back to the sun | Parent |
| `Home` `End` | First or last planet | The root, or the last sibling |
| `Enter` `Space` | Fly into the focused node (on the sun: go back up) | Fly into the focused node |
| `Escape` `Backspace` | Go back up a level | Back to focus mode |
| `+` `−` `0` | Zoom in, zoom out, fit | Zoom in, zoom out, fit |
| `F2` | Edit the focused node's text where it is ([editing](editing.md)) | The same |
| Context menu key, `Shift` `F10` | The map's own menu for the focused node, when the page has one | The same |

The focused node has a visible ring and shows a tooltip with its full text, status and the start of its note. The breadcrumbs, the view switch, the list button, the zoom buttons and the content buttons under the focused node are ordinary buttons, reached with Tab.

In the media viewer, `←` and `→` step through the map's pictures, videos and sounds (or pan a zoomed picture), `Home` and `End` go to the first and last, `+`, `−` and `0` zoom a picture, `Space` or `K` plays or pauses a video or sound, and held on a live photo plays its motion until it's let go, `J` and `L` go ten seconds back and on, `M` turns a sound off and on, and `Escape` closes it. Its buttons are ordinary buttons too ([Keys](media.md#keys)), and a sound's slider takes the arrow keys, Page Up and Page Down, Home and End.

## Screen readers

- Everything below is said in the map's language: the page's, or the one its `language` option names ([Languages](languages.md)). A map whose `language` option names one says so with a `lang` attribute, so screen readers read its words in that language on a page in another.
- The map is a group named after the document's title (or `ariaLabel`), with the role description "mind map".
- Each node is a button whose name says what it is: its text, its status, how many items it holds and what content it has ("Discovery, 4 items, has note"). The focused node is marked as the current one.
- A visually hidden outline lists the whole map as nested lists, so screen readers can browse every node without moving the map. The list button shows the same outline to everyone.
- Moving around is announced: "Discovery, 4 items", or "Overview of the whole map". So are edits made on the map: "Added Night markets", "Removed Beaches".
- Ideas hidden for later (`hideChildren`) stay out of the outline and the media viewer as well as the map, and the node they're under says how many there are, in its name and in the outline: "Ser, 3 hidden ideas". When they show, the reader hears them: "Ser: soy, eres, and es".
- The detail sheet is a modal dialog: focus moves into it, Escape closes it, and focus returns to the button that opened it.
- So is the media viewer, named after the node it shows. A picture's description (its alt text) is the picture's name, and also shows under it. The counter ("2 of 5", with the node's title) is read out as you step, and a video's own controls are the browser's or its site's.
- A sound's player is a group named after the sound, with buttons that say what they do ("Play", "Pause", "Back 10 seconds", "Mute") and a slider that says where the sound is ("0:42 of 3:10"), in the map's language.
- A map shared as a web page ([A map as a web page](guide.md#a-map-as-a-web-page)) presents from its Present button: focus moves to the shown idea's title, the caption is a live region, read out as you step, and Escape gives focus back to the button.
- A live photo's mark is a button, "Play the live photo", whose tooltip, "Hold to play", screen readers read after it: held, or with the space bar held, it plays the motion until it's let go, and pressed once, it plays it through. The motion itself is hidden from them, as it shows nothing the picture's description doesn't say. In the detail sheet, the picture's button says it's a live photo ("View live photo: …").

## Motion

When the reader asks for reduced motion (`prefers-reduced-motion: reduce`):

- views cross-fade in place instead of flying;
- a flicked orbit stops where it is let go instead of coasting;
- the orbit's drift (`animation`) stays still, and transitions such as the hover lift and the sheet's slide-in are off;
- in the media viewer, zooms and steps happen at once instead of gliding and fading, and a live photo's motion plays only when asked, never as the viewer shows it.

`transitionDuration: 0` turns flights off for everyone.

## Reading

- Names inside nodes are never smaller than 9 px on screen, and they keep their size whatever the zoom. A planet whose name has no room inside it shows the name on a pill under it, after its icon, clear of other planets and names, though it may cover the planet's own moons. Smaller nodes too small for their names show none until you zoom in. The outline lists every node, whatever the view.
- Labels meet WCAG AA contrast (4.5:1) in every built-in theme, on every branch color and shade, including where a planet's shading or a translucent planet's background shows through. A test checks this for every theme. Labels use whichever of the theme's dark and light text has more contrast with the node, custom colors included.
- The `contrast` theme is for readers who need more: black outlines and text, bold labels, solid orbits and no shading, with labels above 7:1 (AAA).
- Labels too long for their node show in full in the tooltip and the outline.
- In forced-colors mode (Windows High Contrast), rims and the focus ring use system colors.

## Touch

- Buttons are at least 40 px on touch screens.
- On a page that scrolls, one finger scrolls the page past the map, except on the orbit itself, where it spins the orbit; two fingers zoom.
- A long press on a node opens the page's own menu for it, when the page has one, or edits its text on editable maps; the context menu key, Shift+F10 and F2 do the same from the keyboard.
- The field for typing on the map keeps a 16 px font, scaled to the label's size, so phones don't zoom into it.
- The detail sheet is a bottom sheet you can swipe down to close.
- In the media viewer, two fingers zoom a picture, one pans it once it's zoomed, a swipe across steps to the previous or next picture, video or sound, and a swipe down closes it. A sound's play button is 72 px across, its skip buttons 52 px and its mute button 40 px, and a live photo's mark takes presses 8 px around it. On narrow screens, the previous and next buttons sit under a video, clear of its player's controls.

## What authors can do

- Give images alt text: `![The summit at sunrise](summit.jpg)`. It is the picture's name in the media viewer and the detail sheet, and shows under it in the viewer.
- Give the map a title in its frontmatter (`title: Product roadmap`), or pass `ariaLabel`.
- Keep node text short; put details in notes, which are read in full in the detail sheet.
- Prefer statuses (`<!-- orbit status: blocked -->`) over color alone to convey state: statuses are announced and shown as words in the detail sheet.
