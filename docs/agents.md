# Coding agents

Orbit is built so coding agents (Codex, Claude Code, Kimi Code, Cursor, GitHub Copilot and others) can use it correctly on the first try: the whole format and API are in files the package ships, problems come with the fix, and maps can be checked without a browser.

## Give your agent the docs

- **`llms.txt`** is an index of the docs, and **`llms-full.txt`** is all of them in one file: the format, the API, recipes for each framework, theming and accessibility. Both ship in the package (`node_modules/@restless-dreams/orbit/llms-full.txt`, matching the installed version) and online for the latest release at `https://cdn.jsdelivr.net/npm/@restless-dreams/orbit/llms.txt` and `https://cdn.jsdelivr.net/npm/@restless-dreams/orbit/llms-full.txt`.
- Tell your agent about them in your project's `AGENTS.md`, which Codex, Kimi Code and most other agents read. Claude Code reads `CLAUDE.md`, where a line with `@AGENTS.md` brings in the same file.

```markdown
## Mind maps

This project draws mind maps with Orbit (@restless-dreams/orbit). Before
writing a map or code that uses it, read
node_modules/@restless-dreams/orbit/llms-full.txt. Check every map with
`npx @restless-dreams/orbit validate --json <file>` and fix every diagnostic
it lists.
```

## Install the skill

The package includes an agent skill in `skills/orbit`, in the [Agent Skills](https://agentskills.io) format that Codex, Claude Code, Kimi Code, Cursor, GitHub Copilot and other agents read: a `SKILL.md` with instructions they load on their own when a task involves mind maps, and the guides to the format, recipes, theming, extending, editing, pictures and videos, and languages next to it.

The [skills CLI](https://github.com/vercel-labs/skills) puts it where each agent in your project looks for skills:

```bash
npx skills add restless-dreams/orbit
# From the installed package, so the skill matches its version:
npx skills add ./node_modules/@restless-dreams/orbit
# For particular agents (codex, claude-code, kimi-code-cli, cursor, github-copilot…), or with -g for all your projects:
npx skills add ./node_modules/@restless-dreams/orbit -a codex -a claude-code -a kimi-code-cli
```

Or copy the folder by hand, to where your agent looks:

| Agent | In a project | For all your projects |
| --- | --- | --- |
| Codex, Kimi Code | `.agents/skills/orbit` | `~/.agents/skills/orbit` |
| Claude Code | `.claude/skills/orbit` | `~/.claude/skills/orbit` |
| Cursor, GitHub Copilot | `.agents/skills/orbit` | their own folders (`npx skills add -g` knows them) |

```bash
mkdir -p .agents/skills && cp -r node_modules/@restless-dreams/orbit/skills/orbit .agents/skills/
mkdir -p .claude/skills && cp -r node_modules/@restless-dreams/orbit/skills/orbit .claude/skills/
```

Agents use the skill when a task calls for it, or when you ask for it by name: `$orbit` in Codex, `/orbit` in Claude Code, `/skill:orbit` in Kimi Code.

## What agents can rely on

- **One way to do each thing.** `createOrbitMap(element, markdown, options)` for any page, `<orbit-map>` without a build step, `OrbitMindMap` from `@restless-dreams/orbit/react`, `@restless-dreams/orbit/marked` for markdown pipelines and `renderToSVGString` without a browser.
- **Typed options.** Every option is in the type declarations, and TypeScript rejects one that doesn't exist (plain JavaScript ignores it). A few are spelled their own way where they're set: the frontmatter's `view` is `viewMode` in code and `view-mode` on `<orbit-map>`, and its `animation`, `speed` and `title` are `orbitAnimation`, `orbitSpeed` and `ariaLabel` in code.
- **A starting point.** `npx @restless-dreams/orbit example > map.md` writes a map that shows the main features; `--yaml` writes it as YAML.
- **Problems with the fix.** Parsing is forgiving, and every problem is reported with what to do about it, and with its line wherever it has one: `Unknown frontmatter key "rings" (ignored). Did you mean "showRings"?`, `Unknown theme "dark". Themes: paper, night, … Did you mean "night"?`, `view must be "focus" or "all" (the overview), got "overview".`
- **Checks without a browser.**

```bash
npx @restless-dreams/orbit validate --json map.md
```

```json
{
  "valid": false,
  "flavor": "markdown",
  "root": "Product roadmap",
  "nodes": 22,
  "depth": 3,
  "diagnostics": [
    {
      "code": "unknown-link-target",
      "message": "\"Offline sync\" links to #search-indx, but no node has that id. Did you mean #search-index?",
      "line": 30,
      "severity": "warning"
    }
  ]
}
```

  The command exits with 1 while the map has a problem: fix it and validate again until `valid` is true. Add `--tree` to see the map as Orbit reads it, a node a line with its `#id`: what became a node and what stayed in a note, and the ids that `#id` links and `--focus` take. A few diagnostics only note something and don't make a map invalid: an attribute Orbit doesn't know, kept as one of your own (`unknown-attribute`: often a typo, so read its "Did you mean"), a root Orbit made up for several top-level nodes (`synthetic-root`), a caption with nothing to caption, and an older version of the format, upgraded. `validate` doesn't know what your code registers: it reports a theme of your own as unknown (`--loose` accepts that), and the attributes your node types read as ones it doesn't know, which only notes them. In code, `parseOrbit(source).diagnostics` holds the same list, and `{ strict: true }` throws on the first problem that makes a map invalid.
- **A page to review it.** `npx @restless-dreams/orbit export --html map.md --out map.html` makes one web page with Orbit, the map and its pictures inside. Send it to someone, or to the user's phone, and it opens in any browser, offline, to explore the map or present it.
- **A picture of the result.** `npx @restless-dreams/orbit render map.md --view all --out map.svg` draws the whole map as a standalone SVG. Without `--view all` it draws the map as it opens, centered on the root, where the levels below the root's children have no labels. Open the SVG, or turn it into a PNG with any converter, to look at it.
- **Messages for the usual setup mistakes:** drawing into an element that isn't there throws (`Orbit needs an element to draw the map in, but got null…`), and the console says when the container has no height (`The map has no height, so nothing shows…`) and when a `theme` option, the frontmatter or `<orbit-map theme>` names a theme that doesn't exist.

## Asking for a map

Agents do well with the map's content and where it goes. For example:

- "Turn the outline in NOTES.md into an orbit-md map in docs/roadmap.md and add it to the docs page with `<orbit-map>`. Check it with `orbit validate`."
- "Show our product areas as an Orbit map on the dashboard, in the cosmos theme, with each team's status."
- "Generate a YAML map for Orbit from `teams.json` at build time and render it to SVG for the README."
