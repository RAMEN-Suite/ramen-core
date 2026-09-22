import { GModel, Id } from '../model/Types';
import { ModelElementIndex } from '../project/Elements';
import { Diagnostic } from './Diagnostics';
import { RelationRules } from './rules/RelationRules';
import { ClassifierRules } from './rules/ClassifierRules';
import { ImportRules } from './rules/ImportRules';
import { VALIDATION_ERROR } from './Codes';

export interface ValidationOptions {
  readonly baseId: string;
}

export interface ValidationContext {
  readonly baseId: Id;
  readonly baseIndex: ModelElementIndex;
  readonly derivedIndex: ModelElementIndex;
  readonly baseModel: GModel;
  readonly derivedModel: GModel;
  readonly models: ReadonlyMap<Id, GModel>;
}

export class SemanticValidator {
  private readonly classifierRules: ClassifierRules = new ClassifierRules();
  private readonly relationRules: RelationRules = new RelationRules();
  private readonly importRules: ImportRules = new ImportRules();

  public validate(
    baseModel: GModel,
    derivedModel: GModel,
    models: ReadonlyMap<Id, GModel>,
    options: ValidationOptions,
  ): Diagnostic[] {
    const baseIndex: ModelElementIndex = new ModelElementIndex(baseModel);
    const derivedIndex: ModelElementIndex = new ModelElementIndex(derivedModel);

    const ctx: ValidationContext = {
      baseId: options.baseId,
      baseIndex: baseIndex,
      derivedIndex: derivedIndex,
      baseModel: baseModel,
      derivedModel: derivedModel,
      models: models,
    };

    const diagnostics: Diagnostic[] = [];
    diagnostics.push(...this.importRules.validate(ctx));

    if (diagnostics.some((d: Diagnostic): boolean => d.code === VALIDATION_ERROR.MISSING_BASE_IMPORT)) {
      return diagnostics;
    }

    diagnostics.push(...this.classifierRules.validate(ctx));
    diagnostics.push(...this.relationRules.validate(ctx));
    return diagnostics;
  }
}
