<p align="center">
  <img src="docs/logo.svg" alt="Orbit logo" width="120">
</p>

# Orbit CLI

[![CI](https://github.com/acme/orbit-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/acme/orbit-cli/actions)
[![npm](https://img.shields.io/npm/v/orbit-cli.svg)](https://www.npmjs.com/package/orbit-cli)

> **Note**
> This project is in beta. Expect breaking changes.

A command-line tool for turning **markdown outlines** into mind maps. See the [docs][docs] or the [changelog](CHANGELOG.md).

<!-- markdownlint-disable MD033 -->

## Installation

```bash
# Install globally
npm install -g orbit-cli
# or with bun
bun add -g orbit-cli
```

## Usage

1. Write an outline in `map.md`.
2. Run `orbit render map.md --out map.svg`.
3. Open `map.svg` in a browser.

### Options

| Flag | Default | Description |
| --- | --- | --- |
| `--theme` | `paper` | Color theme |
| `--out` | stdout | Output file |

### Configuration

Create `.orbitrc`:

```json
{
  "theme": "night",
  "maxDepth": 3
}
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first.

---

## License

[MIT](LICENSE) © Acme Inc.

[docs]: https://acme.dev/orbit "Orbit documentation"
