import type { Rule } from 'eslint';

declare const plugin: {
  meta: { name: string };
  rules: Record<'arrow-functions' | 'blank-lines-around-blocks' | 'blank-lines-around-documented-members', Rule.RuleModule>;
};

export default plugin;
