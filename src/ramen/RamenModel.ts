import { ModelDraft } from '../model/editing/Draft';
import type {
  ElementInput,
  ElementRef,
  ModelInput,
  NodeInput,
  RelationInput,
  LiteralInput,
  LiteralUpdate,
  ModelChange,
  Removal,
} from '../model/editing/Draft';
import { ModelFactory, ModelRef, ModelRelationScope } from '../model/index';
import type {
  Bounds,
  Node,
  ResolvedElement,
  ProjectGraph,
  ConstraintRegistry,
  Id,
  Model,
  Ref,
  Relation,
  RelationSelections,
  ProjectValidationResult,
  ValidProjectResult,
  ValidationResult,
} from '../model/index';
import { RamenAnnotation, AnnotationProperty, AnnotationRelation, RamenAnnotations } from './annotations/Definitions';
import { RamenModelFormat, RamenModelDocument } from './Document';
import { RAMEN_MODEL } from './ReferenceModel';
import { RamenValidator } from './validation/ModelValidator';
import { RamenInstanceValidator } from './data/InstanceValidator';
import type { AnnotationAdvice, PropertyAdvice, RelationAdvice } from './annotations/Advisor';
import { RamenAdvisor, AnnotationSuggestion } from './Advisor';
import { RamenFiles, RamenFile } from './exchange/File';
import { RamenEvolution, RamenEvolutionReport } from './exchange/Comparison';

/** Model-qualified element identifier. */
export type RamenElementRef = ElementRef;

/** An element, suggestion, local ID or qualified reference. */
export type RamenRef = ElementInput;

/** Values for a RAMEN node refinement. */
export type CreateRamenNodeInput = NodeInput & { readonly refines: ElementInput };

/** Values for a RAMEN relation refinement. */
export type CreateRamenRelationInput = RelationInput & { readonly refines: ElementInput };

/** Values for one data type literal. */
export type CreateRamenLiteralInput = LiteralInput;

/** Editable literal fields. */
export type UpdateRamenLiteralInput = LiteralUpdate;

/** Edited element and its project validation. */
export type RamenChange<T> = ModelChange<T>;

/** Select a RAMEN relationship by its name, other endpoint and annotation-side cardinality. */
export type AnnotationLink = {
  readonly relation: string;
  readonly bounds: Bounds;
} & ({ readonly from: RamenRef; readonly to?: never } | { readonly to: RamenRef; readonly from?: never });

/** Use a stored relation reference or select a relationship by its endpoints. */
export type AnnotationRelationInput = AnnotationRelation | AnnotationLink;

/** Values needed to declare one closed annotation variant on a local or imported Annotation node. */
export interface AnnotationInput {
  readonly annotationId: RamenRef;
  readonly type: string;
  readonly properties?: readonly AnnotationProperty[];
  readonly relations?: readonly AnnotationRelationInput[];
}

/** Editable fields of a locally declared annotation definition. */
export interface AnnotationUpdate {
  readonly type?: string;
  readonly properties?: readonly AnnotationProperty[];
  readonly relations?: readonly AnnotationRelationInput[];
}

/** Adds the RAMEN vocabulary and annotation rules to shared generic editing. */
export class RamenModel extends ModelDraft<RamenAdvisor> {
  private constructor(model: RamenModelDocument, dependencies: readonly Model[]) {
    super(model, dependencies);
  }

  protected check(): ProjectValidationResult {
    return new RamenValidator().validateProject(this.model.id, this.validationInputs());
  }

  protected advise(result: ValidProjectResult): RamenAdvisor {
    return new RamenAdvisor(result, this.validationInputs());
  }

  protected selections(): RelationSelections {
    return RamenAnnotations.relationSelections(this.validationInputs());
  }

  private family(name: string): readonly Ref[] {
    return RAMEN_MODEL.relations
      .filter((relation: Relation): boolean => relation.name === name)
      .map((relation: Relation): Ref => ModelRef.qualify(RAMEN_MODEL.id, relation.id));
  }

  /** Creates an empty project that imports the current RAMEN reference model. */
  public static create(input: ModelInput | string): RamenModel {
    return this.createLevel(RAMEN_MODEL, input);
  }

