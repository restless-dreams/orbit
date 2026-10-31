import { join } from 'node:path';
import ts from 'typescript';

// What the source declares, as TypeScript reads it: for tests that keep the
// docs to the types, so a new option, event or method can't be left out.

const root = join(import.meta.dir, '../..');
let checker: ts.TypeChecker | undefined;
let program: ts.Program | undefined;

const types = (): { program: ts.Program; checker: ts.TypeChecker } => {
  if (!program || !checker) {
    const config = ts.getParsedCommandLineOfConfigFile(join(root, 'tsconfig.build.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
    const entries = ['src/index.ts', 'src/react/index.ts', 'src/marked/index.ts'].map((entry) => join(root, entry));
    program = ts.createProgram({ rootNames: entries, options: config?.options ?? {} });
    checker = program.getTypeChecker();
  }

  return { program, checker };
};

/** The declaration named `name` in `file` (from the repository's root): an interface, a type or a class. */
const declaration = (file: string, name: string): ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.ClassDeclaration => {
  const source = types().program.getSourceFile(join(root, file));
  const found = source?.statements.find((statement): statement is ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.ClassDeclaration =>
    (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name?.text === name);

  if (!found) {
    throw new Error(`${file} declares no ${name}`);
  }

  return found;
};

/** An old name kept until 1.0, which the docs name only as such, or a member that isn't part of the API. */
const leftOut = (symbol: ts.Symbol): boolean => symbol.getJsDocTags().some((tag) => tag.name === 'deprecated' || tag.name === 'internal');

/** The fields of the interface or type `name` in `file`, without the internal ones, nor the deprecated ones unless `deprecated`. */
export const fieldsOf = (file: string, name: string, { deprecated = false } = {}): string[] => {
  const { checker } = types();
  const type = checker.getTypeAtLocation(declaration(file, name).name!);
  const kept = (symbol: ts.Symbol): boolean => !leftOut(symbol) || (deprecated && !symbol.getJsDocTags().some((tag) => tag.name === 'internal'));
  return checker.getPropertiesOfType(type).filter(kept).map((symbol) => symbol.name).sort();
};

/**
 * The fields values of `property` hold, in the interface `name` in `file`:
 * the deprecated ones too, which they still carry, and which of them every
 * value has.
 */
export const valueFieldsOf = (file: string, name: string, property: string): { all: string[]; required: string[] } => {
  const { checker } = types();
  const found = declaration(file, name);
  const member = checker.getPropertyOfType(checker.getTypeAtLocation(found.name!), property);

  if (!member) {
    throw new Error(`${name} has no ${property}`);
  }

  const fields = checker.getPropertiesOfType(checker.getTypeOfSymbolAtLocation(member, found));
  const required = fields.filter((field) => !(field.flags & ts.SymbolFlags.Optional));
  return { all: fields.map((field) => field.name).sort(), required: required.map((field) => field.name).sort() };
};

/** The props the component `name` in `file` takes out of its first argument by name: `forwardRef(({ a, b: renamed, ...rest }) => …)` gives `a` and `b`. */
export const destructuredPropsOf = (file: string, name: string): string[] => {
  const source = types().program.getSourceFile(join(root, file));
  let names: string[] | null = null;

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer && ts.isCallExpression(node.initializer)) {
      const component = node.initializer.arguments[0];
      const props = component && (ts.isArrowFunction(component) || ts.isFunctionExpression(component)) ? component.parameters[0]?.name : undefined;

      if (props && ts.isObjectBindingPattern(props)) {
        names = props.elements.filter((element) => !element.dotDotDotToken).map((element) => (element.propertyName ?? element.name).getText(source));
      }
    }

    ts.forEachChild(node, visit);
  };

  if (source) {
    visit(source);
  }

  if (!names) {
    throw new Error(`${file} has no component ${name} that takes its props by name`);
  }

  return (names as string[]).sort();
};

/** The public methods of the class `name` in `file`, its static ones included, without the deprecated or internal ones. */
export const methodsOf = (file: string, name: string): string[] => {
  const { checker } = types();
  const found = declaration(file, name);
  const symbol = checker.getSymbolAtLocation(found.name!)!;

  const isPublicMethod = (member: ts.Symbol): boolean => {
    const memberDeclaration = member.valueDeclaration;
    return !!memberDeclaration
      && ts.isMethodDeclaration(memberDeclaration)
      && !(ts.getCombinedModifierFlags(memberDeclaration) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected))
      && !member.name.startsWith('#')
      && !leftOut(member);
  };

  const instance = checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol));
  const statics = checker.getPropertiesOfType(checker.getTypeOfSymbolAtLocation(symbol, found));
  return [...instance, ...statics].filter(isPublicMethod).map((member) => member.name).sort();
};
