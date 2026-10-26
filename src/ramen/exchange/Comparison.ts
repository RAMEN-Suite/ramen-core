import {
  ModelEvolution,
  type EvolutionChange,
  type EvolutionReport,
  type Diagnostic,
  type Id,
  type Model,
} from '../../model/index.js';

import { AnnotationShape } from '../annotations/Definitions.js';
import { AnnotationShapeSchemaValidator } from '../annotations/Schema.js';
import { RamenModelFormat } from '../Document.js';
import { RamenValidator } from '../validation/ModelValidator.js';

/** One added, removed, or changed RAMEN annotation definition. */
export interface AnnotationShapeChange {
  readonly action: 'added' | 'removed' | 'changed';
  readonly modelId: Id;
  readonly annotationId: Id;
  readonly before?: AnnotationShape;
  readonly after?: AnnotationShape;
}

/** Generic element changes plus separately identifiable RAMEN annotation changes. */
export interface RamenEvolutionReport extends EvolutionReport {
  readonly annotationChanges: readonly AnnotationShapeChange[];
}

interface AnnotationRecord {
  readonly modelId: Id;
  readonly annotation: AnnotationShape;
}

interface AnnotationComparisonIndex {
  readonly records: ReadonlyMap<string, AnnotationRecord>;
  readonly invalidShapes: ReadonlySet<string>;
  readonly invalidModels: ReadonlySet<Id>;
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
        (id: Id): readonly Diagnostic[] => validator.validateProject(id, beforeModels).diagnostics,
        beforeModelId,
      ),
      afterDiagnostics: ModelEvolution.validateWorkspace(
        afterModels,
        (id: Id): readonly Diagnostic[] => validator.validateProject(id, afterModels).diagnostics,
        afterModelId,
      ),
      annotationChanges: this.compareAnnotations(beforeModels, afterModels),
    };
  }

  private static compareAnnotations(
    beforeModels: readonly Model[],
    afterModels: readonly Model[],
  ): readonly AnnotationShapeChange[] {
    const before: AnnotationComparisonIndex = this.index(beforeModels);
    const after: AnnotationComparisonIndex = this.index(afterModels);
    const keys: readonly string[] = this.comparableKeys(before, after);
    const annotationChanges: AnnotationShapeChange[] = [];

    for (const key of keys) {
      const oldRecord: AnnotationRecord | undefined = before.records.get(key);
      const newRecord: AnnotationRecord | undefined = after.records.get(key);
      const unchanged: boolean =
        oldRecord !== undefined && newRecord !== undefined && ModelEvolution.sameJson(oldRecord.annotation, newRecord.annotation);
      if (unchanged) continue;

      const record: AnnotationRecord | undefined = newRecord ?? oldRecord;
      if (!record) continue;

      let action: AnnotationShapeChange['action'] = 'changed';
      if (!oldRecord) action = 'added';
      else if (!newRecord) action = 'removed';

      annotationChanges.push({
        action,
        modelId: record.modelId,
        annotationId: record.annotation.id,
        before: oldRecord ? structuredClone(oldRecord.annotation) : undefined,
        after: newRecord ? structuredClone(newRecord.annotation) : undefined,
      });
    }

    return annotationChanges;
  }

  private static comparableKeys(before: AnnotationComparisonIndex, after: AnnotationComparisonIndex): readonly string[] {
    const invalidShapes: ReadonlySet<string> = new Set<string>([...before.invalidShapes, ...after.invalidShapes]);
    const invalidModels: ReadonlySet<Id> = new Set<Id>([...before.invalidModels, ...after.invalidModels]);
    const records: ReadonlyMap<string, AnnotationRecord> = new Map<string, AnnotationRecord>([
      ...before.records,
      ...after.records,
    ]);

    return [...records.keys()]
      .filter((key: string): boolean => {
        const record: AnnotationRecord | undefined = records.get(key);
        return record !== undefined && !invalidModels.has(record.modelId) && !invalidShapes.has(key);
      })
      .sort();
  }

  private static annotationId(input: unknown): Id | undefined {
    const id: unknown = typeof input === 'object' && input !== null && 'id' in input ? input.id : undefined;
    return typeof id === 'string' && id.length > 0 ? id : undefined;
  }

  private static index(models: readonly Model[]): AnnotationComparisonIndex {
    const records: Map<string, AnnotationRecord> = new Map<string, AnnotationRecord>();
    const invalidShapes: Set<string> = new Set<string>();
    const invalidModels: Set<Id> = new Set<Id>();

    for (const model of models) {
      if (!RamenModelFormat.isDocument(model)) continue;
      const annotations: unknown = model.annotations;
      if (!Array.isArray(annotations)) {
        invalidModels.add(model.id);
        continue;
      }

      const seen: Set<Id> = new Set<Id>();
      for (const input of annotations as readonly unknown[]) {
        const id: Id | undefined = this.annotationId(input);
        if (id === undefined || seen.has(id)) {
          invalidModels.add(model.id);
          continue;
        }
        seen.add(id);

        const key: string = `${model.id}:${id}`;
        if (!AnnotationShapeSchemaValidator.isValid({ annotations: [input] })) {
          invalidShapes.add(key);
          continue;
        }
        records.set(key, { modelId: model.id, annotation: input as AnnotationShape });
      }
    }

    return { records, invalidShapes, invalidModels };
  }
}
