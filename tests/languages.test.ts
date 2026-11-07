import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { OrbitSVGRenderer } from '../src/core/svg-renderer';
import { parseOrbit } from '../src/core/dispatch';
import { renderToSVGString } from '../src/core/render-to-svg';
import { defineOrbitMapElement } from '../src/core/auto-render';
import { OrbitWords, languageOf, languageTags, registerLanguage, type OrbitStrings } from '../src/core/languages';
import type { OrbitRendererOptions } from '../src/core/types';
import { node, useMapSize } from './helpers/renderer';

useMapSize(600, 400);

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('lang');
});

/** A map drawn inside an element in `lang`, like a page in that language. */
const mountIn = (lang: string | null, source: string, options: OrbitRendererOptions = {}): { host: HTMLElement; page: HTMLElement; renderer: OrbitSVGRenderer } => {
  const page = document.createElement('main');

  if (lang !== null) {
    page.lang = lang;
  }

  const host = document.createElement('div');
  page.appendChild(host);
  document.body.appendChild(page);
  const renderer = new OrbitSVGRenderer(host, { transitionDuration: 0, ...options });
  renderer.render(parseOrbit(source));
  return { host, page, renderer };
};

const label = (host: HTMLElement, selector: string): string | null => {
  return host.querySelector(selector)?.getAttribute('aria-label') ?? null;
};

/** An <orbit-map> with `content`, inside an element in `lang`. */
const mapElementIn = (lang: string, content: string): HTMLElement => {
  const page = document.createElement('div');
  page.lang = lang;
  const element = document.createElement('orbit-map');
  element.innerHTML = content;
  page.appendChild(element);
  document.body.appendChild(page);
  return element;
};

const MAP = `# Launch plan
> Ship it in two stages.
![Poster](https://example.com/poster.png)

## Research
## Build
## Ship`;

