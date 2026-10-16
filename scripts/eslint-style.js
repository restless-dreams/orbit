// Orbit's own style rules, which ESLint's settings can't express. eslint.config.js
// turns them on, and `eslint --fix` applies all three.
//
// - arrow-functions: functions are arrow functions, unless they can't be.
// - blank-lines-around-blocks: a statement with a block has a blank line before
//   and after it, unless it starts or ends the block it's in.
// - blank-lines-around-documented-members: a member with a doc comment has a
//   blank line before its comment and after it, unless it's first or last.

const isDocComment = (comment) => comment.type === 'Block' && comment.value.startsWith('*');

const isComment = (token) => token.type === 'Line' || token.type === 'Block';

/**
 * The last thing on the line where a node ends: the node itself, or a
 * comma, semicolon or comment after it on the same line.
 */
const endOfLine = (sourceCode, node) => {
  let last = sourceCode.getLastToken(node);
  let after = sourceCode.getTokenAfter(last, { includeComments: true });

  while (after && after.loc.start.line === last.loc.end.line && (isComment(after) || after.value === ',' || after.value === ';')) {
    last = after;
    after = sourceCode.getTokenAfter(last, { includeComments: true });
  }

  return last;
};

/** Whether a blank line separates two tokens, with nothing but comments between them. */
const hasBlankLineBetween = (sourceCode, first, second) => {
  let previous = first;

  for (const token of sourceCode.getTokensBetween(first, second, { includeComments: true })) {
    if (token.loc.start.line - previous.loc.end.line > 1) {
      return true;
    }

    previous = token;
  }

  return second.loc.start.line - previous.loc.end.line > 1;
};

/**
 * Reports a missing blank line after `anchor`, the last thing on a line, and
 * fixes it by adding one there.
 */
const reportMissingBlankLine = (context, node, messageId, anchor, data) => {
  const following = context.sourceCode.getTokenAfter(anchor, { includeComments: true });

  context.report({
    node,
    messageId,
    data,
    fix: following && following.loc.start.line > anchor.loc.end.line ? (fixer) => fixer.insertTextAfter(anchor, '\n') : null,
  });
};

// arrow-functions

/** Node types a function's own `this` can't reach past. */
const thisBoundaries = new Set(['FunctionDeclaration', 'FunctionExpression', 'ClassBody']);

/** Whether a function needs to stay a function, and why. */
const reasonToKeep = (sourceCode, node, usesThis) => {
  if (node.generator) {
    return 'generator';
  }

  if (usesThis) {
    return 'this';
  }

  if (node.params[0]?.type === 'Identifier' && node.params[0].name === 'this') {
    return 'this';
  }

  if (node.returnType?.typeAnnotation.type === 'TSTypePredicate' && node.returnType.typeAnnotation.asserts) {
    return 'assertion';
  }

  const scope = sourceCode.getScope(node);
  const argumentsVariable = scope.block === node ? scope.set.get('arguments') : undefined;

  if (argumentsVariable && argumentsVariable.references.length > 0) {
    return 'arguments';
  }

  if (node.type === 'FunctionDeclaration' && node.id) {
    const [variable] = sourceCode.getDeclaredVariables(node);

    if (variable && variable.defs.length > 1) {
      return 'overloads';
    }
  }

  if (node.type === 'FunctionExpression' && node.id) {
    const variable = sourceCode.getDeclaredVariables(node).find((candidate) => candidate.name === node.id.name);

    if (variable && variable.references.length > 0) {
      return 'named';
    }
  }

  return null;
};

/** Whether an identifier is part of a type, such as `typeof name`, which never runs. */
const isInType = (identifier) => {
  for (let node = identifier.parent; node; node = node.parent) {
    if (node.type === 'TSTypeQuery' || node.type === 'TSTypeAnnotation' || node.type === 'TSTypeAliasDeclaration') {
      return true;
    }

    if (node.type.endsWith('Statement') || node.type.endsWith('Declaration')) {
      return false;
    }
  }

  return false;
};

/**
 * Whether code runs into a function before its definition: a reference to it
 * that comes first and runs in the same function (or module), rather than in
 * a function that's called later. A function written as a constant can't be
 * used before its line has run.
 */
const isUsedBeforeDefinition = (sourceCode, node) => {
  const [variable] = sourceCode.getDeclaredVariables(node);

  if (!variable) {
    return false;
  }

  const ownScope = variable.scope.variableScope;

  return variable.references.some((reference) => (
    reference.identifier.range[0] < node.range[0]
    && reference.identifier.parent?.type !== 'ExportSpecifier'
    && reference.from.variableScope === ownScope
    && !isInType(reference.identifier)
  ));
};

