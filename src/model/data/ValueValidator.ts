import type { BuiltinType, Constraint, DataType, Id, Literal } from '../Types';
import type { ResolvedElement } from '../graph/ProjectGraph';
import { ConstraintRegistry, type ConstraintGraph } from '../validation/Constraints';
import { DiagnosticPath, Diagnostics, type Diagnostic } from '../validation/Diagnostics';
import type { ValidationResult } from '../validation/ModelValidator';

/** Context supplied when checking one value, with or without a recorded object. */
export interface ValueContext {
  readonly path: DiagnosticPath;
  readonly label: string;
  readonly ref?: Id;
  readonly instanceId?: Id;
  readonly graph?: ConstraintGraph;
}

/** Value findings plus whether the primitive type accepted the input. */
export interface ValueCheck extends ValidationResult {
  readonly typeValid: boolean;
}

/** Checks a single value against a built-in or declared data type. */
export class ValueValidator {
  public constructor(private readonly constraints: ConstraintRegistry) {}

  /** Returns findings for one value without requiring a recorded data graph. */
  public validate(type: BuiltinType | ResolvedElement<DataType>, value: unknown, context: ValueContext): ValueCheck {
    const diagnostics: Diagnostic[] = [];
    const baseType: BuiltinType = typeof type === 'string' ? type : type.element.baseType;
    const suffix: string = typeof type === 'string' ? '' : ` for data type '${type.element.name}'`;

    if (!this.matchesBuiltin(baseType, value)) {
      diagnostics.push(
        Diagnostics.error({
          code: 'INSTANCE_PROPERTY_TYPE_INVALID',
          message: `${context.label} must contain ${baseType} values${suffix}.`,
          path: context.path,
          ref: context.ref,
        }),
      );
      return { diagnostics, hasErrors: true, typeValid: false };
    }

    if (typeof type !== 'string') this.validateDeclared(type, value, context, diagnostics);
    return {
      diagnostics,
      hasErrors: diagnostics.some((item: Diagnostic): boolean => item.severity === 'error'),
      typeValid: true,
    };
  }

  private validateDeclared(
    type: ResolvedElement<DataType>,
    value: unknown,
    context: ValueContext,
    diagnostics: Diagnostic[],
  ): void {
    const literals: readonly Literal[] | undefined = type.element.literals;
    if (literals) {
      const literal: Literal | undefined = literals.find((item: Literal): boolean => this.matchesLiteral(item, value));
      if (literal) this.evaluate(literal.constraints ?? [], type.modelId, literal.id, 'literal', value, context, diagnostics);
      else {
        diagnostics.push(
          Diagnostics.error({
            code: 'INSTANCE_PROPERTY_LITERAL_INVALID',
            message: `${context.label} contains no literal declared by data type '${type.element.name}'.`,
            path: context.path,
            ref: context.ref,
          }),
        );
      }
    }

    this.evaluate(type.element.constraints ?? [], type.modelId, type.element.id, 'dataType', value, context, diagnostics);
  }

  private evaluate(
    rules: readonly Constraint[],
    modelId: Id,
    ownerId: Id,
    target: 'dataType' | 'literal',
    value: unknown,
    context: ValueContext,
    diagnostics: Diagnostic[],
  ): void {
    for (const rule of rules) {
      diagnostics.push(
        ...this.constraints.evaluate(rule, {
          modelId,
          ownerId,
          instanceId: context.instanceId,
          target,
          value,
          path: context.path,
          graph: context.graph,
        }),
      );
    }
  }

  private matchesBuiltin(type: BuiltinType, value: unknown): boolean {
    if (type === 'String') return typeof value === 'string';
    if (type === 'Boolean') return typeof value === 'boolean';
    if (type === 'Integer') return typeof value === 'number' && Number.isInteger(value);
    if (type === 'Object') return value !== null && typeof value === 'object' && !Array.isArray(value);
    return typeof value === 'number' && Number.isFinite(value);
  }

  private matchesLiteral(literal: Literal, value: unknown): boolean {
    if (typeof value === 'number') return value === literal.value;
    return value === (literal.literal ?? literal.name);
  }
}
