import { Constraint, Id } from '../Types';
import { compileSchema, SchemaNode } from 'json-schema-library';
import { Diagnostic, DiagnosticPath, DiagnosticReport, Diagnostics } from './Diagnostics';
import { VALIDATION_ERROR } from './Codes';

const STANDARD_FORMAT_SCHEMAS: ReadonlyMap<string, SchemaNode> = new Map<string, SchemaNode>(
  ['uuid', 'date', 'date-time', 'email'].map((format: string): [string, SchemaNode] => [
    format,
    compileSchema({ type: 'string', format: format }),
  ]),
);

/** Model element kind that supplies the context for a constraint evaluation. */
export type ConstraintTarget = 'node' | 'attribute' | 'dataType' | 'literal' | 'relation' | 'relationEnd';

/** Values supplied to a constraint evaluator for one model element instance. */
export interface ConstraintContext {
  readonly modelId: Id;
  readonly ownerId: Id;
  readonly target: ConstraintTarget;
  readonly value: unknown;
  readonly path: DiagnosticPath;
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

  /** Creates the standard registry containing safe regular-expression and scalar-format evaluators. */
  public static createDefault(): ConstraintRegistry {
    return new ConstraintRegistry([new RegexConstraintEvaluator(), new FormatConstraintEvaluator()]);
  }

  /** Registers an evaluator or throws when its language already exists. */
  public register(evaluator: ConstraintEvaluator): void {
    if (this.evaluators.has(evaluator.language)) {
      throw new Error(`Constraint evaluator already registered: '${evaluator.language}'.`);
    }
    this.evaluators.set(evaluator.language, evaluator);
  }

  /** Evaluates a constraint or reports that its language is unsupported. */
  public evaluate(constraint: Constraint, context: ConstraintContext): readonly Diagnostic[] {
    const evaluator: ConstraintEvaluator | undefined = this.evaluators.get(constraint.language);
    if (evaluator) return evaluator.evaluate(constraint, context);
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

/** Evaluates `regex` constraints without executing arbitrary model expressions. */
export class RegexConstraintEvaluator implements ConstraintEvaluator {
  public readonly language: string = 'regex';

  /** Tests a string value against the constraint expression. */
  public evaluate(constraint: Constraint, context: ConstraintContext): readonly Diagnostic[] {
    if (typeof constraint.expression !== 'string') {
      return [this.invalidExpression(constraint, context, 'expected a string')];
    }

    let expression: RegExp;
    try {
      expression = new RegExp(constraint.expression);
    } catch {
      return [this.invalidExpression(constraint, context, 'invalid regular expression')];
    }
    if (typeof context.value !== 'string') return [this.invalidExpression(constraint, context, 'expected a string value')];
    if (expression.test(context.value)) return [];

    return [
      this.createDiagnostic(
        constraint,
        context,
        constraint.code ?? VALIDATION_ERROR.CONSTRAINT_REGEX_MISMATCH,
        constraint.message ?? `Value violates constraint '${constraint.name}'.`,
      ),
    ];
  }

  private invalidExpression(constraint: Constraint, context: ConstraintContext, reason: string): Diagnostic {
    return Diagnostics.error({
      code: VALIDATION_ERROR.CONSTRAINT_EXPRESSION_INVALID,
      message: `Constraint '${constraint.name}' has an invalid expression: ${reason}.`,
      path: context.path,
      ref: constraint.id,
    });
  }

  private createDiagnostic(constraint: Constraint, context: ConstraintContext, code: string, message: string): Diagnostic {
    const report: DiagnosticReport = { code: code, message: message, path: context.path, ref: constraint.id };
    if (constraint.severity === 'warn') return Diagnostics.warn(report);
    if (constraint.severity === 'info') return Diagnostics.info(report);
    return Diagnostics.error(report);
  }
}

/** Evaluates common JSON string formats without executing model-provided code. */
export class FormatConstraintEvaluator implements ConstraintEvaluator {
  public readonly language: string = 'format';

  /** Validates standard JSON Schema string formats used by RAMEN model format data types. */
  public evaluate(constraint: Constraint, context: ConstraintContext): readonly Diagnostic[] {
    if (typeof constraint.expression !== 'string' || typeof context.value !== 'string') {
      return [this.invalid(constraint, context, 'expected a format name and a string value')];
    }
    const schema: SchemaNode | undefined = STANDARD_FORMAT_SCHEMAS.get(constraint.expression);
    const supported: boolean = schema !== undefined || constraint.expression === 'uri';
    if (!supported) return [this.invalid(constraint, context, `unsupported format '${constraint.expression}'`)];
    const valid: boolean = schema ? schema.validate(context.value).valid : this.isAbsoluteUri(context.value);
    if (valid) return [];
    return [this.diagnostic(constraint, context, constraint.message ?? `Value is not a valid ${constraint.expression}.`)];
  }

  private isAbsoluteUri(value: string): boolean {
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

  private diagnostic(constraint: Constraint, context: ConstraintContext, message: string): Diagnostic {
    const report: DiagnosticReport = {
      code: constraint.code ?? VALIDATION_ERROR.CONSTRAINT_FORMAT_MISMATCH,
      message: message,
      path: context.path,
      ref: constraint.id,
    };
    if (constraint.severity === 'warn') return Diagnostics.warn(report);
    if (constraint.severity === 'info') return Diagnostics.info(report);
    return Diagnostics.error(report);
  }
}