  /** Creates another model level that imports an existing RAMEN project model. */
  public static createLevel(base: Model, input: ModelInput | string, dependencies: readonly Model[] = []): RamenModel {
    const models: Map<Id, Model> = new Map<Id, Model>([
      [RAMEN_MODEL.id, RAMEN_MODEL],
      ...dependencies.map((model: Model): [Id, Model] => [model.id, model]),
      [base.id, base],
    ]);
    return new RamenModel(RamenModelFormat.create(ModelFactory.createModel(base, this.options(input))), [...models.values()]);
  }

  /** Creates the next model level while retaining the complete dependency chain. */
  public createNextLevel(input: ModelInput | string): RamenModel {
    return RamenModel.createLevel(this.model, input, [...this.dependencies.values()]);
  }

  /** Loads a project with all models needed to resolve its imports. */
  public static load(model: Model, dependencies: readonly Model[] = [RAMEN_MODEL]): RamenModel {
    if (!RamenModelFormat.isDocument(model)) throw new Error('Expected a RAMEN project model.');
    return new RamenModel(model, dependencies);
  }

  /** Exports a single RAMEN graph. Annotation types and inherited declarations are stored once. */
  public export(): RamenFile {
    return RamenFiles.write(this.model.id, this.validationInputs());
  }

  /** Restores an editable project from a shared graph and validates every model level. */
  public static import(input: unknown): RamenModel {
    const models: readonly Model[] = RamenFiles.read(input);
    const id: Id = (input as RamenFile).id;
    const model: Model | undefined = models.find((item: Model): boolean => item.id === id);
    if (!model) throw new Error('Exported RAMEN model not found.');
    return RamenModel.load(
      model,
      models.filter((item: Model): boolean => item.id !== id),
    );
  }

  /** Returns a detached snapshot of the current project model. */
  public getModel(): RamenModelDocument {
    return structuredClone(this.model) as RamenModelDocument;
  }

  /** Validates a complete data graph using this project's models and optional custom constraint languages. */
  public validateInstances(input: unknown, constraints?: ConstraintRegistry): ValidationResult {
    const validator: RamenInstanceValidator = constraints
      ? RamenInstanceValidator.withConstraints(constraints)
      : new RamenInstanceValidator();

    return validator.validate(this.model.id, this.validationInputs(), input);
  }

  /** Compares this project with a later state and includes RAMEN validation findings from both states. */
  public compareTo(next: RamenModel): RamenEvolutionReport {
    return RamenEvolution.compare(this.model.id, this.validationInputs(), next.model.id, next.validationInputs());
  }

  /** Lists properties and selected model relations available when declaring an annotation type. */
  public adviseAnnotation(node: ElementInput): AnnotationAdvice | undefined {
    return this.createAdvisor().adviseAnnotation(this.model.id, this.nodeReference(node));
  }

  /** Lists current-level relations allowed by one annotation type, including its cardinality rules. */
  public suggestRelationsForAnnotation(node: ElementInput, type: string): readonly RelationAdvice[] {
    return this.createAdvisor().suggestRelationsForAnnotation(this.model.id, this.nodeReference(node), type);
  }

  /** Lists the properties selected or declared by one annotation type. */
  public suggestAttributesForAnnotation(nodeId: ElementInput, type: string): readonly PropertyAdvice[] {
    return this.createAdvisor().suggestAttributesForAnnotation(this.model.id, this.nodeReference(nodeId), type);
  }

  /** Lists annotation definitions available on a local or imported node. */
  public suggestAnnotations(nodeId: ElementInput): readonly AnnotationSuggestion[] {
    const owner: RamenElementRef = this.resolveRef(nodeId, 'node');
    const reference: Id = owner.modelId === this.model.id ? owner.elementId : ModelRef.qualify(owner.modelId, owner.elementId);
    return this.createAdvisor().suggestAnnotations(this.model.id, reference);
  }

  /** Lists annotation types allowed on a carrier, optionally for one chosen Annotation node. */
  public suggestAnnotationsForNode(nodeId: ElementInput, annotationNodeId?: ElementInput): readonly AnnotationSuggestion[] {
    const target: Id | undefined = annotationNodeId ? this.nodeReference(annotationNodeId) : undefined;
    return this.createAdvisor().suggestAnnotationsForNode(this.model.id, this.nodeReference(nodeId), target);
  }