describe('the words a map speaks', () => {
  test('English, Spanish and Brazilian Portuguese are built in, with every word', () => {
    expect(languageTags()).toEqual(expect.arrayContaining(['en', 'es', 'pt', 'pt-BR']));
    const table = (words: OrbitWords) => (words as unknown as { table: OrbitStrings }).table;
    const english = table(new OrbitWords('en'));

    for (const language of ['es', 'pt-BR']) {
      const translated = table(new OrbitWords(language));
      expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort());

      for (const [key, value] of Object.entries(translated)) {
        const kind = typeof english[key as keyof OrbitStrings];
        expect([language, key, typeof value]).toEqual([language, key, kind]);
        // The same placeholders, in any order.
        const placeholders = (text: unknown) => [...new Set(JSON.stringify(text).match(/\{\w+\}/g) ?? [])].sort();
        expect([language, key, placeholders(value)]).toEqual([language, key, placeholders(english[key as keyof OrbitStrings])]);
      }
    }

    expect(new OrbitWords('es').text('zoomIn')).toBe('Acercar');
    expect(new OrbitWords('pt-BR').text('zoomIn')).toBe('Aumentar o zoom');
  });

  test('Brazilian Portuguese is pt-BR’s and pt’s, and Portugal’s until it has its own', () => {
    expect(new OrbitWords('pt-BR').language).toBe('pt-BR');
    expect(new OrbitWords('pt').language).toBe('pt');

    for (const requested of ['pt-BR', 'pt', 'pt-PT', 'pt_BR']) {
      expect(new OrbitWords(requested).text('overview')).toBe('Visão geral');
    }

    // Portugal writes its numbers its own way, and Brazil gives 0 and 1 the same plural.
    const portugal = new OrbitWords('pt-PT');
    expect(portugal.language).toBe('pt');
    expect(portugal.locale).toBe('pt-PT');
    expect(new OrbitWords('pt-BR').count('ideaCount', 1)).toBe('1 ideia');
    expect(new OrbitWords('pt-BR').count('ideaCount', 2400)).toBe('2.400 ideias');
    expect(new OrbitWords('pt-BR').count('hiddenIdeaCount', 3)).toBe('3 ideias ocultas');
    expect(new OrbitWords('pt-BR').list(['nota', 'imagem', 'link'])).toBe('nota, imagem e link');
  });

  test('a regional tag reads its language, and writes numbers its own way', () => {
    const mexican = new OrbitWords('es-MX');
    expect(mexican.language).toBe('es');
    expect(mexican.locale).toBe('es-MX');
    expect(mexican.count('ideaCount', 1)).toBe('1 idea');
    expect(mexican.count('ideaCount', 2400)).toBe('2,400 ideas');
    expect(new OrbitWords('es-ES').count('ideaCount', 24000)).toBe('24.000 ideas');
    expect(new OrbitWords('en').count('ideaCount', 1)).toBe('1 item');
    expect(new OrbitWords('en').count('ideaCount', 3)).toBe('3 items');
  });

  test('a language Orbit doesn’t have, or no language, reads English', () => {
    for (const requested of ['fr', 'xx-YY', undefined, null, '', 'not a tag!']) {
      const words = new OrbitWords(requested);
      expect(words.language).toBe('en');
      expect(words.text('overview')).toBe('Overview');
    }
  });

  test('placeholders take any order, and lists are written the language’s way', () => {
    const spanish = new OrbitWords('es');
    expect(spanish.text('moved', { name: 'Ideas', parent: 'Plan' })).toBe('Se movió Ideas a Plan');
    expect(spanish.text('position', { index: 2, total: 5 })).toBe('2 de 5');
    expect(spanish.list(['nota', 'imagen', 'enlace'])).toBe('nota, imagen y enlace');
    expect(new OrbitWords('en').list(['note', 'image', 'link'])).toBe('note, image, and link');
    expect(spanish.text('goTo')).toBe('Ir a {name}');
  });

  test('the strings option changes single words, and keeps the rest', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const words = new OrbitWords('es', {
        zoomIn: 'Más cerca',
        ideaCount: 'muchas ideas',
        notAWord: 'x',
        overview: 3,
      } as unknown as Partial<OrbitStrings>);
      expect(words.text('zoomIn')).toBe('Más cerca');
      expect(words.count('ideaCount', 9)).toBe('muchas ideas');
      expect(words.text('overview')).toBe('Vista general');
      expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
        '[orbit] strings: Orbit has no words called "notAWord".',
        '[orbit] strings: "overview" should be a string.',
      ]);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('registering languages', () => {
  const undo: (() => void)[] = [];

  afterEach(() => {
    while (undo.length > 0) {
      undo.pop()?.();
    }
  });

  test('adds a language, with English for the words it leaves out, and takes it away again', () => {
    const remove = registerLanguage('fr', { zoomIn: 'Zoomer', ideaCount: { one: '{count} idée', many: '{count} d’idées', other: '{count} idées' } });
    expect(languageTags()).toContain('fr');
    const french = new OrbitWords('fr-CA');
    expect(french.language).toBe('fr');
    expect(french.text('zoomIn')).toBe('Zoomer');
    expect(french.count('ideaCount', 1)).toBe('1 idée');
    expect(french.count('ideaCount', 1_000_000)).toBe(`${new Intl.NumberFormat('fr-CA').format(1_000_000)} d’idées`);
    expect(french.text('zoomOut')).toBe('Zoom out');
    remove();
    expect(languageTags()).not.toContain('fr');
    expect(new OrbitWords('fr').language).toBe('en');
  });

  test('a regional language starts from its base, and changing a built-in one can be undone', () => {
    undo.push(registerLanguage('es-ES', { video: 'Vídeo' }));
    const spain = new OrbitWords('es-ES');
    expect(spain.language).toBe('es-ES');
    expect(spain.text('video')).toBe('Vídeo');
    expect(spain.text('zoomIn')).toBe('Acercar');
    expect(new OrbitWords('es-MX').text('video')).toBe('Video');

    const restore = registerLanguage('es', { zoomIn: 'Acercar más' });
    expect(new OrbitWords('es').text('zoomIn')).toBe('Acercar más');
    restore();
    expect(new OrbitWords('es').text('zoomIn')).toBe('Acercar');
  });

  test('Portugal’s words can come over the Brazilian ones, and Brazil keeps its own', () => {
    undo.push(registerLanguage('pt-PT', { overview: 'Vista geral' }));
    expect(new OrbitWords('pt-PT').text('overview')).toBe('Vista geral');
    expect(new OrbitWords('pt-PT').text('zoomIn')).toBe('Aumentar o zoom');
    expect(new OrbitWords('pt-BR').text('overview')).toBe('Visão geral');

    // Changing pt's words leaves pt-BR's as they are.
    undo.push(registerLanguage('pt', { overview: 'Vista geral' }));
    expect(new OrbitWords('pt-BR').text('overview')).toBe('Visão geral');
  });

  test('a tag that isn’t one is refused', () => {
    expect(() => registerLanguage('not a tag!', {})).toThrow('isn\'t a language tag');
  });
});

describe('the language around a map', () => {
  test('is the closest lang attribute, through shadow roots, then the document’s', () => {
    document.documentElement.lang = 'en-GB';
    const outer = document.createElement('section');
    outer.lang = 'es';
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const inside = document.createElement('div');
    shadow.appendChild(inside);
    outer.appendChild(host);
    document.body.appendChild(outer);
    expect(languageOf(inside)).toBe('es');
    const elsewhere = document.createElement('div');
    document.body.appendChild(elsewhere);
    expect(languageOf(elsewhere)).toBe('en-GB');
    document.documentElement.removeAttribute('lang');
    expect(languageOf(elsewhere)).toBeNull();
  });
});

