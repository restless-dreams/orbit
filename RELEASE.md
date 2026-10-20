# Releasing

Orbit is published to npm as `@restless-dreams/orbit` from
github.com/restless-dreams/orbit. Releases are made by hand: nothing
publishes on a merge, and a maintainer sets the version and publishes when a
release is ready. Release notes are posts on Orbit's website,
https://orbit.hyuchia.com, not a file in the repository. The package is
ESM-only; Node 20.19+ and 22.12+ can also `require()` it.

## One-time setup

- Create the public repository github.com/restless-dreams/orbit. `package.json`
  (`repository`, `homepage`, `bugs`), the docs and `llms.txt` already point
  at it.
- Create the `restless-dreams` organization on npmjs.com (free for public
  packages), so the `@restless-dreams` scope is yours, with the account you
  publish from as a member (with two-factor authentication on).
- Configure private vulnerability reporting or publish a security contact.

## Choosing the version

Versions follow semantic versioning, starting at 0.1.0. While Orbit is 0.x
and still changing, a patch fixes and a minor adds or changes, even
something maps, options or code relied on. From 1.0.0 on, a patch fixes, a
minor adds, and a major breaks something people relied on.

## Cutting a release

On an up-to-date checkout of `main`:

1. Set the version: `npm version minor --no-git-tag-version` (or `patch`,
   and `major` from 1.0.0 on).
2. Keep the maps this release writes, for every later one to be tested
   against: `bun scripts/release-fixtures.ts --version 0.2.0` (with the
   version you set) writes `tests/fixtures/releases/0.2.0/`, which should be
   the same as `next/`. A released version's folder is never changed again.
3. Check the release by hand (below), then commit it ("Release 0.2.0", with
   the version you set) and merge it to `main` like any other change.
4. From `main` with that commit, sign in to npm once (`npm login`) and run
   `npm publish`. `prepack` builds the package first.
5. Tag the release and push the tag, for example
   `git tag v0.2.0 && git push origin v0.2.0`.
6. Write the release notes as a post on https://orbit.hyuchia.com: what's new
   and what changed, for the people who use Orbit, with what they need to do
   to upgrade. Update the website and its docs (README.md and docs/) for the
   new version too.

## Orbit's own copies

The release reaches people's maps only once the copies of Orbit that draw
them are updated. After a minor, or any change to the format (see "Changing
the format" in `docs/format.md`), update each one from the release:

- **The Restless Dreams platform** takes `@restless-dreams/orbit` from npm. A
  range like `^0.1.0` takes only 0.1.x, so a new minor needs its range bumped
  there, and the platform's checks run against it.
- **Orbit for Android** builds its map pages from a checkout of the release's
  GitHub commit (`web/`, and `app/src/main/assets/map/orbit.json` records it).
  Rebuild them with that commit, as its CONTRIBUTING.md says.
- **The TV receiver** at https://orbit.hyuchia.com/cast is built with the
  app's pages: publish it again once they're rebuilt. It serves every version
  of the app, so it must keep reading what older ones send.
- **The website** (orbit-site) runs a build of the release: build and publish
  the pages that should show it, and the docs.

Until they're updated, they read maps with the version they have: a new
attribute is kept but not used, and a map written for a newer format version
opens read-only.

## Checking a release by hand

```bash
bun install --frozen-lockfile
bun run verify          # lint, typecheck, tests, build, publint, Are the Types Wrong
bun run test:browser    # spin, zoom, navigation and screenshots in the Playwright container
bun run pack:lib
tar -tzf restless-dreams-orbit-*.tgz # dist/**, skills/**, llms.txt, llms-full.txt, README.md, LICENSE, package.json
```

Then install the tarball into a scratch project and run the smoke test (CI
does the same on Node 20, 22 and 24):

```bash
mkdir -p /tmp/orbit-smoke && cp scripts/smoke-test.mjs /tmp/orbit-smoke/
cd /tmp/orbit-smoke
npm init -y > /dev/null && npm pkg set type=module
npm install "$OLDPWD"/restless-dreams-orbit-*.tgz react react-dom marked
node smoke-test.mjs
```

After a release, install the published package in a clean project and run the
smoke test again (`npm install @restless-dreams/orbit react react-dom marked` instead of the
tarball).
