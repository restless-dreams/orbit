import { describe, it } from 'bun:test';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import orbit from '../scripts/eslint-style.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser } });

ruleTester.run('arrow-functions', orbit.rules['arrow-functions'], {
  valid: [
    'const add = (a: number, b: number): number => a + b;',
    'function* walk() {\n  yield 1;\n}',
    'function pick(value: string): string;\nfunction pick(value: number): number;\nfunction pick(value: string | number) {\n  return value;\n}',
    "function check(value: unknown): asserts value is string {\n  if (typeof value !== 'string') {\n    throw new Error('Not a string');\n  }\n}",
    'function onClick(this: HTMLElement) {\n  return this.id;\n}',
    "element.addEventListener('click', function () {\n  this.remove();\n});",
    'function count() {\n  return arguments.length;\n}',
    'class Clock {\n  tick() {\n    return 1;\n  }\n}',
    'const clock = {\n  tick() {\n    return 1;\n  },\n};',
    'type Later = typeof later;\nconst later = () => 1;',
  ],
  invalid: [
    {
      code: 'export function interpolate(from: number, to: number, progress: number): number {\n  return from + (to - from) * progress;\n}',
      output: 'export const interpolate = (from: number, to: number, progress: number): number => {\n  return from + (to - from) * progress;\n};',
      errors: [{ messageId: 'declaration' }],
    },
    {
      code: 'async function load<T>(url: string): Promise<T> {\n  return (await fetch(url)).json();\n}',
      output: 'const load = async <T,>(url: string): Promise<T> => {\n  return (await fetch(url)).json();\n};',
      filename: 'example.tsx',
      languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
      errors: [{ messageId: 'declaration' }],
    },
    {
      code: 'items.map(function (item) {\n  return item * 2;\n});',
      output: 'items.map((item) => {\n  return item * 2;\n});',
      errors: [{ messageId: 'expression' }],
    },
    {
      code: 'export function main() {\n  return helper();\n}\n\nfunction helper() {\n  return 2;\n}',
      output: 'export const main = () => {\n  return helper();\n};\n\nconst helper = () => {\n  return 2;\n};',
      errors: [{ messageId: 'declaration' }, { messageId: 'declaration' }],
    },
    {
      code: 'const value = compute();\n\nfunction compute() {\n  return 1;\n}',
      output: null,
      errors: [{ messageId: 'usedBeforeDefinition' }],
    },
  ],
});