  /** Returns the closed annotation variants declared directly by the project model. */
  public getAnnotations(): readonly RamenAnnotation[] {
    return RamenAnnotations.get(this.model);
  }

  /**
   * Declares an annotation variant. Endpoint selections reuse allowed relations or refine them for narrower endpoints.
   * Throws on unavailable or ambiguous selections without changing the model. Stored definitions retain relation references.
   */
  public createAnnotation(input: AnnotationInput): RamenChange<RamenAnnotation> {
    const before: Model = this.model;
    try {
      const owner: RamenElementRef = this.resolveRef(input.annotationId, 'node');
      const annotation: RamenAnnotation = {
        id: ModelFactory.createIdentifier(),
        annotationId: owner.modelId === this.model.id ? owner.elementId : ModelRef.qualify(owner.modelId, owner.elementId),
        type: input.type,
        properties: structuredClone(input.properties ?? []),
        relations: this.annotationRelations(input.annotationId, input.relations ?? []),
      };

      this.model = RamenAnnotations.add(this.model, annotation);
      return this.change(annotation);
    } catch (error: unknown) {
      this.model = before;
      throw error;
    }
  }

  /** Updates a local annotation, resolving endpoint selections or preserving supplied references, then validates the project. */
  public updateAnnotation(annotationId: Id, input: AnnotationUpdate): RamenChange<RamenAnnotation> {
    const before: Model = this.model;
    try {
      const current: RamenAnnotation | undefined = this.getAnnotations().find(
        (annotation: RamenAnnotation): boolean => annotation.id === annotationId,
      );

      if (!current) throw new Error(`Annotation not found: '${annotationId}'.`);
      const annotation: RamenAnnotation = {
        ...current,
        type: input.type ?? current.type,
        properties: structuredClone(input.properties ?? current.properties),
        relations: this.annotationRelations(current.annotationId, input.relations ?? current.relations),
      };

      this.model = RamenAnnotations.update(this.model, annotationId, annotation);
      return this.change(annotation);
    } catch (error: unknown) {
      this.model = before;
      throw error;
    }
  }

  /** Removes a locally declared annotation and validates the complete project. */
  public removeAnnotation(annotationId: Id): RamenChange<RamenAnnotation> {
    const current: RamenAnnotation | undefined = this.getAnnotations().find(
      (annotation: RamenAnnotation): boolean => annotation.id === annotationId,
    );

    if (!current) throw new Error(`Annotation not found: '${annotationId}'.`);
    this.model = RamenAnnotations.remove(this.model, annotationId);
    return this.change(current);
  }

  /** Creates a RAMEN PART_OF relation when the node types permit it. */
  public partOf(part: ElementInput, whole: ElementInput): RamenChange<Relation> {
    return this.connectBy(part, whole, undefined, this.family('PART_OF'));
  }

  /** Creates a RAMEN HAS_ANNOTATION relation when the node types permit it. */
  public hasAnnotation(subject: ElementInput, annotation: ElementInput): RamenChange<Relation> {
    return this.connectBy(subject, annotation, undefined, this.family('HAS_ANNOTATION'));
  }

  /** Creates a RAMEN REFERS_TO relation when the node types permit it. */
  public refersTo(annotation: ElementInput, target: ElementInput): RamenChange<Relation> {
    return this.connectBy(annotation, target, undefined, this.family('REFERS_TO'));
  }

  private annotationRelations(owner: RamenRef, inputs: readonly AnnotationRelationInput[]): readonly AnnotationRelation[] {
    return inputs.map((input: AnnotationRelationInput): AnnotationRelation => {
      if ('relationId' in input) return structuredClone(input);
      const direction: 'incoming' | 'outgoing' = input.from !== undefined ? 'incoming' : 'outgoing';
      const from: RamenRef = input.from ?? owner;
      const to: RamenRef = input.to ?? owner;
      const reference: Ref = this.annotationRelation(input.relation, from, to);
      return { relationId: reference, direction, bounds: { ...input.bounds } };
    });
  }

