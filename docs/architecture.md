# Architecture

Orbit is a single publishable library, `@restless-dreams/orbit` on npm;
the repository root *is* the package.

## Library

- `src/core` contains the parsers and serializers, the layout, the scene
  engine (`src/core/engine`: scenes, camera, flights, spin physics, views),
  the renderer, the HTML controls, detail sheet and media viewer (`src/core/ui`), the
  stylesheet and themes, the web component helpers, and shared types. This is
  the dependency-free public core.
- `src/react` contains the optional React wrapper. It is exported only through
  `@restless-dreams/orbit/react`.
- `src/marked` contains the optional `marked` integration. It is exported only
  through `@restless-dreams/orbit/marked`.
- `scripts/build.ts` produces ESM, source maps, and TypeScript declarations in
  `dist`, compiling the stylesheet with `scripts/sass-plugin.ts`.

The package root (`@restless-dreams/orbit`) is the primary entry. It exports the parsers, serializers, the renderer and its one-call helpers, the web component, the SVG export, the themes and shared types. `@restless-dreams/orbit/react` and `@restless-dreams/orbit/marked` are optional subpaths for the React wrapper and the marked integration.

## Release surface

The npm package includes only:

- `dist/**`
- `skills/**`
- `llms.txt` and `llms-full.txt`
- `README.md`
- `LICENSE`
- `package.json`

Repository-level docs and tests are kept outside the package tarball.
