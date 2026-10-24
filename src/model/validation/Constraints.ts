import { Constraint, Id } from '../Types.js';
import { compileSchema, draft2020, JsonError, SchemaNode } from 'json-schema-library';
import { Diagnostic, DiagnosticPath, DiagnosticReport, Diagnostics } from './Diagnostics.js';
import { VALIDATION_ERROR } from './Codes.js';
import type { ProjectGraph } from '../graph/ProjectGraph.js';
import type { ModelInstanceGraph } from '../data/InstanceTypes.js';

const URI_INVALID_CHARACTERS: RegExp = /[^a-zA-Z0-9:/?#[\]@!$&'()*+,;=._~%-]/;
const URI_INVALID_ESCAPE: RegExp = /%(?![0-9a-fA-F]{2})/;

const STANDARD_FORMAT_SCHEMAS: ReadonlyMap<string, SchemaNode> = new Map<string, SchemaNode>(
  ['uuid', 'date', 'date-time', 'email'].map((format: string): [string, SchemaNode] => [
    format,
    compileSchema({ type: 'string', format: format }),
  ]),
);

function finding(constraint: Constraint, code: string, message: string, path: DiagnosticPath): Diagnostic {
  const report: DiagnosticReport = { code, message, path, ref: constraint.id };
  if (constraint.severity === 'warn') return Diagnostics.warn(report);
  if (constraint.severity === 'info') return Diagnostics.info(report);
  return Diagnostics.error(report);
}

/** Model element kind that supplies the context for a constraint evaluation. */
export type ConstraintTarget = 'node' | 'attribute' | 'dataType' | 'literal' | 'relation' | 'relationEnd';

/** Complete model and data graph available during instance validation. */
export interface ConstraintGraph {
  readonly project: ProjectGraph;
  readonly instances: ModelInstanceGraph;
}

/** Values supplied to a constraint evaluator for one model element instance. */
export interface ConstraintContext {
  readonly modelId: Id;
  readonly ownerId: Id;
  readonly instanceId?: Id;
  readonly target: ConstraintTarget;
  readonly value: unknown;
  readonly path: DiagnosticPath;
  readonly graph?: ConstraintGraph;
}

/** Extension point for one safe, explicitly named constraint language. */
export interface ConstraintEvaluator {
  readonly language: string;
  /** Evaluates one constraint in the supplied model or instance context. */
  evaluate(constraint: Constraint, context: ConstraintContext): readonly Diagnostic[];
}

/** Maps constraint language names to their evaluators. */
export class ConstraintRegistry {
  private readonly evaluators: Map<string, ConstraintEvaluator> = new Map<string, ConstraintEvaluator>();

  /** Creates a registry and registers the supplied evaluators. */
  public constructor(evaluators: readonly ConstraintEvaluator[] = []) {
    for (const evaluator of evaluators) this.register(evaluator);
  }

  /** Creates the standard registry for regular expressions, formats and JSON Schema value rules. */
  public static createDefault(): ConstraintRegistry {
    return new ConstraintRegistry([new RegexEvaluator(), new FormatEvaluator(), new JsonSchemaEvaluator()]);
  }

  /** Registers an evaluator or throws when its language already exists. */
  public register(evaluator: ConstraintEvaluator): void {
    if (this.evaluators.has(evaluator.language)) {
      throw new Error(`Constraint evaluator already registered: '${evaluator.language}'.`);
    }
    this.evaluators.set(evaluator.language, evaluator);
  }

  /** Evaluates a constraint and reports unsupported languages or evaluator failures as errors. */
  public evaluate(constraint: Constraint, context: ConstraintContext): readonly Diagnostic[] {
    const evaluator: ConstraintEvaluator | undefined = this.evaluators.get(constraint.language);
    if (evaluator) {
      try {
        return evaluator.evaluate(constraint, context);
      } catch (error: unknown) {
        const reason: string = error instanceof Error ? error.message : String(error);
        return [
          Diagnostics.error({
            code: VALIDATION_ERROR.CONSTRAINT_EVALUATION_FAILED,
            message: `Evaluator '${constraint.language}' failed for constraint '${constraint.name}': ${reason}.`,
            path: context.path,
            ref: constraint.id,
          }),
        ];
      }
    }

    return [
      Diagnostics.error({
        code: VALIDATION_ERROR.CONSTRAINT_LANGUAGE_UNSUPPORTED,
        message: `Constraint language '${constraint.language}' is not registered.`,
        path: context.path,
        ref: constraint.id,
      }),
    ];
  }
}

/** Evaluates one value against a JSON Schema Draft 2020-12 constraint. */
export class JsonSchemaEvaluator implements ConstraintEvaluator {
  public readonly language: string = 'json-schema';
  private static readonly cacheLimit: number = 128;
  private readonly schemas: Map<string, SchemaNode> = new Map<string, SchemaNode>();

  /** Returns the schema error, if an expression cannot be compiled. */
  public validateExpression(expression: Constraint['expression']): string | undefined {
    if (typeof expression === 'string') return 'expected a JSON Schema object';
    try {
      this.compile(expression);
      return undefined;
    } catch (error: unknown) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  /** Checks a scalar or object value; `format` remains a separate constraint language. */
  public evaluate(constraint: Constraint, context: ConstraintContext): readonly Diagnostic[] {
    if (typeof constraint.expression === 'string') {
      return [this.invalid(constraint, context, 'expected a JSON Schema object')];
    }

    let errors: JsonError[];
    try {
      const schema: SchemaNode = this.compile(constraint.expression);
      errors = schema.validate(context.value).errors;
    } catch (error: unknown) {
      const reason: string = error instanceof Error ? error.message : String(error);
      return [this.invalid(constraint, context, reason)];
    }

    return errors.map((error: JsonError): Diagnostic => {
      const code: string = constraint.code ?? VALIDATION_ERROR.CONSTRAINT_JSON_SCHEMA_MISMATCH;
      const message: string = constraint.message ?? error.message;
      return finding(constraint, code, message, this.valuePath(context, error));
    });
  }

  private compile(expression: Record<string, unknown>): SchemaNode {
    if (expression['$schema'] !== undefined && expression['$schema'] !== draft2020.$schema) {
      throw new Error(`expected JSON Schema Draft 2020-12`);
    }

    const key: string = JSON.stringify(expression);
    const cached: SchemaNode | undefined = this.schemas.get(key);
    if (cached) return cached;

    const schema: SchemaNode = compileSchema(expression, {
      drafts: [draft2020],
      formatAssertion: false,
      throwOnInvalidSchema: true,
      throwOnInvalidRef: true,
    });

    // Bound retained schemas for long-lived validators, evicting the oldest entry.
    if (this.schemas.size >= JsonSchemaEvaluator.cacheLimit) {
      const oldest: string | undefined = this.schemas.keys().next().value;
      if (oldest !== undefined) this.schemas.delete(oldest);
    }
    this.schemas.set(key, schema);
    return schema;
  }

  private valuePath(context: ConstraintContext, error: JsonError): DiagnosticPath {
    const pointer: unknown = error.data?.pointer;
    if (typeof pointer !== 'string') return context.path;
    let remaining: string = pointer.replace(/^#/, '');
    let value: unknown = context.value;
    let path: DiagnosticPath = context.path;

    // The schema library supplies unescaped keys. Stop at the last unambiguous owner rather than inventing a path.
    while (remaining.startsWith('/') && value !== null && typeof value === 'object') {
      const keys: readonly string[] = Object.keys(value).filter(
        (key: string): boolean => remaining === `/${key}` || remaining.startsWith(`/${key}/`),
      );
      const key: string | undefined = keys[0];
      if (keys.length !== 1 || key === undefined) return path;

      path = path.property(key);
      remaining = remaining.slice(key.length + 1);
      value = (value as Record<string, unknown>)[key];
    }
    return path;
  }

  private invalid(constraint: Constraint, context: ConstraintContext, reason: string): Diagnostic {
    return Diagnostics.error({
      code: VALIDATION_ERROR.CONSTRAINT_EXPRESSION_INVALID,
      message: `Constraint '${constraint.name}' has an invalid JSON Schema: ${reason}.`,
      path: context.path,
      ref: constraint.id,
    });
  }
}

/** Evaluates string values against JavaScript regular expressions. */
export class RegexEvaluator implements ConstraintEvaluator {
  public readonly language: string = 'regex';

  /** Checks expression syntax without requiring a recorded string. */
  public validateExpression(expression: Constraint['expression']): string | undefined {
    try {
      this.compile(expression);
      return undefined;
    } catch (error: unknown) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  /** Tests a string value against the constraint expression. */
  public evaluate(constraint: Constraint, context: ConstraintContext): readonly Diagnostic[] {
    let expression: RegExp;
    try {
      expression = this.compile(constraint.expression);
    } catch (error: unknown) {
      return [this.invalidExpression(constraint, context, error instanceof Error ? error.message : String(error))];
    }
    if (typeof context.value !== 'string') return [this.invalidExpression(constraint, context, 'expected a string value')];
    if (expression.test(context.value)) return [];

    return [
      finding(
        constraint,
        constraint.code ?? VALIDATION_ERROR.CONSTRAINT_REGEX_MISMATCH,
        constraint.message ?? `Value violates constraint '${constraint.name}'.`,
        context.path,
      ),
    ];
  }

  private compile(expression: Constraint['expression']): RegExp {
    if (typeof expression !== 'string') throw new Error('expected a string');
    return new RegExp(expression);
  }

  private invalidExpression(constraint: Constraint, context: ConstraintContext, reason: string): Diagnostic {
    return Diagnostics.error({
      code: VALIDATION_ERROR.CONSTRAINT_EXPRESSION_INVALID,
      message: `Constraint '${constraint.name}' has an invalid expression: ${reason}.`,
      path: context.path,
      ref: constraint.id,
    });
  }
}

/** Evaluates common JSON string formats without executing model-provided code. */
export class FormatEvaluator implements ConstraintEvaluator {
  public readonly language: string = 'format';

  /** Checks whether the expression selects a supported format. */
  public validateExpression(expression: Constraint['expression']): string | undefined {
    if (typeof expression !== 'string') return 'expected a format name';
    return STANDARD_FORMAT_SCHEMAS.has(expression) || expression === 'uri' ? undefined : `unsupported format '${expression}'`;
  }

  /** Validates standard JSON Schema string formats used by RAMEN model format data types. */
  public evaluate(constraint: Constraint, context: ConstraintContext): readonly Diagnostic[] {
    const reason: string | undefined = this.validateExpression(constraint.expression);
    if (reason) return [this.invalid(constraint, context, reason)];
    if (typeof constraint.expression !== 'string' || typeof context.value !== 'string')
      return [this.invalid(constraint, context, 'expected a string value')];

    const schema: SchemaNode | undefined = STANDARD_FORMAT_SCHEMAS.get(constraint.expression);
    const valid: boolean = schema ? schema.validate(context.value).valid : this.isAbsoluteUri(context.value);
    if (valid) return [];
    const code: string = constraint.code ?? VALIDATION_ERROR.CONSTRAINT_FORMAT_MISMATCH;
    const message: string = constraint.message ?? `Value is not a valid ${constraint.expression}.`;
    return [finding(constraint, code, message, context.path)];
  }

  private isAbsoluteUri(value: string): boolean {
    if (URI_INVALID_CHARACTERS.test(value) || URI_INVALID_ESCAPE.test(value)) return false;

    try {
      return new URL(value).protocol.length > 1;
    } catch {
      return false;
    }
  }

  private invalid(constraint: Constraint, context: ConstraintContext, reason: string): Diagnostic {
    return Diagnostics.error({
      code: VALIDATION_ERROR.CONSTRAINT_EXPRESSION_INVALID,
      message: `Constraint '${constraint.name}' is invalid: ${reason}.`,
      path: context.path,
      ref: constraint.id,
    });
  }
}
