import { compileSchema, type JsonSchema, type SchemaNode } from 'json-schema-library';
import { SchemaFindings } from './SchemaFindings.js';
import type { Diagnostic, DiagnosticPath } from './Diagnostics.js';

interface DocumentSnapshot {
  readonly schema: SchemaNode;
  readonly value: Record<string, unknown>;
}

interface DocumentParts {
  readonly header: SchemaNode;
  readonly collections: ReadonlyMap<string, SchemaNode>;
}

/** @internal Reuses structural checks of unchanged declarations within one editable workspace. */
export class DocumentSchemaCache {
  private readonly snapshots: Map<string, DocumentSnapshot> = new Map<string, DocumentSnapshot>();
  private readonly parts: WeakMap<SchemaNode, DocumentParts> = new WeakMap<SchemaNode, DocumentParts>();

  public retain(inputs: readonly unknown[]): void {
    const ids: ReadonlySet<unknown> = new Set<unknown>(
      inputs.filter(isRecord).map((input: Record<string, unknown>): unknown => input['id']),
    );
    for (const id of this.snapshots.keys()) {
      if (!ids.has(id)) this.snapshots.delete(id);
    }
  }

  public validate(schema: SchemaNode, input: unknown, code: string, path: DiagnosticPath): readonly Diagnostic[] {
    if (!isRecord(input) || typeof input['id'] !== 'string') return SchemaFindings.validate(schema, input, code, path);
    const id: string = input['id'];
    const previous: DocumentSnapshot | undefined = this.snapshots.get(id);
    const parts: DocumentParts = this.partition(schema);
    const reusable: boolean = previous?.schema === schema && this.validateChanges(parts, input, previous.value);
    const findings: readonly Diagnostic[] = reusable ? [] : SchemaFindings.validate(schema, input, code, path);

    if (findings.length === 0) this.snapshots.set(id, { schema, value: structuredClone(input) });
    return findings;
  }

  private partition(schema: SchemaNode): DocumentParts {
    const existing: DocumentParts | undefined = this.parts.get(schema);
    if (existing) return existing;
    const properties: Record<string, JsonSchema> = {};
    const collections: Map<string, SchemaNode> = new Map<string, SchemaNode>();

    for (const [name, property] of Object.entries(schema.properties ?? {})) {
      const items: SchemaNode | undefined = property.items;
      if (items) collections.set(name, items);
      properties[name] = items ? { ...property.schema, items: true } : property.schema;
    }

    const header: SchemaNode = compileSchema({ ...schema.schema, properties });
    const parts: DocumentParts = { header, collections };
    this.parts.set(schema, parts);
    return parts;
  }

  private validateChanges(parts: DocumentParts, input: Record<string, unknown>, previous: Record<string, unknown>): boolean {
    if (!parts.header.validate(input).valid) return false;

    for (const [name, schema] of parts.collections) {
      const items: unknown = input[name];
      const earlier: unknown = previous[name];
      if (!Array.isArray(items) || !Array.isArray(earlier)) return false;

      const declarations: ReadonlyMap<string, unknown> = new Map<string, unknown>(
        earlier.filter(hasIdentifier).map((item: Record<string, unknown> & { id: string }): [string, unknown] => [item.id, item]),
      );
      const valid: boolean = items.every((item: unknown, index: number): boolean => {
        const previousItem: unknown = hasIdentifier(item) ? declarations.get(item.id) : earlier[index];
        return (index < earlier.length && sameValue(item, previousItem)) || schema.validate(item ?? null).valid;
      });
      if (!valid) return false;
    }
    return true;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasIdentifier(value: unknown): value is Record<string, unknown> & { id: string } {
  return isRecord(value) && typeof value['id'] === 'string';
}

function sameValue(value: unknown, previous: unknown, visited: WeakMap<object, object> = new WeakMap<object, object>()): boolean {
  if (Object.is(value, previous)) return true;
  if (value === null || previous === null || typeof value !== 'object' || typeof previous !== 'object') return false;
  if (!sameStructure(value, previous)) return false;
  if (visited.has(value)) return visited.get(value) === previous;
  visited.set(value, previous);

  const keys: readonly string[] = Object.keys(value);
  if (keys.length !== Object.keys(previous).length) return false;
  const current: Record<string, unknown> = value as Record<string, unknown>;
  const earlier: Record<string, unknown> = previous as Record<string, unknown>;
  return keys.every((key: string): boolean => Object.hasOwn(earlier, key) && sameValue(current[key], earlier[key], visited));
}

function sameStructure(value: object, previous: object): boolean {
  if (Array.isArray(value) !== Array.isArray(previous)) return false;
  if (Array.isArray(value) && Array.isArray(previous) && value.length !== previous.length) return false;

  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.getPrototypeOf(previous)) return false;
  return prototype === Object.prototype || prototype === Array.prototype || prototype === null;
}
