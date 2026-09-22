import { compileSchema, JsonError, SchemaNode } from 'json-schema-library';
import schema from '../schema/gcore.json';
import { GModel } from '../model/ModelTypes';

export class SchemaValidator {
  private static schemaNode: SchemaNode = compileSchema(schema);

  public static getSchemaNode(): SchemaNode {
    return this.schemaNode;
  }

  public static isValid(input: unknown): input is GModel {
    return this.schemaNode.validate(input).valid;
  }

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
