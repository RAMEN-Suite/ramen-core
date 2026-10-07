import { ModelEvolution, type EvolutionChange, type EvolutionReport, type Id, type Model } from '../../model/index.js';

import { RamenAnnotation, RamenAnnotations } from '../annotations/Definitions.js';
import { RamenModelFormat } from '../Document.js';
import { RamenValidator } from '../validation/ModelValidator.js';

/** One added, removed, or changed RAMEN annotation definition. */
export interface RamenAnnotationChange {
  readonly action: 'added' | 'removed' | 'changed';
  readonly modelId: Id;
  readonly annotationId: Id;
  readonly before?: RamenAnnotation;
  readonly after?: RamenAnnotation;
}

/** Generic element changes plus separately identifiable RAMEN annotation changes. */
export interface RamenEvolutionReport extends EvolutionReport {
  readonly annotationChanges: readonly RamenAnnotationChange[];
}

interface AnnotationRecord {
  readonly modelId: Id;
  readonly annotation: RamenAnnotation;
}

/** Compares two complete RAMEN project states without guessing data migrations. */
export class RamenEvolution {
  /** Reports generic model changes, annotation changes, and RAMEN validation findings. */
  public static compare(
    beforeModelId: Id,
    beforeModels: readonly Model[],
    afterModelId: Id,
    afterModels: readonly Model[],
  ): RamenEvolutionReport {
    const changes: readonly EvolutionChange[] = ModelEvolution.compareChanges(
      beforeModels.map((model: Model): Model => RamenModelFormat.toGeneric(model)),
      afterModels.map((model: Model): Model => RamenModelFormat.toGeneric(model)),
    );
    const validator: RamenValidator = new RamenValidator();

    return {
      beforeModelId,
      afterModelId,
      changes,
      beforeDiagnostics: ModelEvolution.validateWorkspace(
        beforeModels,
        (id: Id) => validator.validateProject(id, beforeModels).diagnostics,
      ),
      afterDiagnostics: ModelEvolution.validateWorkspace(
        afterModels,
        (id: Id) => validator.validateProject(id, afterModels).diagnostics,
      ),
      annotationChanges: this.compareAnnotations(beforeModels, afterModels),
    };
  }

  private static compareAnnotations(
    beforeModels: readonly Model[],
    afterModels: readonly Model[],
  ): readonly RamenAnnotationChange[] {
    const before: ReadonlyMap<string, AnnotationRecord> = this.index(beforeModels);
    const after: ReadonlyMap<string, AnnotationRecord> = this.index(afterModels);
    const keys: readonly string[] = [...new Set<string>([...before.keys(), ...after.keys()])].sort();
    const annotationChanges: RamenAnnotationChange[] = [];

    for (const key of keys) {
      const oldRecord: AnnotationRecord | undefined = before.get(key);
      const newRecord: AnnotationRecord | undefined = after.get(key);
      if (oldRecord && newRecord && ModelEvolution.sameJson(oldRecord.annotation, newRecord.annotation)) continue;
      const record: AnnotationRecord | undefined = newRecord ?? oldRecord;
      if (!record) continue;

      annotationChanges.push({
        action: oldRecord ? (newRecord ? 'changed' : 'removed') : 'added',
        modelId: record.modelId,
        annotationId: record.annotation.id,
        before: oldRecord ? structuredClone(oldRecord.annotation) : undefined,
        after: newRecord ? structuredClone(newRecord.annotation) : undefined,
      });
    }

    return annotationChanges;
  }

  private static index(models: readonly Model[]): ReadonlyMap<string, AnnotationRecord> {
    const records: Map<string, AnnotationRecord> = new Map<string, AnnotationRecord>();

    for (const model of models) {
      for (const annotation of RamenAnnotations.get(model)) {
        records.set(`${model.id}:${annotation.id}`, { modelId: model.id, annotation: annotation });
      }
    }

    return records;
  }
}
