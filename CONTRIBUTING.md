# Contributing

Thanks for helping improve Orbit. Keep changes focused, tested, and easy
to review.

## Local setup

```bash
bun install
bun run verify
```

The browser tests' screenshots and sample pictures are stored with
[Git LFS](https://git-lfs.com): install it before cloning (`git lfs install`
once), or run `git lfs pull` in a clone made without it.

Useful commands:

```bash
bun test               # whole suite (bun test tests/renderer.test.ts for one file)
bun run lint
bun run typecheck
bun run build          # ESM + .d.ts into dist/
bun run test:browser   # spin, zoom, navigation and screenshots in Chromium (needs Docker or Podman)
bun run bench          # frame rates on a large map in Chromium; -- --profile=phone for a phone
bun run docs:api       # regenerate docs/api from the source
bun run docs:llms      # rebuild llms-full.txt and the skill's references after editing the docs
```

## Pull requests

- Open an issue first for large features or public API changes.
- Include tests for parser, layout, renderer, or packaging behavior when those
  areas change.
- Keep React and `marked` integration changes on their existing subpaths so the
  core package remains usable without optional peers.
- Run `bun run verify` before requesting review.
- Update the README and `docs/` when user-facing behavior changes.
- A change to the format follows "Changing the format" in
  [`docs/format.md`](./docs/format.md#changing-the-format). After a change to
  how maps are written, run `bun scripts/release-fixtures.ts` to rewrite
  `tests/fixtures/releases/next/`, and include its diff.

## Coding standards

- TypeScript is strict and ESM-first.
- `bun run lint` checks the code style and `bunx eslint --fix .` applies it.
  Functions are arrow functions unless they can't be. Blocks (`if`s, loops,
  functions, calls with a callback) have a blank line before and after them,
  and so do members with a doc comment. The details are in
  [`AGENTS.md`](./AGENTS.md#conventions).
- Prefer small modules with explicit exports.
- Avoid new runtime dependencies in the core (`src/core`) unless they are
  clearly justified. React and `marked` stay optional peers on their own
  subpaths so the core remains dependency-free.

## Release changes

Release preparation is tracked in [`RELEASE.md`](./RELEASE.md). The package is
published from the repository root.
