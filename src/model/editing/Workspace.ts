import type { Id, Model, Ref } from '../Types';
import { ModelRef } from '../graph/References';

/** Identity of a declaration in the editable model workspace. */
export interface WorkspaceElement {
  readonly modelId: Id;
  readonly elementId: Id;
}

/** Definitions affected by deleting a node and its dependent declarations. */
export interface NodeRemovalPreview {
  readonly nodes: readonly WorkspaceElement[];
  readonly relations: readonly WorkspaceElement[];
  readonly annotations: readonly WorkspaceElement[];
  readonly updatedAnnotations: readonly WorkspaceElement[];
}

/** Relations removed and annotation types changed by deleting a relation. */
export interface RelationRemovalPreview {
  readonly relations: readonly WorkspaceElement[];
  readonly updatedAnnotations: readonly WorkspaceElement[];
}

/** A model level and the later levels that depend on it. */
export interface ModelRemovalPreview {
  readonly models: readonly { readonly id: Id; readonly name: string }[];
}

/** Identity fields that can change without replacing a model's declarations. */
export interface ModelUpdate {
  readonly name?: string;
  readonly uri?: string;
  readonly version?: string;
}

interface RemovalIndex {
  readonly nodeChildren: Map<string, WorkspaceElement[]>;
  readonly incidentRelations: Map<string, WorkspaceElement[]>;
  readonly relationChildren: Map<string, WorkspaceElement[]>;
}

/** Resolves a local or qualified reference in the model that contains it. */
export function pointsTo(ref: Ref, ownerModelId: Id, target: WorkspaceElement): boolean {
  return keyFor(ref, ownerModelId) === keyOf(target);
}

function keyOf(item: WorkspaceElement): string {
  return `${item.modelId}:${item.elementId}`;
}

function keyFor(ref: Ref, ownerModelId: Id): string {
  return ModelRef.isQualified(ref) ? ref : `${ownerModelId}:${ref}`;
}

function append(index: Map<string, WorkspaceElement[]>, key: string, item: WorkspaceElement): void {
  const items: WorkspaceElement[] = index.get(key) ?? [];
  items.push(item);
  index.set(key, items);
}

/** Shared editable models. A modeller exposes one model while edits remain visible to its other levels. */
export class ModelWorkspace {
  private readonly models: Map<Id, Model> = new Map<Id, Model>();
  private revision: number = 0;

  public constructor(models: readonly Model[]) {
    for (const model of models) this.add(model);
  }

  public get version(): number {
    return this.revision;
  }

  public get(id: Id): Model | undefined {
    return this.models.get(id);
  }

  public all(): readonly Model[] {
    return [...this.models.values()];
  }

  /** Copies every model into an independent editable workspace. */
  public snapshot(): ModelWorkspace {
    return new ModelWorkspace(this.all());
  }

  public add(model: Model): void {
    if (this.models.has(model.id)) throw new Error(`Model already exists: '${model.id}'.`);
    this.models.set(model.id, structuredClone(model));
    this.revision += 1;
  }

  public update(model: Model): void {
    if (!this.models.has(model.id)) throw new Error(`Model not found: '${model.id}'.`);
    this.models.set(model.id, structuredClone(model));
    this.revision += 1;
  }

  /** Publishes a complete edit only after every replacement has been prepared. */
  public updateMany(models: readonly Model[]): void {
    const replacements: readonly Model[] = models.map((model: Model): Model => structuredClone(model));
    for (const model of replacements) {
      if (!this.models.has(model.id)) throw new Error(`Model not found: '${model.id}'.`);
    }
    for (const model of replacements) this.models.set(model.id, model);
    this.revision += 1;
  }

  /** Updates a level and its exact import headers as one workspace change. */
  public updateModel(id: Id, patch: ModelUpdate): Model {
    const current: Model | undefined = this.models.get(id);
    if (!current) throw new Error(`Model not found: '${id}'.`);

    const updated: Model = {
      ...current,
      name: patch.name ?? current.name,
      $id: patch.uri ?? current.$id,
      version: patch.version ?? current.version,
    };
    const replacements: readonly Model[] = this.all().map((model: Model): Model => {
      if (model.id === id) return updated;
      return {
        ...model,
        imports: model.imports.map((entry) =>
          entry.modelId === id ? { ...entry, name: updated.name, modelUri: updated.$id, version: updated.version } : entry,
        ),
      };
    });
    this.updateMany(replacements);
    return structuredClone(updated);
  }

  /** Shows a level and all transitive importing levels in removal order. */
  public previewModelRemoval(id: Id): ModelRemovalPreview {
    if (!this.models.has(id)) throw new Error(`Model not found: '${id}'.`);
    const models: { id: Id; name: string }[] = [];
    const children: Map<Id, Id[]> = new Map<Id, Id[]>();
    for (const model of this.models.values()) {
      for (const entry of model.imports) {
        const siblings: Id[] = children.get(entry.modelId) ?? [];
        siblings.push(model.id);
        children.set(entry.modelId, siblings);
      }
    }

    const seen: Set<Id> = new Set<Id>([id]);
    const pending: Id[] = [id];

    for (const current of pending) {
      const model: Model | undefined = this.models.get(current);
      if (model) models.push({ id: model.id, name: model.name });

      for (const childId of children.get(current) ?? []) {
        if (seen.has(childId)) continue;
        seen.add(childId);
        pending.push(childId);
      }
    }
    return { models };
  }

