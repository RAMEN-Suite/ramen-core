import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import ts from 'typescript';

interface CodeEntry {
  readonly code: string;
  readonly meaning: string;
  readonly group: string;
}

interface Table {
  readonly marker: string;
  readonly entries: readonly CodeEntry[];
}

function resource(path: string): string {
  return fileURLToPath(new URL(`../${path}`, import.meta.url));
}

function enumEntries(path: string, name: string): readonly CodeEntry[] {
  const source: ts.SourceFile = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const declaration: ts.EnumDeclaration | undefined = source.statements.find(
    (statement: ts.Statement): statement is ts.EnumDeclaration => ts.isEnumDeclaration(statement) && statement.name.text === name,
  );
  if (!declaration) throw new Error(`Diagnostic enum '${name}' not found.`);

  let group: string = '';

  return declaration.members.map((member: ts.EnumMember): CodeEntry => {
    const comment: ts.JSDoc | undefined = ts
      .getJSDocCommentsAndTags(member)
      .find((item: ts.JSDoc | ts.JSDocTag): item is ts.JSDoc => ts.isJSDoc(item));
    const meaning: string | undefined = typeof comment?.comment === 'string' ? comment.comment.trim() : undefined;
    const category: ts.JSDocTag | undefined = comment?.tags?.find((tag: ts.JSDocTag): boolean => tag.tagName.text === 'group');
    if (typeof category?.comment === 'string') group = category.comment.trim();

    const initializer: ts.Expression | undefined = member.initializer;
    if (!initializer || !ts.isStringLiteral(initializer) || !meaning) {
      throw new Error(`Diagnostic '${member.name.getText(source)}' needs a string code and JSDoc meaning.`);
    }

    return { code: initializer.text, meaning, group };
  });
}

function table(entries: readonly CodeEntry[]): string {
  if (entries.length === 0) throw new Error('A diagnostic table cannot be empty.');

  const rows: readonly string[] = entries.map((entry: CodeEntry): string => `| \`${entry.code}\` | ${entry.meaning} |`);

  return ['| Code | Meaning |', '| --- | --- |', ...rows].join('\n');
}

function replaceTable(document: string, section: Table): string {
  const start: string = `<!-- diagnostics:${section.marker}:start -->`;
  const end: string = `<!-- diagnostics:${section.marker}:end -->`;
  const first: number = document.indexOf(start);
  const last: number = document.indexOf(end);

  if (first < 0 || last < first || document.includes(start, first + 1)) {
    throw new Error(`Expected one diagnostic table marked '${section.marker}'.`);
  }

  const prefix: string = document.slice(0, first + start.length);
  const suffix: string = document.slice(last);
  return `${prefix}\n\n${table(section.entries)}\n\n${suffix}`;
}

async function updateDocument(path: string, tables: readonly Table[], check: boolean): Promise<boolean> {
  const current: string = readFileSync(path, 'utf8');
  const updated: string = tables.reduce((document: string, section: Table): string => replaceTable(document, section), current);
  const options: prettier.Options | null = await prettier.resolveConfig(path);
  const formatted: string = await prettier.format(updated, { ...options, filepath: path });

  if (formatted === current) return false;
  if (check) return true;

  writeFileSync(path, formatted);
  return true;
}

async function main(): Promise<void> {
  const check: boolean = process.argv.includes('--check');

  const rmf: readonly CodeEntry[] = enumEntries(resource('src/model/validation/Codes.ts'), 'VALIDATION_ERROR');
  const ramenModel: readonly CodeEntry[] = enumEntries(resource('src/ramen/annotations/Rules.ts'), 'RAMEN_VALIDATION_ERROR');
  const ramenData: readonly CodeEntry[] = enumEntries(resource('src/ramen/data/InstanceValidator.ts'), 'RAMEN_INSTANCE_ERROR');
  const rmfTables: readonly Table[] = [
    { marker: 'structure', entries: rmf.filter((entry: CodeEntry): boolean => entry.group === 'Structure and references') },
    { marker: 'nodes', entries: rmf.filter((entry: CodeEntry): boolean => entry.group === 'Nodes, properties and data types') },
    { marker: 'relations', entries: rmf.filter((entry: CodeEntry): boolean => entry.group === 'Relationships and constraints') },
    { marker: 'data', entries: rmf.filter((entry: CodeEntry): boolean => entry.group === 'Recorded-data codes') },
  ];

  if (rmfTables.reduce((count: number, section: Table): number => count + section.entries.length, 0) !== rmf.length) {
    throw new Error('Every RMF diagnostic needs a known @group.');
  }

  const rmfChanged: boolean = await updateDocument(resource('docs/rmf/diagnostics.md'), rmfTables, check);
  const ramenChanged: boolean = await updateDocument(
    resource('docs/ramen/diagnostics.md'),
    [
      { marker: 'model', entries: ramenModel },
      { marker: 'data', entries: ramenData },
    ],
    check,
  );

  if (check && (rmfChanged || ramenChanged)) {
    throw new Error('Diagnostic tables are outdated. Run npm run docs:diagnostics.');
  }
}

void main().catch((error: unknown): void => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
