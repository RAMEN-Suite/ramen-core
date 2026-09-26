import { ModelDraft } from '../model/ModelDraft';
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
} from '../model/ModelDraft';
import { ModelFactory, ModelRef } from '../model/index';
import type {
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
import { RamenModelFormat, RamenModelDocument } from './model/Document';
import { RAMEN_MODEL } from './model/ReferenceModel';
import { RamenValidator } from './validation/ModelValidator';
import { RamenInstanceValidator } from './validation/InstanceValidator';
import type { AnnotationAdvice, PropertyAdvice, RelationAdvice } from './annotations/Advisor';
import { RamenAdvisor, AnnotationSuggestion } from './Advisor';
import { createRamenBundle, parseRamenBundle, CreateRamenBundleResult, RamenModelBundle } from './exchange/Bundle';
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

/** Values needed to declare one closed annotation variant on a local or imported Annotation node. */
export interface AnnotationInput {
  readonly annotationId: RamenRef;
  readonly type: string;
  readonly properties?: readonly AnnotationProperty[];
  readonly relations?: readonly AnnotationRelation[];
}

/** Editable fields of a locally declared annotation definition. */
export interface AnnotationUpdate {
  readonly type?: string;
  readonly properties?: readonly AnnotationProperty[];
  readonly relations?: readonly AnnotationRelation[];
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

  /** Imports a validated single-file bundle and restores its editable root project. */
  public static importBundle(input: unknown): RamenModel {
    const bundle: RamenModelBundle = parseRamenBundle(input);
    const root: Model | undefined = bundle.models.find((model: Model): boolean => model.id === bundle.rootModelId);

    if (!RamenModelFormat.isDocument(root)) throw new Error(`RAMEN project model not found: '${bundle.rootModelId}'.`);
    const dependencies: readonly Model[] = bundle.models.filter((model: Model): boolean => model.id !== root.id);

    return new RamenModel(root, dependencies);
  }

  /** Returns a detached snapshot of the current project model. */
  public getModel(): RamenModelDocument {
    return structuredClone(this.model) as RamenModelDocument;
  }

  /** Exports the current project and every reachable dependency as one portable bundle. */
  public exportBundle(): CreateRamenBundleResult {
    return createRamenBundle(this.model.id, this.validationInputs());
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

  /** Declares a new annotation variant without creating another model node. */
  public createAnnotation(input: AnnotationInput): RamenChange<RamenAnnotation> {
    const owner: RamenElementRef = this.resolveRef(input.annotationId, 'node');
    const annotation: RamenAnnotation = {
      id: ModelFactory.createIdentifier(),
      annotationId: owner.modelId === this.model.id ? owner.elementId : ModelRef.qualify(owner.modelId, owner.elementId),
      type: input.type,
      properties: structuredClone(input.properties ?? []),
      relations: structuredClone(input.relations ?? []),
    };

    this.model = RamenAnnotations.add(this.model, annotation);
    return this.change(annotation);
  }

  /** Updates a locally declared annotation and validates the complete project. */
  public updateAnnotation(annotationId: Id, input: AnnotationUpdate): RamenChange<RamenAnnotation> {
    const current: RamenAnnotation | undefined = this.getAnnotations().find(
      (annotation: RamenAnnotation): boolean => annotation.id === annotationId,
    );

    if (!current) throw new Error(`Annotation not found: '${annotationId}'.`);
    const annotation: RamenAnnotation = {
      ...current,
      type: input.type ?? current.type,
      properties: structuredClone(input.properties ?? current.properties),
      relations: structuredClone(input.relations ?? current.relations),
    };

    this.model = RamenAnnotations.update(this.model, annotationId, annotation);
    return this.change(annotation);
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
    for (const annotation of this.getAnnotations()) {
      if (annotation.annotationId === input.nodeId) {
        this.model = RamenAnnotations.remove(this.model, annotation.id);
        continue;
      }
      const properties: readonly AnnotationProperty[] = annotation.properties.filter(
        (property: AnnotationProperty): boolean => !('attributeId' in property) || property.attributeId !== input.attributeId,
      );
      const relations: readonly AnnotationRelation[] = this.remainingRelations(annotation.relations, input.relationIds);

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
