import { ModelSchemaValidator } from '../../model/validation/ModelSchema';
import { compileSchema, JsonError, SchemaNode } from 'json-schema-library';
import schema from '../../resources/schemas/ramen-project.schema.json';
import { RAMEN_PROJECT_SCHEMA_URI } from '../Document';

/** Validates the standalone RAMEN project model document format. */
export class RamenProjectSchemaValidator {
  private static readonly schemaNode: SchemaNode = compileSchema(schema, { remote: ModelSchemaValidator.getSchemaNode() });

  /** Returns the versioned RAMEN project JSON Schema node. */
  public static getSchemaNode(): SchemaNode {
    return this.schemaNode;
  }

  /** Reports whether an unknown value is a complete RAMEN project document. */
  public static isValid(input: unknown): boolean {
    return this.schemaNode.validate(input).valid;
  }

  /** Throws when a RAMEN project document does not match its own schema. */
  public static assertValid(input: unknown): void {
    const result: { readonly valid: boolean; readonly errors: JsonError[] } = this.schemaNode.validate(input);
    if (result.valid) return;
    const details: string = result.errors.map((error: JsonError): string => error.message).join('\n');
    throw new Error(`Invalid RAMEN project model (${RAMEN_PROJECT_SCHEMA_URI}): ${details}`);
  }
}
