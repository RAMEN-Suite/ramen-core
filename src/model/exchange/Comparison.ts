import type { Classifier, DataType, Id, Model } from '../Types.js';
import type { Diagnostic } from '../validation/Diagnostics.js';
import { ModelValidator } from '../validation/ModelValidator.js';
import { jsonValueKey } from '../JsonValue.js';

/** Model elements tracked across two versions by their stable identifiers. */
export type EvolutionElement = 'model' | 'node' | 'dataType' | 'attribute' | 'literal' | 'relation';

/** Observable change between two complete workspace states. */
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
  readonly beforeModelId: Id;
  readonly afterModelId: Id;
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

/** Compares full workspace states without mutating them or guessing migration rules. */
export class ModelEvolution {
  /** Compares models, classifiers, attributes, literals, and relations by stable ID. */
  public static compare(
    beforeModelId: Id,
    beforeModels: readonly Model[],
    afterModelId: Id,
    afterModels: readonly Model[],
  ): EvolutionReport {
    const validator: ModelValidator = new ModelValidator();
    const beforeDiagnostics: readonly Diagnostic[] = this.validateWorkspace(
      beforeModels,
      (id: Id): readonly Diagnostic[] => validator.validateProject(id, beforeModels).diagnostics,
    );
    const afterDiagnostics: readonly Diagnostic[] = this.validateWorkspace(
      afterModels,
      (id: Id): readonly Diagnostic[] => validator.validateProject(id, afterModels).diagnostics,
    );

    return {
      beforeModelId,
      afterModelId,
      beforeDiagnostics,
      afterDiagnostics,
      changes: this.compareChanges(beforeModels, afterModels),
    };
  }

  /** Validates terminal models and isolated cycles so every workspace component contributes diagnostics. */
  public static validateWorkspace(
    models: readonly Model[],
    validate: (modelId: Id) => readonly Diagnostic[],
  ): readonly Diagnostic[] {
    const roots: readonly Model[] = this.validationRoots(models);
    const diagnostics: Map<string, Diagnostic> = new Map<string, Diagnostic>();

    for (const model of roots) {
      for (const diagnostic of validate(model.id)) {
        const key: string = JSON.stringify(diagnostic);
        diagnostics.set(key, diagnostic);
      }
    }

    return [...diagnostics.values()];
  }

  private static validationRoots(models: readonly Model[]): readonly Model[] {
    const imported: ReadonlySet<Id> = new Set<Id>(
      models.flatMap((model: Model): Id[] => model.imports.map((entry): Id => entry.modelId)),
    );
    const roots: Model[] = models.filter((model: Model): boolean => !imported.has(model.id));
    const byId: ReadonlyMap<Id, Model> = new Map<Id, Model>(models.map((model: Model): [Id, Model] => [model.id, model]));
    const covered: Set<Id> = new Set<Id>();

    for (const root of roots) this.coverImports(root, byId, covered);
    for (const model of models) {
      if (covered.has(model.id)) continue;
      roots.push(model);
      this.coverImports(model, byId, covered);
    }
    return roots;
  }

  private static coverImports(root: Model, models: ReadonlyMap<Id, Model>, covered: Set<Id>): void {
    const pending: Model[] = [root];
    for (const model of pending) {
      if (covered.has(model.id)) continue;
      covered.add(model.id);
      for (const entry of model.imports) {
        const imported: Model | undefined = models.get(entry.modelId);
        if (imported && !covered.has(imported.id)) pending.push(imported);
      }
    }
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

      if (oldRecord && newRecord && oldRecord.ownerId === newRecord.ownerId && this.sameJson(oldRecord.value, newRecord.value))
        continue;
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
    return jsonValueKey(left) === jsonValueKey(right);
  }
}
