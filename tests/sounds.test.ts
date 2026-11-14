import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { parseOrbit } from '../src/core/dispatch';
import { serializeOrbitMarkdown } from '../src/core/serializer-markdown';
import { serializeOrbitYAML } from '../src/core/serializer-yaml';
import { renderToSVGString } from '../src/core/render-to-svg';
import { renderPrintLayout } from '../src/core/print-layout';
import { withMedia } from '../src/core/web-page/runtime';
import { guardUrl } from '../src/core/url-guard';
import { MediaViewer, galleryItems } from '../src/core/ui/media-viewer';
import { AudioPlayer, formatPlaybackTime } from '../src/core/ui/audio-player';
import { OrbitWords } from '../src/core/languages';
import { createMapTools } from '../src/core/map-tools/tools';
import { click, mount, node, useMapSize } from './helpers/renderer';

useMapSize(600, 400);

/** happy-dom does no layout: the viewer's stage is this big, at the window's top left. */
let stage = { left: 0, top: 0, width: 1000, height: 600 };
const viewerPrototype = MediaViewer.prototype as unknown as { readStageBox: () => typeof stage };
const readStageBox = viewerPrototype.readStageBox;

beforeAll(() => {
  viewerPrototype.readStageBox = () => stage;
});

afterAll(() => {
  viewerPrototype.readStageBox = readStageBox;
});

beforeEach(() => {
  document.body.innerHTML = '';
  stage = { left: 0, top: 0, width: 1000, height: 600 };
});

const BAND = `# 🎸 Band
## Rehearsal <!-- orbit audio: memos/rehearsal.mp4 -->
## Demo
<!-- orbit
audio:
  src: https://example.com/demo.mp3
  caption: The first take
-->
## Poster
![The poster](https://example.com/poster.jpg)
<!-- orbit audio: memos/poster.m4a -->
## Trailer
[Trailer](https://example.com/trailer.mp4)
<!-- orbit audio: memos/trailer.m4a -->`;

const find = (root: ReturnType<typeof parseOrbit>['root'], id: string) => {
  const visit = (current: typeof root): typeof root | undefined => (current.id === id ? current : current.children.map(visit).find(Boolean));
  return visit(root)!;
};

/** A sound's player in the page, with its length known, as a browser learns it. */
const withLength = (host: ParentNode, seconds: number): HTMLAudioElement => {
  const audio = host.querySelector<HTMLAudioElement>('.orbit-audio__element');

  if (!audio) {
    throw new Error('No sound player');
  }

  Object.defineProperty(audio, 'duration', { value: seconds, configurable: true });
  audio.dispatchEvent(new Event('durationchange'));
  return audio;
};

