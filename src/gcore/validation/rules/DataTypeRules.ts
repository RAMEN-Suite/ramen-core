import { GDataType, GLiteral } from '../../model/ModelTypes';
import { Diagnostic, DiagnosticPath, Diagnostics } from '../ValidationDiagnostic';
import { VALIDATION_ERROR } from '../ValidationErrorCode';
import { AbstractRules } from './AbstractRules';

export class DataTypeRules extends AbstractRules {
  public validate(dataType: GDataType, classifierPath: DiagnosticPath): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    const literals: readonly GLiteral[] | undefined = dataType.literals;
    if (!literals) return diagnostics;

    diagnostics.push(...this.validateLiteralsNotEmpty(dataType, literals, classifierPath));
    if (literals.length === 0) return diagnostics;

    diagnostics.push(...this.validateUniqueLiteralNames(literals, classifierPath));
    diagnostics.push(...this.validateUniqueLiteralSerializedForms(literals, classifierPath));
    diagnostics.push(...this.validateUniqueLiteralValues(literals, classifierPath));
    diagnostics.push(...this.validateLiteralValueConsistency(literals, classifierPath));
    return diagnostics;
  }

  private validateLiteralsNotEmpty(dataType: GDataType, literals: readonly GLiteral[], path: DiagnosticPath): Diagnostic[] {
    if (literals.length > 0) return [];

    return [
      Diagnostics.warn({
        code: VALIDATION_ERROR.DATATYPE_LITERALS_EMPTY,
        message: `Datatype '${dataType.id}' declares literals but contains none.`,
        path: path.property('literals'),
        ref: dataType.id,
      }),
    ];
  }

  private validateUniqueLiteralNames(literals: readonly GLiteral[], classifierPath: DiagnosticPath): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const firstIndexByName: Map<string, number> = new Map<string, number>();

    literals.forEach((literal: GLiteral, index: number): void => {
      const previousIndex: number | undefined = firstIndexByName.get(literal.name);

      if (previousIndex === undefined) {
        firstIndexByName.set(literal.name, index);
        return;
      }

      diagnostics.push(
        Diagnostics.error({
          code: VALIDATION_ERROR.DATATYPE_LITERAL_NAME_DUPLICATE,
          message: `Duplicate literal name '${literal.name}' (also at index ${previousIndex}).`,
          path: classifierPath.property('literals').index(index).property('name'),
          ref: literal.name,
        }),
      );
    });
    return diagnostics;
  }

  private validateUniqueLiteralSerializedForms(literals: readonly GLiteral[], classifierPath: DiagnosticPath): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const firstIndexBySerialized: Map<string, number> = new Map<string, number>();

    literals.forEach((literal: GLiteral, index: number): void => {
      const serializedValue: string = this.getLiteralSerializedForm(literal);

      const previousIndex: number | undefined = firstIndexBySerialized.get(serializedValue);
      if (previousIndex === undefined) {
        firstIndexBySerialized.set(serializedValue, index);
        return;
      }

      const isUsingLiteralField: string = this.hasNonEmptyLiteral(literal) ? 'literal' : 'name';
      diagnostics.push(
        Diagnostics.error({
          code: VALIDATION_ERROR.DATATYPE_LITERAL_SERIALIZED_DUPLICATE,
          message: `Duplicate literal serialized form '${serializedValue}' (also at index ${previousIndex}).`,
          path: classifierPath.property('literals').index(index).property(isUsingLiteralField),
          ref: serializedValue,
        }),
      );
    });
    return diagnostics;
  }

  private validateUniqueLiteralValues(literals: readonly GLiteral[], classifierPath: DiagnosticPath): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const firstIndexByValue: Map<number, number> = new Map<number, number>();

    literals.forEach((literal: GLiteral, index: number): void => {
      if (literal.value === undefined || literal.value === null) return;

      const previousIndex: number | undefined = firstIndexByValue.get(literal.value);
      if (previousIndex === undefined) {
        firstIndexByValue.set(literal.value, index);
        return;
      }

      diagnostics.push(
        Diagnostics.error({
          code: VALIDATION_ERROR.DATATYPE_LITERAL_VALUE_DUPLICATE,
          message: `Duplicate literal value ${literal.value} (also at index ${previousIndex}).`,
          path: classifierPath.property('literals').index(index).property('value'),
          ref: String(literal.value),
        }),
      );
    });
    return diagnostics;
  }

  private validateLiteralValueConsistency(literals: readonly GLiteral[], classifierPath: DiagnosticPath): Diagnostic[] {
    let withValue: number = 0;
    let withoutValue: number = 0;

    for (const literal of literals) {
      if (literal.value === undefined || literal.value === null) withoutValue += 1;
      else withValue += 1;
    }

    if (withValue === 0 || withoutValue === 0) return [];

    return [
      Diagnostics.warn({
        code: VALIDATION_ERROR.DATATYPE_LITERAL_VALUE_INCONSISTENT,
        message: `Datatype literals mix explicit 'value' assignments (${withValue}) and implicit values (${withoutValue}). Consider making values consistent.`,
        path: classifierPath.property('literals'),
        ref: String(withValue),
      }),
    ];
  }

  private hasNonEmptyLiteral(literal: GLiteral): boolean {
    return typeof literal.literal === 'string' && literal.literal.trim().length > 0;
  }

  private getLiteralSerializedForm(literal: GLiteral): string {
    if (typeof literal.literal === 'string' && literal.literal.trim().length > 0) return literal.literal.trim();
    return literal.name;
  }
}