describe('a map in Spanish', () => {
  test('its controls, outline and descriptions follow the page’s lang', () => {
    const { host } = mountIn('es-MX', MAP);
    expect(label(host, '.orbit-controls__zoom .orbit-panel')).toBe('Zoom');
    expect(label(host, '.orbit-controls__zoom button')).toBe('Acercar');
    expect(host.querySelector('.orbit-segmented__label')?.textContent).toBe('Enfoque');
    expect(label(host, '.orbit-outline')).toBe('Esquema del mapa');
    expect(host.querySelector('svg.orbit__canvas')?.getAttribute('aria-roledescription')).toBe('mapa mental');
    expect(node(host, 'launch-plan').getAttribute('aria-label')).toBe('Launch plan, 3 ideas, tiene nota e imagen');
  });

  test('a status a file writes as todo, active, done or blocked is said in the map’s language; any other word as written', () => {
    const source = '# Plan\n## Draft <!-- orbit status: active -->\n## Review <!-- orbit status: review -->\n## Ship <!-- orbit status: Done -->';
    const { host: spanish } = mountIn('es', source);
    expect(node(spanish, 'draft').getAttribute('aria-label')).toBe('Draft, estado: En curso');
    expect(node(spanish, 'review').getAttribute('aria-label')).toBe('Review, estado: review');
    expect(node(spanish, 'ship').getAttribute('aria-label')).toBe('Ship, estado: Hecho');
    const { host: english } = mountIn('en', source);
    expect(node(english, 'draft').getAttribute('aria-label')).toBe('Draft, status: In progress');
    expect(new OrbitWords('es').statusName('todo')).toBe('Por hacer');
    expect(new OrbitWords('en').statusName('blocked')).toBe('Blocked');
  });

  test('the language option wins over the page’s, and changing it writes everything again', () => {
    const { host, renderer } = mountIn('es', MAP, { language: 'en' });
    expect(label(host, '.orbit-controls__zoom button')).toBe('Zoom in');
    renderer.setOptions({ language: 'es' });
    expect(label(host, '.orbit-controls__zoom button')).toBe('Acercar');
    expect(label(host, '.orbit-outline')).toBe('Esquema del mapa');
    expect(node(host, 'launch-plan').getAttribute('aria-label')).toContain('tiene nota e imagen');
    renderer.setOptions({ strings: { zoomIn: 'Más cerca' } });
    expect(label(host, '.orbit-controls__zoom button')).toBe('Más cerca');
  });

  test('a language the options ask for is said on the map, so screen readers read its words in it', () => {
    const { host, renderer } = mountIn('en', MAP, { language: 'es' });
    const map = host.querySelector('.orbit') as HTMLElement;
    const zoomIn = host.querySelector('.orbit-controls__zoom button');
    expect(map.lang).toBe('es');
    // Its buttons, outline, detail sheet and media viewer are all inside it.
    expect(languageOf(zoomIn)).toBe('es');
    renderer.setOptions({ language: 'es-MX' });
    expect(map.lang).toBe('es-MX');
    // A language Orbit has no words for is read as the English its words are in.
    renderer.setOptions({ language: 'fr' });
    expect(map.lang).toBe('en');
    // Without the option, the map speaks its page's language, and leaves saying so to the page.
    renderer.setOptions({ language: undefined });
    expect(map.hasAttribute('lang')).toBe(false);
    expect(languageOf(zoomIn)).toBe('en');
  });

  test('the empty map, its announcements and the + speak Spanish', () => {
    const { host } = mountIn('es', '');
    expect(host.querySelector('.orbit-empty strong')?.textContent).toBe('Este mapa está vacío');

    const { host: editing, renderer } = mountIn('es', '# Viaje\n## Comida', { editable: true });
    expect(label(editing, '[data-orbit-add]')).toBe('Agregar una idea a Viaje');
    const live = editing.querySelector('.orbit__live') as HTMLElement;
    renderer.removeNode('comida');

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(live.textContent).toBe('Se eliminó Comida');
        resolve();
      }, 60);
    });
  });

  test('renderToSVGString writes its few words in the language asked for', () => {
    expect(renderToSVGString('', { language: 'es' })).toContain('>Este mapa está vacío<');
    const list = renderToSVGString('- [x] Hecho\n- Pendiente', { language: 'es' });
    expect(list).toContain('<title>Mapa sin título</title>');
    expect(list).toContain('>Mapa sin título</tspan>');
    expect(renderToSVGString('', {})).toContain('>This map is empty<');
  });

  test('<orbit-map> follows the page’s lang, and its own', () => {
    defineOrbitMapElement();
    const element = mapElementIn('es', '# Viaje\n## Comida');
    const zoomIn = () => element.shadowRoot?.querySelector('.orbit-controls__zoom button')?.getAttribute('aria-label');
    expect(zoomIn()).toBe('Acercar');
    element.setAttribute('lang', 'en');
    expect(zoomIn()).toBe('Zoom in');
  });

  test('a map that can’t be drawn says so in its language', () => {
    defineOrbitMapElement();
    const error = spyOn(console, 'error').mockImplementation(() => {});

    try {
      const element = mapElementIn('es', 'nodes:\n  - text: A\n    tags: [a, b');
      const card = element.shadowRoot?.querySelector('[role="alert"]');
      expect(card?.querySelector('strong')?.textContent).toBe('No se pudo dibujar este mapa');
      expect(card?.textContent).toContain('Línea ');
    } finally {
      error.mockRestore();
    }
  });
});

