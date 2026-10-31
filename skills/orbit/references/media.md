<!-- A copy of docs/media.md, made by scripts/build-llms.ts, with links to other files pointing at the repository. Edit the original. -->

# Pictures, videos and sounds

A node's picture shows inside its planet (a live photo's still), a video shows its thumbnail with a play badge, and a sound a badge of its own, a sound wave ([Media](format.md#media) has how to write them). Under the node in focus, "View picture", "Play video" and "Play sound" open them in the media viewer, over the whole window.

- [The media viewer](#the-media-viewer)
- [Live photos](#live-photos)
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
- **Live photos** play their motion over the picture: once as the viewer shows them, muted, and again, with their sound, while they're held ([Live photos](#live-photos)).
- **Videos** start at once: files (`.mp4`, `.webm`, `.mov`) in the browser's own player, YouTube and Vimeo in theirs. The player is as big as the window allows, at the video's shape once it's known (16:9 until then, upright for YouTube Shorts). Stepping away from a video stops it.
- **Sounds** start at once too, in Orbit's own player, so it looks the same in every browser and takes the map's theme: where the sound is (to drag), its time, ten seconds back and on, and its sound off and on. Above it is the node's picture or, for a node without one, art made of its color and icon, whose rings turn, a moon on the inner one, while the sound plays. Any file the browser plays works: `.mp3`, `.m4a`, `.aac`, `.ogg`, `.opus`, `.wav`, `.flac`. Stepping away from a sound stops it.
- **Every picture, video and sound of the map,** in reading order (the order the outline lists the map, a node's picture before its video, and its video before its sound, leaving out ideas hidden for later as the outline does): the previous and next buttons, the arrow keys and, on touch screens, a swipe step through them, starting from the one opened. A counter says where you are ("2 of 5"), and screen readers hear it.
- **Around them,** the node's title, the caption, and the picture's description (its alt text, which is also the picture's name for screen readers), with a link to open the picture or the sound on its own, or the video on its site.
- **Closing:** Esc, the close button, a click around the media or, on touch screens, a swipe down while the picture isn't zoomed. Focus goes back where it was, and the map's own keys, which rest while the viewer is open, work again.

The detail sheet shows a node's picture, video and sound too. Its picture opens the viewer, over the sheet, and its video and sound have an Expand button that moves them there (a file goes on from where it was); closing the viewer goes back to the sheet. A sound also plays right in the sheet, in the same player on one line, and stops when the sheet closes.

## Live photos

A live photo is a picture with its motion, the few seconds of video a phone records around it ([Media](format.md#media) has how to write one). On the map and in the detail sheet it's the picture, still, and the sheet shows its mark. The viewer plays it:

- **As the viewer shows it,** the motion plays once, muted, over the picture, and settles back on it with a cross-fade. When the phone said where in the motion the picture was taken (`still`), the motion ends there, on the picture itself, so nothing jumps as it settles.
- **Held,** the picture plays its motion again from the start, with its sound, and letting go settles it back. A finger or the mouse held still on the picture for a moment holds it, and a long press opens no menu. Its mark, "Live" with Orbit's rings in the picture's top left corner, plays it the same way when held, and through once when clicked or tapped; on the keyboard, hold the space bar. Screen readers find the mark as a button, "Play the live photo", whose tooltip says "Hold to play".
- **With reduced motion** (`prefers-reduced-motion: reduce`), it plays only when asked, never on its own. A press on the picture before its motion starts, to swipe or zoom, skips it too, and so does `openMedia` with `autoplay: false`.
- **Its video loads only when it's needed:** as the viewer shows it, or, when it doesn't play then, the first time it's asked to. One that can't be played leaves the picture as it is, without its mark, and says nothing.
- **Any video a browser plays works,** usually an `.mp4`. Zoomed, the motion plays zoomed with the picture, and the mark keeps to the corner of what shows. A page made with `exportWebPage` carries the motion inside it with the picture (`media`), and `orbit export --html` does for a motion on your computer.

## Keys

| Key | Does |
| --- | --- |
| `←` `→` | The previous or next picture, video or sound; on a zoomed picture, pan it |
| `↑` `↓` | Pan a zoomed picture |
| `Home` `End` | The first or last picture, video or sound |
| `+` `−` `0` | Zoom in, zoom out, fit the picture to the window |
| `Space` `K` | Play or pause the video or sound |
| `Space`, held | Play a live photo's motion with its sound, until it's let go; pressed quickly, through once |
| `J` `L` | Ten seconds back or on |
| `M` | The sound's sound off or on |
| `Escape` | Close the viewer |

On a sound's slider, `←` and `→` go five seconds, `Page Up` and `Page Down` ten, and `Home` and `End` to either end. On a video's own controls, the arrow keys and the space bar are the player's. Inside YouTube's and Vimeo's players every key is theirs, Escape included: Tab out of the player, or click around it, to close the viewer.

## Choosing what the buttons do

The buttons ask your code first, as every button does: `onAction`, then the `action` event. What happens next:

| Your code | "View picture", "Play video" and "Play sound" |
| --- | --- |
| Nothing | Open the media viewer |
| `showMediaViewer: false` | Open the detail sheet at the picture, video or sound, as before the viewer |
| `showMediaViewer: false` and `showDetailSheet: false` | Nothing: Orbit opens neither |
| `showDetailSheet: false` | Open the media viewer: it turns off only the sheet, for notes, embeds and details |
| `onAction` returns `false`, or `preventDefault()` on the `action` event | Nothing: the press is yours |

The detail sheet's picture and Expand buttons are presses of "View picture", "Play video" and "Play sound" too: your code sees them first, and when it takes one the sheet closes, so what you open is in front. With `showMediaViewer: false`, the sheet's picture is only a picture.

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

A page can open the viewer itself, to show a picture big or play a video or a sound on a screen of its own:

```js
map.openMedia('summit');                                    // a node's picture, or its video if it has no picture, or its sound
map.openMedia('trail', { kind: 'video', autoplay: false }); // its video, ready to play
map.openMedia('trail', { kind: 'video', startAt: 42 });     // its video, playing from 0:42
map.openMedia('kickoff', { kind: 'audio' });                // its sound, playing
map.playMedia();
map.seekMedia(42);
map.pauseMedia();
map.unmuteMedia();                                          // from a press: the sound of a video a browser started muted
map.closeMedia();
```

| Method | Does |
| --- | --- |
| `openMedia(nodeId, { kind, autoplay, startAt })` | Shows the node's picture (`kind: 'image'`, the default when it has one), video (`kind: 'video'`) or sound (`kind: 'audio'`), opening the viewer if it's closed. A video or sound starts playing unless `autoplay` is `false`, from its start or `startAt` seconds in (YouTube and Vimeo start at the whole second), and so does a live photo's motion, once. Returns `false` when the map has no such node, or the node no such picture, video or sound. |
| `closeMedia()` | Closes the viewer. |
| `playMedia()`, `pauseMedia()` | Plays or pauses the video or sound it shows. A live photo's motion plays through once, with its sound, and pausing settles it back on its picture. Returns `false` when it shows none it can drive. |
| `seekMedia(seconds)` | Moves the video or sound to `seconds` from its start. Returns `false` when it shows none it can drive, and for a live photo, whose motion always plays from its start. |
| `unmuteMedia()` | Turns on the sound of the video or sound it shows, or of a live photo's motion: the one playing, and its opening if it hasn't started. Browsers allow it only from a press (see [Sound and autoplay](#sound-and-autoplay)). Returns `false` when it shows none it can drive. |

`openMedia` opens the viewer whatever `showMediaViewer`, `showDetailSheet` and `interactive` say: those choose what the buttons do. Files, sounds, YouTube and Vimeo can be driven; a video on any other site plays in a frame, with its own controls only. `<orbit-map>` has the same six methods.

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
| `media-open` | `orbit-media-open` | `{ node, kind, index, total }`: the viewer opened, or stepped, on a node's picture (`kind: 'image'`), video (`'video'`) or sound (`'audio'`), `index` of `total` in reading order, from 0 |
| `media-close` | `orbit-media-close` | `{ node, kind, index, total }`: the viewer closed, showing that |
| `media-state` | `orbit-media-state` | `{ node, kind, playing, time, duration, ended, muted }`: the video (`kind: 'video'`), sound (`'audio'`) or live photo's motion (`'image'`) started, paused, moved to another time, ended or was muted, at once; while it plays, its time a few times a second. `time` and `duration` are in seconds; `duration` is `null` until it's known. A node with a video and a sound reports each with its own `kind` |

`onMediaOpen`, `onMediaClose` and `onMediaState` receive the same, and so do the React props of the same names. The DOM events bubble from the map's container and out of `<orbit-map>`.

## YouTube and Vimeo

YouTube videos play in YouTube's privacy-enhanced player (`youtube-nocookie.com`), and Vimeo videos in Vimeo's with `dnt=1`, which tracks no sessions. Links to watch pages, `youtu.be`, Shorts, Vimeo channels, groups, showcases and unlisted videos all work; Orbit frames their players, never their pages, which refuse to be framed.

- **The referrer:** the players' frames send the page's origin, never its address (`referrerpolicy="strict-origin-when-cross-origin"`). YouTube's player won't play without knowing the site it's on (its "Error 153"), and a page that sends no referrer (`Referrer-Policy: no-referrer`) still gives its origin to these frames. A page opened from a file has no origin to give, so YouTube's videos don't play there.
- **Driving them:** `playMedia`, `pauseMedia` and `seekMedia` reach the players through the messages their own JavaScript APIs send (YouTube's `enablejsapi=1`, with the page's `origin`; Vimeo's player.js messages), and `media-state` follows what the players say. Nothing is loaded from either site but the player itself.
- **Other sites:** a video on any other site plays in a frame, as the detail sheet shows an embed, with only its own controls: `playMedia` and its kin return `false` for it, and it reports no `media-state`.

## Sound and autoplay

Browsers let a video start with sound only once the reader has interacted with the page. A press of "Play video", the arrows or a swipe counts, so those videos play with sound.

A live photo's motion plays muted as the viewer shows it, which browsers allow, and with its sound when it's held, a press being an interaction; a browser that still refuses its sound plays it silent.

A video opened from code on a page nobody has touched yet, such as an audience's screen, may not be allowed to. A video file then starts muted, and its `media-state` says `muted: true`. A sound can't play muted, so it waits instead, paused, with its play button ready: its `media-state` says `playing: false`. YouTube's and Vimeo's players decide for themselves: they start muted, or wait for a press. Screens that should play sound from the start can allow it: a kiosk Chrome with `--autoplay-policy=no-user-gesture-required`, or an Android `WebView` with `setMediaPlaybackRequiresUserGesture(false)`.

Elsewhere, offer a button for the sound while `media-state` says the video is muted, or isn't playing when it should. Its press counts as interacting with the page, so `unmuteMedia()` and `playMedia()` from its click play the video with sound, YouTube's and Vimeo's included. The viewer is a modal `<dialog>` in the top layer, and a modal dialog makes the rest of the page inert, popovers included: show the button in a `<dialog>` of its own with `showModal()`, after the viewer opens, so it's on top and can be pressed.

```js
soundButton.addEventListener('click', () => {
  map.unmuteMedia();
  map.playMedia();
  soundDialog.close();
});
```

## Maps that aren't interactive

On a map with `interactive: false`, a still picture, the viewer is the page's to drive. It shows the picture, video or sound with its title and caption, but no buttons, no counter and no controls on videos, a sound's player only shows how it's going, and a live photo plays its motion as it opens but can't be held; it takes no input of its own: Esc and clicks don't close it, and keys and presses reach the page, so a presentation's own keys keep working. Open, close and play it with the methods above: `playMedia()` plays a live photo's motion again, and `media-state` follows it as it does a video.

## Looks

The viewer takes its colors from the detail sheet's custom properties: `--orbit-sheet-background` behind the media (blurred by `--orbit-sheet-blur` where it's see-through, as in the glass themes), `--orbit-sheet-text` and `--orbit-sheet-muted-text` for the title, caption and counter, and `--orbit-sheet-shadow` under a video. Its buttons are the map's controls (`--orbit-control-*`, `--orbit-focus-ring`). A sound's player takes the controls' accent (`--orbit-control-active-background` and `--orbit-control-active-text`) for its play button and the slider's filled part, and in the detail sheet sits on the chips' background (`--orbit-chip-background`); the art made for a sound takes its node's color. A live photo's mark is a control too (`--orbit-control-background`, `--orbit-control-text`, `--orbit-control-border`, `--orbit-control-shadow`, `--orbit-control-blur`), and takes the accent while the motion plays, as its dashed orbit turns. See [Theming](theming.md#custom-properties).

With reduced motion (`prefers-reduced-motion: reduce`), zooms and steps happen at once instead of gliding and fading, a sound's art stays still, and a live photo's motion plays only when asked, and shows and goes at once.
