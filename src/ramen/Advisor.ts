import { BuiltinDataTypes } from '../gcore/model/Builtins';
import { BuiltinType, GDataType, GModel, GNode, GRelation, Id, Ref } from '../gcore/model/Types';
import { ProjectGraph, ResolvedModelElement } from '../gcore/project/Graph';
import { ModelRef } from '../gcore/project/Refs';
import { ValidProjectResult } from '../gcore/validation/Validate';
import { AnnotationTypes, RamenAnnotationType } from './AnnotationTypes';

/** One node type that a new project node can refine. */
export interface NodeRefinementSuggestion {
  readonly modelId: Id;
  readonly nodeId: Id;
  readonly ref: Ref;
  readonly name: string;
}

/** One primitive or declared data type available to a project attribute. */
export interface DataTypeSuggestion {
  readonly modelId?: Id;
  readonly dataTypeId: Ref;
  readonly ref: Ref;
  readonly name: string;
  readonly baseType: BuiltinType;
}

/** One relation compatible with two selected project node types. */
export interface RelationRefinementSuggestion {
  readonly modelId: Id;
  readonly relationId: Id;
  readonly ref: Ref;
  readonly name: string;
  readonly actions: readonly ['reuse', 'refine'];
  readonly explanation: string;
}

/** One concrete annotation type declared by a reachable project model. */
export interface AnnotationTypeSuggestion {
  readonly modelId: Id;
  readonly nodeId: Id;
  readonly ref: Ref;
  readonly name: string;
  readonly typeValue: string;
}

/** Computes deterministic modeling suggestions from an already validated project graph. */
export class RamenAdvisor {
  private readonly graph: ProjectGraph;

  /** Creates an advisor from a successful project validation result. */
  public constructor(result: ValidProjectResult) {
    this.graph = result.graph;
  }

  /** Lists imported node types that can be refined by a new node in the selected model. */
  public suggestNodeRefinements(modelId: Id): readonly NodeRefinementSuggestion[] {
    return this.importedModels(modelId)
      .flatMap((model: GModel): NodeRefinementSuggestion[] =>
        model.classifiers.flatMap((classifier): NodeRefinementSuggestion[] => {
          if (classifier.kind !== 'GNode') return [];
          return [
            {
              modelId: model.id,
              nodeId: classifier.id,
              ref: ModelRef.qualify(model.id, classifier.id),
              name: classifier.name,
            },
          ];
        }),
      )
      .sort((left: NodeRefinementSuggestion, right: NodeRefinementSuggestion): number => left.name.localeCompare(right.name));
  }

  /** Lists primitive and reachable declared data types available to an attribute. */
  public suggestDataTypes(modelId: Id): readonly DataTypeSuggestion[] {
    const builtins: DataTypeSuggestion[] = BuiltinDataTypes.values.map((type: BuiltinType): DataTypeSuggestion => ({
      dataTypeId: type,
      ref: type,
      name: type,
      baseType: type,
    }));
    const declared: DataTypeSuggestion[] = [this.graph.getModel(modelId), ...this.importedModels(modelId)].flatMap(
      (model: GModel | undefined): DataTypeSuggestion[] => {
        if (!model) return [];
        return model.classifiers.flatMap((classifier): DataTypeSuggestion[] => {
          if (classifier.kind !== 'GDataType') return [];
          const dataType: GDataType = classifier;
          const ref: Ref = model.id === modelId ? dataType.id : ModelRef.qualify(model.id, dataType.id);
          return [{ modelId: model.id, dataTypeId: dataType.id, ref: ref, name: dataType.name, baseType: dataType.baseType }];
        });
      },
    );
    return [...builtins, ...declared].sort((left: DataTypeSuggestion, right: DataTypeSuggestion): number =>
      left.name.localeCompare(right.name),
    );
  }

  /** Lists concrete annotation types declared in the selected model and its imports. */
  public suggestAnnotationTypes(modelId: Id): readonly AnnotationTypeSuggestion[] {
    return [this.graph.getModel(modelId), ...this.importedModels(modelId)]
      .flatMap((model: GModel | undefined): AnnotationTypeSuggestion[] => {
        if (!model) return [];
        return model.classifiers.flatMap((classifier): AnnotationTypeSuggestion[] => {
          if (classifier.kind !== 'GNode') return [];
          const metadata: RamenAnnotationType | undefined = AnnotationTypes.read(classifier);
          if (!metadata) return [];
          return [
            {
              modelId: model.id,
              nodeId: classifier.id,
              ref: model.id === modelId ? classifier.id : ModelRef.qualify(model.id, classifier.id),
              name: classifier.name,
              typeValue: metadata.typeValue,
            },
          ];
        });
      })
      .sort((left: AnnotationTypeSuggestion, right: AnnotationTypeSuggestion): number =>
        left.typeValue.localeCompare(right.typeValue),
      );
  }

  /** Lists imported relations whose endpoint types accept the selected source and target nodes. */
  public suggestRelations(modelId: Id, fromNodeId: Id, toNodeId: Id): readonly RelationRefinementSuggestion[] {
    const from: ResolvedModelElement<GNode> | undefined = this.resolveLocalNode(modelId, fromNodeId);
    const to: ResolvedModelElement<GNode> | undefined = this.resolveLocalNode(modelId, toNodeId);
    if (!from || !to) return [];

    return this.importedModels(modelId)
      .flatMap((model: GModel): RelationRefinementSuggestion[] =>
        model.relations.flatMap((relation: GRelation): RelationRefinementSuggestion[] => {
          if (!this.accepts(model.id, relation.from.nodeId, from) || !this.accepts(model.id, relation.to.nodeId, to)) return [];
          return [
            {
              modelId: model.id,
              relationId: relation.id,
              ref: ModelRef.qualify(model.id, relation.id),
              name: relation.name,
              actions: ['reuse', 'refine'],
              explanation: `'${relation.name}' accepts '${from.element.name}' as source and '${to.element.name}' as target.`,
            },
          ];
        }),
      )
      .sort((left: RelationRefinementSuggestion, right: RelationRefinementSuggestion): number =>
        left.name.localeCompare(right.name),
      );
  }

  private importedModels(modelId: Id): readonly GModel[] {
    return this.graph.getModels().filter((model: GModel): boolean => model.id !== modelId);
  }

  private resolveLocalNode(modelId: Id, nodeId: Id): ResolvedModelElement<GNode> | undefined {
    const node: GNode | undefined = this.graph.getNode(modelId, nodeId);
    return node ? { modelId: modelId, element: node } : undefined;
  }

  private accepts(ownerModelId: Id, requiredRef: Ref, actual: ResolvedModelElement<GNode>): boolean {
    const required: ResolvedModelElement<GNode> | undefined = this.graph.resolveNode(ownerModelId, requiredRef);
    if (!required) return false;
    if (required.modelId === actual.modelId && required.element.id === actual.element.id) return true;
    return this.graph
      .getNodeAncestors(actual.modelId, actual.element.id)
      .some(
        (ancestor: ResolvedModelElement<GNode>): boolean =>
          ancestor.modelId === required.modelId && ancestor.element.id === required.element.id,
      );
  }
}