  private annotationRelation(name: string, from: RamenRef, to: RamenRef): Ref {
    const result: ProjectValidationResult = this.validate();
    if (!result.valid) throw new Error('Cannot select a relationship from an invalid model.');
    const family: readonly Ref[] = this.family(name);
    if (family.length === 0) throw new Error(`Unknown RAMEN relationship '${name}'.`);
    const scope: ModelRelationScope = new ModelRelationScope(result.graph, this.selections());
    const source: ElementRef = this.resolveRef(from, 'node');
    const target: ElementRef = this.resolveRef(to, 'node');
    const local: readonly ResolvedElement<Relation>[] = scope.available(this.model.id);
    const bases: readonly ResolvedElement<Relation>[] = scope.bases(this.model.id);
    const matches: (item: ResolvedElement<Relation>) => boolean = (item: ResolvedElement<Relation>): boolean =>
      this.matchesAnnotationRelation(result.graph, item, family, source, target);
    const current: readonly ResolvedElement<Relation>[] = local.filter(matches);
    const candidates: readonly ResolvedElement<Relation>[] = current.length > 0 ? current : bases.filter(matches);
    if (candidates.length > 1)
      throw new Error(`Multiple '${name}' relationships match these endpoints. Select a relation reference.`);
    const selected: ResolvedElement<Relation> | undefined = candidates[0];
    if (selected)
      return selected.modelId === this.model.id ? selected.element.id : ModelRef.qualify(selected.modelId, selected.element.id);
    return this.connectBy(from, to, undefined, family).element.id;
  }

  private matchesAnnotationRelation(
    graph: ProjectGraph,
    item: ResolvedElement<Relation>,
    family: readonly Ref[],
    source: ElementRef,
    target: ElementRef,
  ): boolean {
    const reference: Ref = ModelRef.qualify(item.modelId, item.element.id);
    const ancestors: readonly ResolvedElement<Relation>[] = graph.getRelationAncestors(item.modelId, item.element.id);
    const belongs: boolean =
      family.includes(reference) ||
      ancestors.some((base: ResolvedElement<Relation>): boolean =>
        family.includes(ModelRef.qualify(base.modelId, base.element.id)),
      );
    if (!belongs) return false;
    const from: ResolvedElement<Node> | undefined = graph.resolveNode(item.modelId, item.element.from.nodeId);
    const to: ResolvedElement<Node> | undefined = graph.resolveNode(item.modelId, item.element.to.nodeId);
    return (
      from?.modelId === source.modelId &&
      from.element.id === source.elementId &&
      to?.modelId === target.modelId &&
      to.element.id === target.elementId
    );
  }

  private remainingRelations(relations: readonly AnnotationRelation[], removed?: ReadonlySet<Id>): readonly AnnotationRelation[] {
    return relations.flatMap((relation: AnnotationRelation): AnnotationRelation[] => {
      const refs: readonly Id[] = RamenAnnotations.relationRefs(relation).filter((ref: Id): boolean => !removed?.has(ref));
      const relationId: Id | undefined = refs[0];
      if (!relationId) return [];
      const { alternatives: _alternatives, ...rest }: AnnotationRelation = relation;
      return [{ ...rest, relationId, ...(refs.length > 1 ? { alternatives: refs.slice(1) } : {}) }];
    });
  }

  protected onRemove(input: Removal): void {
    const removed: ReadonlySet<Id> = new Set<Id>(
      [...(input.relationIds ?? [])].flatMap((id: Id): Id[] => [id, ModelRef.qualify(this.model.id, id)]),
    );
    for (const annotation of this.getAnnotations()) {
      if (input.nodeId !== undefined && ModelRef.matches(annotation.annotationId, this.model.id, input.nodeId)) {
        this.model = RamenAnnotations.remove(this.model, annotation.id);
        continue;
      }
      const properties: readonly AnnotationProperty[] = annotation.properties.filter(
        (property: AnnotationProperty): boolean =>
          !('attributeId' in property) ||
          input.attributeId === undefined ||
          !ModelRef.matches(property.attributeId, this.model.id, input.attributeId),
      );
      const relations: readonly AnnotationRelation[] = this.remainingRelations(annotation.relations, removed);

      if (
        properties.length === annotation.properties.length &&
        JSON.stringify(relations) === JSON.stringify(annotation.relations)
      )
        continue;
      this.model = RamenAnnotations.update(this.model, annotation.id, {
        ...annotation,
        properties: properties,
        relations: relations,
      });
    }
  }
}
