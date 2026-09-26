import type { ConstraintRegistry } from '../validation/Constraints';
import type { Classifier, DataType, Id, Model } from '../Types';
import type { Diagnostic } from '../validation/Diagnostics';
import { ModelValidator } from '../validation/ModelValidator';

/** Model elements tracked across two versions by their stable identifiers. */
export type EvolutionElement = 'model' | 'node' | 'dataType' | 'attribute' | 'literal' | 'relation';

/** Observable change between two complete project states. */
export interface EvolutionChange {
  readonly action: 'added' | 'removed' | 'changed';
  readonly element: EvolutionElement;
  readonly modelId: Id;
  readonly elementId: Id;
  readonly ownerId?: Id;
  readonly before?: unknown;
  readonly after?: unknown;
}

/** Reproducible comparison artifact; diagnostics identify invalid input states. */
export interface EvolutionReport {
  readonly beforeRootModelId: Id;
  readonly afterRootModelId: Id;
  readonly beforeDiagnostics: readonly Diagnostic[];
  readonly afterDiagnostics: readonly Diagnostic[];
  readonly changes: readonly EvolutionChange[];
}

interface ElementRecord {
  readonly element: EvolutionElement;
  readonly modelId: Id;
  readonly elementId: Id;
  readonly ownerId?: Id;
  readonly value: unknown;
}

/** Compares full project states without mutating them or guessing migration rules. */
export class ModelEvolution {
  /** Compares models, classifiers, attributes, literals, and relations by stable ID. */
  public static compare(
    beforeRootModelId: Id,
    beforeModels: readonly Model[],
    afterRootModelId: Id,
    afterModels: readonly Model[],
    constraints?: ConstraintRegistry,
  ): EvolutionReport {
    const validator: ModelValidator = new ModelValidator(constraints);
    const beforeDiagnostics: readonly Diagnostic[] = validator.validateProject(beforeRootModelId, beforeModels).diagnostics;
    const afterDiagnostics: readonly Diagnostic[] = validator.validateProject(afterRootModelId, afterModels).diagnostics;
    return {
      beforeRootModelId,
      afterRootModelId,
      beforeDiagnostics,
      afterDiagnostics,
      changes: this.compareChanges(beforeModels, afterModels),
    };
  }

  /** Reports element changes only; callers choose whether and how to validate the two states. */
  public static compareChanges(beforeModels: readonly Model[], afterModels: readonly Model[]): readonly EvolutionChange[] {
    const before: ReadonlyMap<string, ElementRecord> = this.index(beforeModels);
    const after: ReadonlyMap<string, ElementRecord> = this.index(afterModels);
    const keys: readonly string[] = [...new Set<string>([...before.keys(), ...after.keys()])].sort();
    const changes: EvolutionChange[] = [];

    for (const key of keys) {
      const oldRecord: ElementRecord | undefined = before.get(key);
      const newRecord: ElementRecord | undefined = after.get(key);

      if (oldRecord && newRecord && this.sameJson(oldRecord.value, newRecord.value)) continue;
      const record: ElementRecord | undefined = newRecord ?? oldRecord;

      if (!record) continue;
      changes.push({
        action: oldRecord ? (newRecord ? 'changed' : 'removed') : 'added',
        element: record.element,
        modelId: record.modelId,
        elementId: record.elementId,
        ownerId: record.ownerId,
        before: oldRecord ? structuredClone(oldRecord.value) : undefined,
        after: newRecord ? structuredClone(newRecord.value) : undefined,
      });
    }

    return changes;
  }

  private static index(models: readonly Model[]): ReadonlyMap<string, ElementRecord> {
    const records: Map<string, ElementRecord> = new Map<string, ElementRecord>();

    for (const model of models) {
      this.add(records, 'model', model.id, model.id, this.modelDetails(model));
      for (const classifier of model.classifiers) this.indexClassifier(records, model.id, classifier);
      for (const relation of model.relations) this.add(records, 'relation', model.id, relation.id, relation);
    }

    return records;
  }

  private static indexClassifier(records: Map<string, ElementRecord>, modelId: Id, classifier: Classifier): void {
    if (classifier.kind === 'Node') {
      this.add(records, 'node', modelId, classifier.id, this.nodeDetails(classifier));
      for (const attribute of classifier.attributes) {
        this.add(records, 'attribute', modelId, attribute.id, attribute, classifier.id);
      }

      return;
    }

    this.add(records, 'dataType', modelId, classifier.id, this.dataTypeDetails(classifier));
    for (const literal of classifier.literals ?? []) this.add(records, 'literal', modelId, literal.id, literal, classifier.id);
  }

  private static add(
    records: Map<string, ElementRecord>,
    element: EvolutionElement,
    modelId: Id,
    elementId: Id,
    value: unknown,
    ownerId?: Id,
  ): void {
    const key: string = `${modelId}:${element}:${elementId}`;
    records.set(key, { element, modelId, elementId, ownerId, value });
  }

  private static modelDetails(model: Model): unknown {
    const { classifiers: _classifiers, relations: _relations, ...details } = model;
    return details;
  }

  private static nodeDetails(node: Extract<Classifier, { kind: 'Node' }>): unknown {
    const { attributes: _attributes, ...details } = node;
    return details;
  }

  private static dataTypeDetails(dataType: DataType): unknown {
    const { literals: _literals, ...details } = dataType;
    return details;
  }

  /** Compares JSON values without treating object key order as a model change. */
  public static sameJson(left: unknown, right: unknown): boolean {
    return JSON.stringify(this.canonical(left)) === JSON.stringify(this.canonical(right));
  }

  private static canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item: unknown): unknown => this.canonical(item));
    if (value === null || typeof value !== 'object') return value;
    const record: Record<string, unknown> = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};

    for (const key of Object.keys(record).sort()) sorted[key] = this.canonical(record[key]);

    return sorted;
  }
}
