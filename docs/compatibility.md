# Compatibility

What Orbit keeps working from one version to the next, what may change, and how a change is announced.

## Versions

Orbit follows [semantic versioning](https://semver.org).

- **While it's 0.x,** as now, a patch fixes, and a minor adds or changes, even something maps, options or code relied on. A change to something on the public surface below comes with the release's notes, and keeps working through the next minor wherever it can, deprecated.
- **From 1.0.0 on,** a patch fixes, a minor adds, and only a major removes or changes something people relied on.

Each release is tagged `v<version>` on GitHub, and its notes are a post on [orbit.hyuchia.com](https://orbit.hyuchia.com), linked from the GitHub release. Orbit 0.3.0 was never published: npm and GitHub go from 0.2.0 to 0.4.0.

## The format

Maps have their own version, `schemaVersion`, apart from the package's ([Versions](format.md#versions)). Every version of Orbit reads the maps the earlier ones wrote, and writes back what it doesn't read as it was. A map written for a newer format than a version knows reads with an error, so an app can open it without editing it. [Changing the format](format.md#changing-the-format) says what each kind of change needs.

## The public surface

The version rules cover:

- **The package:** what `@restless-dreams/orbit`, `@restless-dreams/orbit/react` and `@restless-dreams/orbit/marked` export, and their types.
- **Maps on a page:**
  - the renderer's options, with their names, defaults and units;
  - its methods;
  - its events, as `on()` names them, their DOM events (`orbit-*`) and their payloads;
  - the `on…` callbacks;
  - `<orbit-map>`'s attributes and methods.
- **Styles:**
  - the `--orbit-*` custom properties ([Theming](theming.md#custom-properties)), the print layout's `--orbit-print-*` included;
  - the classes and attributes [Extending](extending.md) documents for styling: `.orbit-node`, `.orbit-node__shade`, `.orbit-label`, and `data-orbit-type`, `data-orbit-status` and `data-orbit-tags`;
  - `data-orbit-node-id` on each node's element: the node's id, and `--orbit-node-color` there: the color its planet is drawn with.
- **The command line:** its commands, flags and exit codes, and the shape of its `--json` output.
- **Codes:** diagnostic codes ([Checking a map](format.md#checking-a-map)), and the warnings maps from other apps bring ([Maps from other apps](import-export.md)).
- **Map tools:** their names and inputs. Their descriptions and the words of their results are tuned with real models and may change in any version.

Tests hold that surface to what's documented:
- [`docs/api`](api/README.md) is what TypeDoc writes from the types, and a test fails while it's stale: a change to the package's exports or types shows in a merge request's diff there;
- the guide is checked against the options, methods, events, callbacks and `<orbit-map>`'s attributes;
- each event is checked reaching `on()`, its DOM event and its callback with the payload its type gives;
- the React wrapper is checked to take every option.

Anything else may change in any version:
- modules the package doesn't export (`dist/chunk-*` included);
- classes, attributes and elements not listed above, and the structure of the map's DOM;
- custom properties that start `--_orbit-`.

## Deprecations

A name or shape that changes:
- keeps working through at least the next minor;
- is marked `@deprecated` in its type, with what to use instead, so editors strike it through;
- warns once on the console the first time a map uses it.

Deprecated names go no sooner than 1.0.

## Names that changed in 0.4.0

The old names keep working until 1.0, deprecated.

| Old | New |
| --- | --- |
| `renderOrbitMarkdownBlocks()` | `hydrateOrbitBlocks()`, from the package's root as from `/marked` |
| `isOrbitThemePreset()` | `isThemePreset()` |
| `RendererOptions`, `ViewMode` | `OrbitRendererOptions`, `OrbitViewMode` |
| `ParseOptions`, `ParseYamlOptions` | `OrbitParseOptions` |
| `SerializeOptions` | `OrbitSerializeOptions` |
| `RenderToSVGOptions` | `OrbitSVGOptions` |
| `CreateOrbitMapOptions` | `OrbitMapOptions` |
| `AutoRenderOptions` | `OrbitAutoRenderOptions` |
| `MaterialThemeOptions` | `OrbitMaterialThemeOptions` |
| `ParsedOrbitDocument` | `OrbitParsedDocument` |
| `MapTools`, `MapToolsOptions`, `MapToolResult`, `MapToolDefinition`, `MapToolFormats`, `MapToolName`, `MapToolProvider`, `MapToolProperty`, `MapToolSchema` | the same names with `Orbit` before them: `OrbitMapTools`… |
| the `viewMode`, `orbitAnimation` and `orbitSpeed` options (the renderer's, `<OrbitMindMap>`'s props, and `viewMode` in `renderToSVGString`, `renderPrintLayout` and `exportWebPage`) | `view`, `animation` and `speed`, as the document writes them |
| a parsed document's `options.viewMode`, `.orbitAnimation` and `.orbitSpeed` | `options.view`, `.animation` and `.speed`; the old names still read, and options made by hand with them are read as the new ones |
| `<orbit-map view-mode="…">`, `data-view-mode` | `view="…"`, `data-view` |
| the `mediaViewer` option | `showMediaViewer`, as `showRings` and the other switches are named |
| `spin-settle`'s `planet` | `node`, as every other event names it |

`ariaLabel` keeps its name. It's only ever the map's accessible name. A document's `title` can name its root, and an export's `title` is shown.

