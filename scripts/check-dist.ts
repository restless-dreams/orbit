// Imports the built package the way people will, after `bun run build`: every
// entry in package.json loads, exports exactly what scripts/exports.ts lists
// (none of them left undefined by a bundling mistake), and the command runs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_EXPORTS } from './exports';

const root = join(import.meta.dir, '..');

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  exports: Record<string, string | { default: string }>;
  bin: Record<string, string>;
};

const problems: string[] = [];

for (const [entry, expected] of Object.entries(PACKAGE_EXPORTS)) {
  const target = manifest.exports[entry];

  if (!target || typeof target === 'string') {
    problems.push(`${entry}: missing from package.json exports`);
    continue;
  }

  let module: Record<string, unknown>;

  try {
    module = await import(join(root, target.default));
  } catch (error) {
    problems.push(`${entry}: ${target.default} doesn't load: ${(error as Error).message}`);
    continue;
  }

  const actual = Object.keys(module).sort();
  const missing = expected.filter((name) => !actual.includes(name));
  const extra = actual.filter((name) => !expected.includes(name));
  const undefinedNames = expected.filter((name) => name in module && module[name] === undefined);

  if (missing.length > 0) {
    problems.push(`${entry}: missing ${missing.join(', ')}`);
  }

  if (extra.length > 0) {
    problems.push(`${entry}: exports more than listed: ${extra.join(', ')}`);
  }

  if (undefinedNames.length > 0) {
    problems.push(`${entry}: exports left undefined: ${undefinedNames.join(', ')}`);
  }
}

// The web page script loads into a page exportWebPage() makes with it.
const webPageScript = readFileSync(join(root, 'dist/web-page.js'), 'utf8');
const { exportWebPage } = (await import(join(root, 'dist/index.js'))) as { exportWebPage: (input: string, options: { script: string }) => string };

if (webPageScript.length < 10_000 || !exportWebPage('# Plan\n## Research', { script: webPageScript }).includes('id="orbit-script"')) {
  problems.push('dist/web-page.js: missing, or not taken in by exportWebPage()');
}

for (const [name, path] of Object.entries(manifest.bin)) {
  const result = Bun.spawnSync(['bun', join(root, path), 'validate', '-'], { stdin: new TextEncoder().encode('# Plan\n## Research\n') });
  const output = result.stdout.toString();

  if (result.exitCode !== 0 || !output.startsWith('OK:')) {
    problems.push(`${name}: \`${path} validate -\` exited ${result.exitCode}: ${output}${result.stderr.toString()}`);
  }
}

if (problems.length > 0) {
  console.error(`The built package has problems:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
  process.exit(1);
}

console.log(`The built package loads: ${Object.keys(PACKAGE_EXPORTS).length} entries and the command, as listed.`);