const press = (target: Element, key: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

describe('the format', () => {
  test('a sound is an address, or one with a caption, and nothing else is', () => {
    const map = parseOrbit(BAND);
    expect(find(map.root, 'rehearsal').audio).toEqual({ src: 'memos/rehearsal.mp4' });
    expect(find(map.root, 'demo').audio).toEqual({ src: 'https://example.com/demo.mp3', caption: 'The first take' });
    expect(map.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
  });

  test('a caption beside a sound stays with the node’s picture, as older versions read it', () => {
    const map = parseOrbit('# Trip\n## Summit\n![Dawn](dawn.jpg)\n<!-- orbit\naudio: wind.m4a\ncaption: Above the clouds\n-->\n');
    const summit = find(map.root, 'summit');
    expect(summit.image?.caption).toBe('Above the clouds');
    expect(summit.audio).toEqual({ src: 'wind.m4a' });
  });

  test('a value that isn’t a sound is kept as written, and said so', () => {
    const source = '# Settings\n## Bell <!-- orbit audio: true -->\n';
    const map = parseOrbit(source);
    const bell = find(map.root, 'bell');
    expect(bell.audio).toBeUndefined();
    expect(bell.attrs).toEqual({ audio: true });
    expect(map.diagnostics.map((item) => item.code)).toContain('invalid-attributes');
    expect(serializeOrbitMarkdown(map)).toBe(source);
  });

  test('a link to a sound file on a line of its own stays note text, as it always was', () => {
    const map = parseOrbit('# Trip\n## Wind\n[Listen](https://example.com/wind.mp3)\n');
    const wind = find(map.root, 'wind');
    expect(wind.audio).toBeUndefined();
    expect(wind.note).toBe('[Listen](https://example.com/wind.mp3)');
  });

  test('saving writes a sound as an attribute: its address alone, or with its caption', () => {
    const map = parseOrbit('# Band\n## Rehearsal\n## Demo\n');
    find(map.root, 'rehearsal').audio = { src: 'memos/rehearsal.mp4' };
    find(map.root, 'demo').audio = { src: 'memos/demo.mp3', caption: 'The first take' };
    expect(serializeOrbitMarkdown(map, { keepSource: false })).toContain('## Rehearsal <!-- orbit audio: memos/rehearsal.mp4 -->');
    expect(serializeOrbitMarkdown(map, { keepSource: false })).toContain('<!-- orbit\naudio:\n  src: memos/demo.mp3\n  caption: The first take\n-->');
    const yaml = serializeOrbitYAML(map);
    expect(yaml).toContain('audio: memos/rehearsal.mp4');
    expect(yaml).toContain('audio:\n          src: memos/demo.mp3\n          caption: The first take');
    expect(find(parseOrbit(yaml).root, 'demo').audio).toEqual({ src: 'memos/demo.mp3', caption: 'The first take' });
  });

  test('a map with sounds is written back as it was, and an edit rewrites only its own idea', () => {
    const map = parseOrbit(BAND);
    expect(serializeOrbitMarkdown(map)).toBe(BAND);
    find(map.root, 'rehearsal').text = 'Rehearsal tape';
    const written = serializeOrbitMarkdown(map);
    expect(written).toContain('## Rehearsal tape <!-- orbit audio: memos/rehearsal.mp4, id: rehearsal -->');
    expect(written).toContain('<!-- orbit\naudio:\n  src: https://example.com/demo.mp3\n  caption: The first take\n-->');
  });

  test('fields a newer version writes in a sound are kept', () => {
    const source = '# Band\n## Demo\n<!-- orbit\naudio:\n  src: demo.mp3\n  waveform: [1, 4, 2]\n-->\n';
    const map = parseOrbit(source);
    expect(find(map.root, 'demo').audio).toEqual({ src: 'demo.mp3' });
    find(map.root, 'demo').audio!.caption = 'Take two';
    const written = serializeOrbitMarkdown(map);
    expect(written).toContain('waveform: [1, 4, 2]');
    expect(written).toContain('caption: Take two');
  });

  test('the address is checked where it plays: files, the web, blobs and sounds inside a page', () => {
    const quiet = spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(guardUrl('memos/idea.m4a', 'audio')).toBe('memos/idea.m4a');
    expect(guardUrl('https://example.com/a.mp3', 'audio')).toBe('https://example.com/a.mp3');
    expect(guardUrl('blob:https://example.com/abc', 'audio')).toBe('blob:https://example.com/abc');
    expect(guardUrl('data:audio/mp4;base64,AAAA', 'audio')).toBe('data:audio/mp4;base64,AAAA');
    expect(guardUrl('data:text/html;base64,AAAA', 'audio')).toBeNull();
    expect(guardUrl('javascript:alert(1)', 'audio')).toBeNull();
    expect(guardUrl('data:audio/mp4;base64,AAAA', 'image')).toBeNull();
    quiet.mockRestore();
  });
});

describe('on the map', () => {
  test('a planet with a sound wears a sound wave, on the other side from a video’s play button', () => {
    const { host, renderer } = mount(BAND);
    renderer.focusNode('band');
    const rehearsal = node(host, 'rehearsal');
    expect(rehearsal.querySelector('.orbit-node__sound path')?.getAttribute('d')).toBe('M-0.42 -0.2 V0.2 M0 -0.46 V0.46 M0.42 -0.2 V0.2');
    expect(rehearsal.querySelector('.orbit-node__marker')).toBeNull();
    expect(rehearsal.querySelector('.orbit-node__sound')?.getAttribute('transform')).toBe('translate(0.72 0.72) scale(0.17)');
    const trailer = node(host, 'trailer');
    expect(trailer.querySelector('.orbit-node__play')).not.toBeNull();
    expect(trailer.querySelector('.orbit-node__sound')?.getAttribute('transform')).toBe('translate(-0.72 0.72) scale(0.17)');
    expect(rehearsal.getAttribute('aria-label')).toContain('has sound');
  });

  test('exported maps draw the badge too', () => {
    const svg = renderToSVGString(BAND, { width: 800, height: 600 });
    // The four planets with a sound, and the trailer's play button.
    expect((svg.match(/fill="none" stroke="#ffffff" stroke-width="[\d.]+" stroke-linecap="round"/g) ?? []).length).toBe(4);
    expect((svg.match(/fill="#0f172a" fill-opacity="0.62"/g) ?? []).length).toBe(1);
  });

  test('the idea in focus offers "Play sound", which opens the viewer on it', () => {
    const { host, renderer } = mount(BAND);
    renderer.focusNode('demo');
    const button = host.querySelector<HTMLButtonElement>('.orbit-action--audio');
    expect(button?.getAttribute('aria-label')).toBe('Play sound');
    click(button!);
    const dialog = host.querySelector<HTMLDialogElement>('dialog.orbit-viewer[open]');
    expect(dialog?.dataset.orbitMedia).toBe('audio');
    expect(dialog?.querySelector('audio')?.getAttribute('src')).toBe('https://example.com/demo.mp3');
    expect(dialog?.querySelector('.orbit-viewer__text')?.textContent).toBe('The first take');
  });
});

describe('the media viewer', () => {
  test('sounds come in reading order, after a node’s picture and video', () => {
    const quiet = spyOn(console, 'warn').mockImplementation(() => undefined);
    const map = parseOrbit(`${BAND}\n## Blocked <!-- orbit audio: "javascript:alert(1)" -->`);
    expect(galleryItems(map.root).map((item) => `${item.node.id} ${item.kind}`)).toEqual([
      'rehearsal audio', 'demo audio', 'poster image', 'poster audio', 'trailer video', 'trailer audio',
    ]);
    quiet.mockRestore();
  });

  test('a sound plays at once in Orbit’s player, under art made of its idea’s color and icon', () => {
    const { host, renderer } = mount(BAND);
    expect(renderer.openMedia('rehearsal')).toBe(true);
    const dialog = host.querySelector<HTMLDialogElement>('dialog.orbit-viewer[open]')!;
    const audio = dialog.querySelector('audio')!;
    expect(audio.paused).toBe(false);
    expect(audio.getAttribute('src')).toBe('memos/rehearsal.mp4');
    expect(audio.controls).toBe(false);
    const art = dialog.querySelector<HTMLElement>('.orbit-viewer__art')!;
    expect(art.classList.contains('orbit-viewer__art--made')).toBe(true);
    expect(art.style.getPropertyValue('--orbit-art-color')).toBe(renderer.getNodeColor('rehearsal') ?? '');
    expect(dialog.querySelectorAll('.orbit-viewer__art-ring')).toHaveLength(2);
    expect(dialog.querySelector('.orbit-viewer__title')?.textContent).toBe('Rehearsal');
    expect(dialog.querySelector('.orbit-viewer__link')?.hasAttribute('hidden')).toBe(false);
    expect(dialog.classList.contains('orbit-viewer--playing')).toBe(true);
  });

  test('a node’s picture is its sound’s art', () => {
    const { host, renderer } = mount(BAND);
    renderer.openMedia('poster', { kind: 'audio' });
    const dialog = host.querySelector('dialog.orbit-viewer[open]')!;
    expect(dialog.querySelector('.orbit-viewer__art-picture')?.getAttribute('src')).toBe('https://example.com/poster.jpg');
    expect(dialog.querySelector('.orbit-viewer__art--made')).toBeNull();
  });

  test('the art is as big as the room over the player allows, and none on a stage too short for it', () => {
    const { host, renderer } = mount(BAND);
    renderer.openMedia('rehearsal');
    const box = host.querySelector<HTMLElement>('.orbit-viewer__sound')!;
    expect(box.style.getPropertyValue('--_orbit-viewer-art')).toBe('400px');
    expect(box.style.width).toBe('400px');

    stage = { left: 0, top: 0, width: 360, height: 260 };
    renderer.closeMedia();
    renderer.openMedia('rehearsal');
    const short = host.querySelector<HTMLElement>('.orbit-viewer__sound')!;
    expect(short.querySelector<HTMLElement>('.orbit-viewer__art')?.hidden).toBe(true);
    expect(short.style.width).toBe('300px');
  });

  test('its player is as wide as the art, and never narrower than it needs unless the stage is', () => {
    const { host, renderer } = mount(BAND);

    const opened = (width: number, height: number) => {
      stage = { left: 0, top: 0, width, height };
      renderer.closeMedia();
      renderer.openMedia('rehearsal');
      const box = host.querySelector<HTMLElement>('.orbit-viewer__sound')!;
      return { art: Number.parseFloat(box.style.getPropertyValue('--_orbit-viewer-art')), width: Number.parseFloat(box.style.width) };
    };

    // A wide stage short of height: small art over a player of its own width.
    const wide = opened(1000, 360);
    expect(wide.art).toBeGreaterThan(96);
    expect(wide.art).toBeLessThan(300);
    expect(wide.width).toBe(300);
    // A narrow one, tall enough: the art and the player take its whole width.
    const narrow = opened(280, 800);
    expect(narrow.width).toBeLessThan(300);
    expect(narrow.width).toBe(narrow.art);
  });

  test('its keys: Space or K plays and pauses, J and L go ten seconds back and on, M turns the sound off and on', () => {
    const { host, renderer } = mount(BAND);
    const states: boolean[] = [];
    renderer.on('media-state', (state) => states.push(state.playing));
    renderer.openMedia('rehearsal');
    const dialog = host.querySelector<HTMLDialogElement>('dialog.orbit-viewer[open]')!;
    const audio = withLength(dialog, 180);
    press(dialog, 'k');
    expect(audio.paused).toBe(true);
    press(dialog, ' ');
    expect(audio.paused).toBe(false);
    press(dialog, 'l');
    press(dialog, 'L');
    expect(audio.currentTime).toBe(20);
    press(dialog, 'j');
    expect(audio.currentTime).toBe(10);
    press(dialog, 'm');
    expect(audio.muted).toBe(true);
    press(dialog, 'M');
    expect(audio.muted).toBe(false);
    expect(states).toContain(false);
  });

  test('its player says what it does and where the sound is, in the map’s language', () => {
    const { host, renderer } = mount(BAND, { language: 'es' });
    renderer.openMedia('demo');
    const dialog = host.querySelector('dialog.orbit-viewer[open]')!;
    const audio = withLength(dialog, 190);
    audio.currentTime = 42;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(dialog.querySelector('.orbit-audio__toggle')?.getAttribute('aria-label')).toBe('Pausar');
    expect(dialog.querySelector('.orbit-audio__skip')?.getAttribute('aria-label')).toBe('Retroceder 10 segundos');
    expect(dialog.querySelector('.orbit-audio__position')?.getAttribute('aria-label')).toBe('Posición');
    expect(dialog.querySelector('.orbit-audio__position')?.getAttribute('aria-valuetext')).toBe('0:42 de 3:10');
    expect(dialog.querySelector('.orbit-audio__time')?.textContent).toBe('0:42');
    expect(dialog.querySelector('.orbit-audio__length')?.textContent).toBe('3:10');
    expect(dialog.querySelector('.orbit-viewer__link')?.getAttribute('aria-label')).toBe('Abrir el audio en una pestaña nueva');
  });

  test('its player speaks the map\'s new language when the language changes', () => {
    const { host, renderer } = mount(BAND);
    renderer.openMedia('demo');
    const dialog = host.querySelector('dialog.orbit-viewer[open]')!;
    const audio = withLength(dialog, 190);
    audio.currentTime = 42;
    audio.dispatchEvent(new Event('timeupdate'));
    renderer.setOptions({ language: 'es' });
    expect(dialog.querySelector('.orbit-audio__toggle')?.getAttribute('aria-label')).toBe('Pausar');
    expect(dialog.querySelector('.orbit-audio__skip')?.getAttribute('aria-label')).toBe('Retroceder 10 segundos');
    expect(dialog.querySelector('.orbit-audio__sound')?.getAttribute('aria-label')).toBe('Silenciar');
    expect(dialog.querySelector('.orbit-audio__position')?.getAttribute('aria-label')).toBe('Posición');
    expect(dialog.querySelector('.orbit-audio__position')?.getAttribute('aria-valuetext')).toBe('0:42 de 3:10');
  });

  test('stepping away from a sound stops it', () => {
    const { host, renderer } = mount(BAND);
    renderer.openMedia('rehearsal');
    const dialog = host.querySelector<HTMLDialogElement>('dialog.orbit-viewer[open]')!;
    const audio = dialog.querySelector('audio')!;
    press(dialog, 'ArrowRight');
    expect(audio.paused).toBe(true);
    expect(audio.hasAttribute('src')).toBe(false);
    expect(dialog.querySelector('audio')?.getAttribute('src')).toBe('https://example.com/demo.mp3');
  });

  test('a page drives it: play, pause, seek, and events', () => {
    const { renderer } = mount(BAND, { interactive: false });
    const opened: string[] = [];
    renderer.on('media-open', (event) => opened.push(`${event.node.id} ${event.kind} ${event.index + 1}/${event.total}`));
    expect(renderer.openMedia('demo', { kind: 'audio', autoplay: false })).toBe(true);
    expect(opened).toEqual(['demo audio 2/6']);
    const audio = document.querySelector('audio')!;
    expect(audio.paused).toBe(true);
    expect(renderer.playMedia()).toBe(true);
    expect(audio.paused).toBe(false);
    expect(renderer.seekMedia(30)).toBe(true);
    expect(audio.currentTime).toBe(30);
    expect(renderer.pauseMedia()).toBe(true);
    expect(audio.paused).toBe(true);
    expect(document.querySelector('.orbit-audio')?.classList.contains('orbit-audio--still')).toBe(true);
  });
});

describe('the detail sheet', () => {
  test('plays a sound on one line, with its caption, and stops it when the sheet closes', () => {
    const { host, renderer } = mount(BAND, { showMediaViewer: false });
    renderer.focusNode('demo');
    click(host.querySelector('.orbit-action--audio')!);
    const sheet = host.querySelector<HTMLDialogElement>('dialog.orbit-sheet[open]')!;
    const figure = sheet.querySelector('[data-section="audio"]')!;
    expect(figure.querySelector('.orbit-audio--inline')).not.toBeNull();
    expect(figure.querySelector('figcaption')?.textContent).toBe('The first take');
    const audio = figure.querySelector('audio')!;
    expect(audio.paused).toBe(true);
    click(figure.querySelector('.orbit-audio__toggle')!);
    expect(audio.paused).toBe(false);
    click(sheet.querySelector('.orbit-sheet__close')!);
    expect(audio.paused).toBe(true);
    expect(audio.hasAttribute('src')).toBe(false);
  });

  test('its Expand button moves the sound to the viewer, where it goes on', () => {
    const { host, renderer } = mount('# Band\n## Demo\nRecorded in one take.\n<!-- orbit audio: memos/demo.m4a -->\n');
    renderer.focusNode('demo');
    click(host.querySelector('.orbit-action--note')!);
    const sheet = host.querySelector<HTMLDialogElement>('dialog.orbit-sheet[open]')!;
    const audio = sheet.querySelector('audio')!;
    audio.currentTime = 12;
    const expand = sheet.querySelector('[data-section="audio"] .orbit-sheet__expand')!;
    expect(expand.getAttribute('aria-label')).toBe('Expand the sound');
    expect(expand.textContent).toBe('Expand');
    click(expand);
    expect(audio.paused).toBe(true);
    const viewer = host.querySelector('dialog.orbit-viewer[open]')!;
    const playing = viewer.querySelector('audio')!;
    playing.dispatchEvent(new Event('loadedmetadata'));
    expect(playing.currentTime).toBe(12);
    expect(sheet.open).toBe(true);
  });

  test('a sound that has ended starts over in the viewer', () => {
    const { host, renderer } = mount('# Band\n## Demo\nRecorded in one take.\n<!-- orbit audio: memos/demo.m4a -->\n', { language: 'es' });
    renderer.focusNode('demo');
    click(host.querySelector('.orbit-action--note')!);
    const sheet = host.querySelector<HTMLDialogElement>('dialog.orbit-sheet[open]')!;
    const audio = withLength(sheet, 30);
    audio.currentTime = 30;
    Object.defineProperty(audio, 'ended', { value: true, configurable: true });
    audio.dispatchEvent(new Event('ended'));
    const expand = sheet.querySelector('[data-section="audio"] .orbit-sheet__expand')!;
    expect(expand.getAttribute('aria-label')).toBe('Ampliar el audio');
    click(expand);
    const playing = host.querySelector<HTMLAudioElement>('dialog.orbit-viewer[open] audio')!;
    playing.dispatchEvent(new Event('loadedmetadata'));
    expect(playing.currentTime).toBe(0);
  });
});

describe('the player', () => {
  test('writes times as players do', () => {
    expect(formatPlaybackTime(0)).toBe('0:00');
    expect(formatPlaybackTime(42.9)).toBe('0:42');
    expect(formatPlaybackTime(185)).toBe('3:05');
    expect(formatPlaybackTime(3729)).toBe('1:02:09');
    expect(formatPlaybackTime(null)).toBe('--:--');
    expect(formatPlaybackTime(Number.NaN)).toBe('--:--');
  });

  test('its slider steps five seconds with the arrows, ten with the page keys, and to either end', () => {
    const player = new AudioPlayer({
      source: 'memo.m4a',
      autoplay: false,
      controls: true,
      title: 'Memo',
      words: new OrbitWords('en'),
      size: 'inline',
      onState: () => undefined,
      onError: () => undefined,
    });
    document.body.appendChild(player.element);
    const audio = withLength(player.element, 100);
    const slider = player.element.querySelector<HTMLInputElement>('.orbit-audio__position')!;
    press(slider, 'ArrowRight');
    expect(audio.currentTime).toBe(5);
    press(slider, 'PageUp');
    expect(audio.currentTime).toBe(15);
    press(slider, 'End');
    expect(audio.currentTime).toBe(100);
    press(slider, 'Home');
    expect(audio.currentTime).toBe(0);
    expect(player.element.style.getPropertyValue('--_orbit-audio-progress')).toBe('0.00%');
    slider.value = '50';
    slider.dispatchEvent(new Event('input'));
    expect(player.element.querySelector('.orbit-audio__time')?.textContent).toBe('0:50');
    expect(audio.currentTime).toBe(0);
    slider.dispatchEvent(new Event('change'));
    expect(audio.currentTime).toBe(50);
    expect(player.element.style.getPropertyValue('--_orbit-audio-progress')).toBe('50.00%');
    player.destroy();
  });

  test('starts startAt seconds in once it knows its length, unless it was sent somewhere else before', () => {
    const open = () => new AudioPlayer({
      source: 'memo.m4a',
      autoplay: false,
      controls: true,
      startAt: 30,
      title: 'Memo',
      words: new OrbitWords('en'),
      size: 'inline',
      onState: () => undefined,
      onError: () => undefined,
    });

    const untouched = open();
    const audio = untouched.element.querySelector<HTMLAudioElement>('.orbit-audio__element')!;
    audio.dispatchEvent(new Event('loadedmetadata'));
    expect(audio.currentTime).toBe(30);
    untouched.destroy();

    const sent = open();
    const sentAudio = sent.element.querySelector<HTMLAudioElement>('.orbit-audio__element')!;
    sent.seek(5);
    sentAudio.dispatchEvent(new Event('loadedmetadata'));
    expect(sentAudio.currentTime).toBe(5);
    sent.destroy();
  });

  test('says how long the sound is once it knows', () => {
    const player = new AudioPlayer({
      source: 'memo.m4a',
      autoplay: false,
      controls: true,
      title: 'Memo',
      words: new OrbitWords('en'),
      size: 'inline',
      onState: () => undefined,
      onError: () => undefined,
    });
    const slider = player.element.querySelector('.orbit-audio__position')!;
    expect(slider.getAttribute('aria-valuetext')).toBe('0:00 of --:--');
    withLength(player.element, 190);
    expect(slider.getAttribute('aria-valuetext')).toBe('0:00 of 3:10');
    player.destroy();
  });

  test('its play button turns into pause while it plays, and plays a sound at its end from the start', () => {
    const player = new AudioPlayer({
      source: 'memo.m4a',
      autoplay: false,
      controls: true,
      title: 'Memo',
      words: new OrbitWords('en'),
      size: 'stage',
      onState: () => undefined,
      onError: () => undefined,
    });
    const toggle = player.element.querySelector<HTMLButtonElement>('.orbit-audio__toggle')!;
    expect(toggle.getAttribute('aria-label')).toBe('Play');
    click(toggle);
    expect(toggle.getAttribute('aria-label')).toBe('Pause');
    expect(player.element.classList.contains('orbit-audio--playing')).toBe(true);
    expect(player.element.querySelectorAll('.orbit-audio__skip-seconds')).toHaveLength(2);
    player.destroy();
  });
});

describe('printing and pages', () => {
  test('prints a sound by its caption, with its address when it’s on the web', () => {
    const container = document.createElement('div');
    renderPrintLayout(container, BAND);
    const sounds = [...container.querySelectorAll('.orbit-print__media--audio figcaption')].map((caption) => caption.textContent);
    expect(sounds).toEqual(['Sound', 'The first take: https://example.com/demo.mp3', 'Sound', 'Sound']);
    expect(container.querySelector('.orbit-print__media--audio a')?.getAttribute('href')).toBe('https://example.com/demo.mp3');
  });

  test('a web page swaps a sound for the one inside it', () => {
    const map = withMedia(parseOrbit(BAND), { 'memos/rehearsal.mp4': 'data:audio/mp4;base64,AAAA' });
    expect(find(map.root, 'rehearsal').audio?.src).toBe('data:audio/mp4;base64,AAAA');
    expect(find(map.root, 'demo').audio?.src).toBe('https://example.com/demo.mp3');
  });

  test('map tools read and set a sound', () => {
    const tools = createMapTools('# Band\n## Demo\n');
    const set = tools.run('update_node', { node_id: 'demo', audio: { src: 'https://example.com/demo.mp3', caption: 'Take one' } });
    expect(set.ok).toBe(true);
    expect(set.text).toContain('sound');
    expect(tools.run('read_map', {}).text).toContain('audio');
    expect(tools.run('update_node', { node_id: 'demo', audio: { src: 'javascript:alert(1)' } }).text).toContain('audio can\'t play');
  });
});
