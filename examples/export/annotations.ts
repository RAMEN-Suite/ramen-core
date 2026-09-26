import assert from 'node:assert/strict';
import { ModelRef } from '../../dist/model/index.js';
import type {
  Attribute,
  Bounds,
  Classifier,
  Model,
  Node,
  ProjectGraph,
  Relation,
  ResolvedElement,
} from '../../dist/model/index.js';
import { RAMEN_ELEMENT, RAMEN_MODEL, RamenModelFormat } from '../../dist/ramen/index.js';
import type {
  AnnotationRelation,
  AnnotationSuggestion,
  PropertyAdvice,
  RamenAnnotation,
  RamenModel,
} from '../../dist/ramen/index.js';

export interface Group {
  readonly relations: readonly string[];
  readonly direction: 'incoming' | 'outgoing';
  readonly bounds: Bounds;
}

/** One effective type on one concrete Annotation node, with a closed property and relation allowlist. */
export interface AnnotationView {
  readonly ref: string;
  readonly nodeId: string;
  readonly type: string;
  readonly properties: readonly Attribute[];
  readonly relations: readonly Group[];
}

/** Resolves RAMEN-specific definitions after the generic graph has been validated. */
export class Annotations {
  private readonly definitions: Map<string, RamenAnnotation> = new Map<string, RamenAnnotation>();
  private readonly attributes: Map<string, Attribute> = new Map<string, Attribute>();
  public readonly selections: Map<string, readonly string[]> = new Map<string, readonly string[]>();

  private readonly project: RamenModel;
  private readonly graph: ProjectGraph;

  public constructor(project: RamenModel, graph: ProjectGraph) {
    this.project = project;
    this.graph = graph;
    for (const model of project.getModels()) {
      this.indexAttributes(model);
      if (!RamenModelFormat.isDocument(model)) continue;
      this.selections.set(
        model.id,
        model.annotations.flatMap((item: RamenAnnotation): string[] =>
          item.relations.flatMap((relation: AnnotationRelation): string[] => [
            relation.relationId,
            ...(relation.alternatives ?? []),
          ]),
        ),
      );
      for (const annotation of model.annotations) {
        this.definitions.set(ModelRef.qualify(model.id, annotation.id), annotation);
        for (const property of annotation.properties) {
          if (!('attributeId' in property)) this.addAttribute(model.id, property);
        }
      }
    }
  }

  private indexAttributes(model: Model): void {
    for (const classifier of model.classifiers) {
      if (classifier.kind !== 'Node') continue;
      for (const attribute of classifier.attributes) this.addAttribute(model.id, attribute);
    }
  }

  private addAttribute(modelId: string, attribute: Attribute): void {
    const builtin: boolean = ['String', 'Boolean', 'Integer', 'Float'].includes(attribute.typeId);
    const typeId: string =
      builtin || ModelRef.isQualified(attribute.typeId) ? attribute.typeId : ModelRef.qualify(modelId, attribute.typeId);
    this.attributes.set(ModelRef.qualify(modelId, attribute.id), { ...attribute, typeId });
  }

  /** Materializes each inherited definition for each applicable node without copying it into origin. */
  public resolve(
    nodes: readonly ResolvedElement<Node>[],
    relations: readonly ResolvedElement<Relation>[],
  ): readonly AnnotationView[] {
    return nodes.flatMap((node: ResolvedElement<Node>): AnnotationView[] => {
      const ref: string = ModelRef.qualify(node.modelId, node.element.id);
      return this.project.suggestAnnotations(ref).map((choice: AnnotationSuggestion): AnnotationView => {
        const definition: RamenAnnotation | undefined = this.definitions.get(
          ModelRef.qualify(choice.modelId, choice.annotationId),
        );
        assert.ok(definition);
        return {
          ref: ModelRef.qualify(choice.modelId, choice.annotationId),
          nodeId: ref,
          type: choice.type,
          properties: this.properties(ref, choice.type),
          relations: definition.relations.map((group: AnnotationRelation): Group =>
            this.group(group, choice.modelId, node, relations),
          ),
        };
      });
    });
  }

  private properties(nodeRef: string, type: string): readonly Attribute[] {
    const common: Classifier | undefined = RAMEN_MODEL.classifiers.find(
      (item: Classifier): boolean => item.id === RAMEN_ELEMENT.ANNOTATION,
    );
    assert.ok(common?.kind === 'Node');
    const result: Map<string, Attribute> = new Map<string, Attribute>();
    for (const property of common.attributes) {
      const resolved: Attribute | undefined = this.attributes.get(ModelRef.qualify(RAMEN_MODEL.id, property.id));
      assert.ok(resolved);
      result.set(resolved.name, resolved);
    }
    for (const choice of this.project.suggestAttributesForAnnotation(nodeRef, type)) {
      result.set(choice.name, this.property(choice));
    }
    return [...result.values()];
  }

  private property(choice: PropertyAdvice): Attribute {
    const attribute: Attribute | undefined = this.attributes.get(ModelRef.qualify(choice.modelId, choice.attributeId));
    assert.ok(attribute);
    return { ...attribute, bounds: choice.suggestedBounds };
  }

  private group(
    group: AnnotationRelation,
    ownerId: string,
    node: ResolvedElement<Node>,
    relations: readonly ResolvedElement<Relation>[],
  ): Group {
    const refs: readonly string[] = [group.relationId, ...(group.alternatives ?? [])];
    const matches: readonly ResolvedElement<Relation>[] = relations.filter((item: ResolvedElement<Relation>): boolean => {
      const end: string = group.direction === 'incoming' ? item.element.to.nodeId : item.element.from.nodeId;
      return (
        this.graph.acceptsNode(item.modelId, end, node) &&
        refs.some((ref: string): boolean => this.graph.isRelationRefSameOrSubtype(item.modelId, item.element.id, ownerId, ref))
      );
    });
    return {
      direction: group.direction,
      bounds: group.bounds,
      relations: matches.map((item: ResolvedElement<Relation>): string => ModelRef.qualify(item.modelId, item.element.id)),
    };
  }
}