ruleTester.run('blank-lines-around-blocks', orbit.rules['blank-lines-around-blocks'], {
  valid: [
    'const run = () => {\n  if (ready) {\n    start();\n  }\n};',
    'const total = 1;\nconst count = 2;',
    "const options = {\n  theme: 'night',\n};\nconst map = render(options);",
    "interface Header { kind: 'header'; level: number }\ninterface Note { kind: 'note'; text: string }",
  ],
  invalid: [
    {
      code: [
        'const tick = (now: number): void => {',
        '  let changed = this.paintRequested;',
        '  for (const task of Array.from(this.tasks)) {',
        "    let result: boolean | 'hold';",
        '    try {',
        '      result = task(now);',
        '    } catch (error) {',
        '      // A task that threw is done: the rest of the loop carries on.',
        "      console.error('[orbit] An animation task threw:', error);",
        '      result = false;',
        '    }',
        '    if (result === false) {',
        '      this.tasks.delete(task);',
        '    }',
        "    changed ||= result !== 'hold';",
        '  }',
        '  this.paintRequested = false;',
        '  if (changed) {',
        '    this.paint();',
        '  }',
        '  if (this.tasks.size > 0) {',
        '    this.frameHandle = this.schedule(this.tick);',
        '  } else {',
        '    this.frameHandle = null;',
        '  }',
        '};',
      ].join('\n'),
      output: [
        'const tick = (now: number): void => {',
        '  let changed = this.paintRequested;',
        '',
        '  for (const task of Array.from(this.tasks)) {',
        "    let result: boolean | 'hold';",
        '',
        '    try {',
        '      result = task(now);',
        '    } catch (error) {',
        '      // A task that threw is done: the rest of the loop carries on.',
        "      console.error('[orbit] An animation task threw:', error);",
        '      result = false;',
        '    }',
        '',
        '    if (result === false) {',
        '      this.tasks.delete(task);',
        '    }',
        '',
        "    changed ||= result !== 'hold';",
        '  }',
        '',
        '  this.paintRequested = false;',
        '',
        '  if (changed) {',
        '    this.paint();',
        '  }',
        '',
        '  if (this.tasks.size > 0) {',
        '    this.frameHandle = this.schedule(this.tick);',
        '  } else {',
        '    this.frameHandle = null;',
        '  }',
        '};',
      ].join('\n'),
      errors: 7,
    },
    {
      code: "const unsubscribe = map.on('edit', () => {\n  save();\n});\nconst total = 3;",
      output: "const unsubscribe = map.on('edit', () => {\n  save();\n});\n\nconst total = 3;",
      errors: [{ messageId: 'after' }],
    },
    {
      code: 'if (ready) { start(); }\nstop();',
      output: 'if (ready) { start(); }\n\nstop();',
      errors: [{ messageId: 'after' }],
    },
    {
      code: 'start();\n// Explain the loop.\nfor (const item of items) {\n  use(item);\n}',
      output: 'start();\n\n// Explain the loop.\nfor (const item of items) {\n  use(item);\n}',
      errors: [{ messageId: 'before' }],
    },
  ],
});

ruleTester.run('blank-lines-around-documented-members', orbit.rules['blank-lines-around-documented-members'], {
  valid: [
    'interface Size {\n  width: number;\n  height: number;\n}',
    'interface Size {\n  /** Across. */\n  width: number;\n}',
    'const size = { /** Across. */ width: 1, height: 2 };',
  ],
  invalid: [
    {
      code: [
        'export interface SceneOptions {',
        '  viewport: Viewport;',
        "  /** The parts of the viewport the page's own controls cover: views are fitted into the rest. */",
        '  insets?: Insets;',
        '  colors: Map<string, string>;',
        '  maxDepth?: number;',
        "  /** Keep a place in the orbit for a new idea, after the sun's children (or at `index`). Focus scenes only. */",
        '  addSlot?: { index?: number };',
        '  /**',
        "   * One of the sun's children being dragged to another place among them: it's",
        '   * laid out at `index` among the others, so they make room for it there.',
        '   * Focus scenes only.',
        '   */',
        '  reorder?: { id: string; index: number };',
        '}',
      ].join('\n'),
      output: [
        'export interface SceneOptions {',
        '  viewport: Viewport;',
        '',
        "  /** The parts of the viewport the page's own controls cover: views are fitted into the rest. */",
        '  insets?: Insets;',
        '',
        '  colors: Map<string, string>;',
        '  maxDepth?: number;',
        '',
        "  /** Keep a place in the orbit for a new idea, after the sun's children (or at `index`). Focus scenes only. */",
        '  addSlot?: { index?: number };',
        '',
        '  /**',
        "   * One of the sun's children being dragged to another place among them: it's",
        '   * laid out at `index` among the others, so they make room for it there.',
        '   * Focus scenes only.',
        '   */',
        '  reorder?: { id: string; index: number };',
        '}',
      ].join('\n'),
      errors: 5,
    },
    {
      code: 'const browser = {\n  /** Mixes colors. */\n  mixesColors: true,\n  /** Moves overlays. */\n  translates: false,\n};',
      output: 'const browser = {\n  /** Mixes colors. */\n  mixesColors: true,\n\n  /** Moves overlays. */\n  translates: false,\n};',
      errors: [{ messageId: 'after' }, { messageId: 'before' }],
    },
  ],
});
