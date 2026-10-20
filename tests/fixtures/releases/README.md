# Maps as each release wrote them

Every version of Orbit is tested against the maps earlier ones wrote
(`tests/release-fixtures.test.ts`). Each must:

- read them without errors, with the same notes;
- write them back exactly, with the source kept;
- understand them the same way, after its format upgrades, and write them in
  its own markdown and YAML without losing anything.

- `sources/` are the maps every version starts from, written by hand: every
  attribute and document option, media with captions, hidden comments, links
  between nodes, node types with versions, custom attributes and frontmatter
  keys Orbit doesn't know.
- A version's folder holds what it wrote from them:
  - `everything.md` and `everything-from-yaml.md`: its own markdown;
  - `everything.yaml` and `everything-from-yaml.yaml`: its YAML;
  - `trip.md`: `sources/trip.md` edited through its renderer and saved with
    the source kept, the way an app saves;
  - `reads.json`: how it read each one back.
- `next/` is what this checkout writes, and a test keeps it current: after a
  change to how maps are written, rewrite it with
  `bun scripts/release-fixtures.ts` and read the diff.
- A released version's folder is never changed: what it wrote is what
  people's files hold. RELEASE.md adds one at each release.

`0.1.0/` was written by `@restless-dreams/orbit@0.1.0` from npm, the same
Orbit Orbit for Android 0.2.0 bundles:

```bash
mkdir /tmp/orbit-0.1.0 && cd /tmp/orbit-0.1.0 && npm init -y && npm pkg set type=module && npm install @restless-dreams/orbit@0.1.0
cd -
bun scripts/release-fixtures.ts --orbit /tmp/orbit-0.1.0/node_modules/@restless-dreams/orbit/dist/index.js --version 0.1.0
```
