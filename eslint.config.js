import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import orbit from './scripts/eslint-style.js'

// The house style ESLint has no settings for: see scripts/eslint-style.js.
const styleRules = {
  curly: ['error', 'all'],
  'orbit/arrow-functions': 'error',
  'orbit/blank-lines-around-blocks': 'error',
  'orbit/blank-lines-around-documented-members': 'error',
}

export default defineConfig([
  globalIgnores(['dist', '**/dist/**', 'node_modules', '**/node_modules/**', 'build', '**/build/**', '**/*.tsbuildinfo', '**/.claude/**']),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      orbit,
    },
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    rules: styleRules,
  },
  {
    files: ['**/*.{js,mjs}'],
    plugins: { orbit },
    rules: styleRules,
  },
  {
    files: ['src/react/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
  },
  {
    // Every browser test fails on a page error it didn't expect: its test comes from e2e/fixtures.ts.
    files: ['e2e/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{ name: '@playwright/test', importNames: ['test'], message: 'Import test from ./fixtures, which fails a test on a page error it didn\'t expect.' }],
      }],
    },
  },
])
