import type { Constraint } from '../Types.js';
import { JsonSchemaEvaluator, RegexEvaluator, FormatEvaluator } from './Constraints.js';
import { DiagnosticPath, Diagnostics, type Diagnostic } from './Diagnostics.js';
import { VALIDATION_ERROR } from './Codes.js';

/** Checks constraint declarations before any recorded values are evaluated. */
export class ConstraintRules {
  private readonly evaluators: readonly (JsonSchemaEvaluator | RegexEvaluator | FormatEvaluator)[] = [
    new JsonSchemaEvaluator(),
    new RegexEvaluator(),
    new FormatEvaluator(),
  ];

  public validate(rules: readonly Constraint[] | undefined, path: DiagnosticPath): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    rules?.forEach((rule: Constraint, index: number): void => {
      const evaluator: JsonSchemaEvaluator | RegexEvaluator | FormatEvaluator | undefined = this.evaluators.find(
        (item: JsonSchemaEvaluator | RegexEvaluator | FormatEvaluator): boolean => item.language === rule.language,
      );
      const reason: string | undefined = evaluator?.validateExpression(rule.expression);
      if (!reason) return;

      diagnostics.push(
        Diagnostics.error({
          code: VALIDATION_ERROR.CONSTRAINT_EXPRESSION_INVALID,
          message: `Constraint '${rule.name}': ${reason}.`,
          path: path.property('constraints').index(index).property('expression'),
          ref: rule.id,
        }),
      );
    });

    return diagnostics;
  }
}
