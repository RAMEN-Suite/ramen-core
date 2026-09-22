import { GModel, GRelation, Id, Ref } from '../model/ModelTypes';
import { QualifiedParts, ModelRef } from './ModelRef';
import { ModelElementIndex } from './ModelElementIndex';

export class RelationDefinitions {
  public static resolveReservedRoleNames(startModelId: Id, nodeId: Id, modelsById: ReadonlyMap<Id, GModel>): ReadonlySet<string> {
    const reserved: Set<string> = new Set<string>();

    const model: GModel | undefined = modelsById.get(startModelId);
    if (!model) return reserved;

    const index: ModelElementIndex = new ModelElementIndex(model);
    for (const rel of index.relationsById.values()) {
      if (rel.from.nodeId === nodeId) reserved.add(rel.to.role);
      if (rel.to.nodeId === nodeId) reserved.add(rel.from.role);
    }

    return reserved;
  }

  public static resolveBaseRelationId(baseModelId: Id, relation: GRelation): Id | null {
    const superTypes: readonly Ref[] = relation.superTypes ?? [];
    if (superTypes.length !== 1) return null;

    const superType: Ref | undefined = superTypes[0];
    if (superType === undefined) return null;
    if (!ModelRef.isQualified(superType)) return null;

    const parts: QualifiedParts = ModelRef.splitQualified(superType);
    if (parts.modelId !== baseModelId) return null;

    return parts.refId;
  }

  public static resolveBaseRelationName(base: GModel, relation: GRelation): string | null {
    const baseRelationId: Id | null = this.resolveBaseRelationId(base.id, relation);
    if (!baseRelationId) return null;

    const baseIndex: ModelElementIndex = new ModelElementIndex(base);
    return baseIndex.relationsById.get(baseRelationId)?.name ?? null;
  }
}