/** The type parameters of a function, written so they stay type parameters in a .tsx file. */
const typeParametersText = (context, node) => {
  if (!node.typeParameters) {
    return '';
  }

  const text = context.sourceCode.getText(node.typeParameters);
  const parameters = node.typeParameters.params;
  const isTsx = context.filename.endsWith('.tsx');

  if (isTsx && parameters.length === 1 && !parameters[0].constraint && !text.replace(/\s/g, '').endsWith(',>')) {
    return `${text.slice(0, -1)},>`;
  }

  return text;
};

/** The arrow function a function becomes: `async <T>(parameters): Result => { … }`. */
const arrowText = (context, node) => {
  const sourceCode = context.sourceCode;
  const openingParenthesis = sourceCode.getTokenAfter(node.typeParameters ?? node.id ?? sourceCode.getFirstToken(node, (token) => token.value === 'function'));
  const closingParenthesis = sourceCode.getTokenBefore(node.returnType ?? node.body);
  const parameters = sourceCode.text.slice(openingParenthesis.range[0], closingParenthesis.range[1]);
  const result = node.returnType ? sourceCode.getText(node.returnType) : '';

  return `${node.async ? 'async ' : ''}${typeParametersText(context, node)}${parameters}${result} => ${sourceCode.getText(node.body)}`;
};

/** Whether a function has comments in the words before its parameters, which the fix would drop. */
const hasCommentsInHeader = (sourceCode, node) => {
  const start = node.typeParameters?.range[0] ?? sourceCode.getTokenAfter(node.id ?? sourceCode.getFirstToken(node)).range[0];

  return sourceCode.getCommentsInside(node).some((comment) => comment.range[1] <= start);
};

/** Parents an arrow function can replace a function expression in without parentheses. */
const arrowSafeParents = new Set([
  'ArrayExpression',
  'AssignmentExpression',
  'AssignmentPattern',
  'CallExpression',
  'ExportDefaultDeclaration',
  'NewExpression',
  'Property',
  'PropertyDefinition',
  'ReturnStatement',
  'VariableDeclarator',
]);

const arrowFunctions = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: { description: 'Functions are arrow functions, unless they need to be functions.' },
    messages: {
      declaration: 'Write {{name}} as an arrow function: `const {{name}} = (…) => { … };`.',
      usedBeforeDefinition: '{{name}} runs before its definition. Move it above the code that uses it, then write it as an arrow function.',
      expression: 'Write this function as an arrow function.',
    },
    schema: [],
  },
  create: (context) => {
    const sourceCode = context.sourceCode;
    const scopes = [];
    const usingThis = new Set();

    const enter = (node) => {
      scopes.push(node);
    };

    const markThis = () => {
      const current = scopes.at(-1);

      if (current && current.type !== 'ClassBody') {
        usingThis.add(current);
      }
    };

    const leaveFunction = (node) => {
      scopes.pop();

      const isMethod = node.type === 'FunctionExpression' && (
        node.parent.type === 'MethodDefinition'
        || node.parent.type === 'TSAbstractMethodDefinition'
        || (node.parent.type === 'Property' && (node.parent.method || node.parent.kind !== 'init'))
      );

      if (isMethod || !node.body || reasonToKeep(sourceCode, node, usingThis.has(node))) {
        return;
      }

      if (node.type === 'FunctionDeclaration') {
        const name = node.id?.name ?? 'this function';

        if (!node.id || node.parent.type === 'ExportDefaultDeclaration') {
          context.report({ node, messageId: 'declaration', data: { name } });
          return;
        }

        if (isUsedBeforeDefinition(sourceCode, node)) {
          context.report({ node: node.id, messageId: 'usedBeforeDefinition', data: { name } });
          return;
        }

        context.report({
          node: node.id,
          messageId: 'declaration',
          data: { name },
          fix: hasCommentsInHeader(sourceCode, node) ? null : (fixer) => fixer.replaceText(node, `const ${name} = ${arrowText(context, node)};`),
        });

        return;
      }

      const fixable = arrowSafeParents.has(node.parent.type) && !hasCommentsInHeader(sourceCode, node);

      context.report({
        node,
        messageId: 'expression',
        fix: fixable ? (fixer) => fixer.replaceText(node, arrowText(context, node)) : null,
      });
    };

    return {
      FunctionDeclaration: enter,
      FunctionExpression: enter,
      ClassBody: enter,
      'ClassBody:exit': () => {
        scopes.pop();
      },
      'FunctionDeclaration:exit': leaveFunction,
      'FunctionExpression:exit': leaveFunction,
      ThisExpression: markThis,
      Super: markThis,
      MetaProperty: (node) => {
        if (node.meta.name === 'new') {
          markThis();
        }
      },
    };
  },
};

// blank-lines-around-blocks

/** Nodes whose closing brace ends a block: blocks and function bodies, switches, classes, interfaces, enums, modules and object types. */
const blockOwners = new Set([
  'BlockStatement',
  'ClassBody',
  'StaticBlock',
  'SwitchStatement',
  'TSEnumBody',
  'TSInterfaceBody',
  'TSModuleBlock',
  'TSTypeLiteral',
]);

