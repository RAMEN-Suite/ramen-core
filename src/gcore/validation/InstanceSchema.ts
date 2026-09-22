import { compileSchema, JsonError, SchemaNode } from 'json-schema-library';
import schema from '../../resources/schemas/gcore-instance.schema.json';
import { ModelInstanceGraph } from './InstanceTypes';

/** Validates the closed JSON structure of a complete GCore instance graph. */
export class InstanceSchemaValidator {
  private static readonly schemaNode: SchemaNode = compileSchema(schema);

  /** Reports whether an unknown value has the structure of a GCore instance graph. */
  public static isValid(input: unknown): input is ModelInstanceGraph {
    return this.schemaNode.validate(input).valid;
  }

  /** Asserts instance graph structure and throws a formatted validation error on failure. */
  public static assertValid(input: unknown): asserts input is ModelInstanceGraph {
    const result: { readonly valid: boolean; readonly errors: JsonError[] } = this.schemaNode.validate(input);
    if (result.valid) return;
    const details: string = result.errors.map((error: JsonError): string => error.message).join('\n');
    throw new Error(`Instance schema validation failed: ${details}`);
  }
}
