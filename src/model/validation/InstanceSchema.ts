import { compileSchema, JsonError, SchemaNode } from 'json-schema-library';
import schema from '../../resources/schemas/model-instances.schema.json';
import { ModelInstanceGraph } from './InstanceTypes';

/** Canonical identifier of the supported model instance schema. */
export const MODEL_INSTANCES_SCHEMA_URI: string = 'https://ramen-schema.org/model/1.0.0/instances.schema.json';

/** Validates the closed JSON structure of a complete RAMEN model instance graph. */
export class InstanceSchemaValidator {
  private static readonly schemaNode: SchemaNode = compileSchema(schema);

  /** Returns the compiled, versioned instance JSON Schema node. */
  public static getSchemaNode(): SchemaNode {
    return this.schemaNode;
  }

  /** Reports whether an unknown value has the structure of a RAMEN model instance graph. */
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
