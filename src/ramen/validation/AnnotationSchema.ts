import { compileSchema, JsonError, SchemaNode } from 'json-schema-library';
import schema from '../../resources/schemas/ramen-annotations.schema.json';

/** Canonical identifier of the schema for `Model.ext.ramen` annotation definitions. */
export const RAMEN_ANNOTATION_SCHEMA_URI: string = 'https://ramen-schema.org/ramen/1.0.0/annotations.schema.json';

/** Validates the object stored below `Model.ext.ramen`. */
export class RamenAnnotationSchemaValidator {
  private static readonly schemaNode: SchemaNode = compileSchema(schema);

  /** Returns the compiled, versioned RAMEN JSON Schema node. */
  public static getSchemaNode(): SchemaNode {
    return this.schemaNode;
  }

  /** Reports whether an unknown value conforms to the RAMEN extension schema. */
  public static isValid(input: unknown): boolean {
    return this.schemaNode.validate(input).valid;
  }

  /** Asserts RAMEN schema conformance and throws a formatted error on failure. */
  public static assertValid(input: unknown): void {
    const result: { readonly valid: boolean; readonly errors: JsonError[] } = this.schemaNode.validate(input);

    if (result.valid) return;

    const messages: string = result.errors.map((error: JsonError): string => error.message).join('\n');

    throw new Error(`RAMEN schema validation failed: ${messages}`);
  }
}