  /** Removes the previewed model levels together. The caller enforces strict or cascade mode. */
  public removeModels(preview: ModelRemovalPreview): void {
    for (const model of preview.models) {
      if (!this.models.has(model.id)) throw new Error(`Model not found: '${model.id}'.`);
    }
    for (const model of preview.models) this.models.delete(model.id);
    this.revision += 1;
  }

  public dependenciesOf(id: Id): ReadonlyMap<Id, Model> {
    const dependencies: Map<Id, Model> = new Map<Id, Model>();
    const pending: Id[] = [id];
    while (pending.length > 0) {
      const current: Id | undefined = pending.pop();
      if (!current) continue;
      const model: Model | undefined = this.models.get(current);
      for (const entry of model?.imports ?? []) {
        if (dependencies.has(entry.modelId)) continue;
        const imported: Model | undefined = this.models.get(entry.modelId);
        if (!imported) continue;
        dependencies.set(imported.id, imported);
        pending.push(imported.id);
      }
    }
    dependencies.delete(id);
    return dependencies;
  }

  /** Follows node refinements and every relation that depends on the removed nodes or relations. */
  public previewNodeRemoval(target: WorkspaceElement): NodeRemovalPreview {
    const index: RemovalIndex = this.buildRemovalIndex();
    const nodes: WorkspaceElement[] = this.collectNodes(target, index.nodeChildren);
    const relations: WorkspaceElement[] = this.collectRelations(nodes, index);
    return { nodes, relations, annotations: [], updatedAnnotations: [] };
  }

  /** Follows relation refinements across every model in this workspace. */
  public previewRelationRemoval(target: WorkspaceElement): RelationRemovalPreview {
    const index: RemovalIndex = this.buildRemovalIndex();
    const relations: WorkspaceElement[] = this.collectRelationClosure([target], index.relationChildren);
    return { relations, updatedAnnotations: [] };
  }

  private buildRemovalIndex(): RemovalIndex {
    const nodeChildren: Map<string, WorkspaceElement[]> = new Map<string, WorkspaceElement[]>();
    const incidentRelations: Map<string, WorkspaceElement[]> = new Map<string, WorkspaceElement[]>();
    const relationChildren: Map<string, WorkspaceElement[]> = new Map<string, WorkspaceElement[]>();

    for (const model of this.models.values()) {
      for (const classifier of model.classifiers) {
        if (classifier.kind !== 'Node') continue;
        const item: WorkspaceElement = { modelId: model.id, elementId: classifier.id };
        for (const parent of classifier.superTypes) append(nodeChildren, keyFor(parent, model.id), item);
      }
      for (const relation of model.relations) {
        const item: WorkspaceElement = { modelId: model.id, elementId: relation.id };
        append(incidentRelations, keyFor(relation.from.nodeId, model.id), item);
        append(incidentRelations, keyFor(relation.to.nodeId, model.id), item);
        for (const parent of relation.superTypes) append(relationChildren, keyFor(parent, model.id), item);
      }
    }
    return { nodeChildren, incidentRelations, relationChildren };
  }

  private collectNodes(target: WorkspaceElement, children: ReadonlyMap<string, readonly WorkspaceElement[]>): WorkspaceElement[] {
    const nodes: WorkspaceElement[] = [target];
    const nodeKeys: Set<string> = new Set<string>([keyOf(target)]);
    for (const node of nodes) {
      for (const child of children.get(keyOf(node)) ?? []) {
        if (nodeKeys.has(keyOf(child))) continue;
        nodeKeys.add(keyOf(child));
        nodes.push(child);
      }
    }
    return nodes;
  }

  private collectRelations(nodes: readonly WorkspaceElement[], index: RemovalIndex): WorkspaceElement[] {
    const incident: WorkspaceElement[] = nodes.flatMap(
      (node: WorkspaceElement): WorkspaceElement[] => index.incidentRelations.get(keyOf(node)) ?? [],
    );
    return this.collectRelationClosure(incident, index.relationChildren);
  }

  private collectRelationClosure(
    seeds: readonly WorkspaceElement[],
    children: ReadonlyMap<string, readonly WorkspaceElement[]>,
  ): WorkspaceElement[] {
    const relations: WorkspaceElement[] = [];
    const relationKeys: Set<string> = new Set<string>();
    for (const relation of seeds) {
      if (relationKeys.has(keyOf(relation))) continue;
      relationKeys.add(keyOf(relation));
      relations.push(relation);
    }
    for (const relation of relations) {
      for (const child of children.get(keyOf(relation)) ?? []) {
        if (relationKeys.has(keyOf(child))) continue;
        relationKeys.add(keyOf(child));
        relations.push(child);
      }
    }
    return relations;
  }
}
