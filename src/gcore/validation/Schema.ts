import { compileSchema, JsonError, SchemaNode } from 'json-schema-library';
import schema from '../../resources/schemas/gcore.schema.json';
import { GModel } from '../model/Types';

/** Validates unknown JSON values against the versioned GCore JSON Schema. */
export class SchemaValidator {
  private static schemaNode: SchemaNode = compileSchema(schema);

  /** Returns the compiled GCore JSON Schema node. */
  public static getSchemaNode(): SchemaNode {
    return this.schemaNode;
  }

  /** Reports whether an unknown value conforms to the GCore JSON Schema. */
  public static isValid(input: unknown): input is GModel {
    return this.schemaNode.validate(input).valid;
  }

  /** Asserts schema conformance and throws a formatted validation error on failure. */
  public static assertValid(input: unknown): asserts input is GModel {
    const { valid, errors } = this.schemaNode.validate(input);
    if (!valid) {
      throw new Error(`Validation Error: ${SchemaValidator.formatErrors(errors)}`);
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
