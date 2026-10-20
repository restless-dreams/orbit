# Recipes

How to use Orbit with common frameworks and tools. Every map fills its container, so give the container a height.

- [Plain HTML](#plain-html)
- [React and Next.js](#react-and-nextjs)
- [Vue](#vue)
- [Svelte](#svelte)
- [Astro](#astro)
- [Markdown pipelines](#markdown-pipelines)
- [Static sites, emails and print](#static-sites-emails-and-print)

## Plain HTML

The `<orbit-map>` element needs no build step:

```html
<script type="module">
  import { defineOrbitMapElement } from 'https://cdn.jsdelivr.net/npm/@restless-dreams/orbit/+esm';
  defineOrbitMapElement();
</script>

<orbit-map height="420">
  # 🚀 Project

  ## Research <!-- orbit status: active -->
  ## Build
  ## Launch
</orbit-map>
```

Hide elements until the script loads, so the raw markdown never flashes: `orbit-map:not(:defined) { visibility: hidden; }`.

To draw into your own element instead:

```js
import { createOrbitMap } from '@restless-dreams/orbit';

const map = createOrbitMap(document.querySelector('#map'), markdown, { theme: 'auto' });
map.on('focus-change', ({ node }) => console.log(node.text));
```

## React and Next.js

`@restless-dreams/orbit/react` is marked `"use client"`, so you can render it from a Server Component. It draws a static SVG of the map on the server, and the live map takes over in the browser.

```tsx
// app/roadmap/page.tsx (a Server Component)
import { OrbitMindMap } from '@restless-dreams/orbit/react';
import { readFile } from 'node:fs/promises';

const RoadmapPage = async () => {
  const markdown = await readFile('content/roadmap.md', 'utf8');
  return (
    <div style={{ height: 520 }}>
      <OrbitMindMap source={markdown} theme="auto" />
    </div>
  );
};

export default RoadmapPage;
```

Callbacks are functions, which can't cross from a Server Component, so put interactive maps in a client component:

```tsx
'use client';

import { useRef, useState } from 'react';
import { OrbitMindMap, type OrbitMindMapRef } from '@restless-dreams/orbit/react';

export const RoadmapExplorer = ({ markdown }: { markdown: string }) => {
  const map = useRef<OrbitMindMapRef>(null);
  const [focusedId, setFocusedId] = useState<string>();

  return (
    <>
      <button onClick={() => map.current?.overview()}>Show everything</button>
      <div style={{ height: 520 }}>
        <OrbitMindMap
          ref={map}
          source={markdown}
          focusedId={focusedId}
          onFocusChange={(node) => setFocusedId(node.id)}
        />
      </div>
    </>
  );
};
```

## Vue

Use the web component. Tell Vue that `orbit-map` is a custom element:

```ts
// vite.config.ts
import vue from '@vitejs/plugin-vue';

export default {
  plugins: [vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === 'orbit-map' } } })],
};
```

```ts
// main.ts
import { defineOrbitMapElement } from '@restless-dreams/orbit';

defineOrbitMapElement();
```

```vue
<script setup lang="ts">
import { ref } from 'vue';

const markdown = ref('# Project\n\n## Research\n## Build');
const focused = ref('');
</script>

<template>
  <orbit-map
    :source="markdown"
    height="420"
    @orbit-focus-change="(event) => (focused = event.detail.node.text)"
  />
  <p>Looking at: {{ focused }}</p>
</template>
```

Setting `source` redraws the map and keeps the reader's place.

## Svelte

An action draws the map and redraws it when the markdown changes (Svelte 4 and 5):

```svelte
<script>
  import { createOrbitMap } from '@restless-dreams/orbit';

  let { markdown } = $props();

  const orbit = (element, source) => {
    const map = createOrbitMap(element, source);
    return {
      update: (next) => map.render(next),
      destroy: () => map.destroy(),
    };
  };
</script>

<div use:orbit={markdown} style="height: 420px"></div>
```

## Astro

Interactive, with the web component:

```astro
---
import markdown from '../content/roadmap.md?raw';
---
<orbit-map source={markdown} height="420"></orbit-map>

<script>
  import { defineOrbitMapElement } from '@restless-dreams/orbit';
  defineOrbitMapElement();
</script>
```

Or static, with no JavaScript at all:

```astro
---
import { renderToSVGString } from '@restless-dreams/orbit';
import markdown from '../content/roadmap.md?raw';
const svg = renderToSVGString(markdown, { responsive: true, theme: 'paper' });
---
<figure style="height: 420px" set:html={svg} />
```

## Markdown pipelines

**marked:** `@restless-dreams/orbit/marked` turns ```` ```orbit ```` fences into maps (see [Markdown pipelines](guide.md#markdown-pipelines-marked) in the guide).

**remark and rehype** (Astro, Docusaurus, Next.js MDX, Eleventy, …): a small rehype plugin replaces the fences with static SVG at build time:

```js
import { visit } from 'unist-util-visit';
import { toString } from 'hast-util-to-string';
import { fromHtml } from 'hast-util-from-html';
import { renderToSVGString } from '@restless-dreams/orbit';

/** Replaces ```orbit code blocks with a static SVG of the map. */
export const rehypeOrbit = (options = {}) => {
  return (tree) => {
    let count = 0;

    visit(tree, 'element', (node, index, parent) => {
      const code = node.tagName === 'pre' ? node.children.find((child) => child.tagName === 'code') : null;
      const classes = code?.properties?.className ?? [];

      if (!code || !classes.includes('language-orbit') || !parent || index === undefined) {
        return;
      }

      count += 1;
      const svg = renderToSVGString(toString(code), { responsive: true, idPrefix: `orbit-${count}`, ...options });
      parent.children[index] = fromHtml(svg, { fragment: true, space: 'svg' }).children[0];
    });
  };
};
```

To make those maps explorable in the browser, emit `<orbit-map>` elements instead of SVG and load `defineOrbitMapElement()` on the page.

## Static sites, emails and print

`renderToSVGString` and the `orbit render` command draw a map without a browser:

```bash
npx @restless-dreams/orbit render roadmap.md --out roadmap.svg --theme night --width 1600 --height 1000
npx @restless-dreams/orbit render roadmap.md --view all --out overview.svg
```

The SVG has its colors resolved and its labels as text, so it opens the same in browsers, design tools and image converters. Give each SVG inlined in one page its own `idPrefix`.

For a PDF, export the map as a web page and print it, or have a headless browser do it. The page prints laid out for paper, with the map's picture, then every idea and its note:

```bash
npx @restless-dreams/orbit export --html roadmap.md --out roadmap.html
chromium --headless --no-pdf-header-footer --print-to-pdf=roadmap.pdf roadmap.html
```

On your own pages, `renderPrintLayout` lays a map out the same way (see [Printing and PDF](guide.md#printing-and-pdf)).