describe('a map in Brazilian Portuguese', () => {
  test('its controls, outline, descriptions and statuses follow the page’s lang', () => {
    const { host } = mountIn('pt-BR', MAP);
    expect(label(host, '.orbit-controls__zoom button')).toBe('Aumentar o zoom');
    expect(host.querySelector('.orbit-segmented__label')?.textContent).toBe('Foco');
    expect(label(host, '.orbit-outline')).toBe('Tópicos do mapa');
    expect(node(host, 'launch-plan').getAttribute('aria-label')).toBe('Launch plan, 3 ideias, tem nota e imagem');

    const { host: statuses } = mountIn('pt', '# Plano\n## Rascunho <!-- orbit status: active -->\n## Entrega <!-- orbit status: done -->');
    expect(node(statuses, 'rascunho').getAttribute('aria-label')).toBe('Rascunho, status: Em andamento');
    expect(node(statuses, 'entrega').getAttribute('aria-label')).toBe('Entrega, status: Concluído');
  });

  test('its announcements and the + speak Portuguese, whatever the idea’s name', () => {
    const { host, renderer } = mountIn('pt-BR', '# Viagem\n## Comida\n## Praias\n## Museus', { editable: true });
    expect(label(host, '[data-orbit-add]')).toBe('Adicionar uma ideia a Viagem');
    const live = host.querySelector('.orbit__live') as HTMLElement;

    const announced = () => new Promise<string>((resolve) => {
      setTimeout(() => resolve(live.textContent ?? ''), 60);
    });

    renderer.removeNode('museus');

    return announced().then((removed) => {
      // The idea's name comes after the words, which agree with "ideia" whatever the name is.
      expect(removed).toBe('Ideia excluída: Museus');
      renderer.moveNode('praias', 'comida');
      return announced();
    }).then((moved) => {
      expect(moved).toBe('Ideia movida para Comida: Praias');
    });
  });

  test('renderToSVGString writes its few words in Portuguese', () => {
    expect(renderToSVGString('', { language: 'pt-BR' })).toContain('>Este mapa está vazio<');
    expect(renderToSVGString('- Praia\n- Serra', { language: 'pt-BR' })).toContain('<title>Mapa sem título</title>');
  });
});

describe('the root Orbit makes up', () => {
  test('is named in the reader’s language, with the same id in every one', () => {
    expect(parseOrbit('- Uno\n- Dos', { untitled: 'Mapa sin título' }).root).toMatchObject({ id: 'untitled-map', text: 'Mapa sin título' });
    expect(parseOrbit('nodes:\n  - text: Uno\n  - text: Dos', { untitled: 'Mapa sin título' }).root).toMatchObject({ id: 'untitled-map', text: 'Mapa sin título' });
    expect(parseOrbit('- Uno\n- Dos').root).toMatchObject({ id: 'untitled-map', text: 'Untitled map' });
    // A title names it, whatever the language.
    expect(parseOrbit('---\ntitle: Viaje\n---\n- Uno\n- Dos', { untitled: 'Mapa sin título' }).root).toMatchObject({ text: 'Viaje' });
  });

  test('a map that’s just a list is saved as a list, in any language', () => {
    const source = '- Comida\n- Lugares\n';
    const { renderer } = mountIn('es', '');
    renderer.render(source);
    expect(renderer.getFocusedNode()?.text).toBe('Mapa sin título');
    renderer.addNode('lugares', { text: 'Museos' });
    expect(renderer.toMarkdown()).toBe('- Comida\n- Lugares\n  - Museos\n');
  });
});
