import { compileSchema, JsonError, SchemaNode } from 'json-schema-library';
import schema from '../../resources/schemas/model.schema.json';
import { Model } from '../Types.js';

/** Canonical identifier of the supported RAMEN model format schema. */
export const MODEL_SCHEMA_URI: string = 'https://ramen-schema.org/model/1.0.0/schema.json';

/** Validates unknown JSON values against the versioned RAMEN model format JSON Schema. */
export class ModelSchemaValidator {
  private static schemaNode: SchemaNode = compileSchema(schema);

  /** Returns the compiled RAMEN model format JSON Schema node. */
  public static getSchemaNode(): SchemaNode {
    return this.schemaNode;
  }

  /** Reports whether an unknown value conforms to the RAMEN model format JSON Schema. */
  public static isValid(input: unknown): input is Model {
    // A missing root is invalid; the schema library otherwise treats undefined as an absent optional value.
    return this.schemaNode.validate(input ?? null).valid;
  }

  /** Asserts schema conformance and throws a formatted validation error on failure. */
  public static assertValid(input: unknown): asserts input is Model {
    const { valid, errors } = this.schemaNode.validate(input ?? null);
    if (!valid) {
      throw new Error(`Validation Error: ${ModelSchemaValidator.formatErrors(errors)}`);
    }
  }

  private static formatErrors(errors: JsonError[]): string {
    return errors
      .map((error: JsonError): string => {
        const code: string = typeof error.code === 'string' ? error.code : (JSON.stringify(error.code) ?? 'unknown');
        return `[${code}] ${error.message}`;
      })
      .join('\n');
  }
}