/** Statements that are blocks even when they're written on one line. */
const controlStatements = new Set([
  'BlockStatement',
  'DoWhileStatement',
  'ForInStatement',
  'ForOfStatement',
  'ForStatement',
  'IfStatement',
  'LabeledStatement',
  'SwitchStatement',
  'TryStatement',
  'WhileStatement',
]);

/**
 * Whether a statement is a block: an `if`, a loop, a `switch` or a `try`, or
 * a statement on several lines whose last line starts with the brace that
 * closes a block. So a function, a class, an interface and a call with a
 * callback are blocks too, and an object or a call on several lines is not.
 */
const isBlock = (sourceCode, statement) => {
  if (controlStatements.has(statement.type)) {
    return true;
  }

  const lastLine = statement.loc.end.line;

  if (statement.loc.start.line === lastLine) {
    return false;
  }

  const index = sourceCode.getIndexFromLoc({ line: lastLine, column: sourceCode.lines[lastLine - 1].search(/\S/) });
  const firstOnLastLine = sourceCode.getTokenByRangeStart(index);

  if (!firstOnLastLine || firstOnLastLine.value !== '}') {
    return false;
  }

  const owner = sourceCode.getNodeByRangeIndex(index);

  return Boolean(owner) && blockOwners.has(owner.type);
};

const blankLinesAroundBlocks = {
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    docs: { description: 'A statement with a block has a blank line before and after it, unless it starts or ends the block it is in.' },
    messages: {
      before: 'Add a blank line before this block.',
      after: 'Add a blank line after this block.',
    },
    schema: [],
  },
  create: (context) => {
    const sourceCode = context.sourceCode;

    const checkStatements = (statements) => {
      for (let index = 1; index < statements.length; index += 1) {
        const previous = statements[index - 1];
        const next = statements[index];
        const previousIsBlock = isBlock(sourceCode, previous);

        if (!previousIsBlock && !isBlock(sourceCode, next)) {
          continue;
        }

        const anchor = endOfLine(sourceCode, previous);

        if (!hasBlankLineBetween(sourceCode, anchor, sourceCode.getFirstToken(next))) {
          reportMissingBlankLine(context, previousIsBlock ? previous : next, previousIsBlock ? 'after' : 'before', anchor);
        }
      }
    };

    return {
      Program: (node) => checkStatements(node.body),
      BlockStatement: (node) => checkStatements(node.body),
      StaticBlock: (node) => checkStatements(node.body),
      SwitchCase: (node) => checkStatements(node.consequent),
      TSModuleBlock: (node) => checkStatements(node.body),
    };
  },
};

// blank-lines-around-documented-members

/** The members of interfaces, type literals, classes, objects and enums. */
const memberLists = {
  TSInterfaceBody: (node) => node.body,
  TSTypeLiteral: (node) => node.members,
  ClassBody: (node) => node.body,
  ObjectExpression: (node) => node.properties,
  TSEnumBody: (node) => node.members,
};

const blankLinesAroundDocumentedMembers = {
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    docs: { description: 'A member with a doc comment has a blank line before its comment and after it, unless it is the first or last.' },
    messages: {
      before: 'Add a blank line before the doc comment of {{name}}.',
      after: 'Add a blank line after {{name}}, which has a doc comment.',
    },
    schema: [],
  },
  create: (context) => {
    const sourceCode = context.sourceCode;

    const memberName = (member) => {
      const key = member.key ?? member.id;

      return key ? `"${sourceCode.getText(key)}"` : 'this member';
    };

    const checkMembers = (container) => {
      const members = memberLists[container.type](container);

      if (container.loc.start.line === container.loc.end.line) {
        return;
      }

      members.forEach((member, index) => {
        const comments = sourceCode.getCommentsBefore(member);

        if (!comments.some(isDocComment)) {
          return;
        }

        const name = memberName(member);
        const previous = members[index - 1];
        const next = members[index + 1];

        if (previous) {
          const anchor = endOfLine(sourceCode, previous);
          const firstComment = comments.find((comment) => comment.range[0] > anchor.range[1]) ?? member;

          if (!hasBlankLineBetween(sourceCode, anchor, firstComment)) {
            reportMissingBlankLine(context, member, 'before', anchor, { name });
          }
        }

        if (next) {
          const anchor = endOfLine(sourceCode, member);
          const following = sourceCode.getTokenAfter(anchor, { includeComments: true });

          if (!hasBlankLineBetween(sourceCode, anchor, following)) {
            reportMissingBlankLine(context, member, 'after', anchor, { name });
          }
        }
      });
    };

    return Object.fromEntries(Object.keys(memberLists).map((type) => [type, checkMembers]));
  },
};

export default {
  meta: { name: 'orbit-style' },
  rules: {
    'arrow-functions': arrowFunctions,
    'blank-lines-around-blocks': blankLinesAroundBlocks,
    'blank-lines-around-documented-members': blankLinesAroundDocumentedMembers,
  },
};
