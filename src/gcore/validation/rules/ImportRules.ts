import { GModel, Id, Import } from '../../model/ModelTypes';
import { Diagnostic, DiagnosticPath, Diagnostics } from '../ValidationDiagnostic';
import { VALIDATION_ERROR } from '../ValidationErrorCode';
import { ValidationContext } from '../SemanticValidator';
import { AbstractRules } from './AbstractRules';

export class ImportRules extends AbstractRules {
  public validate(ctx: ValidationContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    const model: GModel = ctx.derivedModel;
    const imports: readonly Import[] = model.imports ?? [];

    diagnostics.push(...this.validateUniqueIds(imports));
    diagnostics.push(...this.validateNoSelfImport(model, imports));
    diagnostics.push(...this.validateBaseImported(ctx));
    return diagnostics;
  }

  private validateUniqueIds(imports: readonly Import[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const firstIndexByModelId: Map<Id, number> = new Map<Id, number>();

    imports.forEach((imp: Import, index: number): void => {
      const previousIndex: number | undefined = firstIndexByModelId.get(imp.modelId);
      if (previousIndex === undefined) {
        firstIndexByModelId.set(imp.modelId, index);
        return;
      }

      diagnostics.push(
        Diagnostics.error({
          code: VALIDATION_ERROR.IMPORT_MODEL_ID_DUPLICATE,
          message: `Duplicate import modelId '${imp.modelId}' (also at index ${previousIndex}).`,
          path: DiagnosticPath.root().property('imports').index(index).property('modelId'),
          ref: imp.modelId,
        }),
      );
    });
    return diagnostics;
  }

  private validateNoSelfImport(model: GModel, imports: readonly Import[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    imports.forEach((imp: Import, index: number): void => {
      if (imp.modelId !== model.id) return;

      diagnostics.push(
        Diagnostics.error({
          code: VALIDATION_ERROR.IMPORT_SELF_NOT_ALLOWED,
          message: `Model '${model.id}' must not import itself.`,
          path: DiagnosticPath.root().property('imports').index(index).property('modelId'),
          ref: model.id,
        }),
      );
    });
    return diagnostics;
  }

  private validateBaseImported(ctx: ValidationContext): Diagnostic[] {
    if (ctx.derivedIndex.importsByModelId.has(ctx.baseId)) return [];

    return [
      Diagnostics.error({
        code: VALIDATION_ERROR.MISSING_BASE_IMPORT,
        message: `Derived model must import base with modelId '${ctx.baseId}'.`,
        path: DiagnosticPath.root().property('imports'),
        ref: ctx.baseId,
      }),
    ];
  }
}
