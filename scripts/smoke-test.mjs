// Exercises the packed package the way consumers use it. Run from a project
// that installed the tarball plus the optional peers (react, react-dom,
// marked), at any versions their ranges allow: `node smoke-test.mjs`. With
// `--without-peers`, run from a project that installed the tarball alone:
// the core, the CLI and the web page work without them, and the React and
// marked entry points fail only for the peer they need.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const source = '# Root\n## Alpha\n## Beta';
const withoutPeers = process.argv.includes('--without-peers');
const PEERS = ['react', 'react-dom', 'marked'];

/** The version of a package this project installed, or undefined when it didn't. */
const versionOf = (name) => {
  const manifest = new URL(`./node_modules/${name}/package.json`, import.meta.url);
  return existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).version : undefined;
};

const peers = PEERS.filter((name) => versionOf(name) !== undefined);
assert.deepEqual(peers, withoutPeers ? [] : PEERS, withoutPeers ? 'the project has none of the optional peers' : 'the project has every optional peer');

const root = await import('@restless-dreams/orbit');
assert.equal(root.parseOrbit(source).root.children.length, 2, 'Orbit parses');
assert.equal(typeof root.OrbitSVGRenderer, 'function', 'Orbit exports the renderer');

if (withoutPeers) {
  // Each entry point that needs a peer says which, and nothing else is missing.
  for (const [entry, peer] of [['@restless-dreams/orbit/react', 'react'], ['@restless-dreams/orbit/marked', 'marked']]) {
    await assert.rejects(import(entry), (error) => error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes(`'${peer}'`), `${entry} fails for want of ${peer}`);
  }
} else {
  const react = await import('@restless-dreams/orbit/react');
  assert.ok(react.OrbitMindMap, '@restless-dreams/orbit/react exports OrbitMindMap');
  const reactEntry = readFileSync(fileURLToPath(import.meta.resolve('@restless-dreams/orbit/react')), 'utf8');
  assert.ok(reactEntry.startsWith('"use client";'), '@restless-dreams/orbit/react starts with "use client"');

  const marked = await import('@restless-dreams/orbit/marked');
  const html = await marked.renderOrbitMarkdown(`Intro\n\n\`\`\`orbit\n${source}\n\`\`\``);
  assert.match(html, /data-orbit=/, '@restless-dreams/orbit/marked renders a placeholder');
  const { marked: globalMarked } = await import('marked');
  const configured = await marked.configureMarked(globalMarked).parse(`\`\`\`orbit\n${source}\n\`\`\``);
  assert.match(configured, /data-orbit=/, 'configureMarked() teaches the global marked the fence');

  const reactServer = await import('react-dom/server');
  const { createElement } = await import('react');
  const serverMarkup = reactServer.renderToString(createElement(react.OrbitMindMap, { source }));
  assert.match(serverMarkup, /data-orbit-static[\s\S]*<svg/, 'server-rendered React shows a static map');
}

const packageRoot = fileURLToPath(new URL('.', import.meta.resolve('@restless-dreams/orbit/package.json')));
assert.match(readFileSync(`${packageRoot}llms-full.txt`, 'utf8'), /^# Orbit/, 'the package ships llms-full.txt');
assert.match(readFileSync(`${packageRoot}skills/orbit/SKILL.md`, 'utf8'), /^---\nname: orbit\n/, 'the package ships the agent skill');

const require = createRequire(import.meta.url);
assert.equal(require('@restless-dreams/orbit').parseOrbit(source).root.text, 'Root', 'require() loads the package');

const cli = execFileSync('npx', ['--no-install', 'orbit', 'validate', '-'], { input: source, encoding: 'utf8' });
assert.match(cli, /^OK: 3 nodes/, 'the CLI validates a document');

// Map tools change a document without a browser.
const tools = root.createMapTools(source);
assert.equal(tools.for('anthropic').length, 8, 'the map tools come in a provider\'s shape');
assert.ok(tools.run('add_nodes', { parent_id: 'alpha', outline: '- Gamma' }).ok, 'the map tools add a node');
assert.match(root.serializeOrbitMarkdown(tools.document), /Gamma/, 'the map tools change the document');

// Rendering to SVG needs no browser.
const svg = root.renderToSVGString(source, { theme: 'night' });
assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, 'renderToSVGString works in Node');
assert.match(svg, />Alpha</, 'the SVG has text labels');
assert.equal(execFileSync('npx', ['--no-install', 'orbit', '--version'], { encoding: 'utf8' }).trim(), versionOf('@restless-dreams/orbit'), 'the CLI says its version');
const rendered = execFileSync('npx', ['--no-install', 'orbit', 'render', '-'], { input: source, encoding: 'utf8' });
assert.match(rendered, /<svg[^>]+width="1200"/, 'the CLI renders a document to SVG');
const webPage = execFileSync('npx', ['--no-install', 'orbit', 'export', '--html', '-'], { input: source, encoding: 'utf8' });
assert.match(webPage, /^<!doctype html>[\s\S]*id="orbit-script"/, 'the CLI exports a web page with Orbit inside');

// Every import shown in the README and the skill's guides must resolve against the published package.
const packageFolder = new URL('./node_modules/@restless-dreams/orbit/', import.meta.url);
const references = new URL('skills/orbit/references/', packageFolder);
const guides = [new URL('README.md', packageFolder), ...readdirSync(references).map((name) => new URL(name, references))];
const documented = new Map();

for (const fence of guides.map((guide) => readFileSync(guide, 'utf8')).join('\n').matchAll(/```(?:ts|tsx|js|jsx)\n([\s\S]*?)```/g)) {
  for (const statement of fence[1].matchAll(/import\s*\{([^}]+)\}\s*from\s*'(@restless-dreams\/orbit[^']*)'/g)) {
    const names = statement[1].split(',').map((name) => name.trim()).filter((name) => name && !name.startsWith('type '));
    documented.set(statement[2], [...(documented.get(statement[2]) ?? []), ...names]);
  }
}

assert.ok(documented.size > 2, 'the guides show imports from every entry point');

for (const [specifier, names] of documented) {
  if (withoutPeers && /\/(react|marked)$/.test(specifier)) {
    continue;
  }

  const module = await import(specifier);

  for (const name of names) {
    assert.ok(name in module, `the docs import ${name} from ${specifier}, which does not export it`);
  }
}

const versions = withoutPeers ? 'without the optional peers' : `with ${PEERS.map((name) => `${name} ${versionOf(name)}`).join(', ')}`;
console.log(`Smoke test passed on Node ${process.version}, ${versions}`);
