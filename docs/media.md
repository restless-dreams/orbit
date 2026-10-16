# Pictures and videos

A node's picture shows inside its planet, and a video shows its thumbnail with a play badge ([Media](format.md#media) has how to write them). Under the node in focus, "View image" and "Play video" open them in the media viewer, over the whole window.

- [The media viewer](#the-media-viewer)
- [Keys](#keys)
- [Choosing what the buttons do](#choosing-what-the-buttons-do)
- [From code](#from-code)
- [Events](#events)
- [YouTube and Vimeo](#youtube-and-vimeo)
- [Sound and autoplay](#sound-and-autoplay)
- [Maps that aren't interactive](#maps-that-arent-interactive)
- [Looks](#looks)

## The media viewer

The viewer covers the whole window, even when the map sits in a small box on a page, and follows the map's theme, light or dark.

- **Pictures** fit the window, never past twice their own size. The wheel, a pinch, a double click or tap, the `+`, `−` and `0` keys and the zoom buttons zoom around the point under the pointer or between the fingers, and a zoomed picture pans with a drag. Zooming goes to four times the fitted size, or until the picture shows at twice its own size if that's further.
- **Videos** start at once: files (`.mp4`, `.webm`, `.mov`) in the browser's own player, YouTube and Vimeo in theirs. The player is as big as the window allows, at the video's shape once it's known (16:9 until then, upright for YouTube Shorts). Stepping away from a video stops it.
- **Every picture and video of the map,** in reading order (the order the outline lists the map, a node's picture before its video): the previous and next buttons, the arrow keys and, on touch screens, a swipe step through them, starting from the one opened. A counter says where you are ("2 of 5"), and screen readers hear it.
- **Around them,** the node's title, the caption, and the picture's description (its alt text, which is also the picture's name for screen readers), with a link to open the picture on its own, or the video on its site.
- **Closing:** Esc, the close button, a click around the media or, on touch screens, a swipe down while the picture isn't zoomed. Focus goes back where it was, and the map's own keys, which rest while the viewer is open, work again.

The detail sheet shows a node's picture and video too. Its picture opens the viewer, over the sheet, and its video has an Expand button that moves it there (a video file goes on from where it was); closing the viewer goes back to the sheet.

## Keys

| Key | Does |
| --- | --- |
| `←` `→` | The previous or next picture or video; on a zoomed picture, pan it |
| `↑` `↓` | Pan a zoomed picture |
| `Home` `End` | The first or last picture or video |
| `+` `−` `0` | Zoom in, zoom out, fit the picture to the window |
| `Space` | Play or pause the video |
| `Escape` | Close the viewer |

On a video's own controls, the arrow keys and the space bar are the player's. Inside YouTube's and Vimeo's players every key is theirs, Escape included: Tab out of the player, or click around it, to close the viewer.

## Choosing what the buttons do

The buttons ask your code first, as every button does: `onAction`, then the `action` event. What happens next:

| Your code | "View image" and "Play video" |
| --- | --- |
| Nothing | Open the media viewer |
| `mediaViewer: false` | Open the detail sheet at the picture or video, as before the viewer |
| `mediaViewer: false` and `showDetailSheet: false` | Nothing: Orbit opens neither |
| `showDetailSheet: false` | Open the media viewer: it turns off only the sheet, for notes, embeds and details |
| `onAction` returns `false`, or `preventDefault()` on the `action` event | Nothing: the press is yours |

The detail sheet's picture and Expand button are presses of "View image" and "Play video" too: your code sees them first, and when it takes one the sheet closes, so what you open is in front. With `mediaViewer: false`, the sheet's picture is only a picture.

```js
createOrbitMap(element, markdown, {
  onAction: ({ node, action }) => {
    if (action === 'image') {
      openMyLightbox(node.image.src);
      return false;
    }

    return undefined;
  },
});
```

## From code

A page can open the viewer itself, to show a picture big or play a video on a screen of its own:

```js
map.openMedia('summit');                                    // a node's picture, or its video if it has no picture
map.openMedia('trail', { kind: 'video', autoplay: false }); // its video, ready to play
map.openMedia('trail', { kind: 'video', startAt: 42 });     // its video, playing from 0:42
map.playMedia();
map.seekMedia(42);
map.pauseMedia();
map.unmuteMedia();                                          // from a press: the sound of a video a browser started muted
map.closeMedia();
```

| Method | Does |
| --- | --- |
| `openMedia(nodeId, { kind, autoplay, startAt })` | Shows the node's picture (`kind: 'image'`, the default when it has one) or video (`kind: 'video'`), opening the viewer if it's closed. A video starts playing unless `autoplay` is `false`, from its start or `startAt` seconds in (YouTube and Vimeo start at the whole second). Returns `false` when the map has no such node, or the node no such picture or video. |
| `closeMedia()` | Closes the viewer. |
| `playMedia()`, `pauseMedia()` | Plays or pauses the video it shows. Returns `false` when it shows no video it can drive. |
| `seekMedia(seconds)` | Moves the video to `seconds` from its start. Returns `false` when it shows no video it can drive. |
| `unmuteMedia()` | Turns on the sound of the video it shows. Browsers allow it only from a press (see [Sound and autoplay](#sound-and-autoplay)). Returns `false` when it shows no video it can drive. |

`openMedia` opens the viewer whatever `mediaViewer`, `showDetailSheet` and `interactive` say: those choose what the buttons do. Files, YouTube and Vimeo can be driven; a video on any other site plays in a frame, with its own controls only. `<orbit-map>` has the same six methods.

This is what an audience's screen does while someone presents from a phone: it opens what the presenter opens, where the presenter's video is, and follows the presenter's player, and tells the phone how the video is going.

```js
const map = createOrbitMap(element, markdown, { interactive: false, showControls: false });

presenter.addEventListener('message', ({ data }) => {
  if (data.type === 'media') {
    map.openMedia(data.id, { kind: data.kind, autoplay: data.playing, startAt: data.seconds });
  } else if (data.type === 'play') {
    map.playMedia();
  } else if (data.type === 'pause') {
    map.pauseMedia();
  } else if (data.type === 'seek') {
    map.seekMedia(data.seconds);
  } else if (data.type === 'close') {
    map.closeMedia();
  }
});

map.on('media-state', ({ node, playing, time }) => {
  presenter.postMessage({ type: 'state', id: node.id, playing, time });
});
```

## Events

| Event | DOM event | Detail |
| --- | --- | --- |
| `media-open` | `orbit-media-open` | `{ node, kind, index, total }`: the viewer opened, or stepped, on a node's picture (`kind: 'image'`) or video (`'video'`), `index` of `total` in reading order, from 0 |
| `media-close` | `orbit-media-close` | `{ node, kind, index, total }`: the viewer closed, showing that |
| `media-state` | `orbit-media-state` | `{ node, playing, time, duration, ended, muted }`: the video started, paused, moved to another time, ended or was muted, at once; while it plays, its time a few times a second. `time` and `duration` are in seconds; `duration` is `null` until it's known |

`onMediaOpen`, `onMediaClose` and `onMediaState` receive the same, and so do the React props of the same names. The DOM events bubble from the map's container and out of `<orbit-map>`.

## YouTube and Vimeo

YouTube videos play in YouTube's privacy-enhanced player (`youtube-nocookie.com`), and Vimeo videos in Vimeo's with `dnt=1`, which tracks no sessions. Links to watch pages, `youtu.be`, Shorts, Vimeo channels, groups, showcases and unlisted videos all work; Orbit frames their players, never their pages, which refuse to be framed.

- **The referrer:** the players' frames send the page's origin, never its address (`referrerpolicy="strict-origin-when-cross-origin"`). YouTube's player won't play without knowing the site it's on (its "Error 153"), and a page that sends no referrer (`Referrer-Policy: no-referrer`) still gives its origin to these frames. A page opened from a file has no origin to give, so YouTube's videos don't play there.
- **Driving them:** `playMedia`, `pauseMedia` and `seekMedia` reach the players through the messages their own JavaScript APIs send (YouTube's `enablejsapi=1`, with the page's `origin`; Vimeo's player.js messages), and `media-state` follows what the players say. Nothing is loaded from either site but the player itself.
- **Other sites:** a video on any other site plays in a frame, as the detail sheet shows an embed, with only its own controls: `playMedia` and its kin return `false` for it, and it reports no `media-state`.

## Sound and autoplay

Browsers let a video start with sound only once the reader has interacted with the page. A press of "Play video", the arrows or a swipe counts, so those videos play with sound.

A video opened from code on a page nobody has touched yet, such as an audience's screen, may not be allowed to. A video file then starts muted, and its `media-state` says `muted: true`. YouTube's and Vimeo's players decide for themselves: they start muted, or wait for a press. Screens that should play sound from the start can allow it: a kiosk Chrome with `--autoplay-policy=no-user-gesture-required`, or an Android `WebView` with `setMediaPlaybackRequiresUserGesture(false)`.

Elsewhere, offer a button for the sound while `media-state` says the video is muted, or isn't playing when it should. Its press counts as interacting with the page, so `unmuteMedia()` and `playMedia()` from its click play the video with sound, YouTube's and Vimeo's included. The viewer is a modal `<dialog>` in the top layer, and a modal dialog makes the rest of the page inert, popovers included: show the button in a `<dialog>` of its own with `showModal()`, after the viewer opens, so it's on top and can be pressed.

```js
soundButton.addEventListener('click', () => {
  map.unmuteMedia();
  map.playMedia();
  soundDialog.close();
});
```

## Maps that aren't interactive

On a map with `interactive: false`, a still picture, the viewer is the page's to drive. It shows the picture or video with its title and caption, but no buttons, no counter and no controls on videos, and it takes no input of its own: Esc and clicks don't close it, and keys and presses reach the page, so a presentation's own keys keep working. Open, close and play it with the methods above.

## Looks

The viewer takes its colors from the detail sheet's custom properties: `--orbit-sheet-background` behind the media (blurred by `--orbit-sheet-blur` where it's see-through, as in the glass themes), `--orbit-sheet-text` and `--orbit-sheet-muted-text` for the title, caption and counter, and `--orbit-sheet-shadow` under a video. Its buttons are the map's controls (`--orbit-control-*`, `--orbit-focus-ring`). See [Theming](theming.md#custom-properties).

With reduced motion (`prefers-reduced-motion: reduce`), zooms and steps happen at once instead of gliding and fading.
