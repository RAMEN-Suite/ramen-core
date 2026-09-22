import { GConstraint, Id } from '../model/Types';
import { Diagnostic, DiagnosticPath, DiagnosticReport, Diagnostics } from './Diagnostics';
import { VALIDATION_ERROR } from './Codes';

/** Values supplied to a constraint evaluator for one model or instance element. */
export interface ConstraintContext {
  readonly modelId: Id;
  readonly ownerId: Id;
  readonly value: unknown;
  readonly path: DiagnosticPath;
}

/** Extension point for one safe, explicitly named constraint language. */
export interface ConstraintEvaluator {
  readonly language: string;
  /** Evaluates one constraint in the supplied model or instance context. */
  evaluate(constraint: GConstraint, context: ConstraintContext): readonly Diagnostic[];
}

/** Maps constraint language names to their evaluators. */
export class ConstraintRegistry {
  private readonly evaluators: Map<string, ConstraintEvaluator> = new Map<string, ConstraintEvaluator>();

  /** Creates a registry and registers the supplied evaluators. */
  public constructor(evaluators: readonly ConstraintEvaluator[] = []) {
    for (const evaluator of evaluators) this.register(evaluator);
  }

  /** Creates the standard registry containing the safe regular-expression evaluator. */
  public static createDefault(): ConstraintRegistry {
    return new ConstraintRegistry([new RegexConstraintEvaluator()]);
  }

  /** Registers an evaluator or throws when its language already exists. */
  public register(evaluator: ConstraintEvaluator): void {
    if (this.evaluators.has(evaluator.language)) {
      throw new Error(`Constraint evaluator already registered: '${evaluator.language}'.`);
    }
    this.evaluators.set(evaluator.language, evaluator);
  }

  /** Evaluates a constraint or reports that its language is unsupported. */
  public evaluate(constraint: GConstraint, context: ConstraintContext): readonly Diagnostic[] {
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

  /** Tests the string representation of a value against the constraint expression. */
  public evaluate(constraint: GConstraint, context: ConstraintContext): readonly Diagnostic[] {
    if (typeof constraint.expression !== 'string') {
      return [this.invalidExpression(constraint, context, 'expected a string')];
    }

    let expression: RegExp;
    try {
      expression = new RegExp(constraint.expression);
    } catch {
      return [this.invalidExpression(constraint, context, 'invalid regular expression')];
    }
    if (expression.test(String(context.value))) return [];

    return [
      this.createDiagnostic(
        constraint,
        context,
        constraint.code ?? VALIDATION_ERROR.CONSTRAINT_REGEX_MISMATCH,
        constraint.message ?? `Value violates constraint '${constraint.name}'.`,
      ),
    ];
  }

  private invalidExpression(constraint: GConstraint, context: ConstraintContext, reason: string): Diagnostic {
    return Diagnostics.error({
      code: VALIDATION_ERROR.CONSTRAINT_EXPRESSION_INVALID,
      message: `Constraint '${constraint.name}' has an invalid expression: ${reason}.`,
      path: context.path,
      ref: constraint.id,
    });
  }

  private createDiagnostic(constraint: GConstraint, context: ConstraintContext, code: string, message: string): Diagnostic {
    const report: DiagnosticReport = { code: code, message: message, path: context.path, ref: constraint.id };
    if (constraint.severity === 'warn') return Diagnostics.warn(report);
    if (constraint.severity === 'info') return Diagnostics.info(report);
    return Diagnostics.error(report);
  }
}
