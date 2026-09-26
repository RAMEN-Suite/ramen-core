import { ModelEditor, ModelFactory, ModelRef } from '../model/index';
import type {
  Bounds,
  Classifier,
  ConstraintRegistry,
  CreateAttributeInput,
  CreateDataTypeInput,
  CreateModelInput,
  Attribute,
  DataType,
  Model,
  ProjectGraph,
  Literal,
  Node,
  Relation,
  Id,
  ProjectValidationResult,
  UpdateAttributeInput,
  UpdateDataTypeInput,
  UpdateNodeInput,
  UpdateRelationInput,
  ValidationResult,
} from '../model/index';
import { RamenAnnotation, RamenAnnotationProperty, RamenAnnotationRelation, RamenAnnotations } from './annotations/Definitions';
import { RamenModelFormat } from './model/Document';
import type { RamenModelDocument } from './model/Document';
import { RAMEN_MODEL } from './model/ReferenceModel';
import { RamenValidator } from './validation/ModelValidator';
import { RamenInstanceValidator } from './validation/InstanceValidator';
import type { AnnotationPropertyAdvice } from './annotations/Advisor';
import { RamenAdvisor } from './Advisor';
import type { AnnotationSuggestion, AttributeSuggestion, RelationRefinementSuggestion } from './Advisor';
import { createRamenBundle, parseRamenBundle } from './exchange/Bundle';
import type { CreateRamenBundleResult, RamenModelBundle } from './exchange/Bundle';
import { RamenEvolution } from './exchange/Comparison';
import type { RamenEvolutionReport } from './exchange/Comparison';

/** Reference to one node or relation in a specific model. */
export interface RamenElementRef {
  readonly modelId: Id;
  readonly elementId: Id;
}

/** An element ID is enough when it is unique in the current model chain. */
export type RamenRef = Id | RamenElementRef;

type RamenRelationKind = 'PART_OF' | 'HAS_ANNOTATION' | 'REFERS_TO';

/** Values needed to create a project node refining an existing node. */
export interface CreateRamenNodeInput {
  readonly name: string;
  readonly refines: RamenRef;
}

/** Values needed to create a project relation refining an existing relation. */
export interface CreateRamenRelationInput {
  readonly refines: RamenRef;
  readonly fromNodeId: Id;
  readonly toNodeId: Id;
  readonly fromBounds?: Bounds;
  readonly toBounds?: Bounds;
}

/** Values needed to declare one closed annotation variant on a local or imported Annotation node. */
export interface CreateRamenAnnotationInput {
  readonly annotationId: RamenRef;
  readonly type: string;
  readonly properties?: readonly RamenAnnotationProperty[];
  readonly relations?: readonly RamenAnnotationRelation[];
}

/** Editable fields of a locally declared annotation definition. */
export interface UpdateRamenAnnotationInput {
  readonly type?: string;
  readonly properties?: readonly RamenAnnotationProperty[];
  readonly relations?: readonly RamenAnnotationRelation[];
}

/** Values of a named literal in a project-defined data type. */
export interface CreateRamenLiteralInput {
  readonly name: string;
  readonly literal?: string;
  readonly value?: number;
}

/** Editable fields of a locally declared data type literal. */
export type UpdateRamenLiteralInput = Partial<Pick<Literal, 'name' | 'literal' | 'value' | 'constraints' | 'ext'>>;

/** Result of a model change together with immediate whole-project validation. */
export interface RamenChange<T> {
  readonly element: T;
  readonly validation: ProjectValidationResult;
}

/** Stateful convenience API for creating and validating one RAMEN project model. */
export class RamenModel {
  private model: Model;
  private readonly dependencies: ReadonlyMap<Id, Model>;
  private readonly validator: RamenValidator = new RamenValidator();

  private validatedModel: Model | undefined;
  private validation: ProjectValidationResult | undefined;
  private advisor: RamenAdvisor | undefined;

  private constructor(model: RamenModelDocument, dependencies: readonly Model[]) {
    this.model = structuredClone(model);
    this.dependencies = new Map<Id, Model>(dependencies.map((item: Model): [Id, Model] => [item.id, structuredClone(item)]));
  }

  /** Creates an empty project that imports the current RAMEN reference model. */
  public static create(input: CreateModelInput): RamenModel {
    return this.createLevel(RAMEN_MODEL, input);
  }

  /** Creates another model level that imports an existing RAMEN project model. */
  public static createLevel(base: Model, input: CreateModelInput, dependencies: readonly Model[] = []): RamenModel {
    const models: Map<Id, Model> = new Map<Id, Model>([
      [RAMEN_MODEL.id, RAMEN_MODEL],
      ...dependencies.map((model: Model): [Id, Model] => [model.id, model]),
      [base.id, base],
    ]);
    return new RamenModel(RamenModelFormat.create(ModelFactory.createModel(base, input)), [...models.values()]);
  }

  /** Creates the next model level while retaining the complete dependency chain. */
  public createNextLevel(input: CreateModelInput): RamenModel {
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

  /** Returns detached snapshots of the current model and every transitive dependency. */
  public getModels(): readonly Model[] {
    return this.validationInputs().map((model: Model): Model => structuredClone(model));
  }

  /** Exports the current project and every reachable dependency as one portable bundle. */
  public exportBundle(): CreateRamenBundleResult {
    return createRamenBundle(this.model.id, this.validationInputs());
  }

  /** Validates the complete current project and returns its graph on success. */
  public validate(): ProjectValidationResult {
    if (this.validatedModel === this.model && this.validation) return this.validation;
    const result: ProjectValidationResult = this.validator.validateProject(this.model.id, this.validationInputs());
    this.validatedModel = this.model;
    this.advisor = undefined;
    this.validation = Object.freeze({
      ...result,
      diagnostics: Object.freeze(result.diagnostics.map((diagnostic): typeof diagnostic => Object.freeze(diagnostic))),
    });
    return this.validation;
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

  /** Returns an advisor or explains why the current model cannot provide suggestions. */
  public createAdvisor(): RamenAdvisor {
    const result: ProjectValidationResult = this.validate();
    if (!result.valid)
      throw new Error(`Cannot advise an invalid RAMEN model: ${result.diagnostics[0]?.message ?? 'Unknown error.'}`);

    this.advisor ??= new RamenAdvisor(result, this.validationInputs());
    return this.advisor;
  }

  /** Lists attributes visible on a local or imported node. */
  public suggestAttributes(nodeId: Id): readonly AttributeSuggestion[] {
    const owner: RamenElementRef = this.resolveRef(nodeId, 'node');
    return this.createAdvisor().suggestAttributes(owner.modelId, owner.elementId);
  }

  /** Lists the properties selected or declared by one annotation type. */
  public suggestAttributesForAnnotation(nodeId: Id, type: string): readonly AnnotationPropertyAdvice[] {
    return this.createAdvisor().suggestAttributesForAnnotation(this.model.id, this.nodeReference(nodeId), type);
  }

  /** Lists relations that can connect two nodes in this model. */
  public suggestRelations(fromNodeId: Id, toNodeId: Id): readonly RelationRefinementSuggestion[] {
    return this.createAdvisor().suggestRelations(this.model.id, this.nodeReference(fromNodeId), this.nodeReference(toNodeId));
  }

  /** Lists annotation definitions available on a local or imported node. */
  public suggestAnnotations(nodeId: Id): readonly AnnotationSuggestion[] {
    const owner: RamenElementRef = this.resolveRef(nodeId, 'node');
    const reference: Id = owner.modelId === this.model.id ? owner.elementId : ModelRef.qualify(owner.modelId, owner.elementId);
    return this.createAdvisor().suggestAnnotations(this.model.id, reference);
  }

  /** Lists annotation types allowed on a carrier, optionally for one chosen Annotation node. */
  public suggestAnnotationsForNode(nodeId: Id, annotationNodeId?: Id): readonly AnnotationSuggestion[] {
    const target: Id | undefined = annotationNodeId ? this.nodeReference(annotationNodeId) : undefined;
    return this.createAdvisor().suggestAnnotationsForNode(this.model.id, this.nodeReference(nodeId), target);
  }

  /** Adds a node refinement and immediately validates the resulting project. */
  public createNode(input: CreateRamenNodeInput): RamenChange<Node> {
    const base: RamenElementRef = this.resolveRef(input.refines, 'node');
    const node: Node = ModelFactory.createNode(base.modelId, {
      name: input.name,
      baseNodeId: base.elementId,
    });

    this.model = ModelEditor.addClassifier(this.model, node);
    return this.change(node);
  }

  /** Updates a local node and immediately validates the resulting project. */
  public updateNode(nodeId: Id, input: UpdateNodeInput): RamenChange<Node> {
    this.requireNode(nodeId);
    this.model = ModelEditor.updateNode(this.model, nodeId, input);

    return this.change(this.requireNode(nodeId));
  }

  /** Removes a local node and its connected local relations. */
  public removeNode(nodeId: Id): RamenChange<Node> {
    const node: Node = this.requireNode(nodeId);
    const relationIds: Set<Id> = new Set<Id>(
      this.model.relations
        .filter((relation: Relation): boolean => relation.from.nodeId === nodeId || relation.to.nodeId === nodeId)
        .map((relation: Relation): Id => relation.id),
    );

    this.model = ModelEditor.removeNode(this.model, nodeId);
    this.cleanAnnotationReferences({ nodeId: nodeId, relationIds: relationIds });

    return this.change(node);
  }

  /** Returns the closed annotation variants declared directly by the project model. */
  public getAnnotations(): readonly RamenAnnotation[] {
    return RamenAnnotations.get(this.model);
  }

  /** Declares a new annotation variant without creating another model node. */
  public createAnnotation(input: CreateRamenAnnotationInput): RamenChange<RamenAnnotation> {
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
  public updateAnnotation(annotationId: Id, input: UpdateRamenAnnotationInput): RamenChange<RamenAnnotation> {
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

  /** Adds an attribute to a local node and immediately validates the resulting project. */
  public createAttribute(nodeId: Id, input: CreateAttributeInput): RamenChange<Attribute> {
    const attribute: Attribute = ModelFactory.createAttribute(input);
    this.model = ModelEditor.addAttribute(this.model, nodeId, attribute);
    return this.change(attribute);
  }

  /** Updates an attribute by stable identifier and validates the resulting project. */
  public updateAttribute(nodeId: Id, attributeId: Id, input: UpdateAttributeInput): RamenChange<Attribute> {
    this.requireAttribute(nodeId, attributeId);
    this.model = ModelEditor.updateAttribute(this.model, nodeId, attributeId, input);

    return this.change(this.requireAttribute(nodeId, attributeId));
  }

  /** Removes an attribute by stable identifier and validates the resulting project. */
  public removeAttribute(nodeId: Id, attributeId: Id): RamenChange<Attribute> {
    const attribute: Attribute = this.requireAttribute(nodeId, attributeId);

    this.model = ModelEditor.removeAttribute(this.model, nodeId, attributeId);
    this.cleanAnnotationReferences({ attributeId: attributeId });

    return this.change(attribute);
  }

  /** Adds a scalar data type and immediately validates the resulting project. */
  public createDataType(input: CreateDataTypeInput): RamenChange<DataType> {
    const dataType: DataType = ModelFactory.createDataType(input);
    this.model = ModelEditor.addClassifier(this.model, dataType);
    return this.change(dataType);
  }

  /** Updates a local data type and validates the resulting project. */
  public updateDataType(dataTypeId: Id, input: UpdateDataTypeInput): RamenChange<DataType> {
    this.requireDataType(dataTypeId);
    this.model = ModelEditor.updateDataType(this.model, dataTypeId, input);

    return this.change(this.requireDataType(dataTypeId));
  }

  /** Removes a local data type and validates the resulting project. */
  public removeDataType(dataTypeId: Id): RamenChange<DataType> {
    const dataType: DataType = this.requireDataType(dataTypeId);

    this.model = ModelEditor.removeClassifierById(this.model, dataTypeId);

    return this.change(dataType);
  }

  /** Adds one named literal to a local data type. */
  public createLiteral(dataTypeId: Id, input: CreateRamenLiteralInput): RamenChange<Literal> {
    const dataType: DataType = this.requireDataType(dataTypeId);
    const literal: Literal = ModelFactory.createLiteral(input.name, input.literal, input.value);
    const literals: [Literal, ...Literal[]] = [literal, ...(dataType.literals ?? [])];

    this.model = ModelEditor.updateDataType(this.model, dataTypeId, { literals: literals });
    return this.change(literal);
  }

  /** Updates one literal by stable identifier. */
  public updateLiteral(dataTypeId: Id, literalId: Id, input: UpdateRamenLiteralInput): RamenChange<Literal> {
    const dataType: DataType = this.requireDataType(dataTypeId);
    const current: Literal = this.requireLiteral(dataType, literalId);
    const literal: Literal = { ...current, ...structuredClone(input) };
    const literals: [Literal, ...Literal[]] = (dataType.literals ?? []).map((item: Literal): Literal =>
      item.id === literalId ? literal : item,
    ) as [Literal, ...Literal[]];

    this.model = ModelEditor.updateDataType(this.model, dataTypeId, { literals: literals });
    return this.change(literal);
  }

  /** Removes one literal; an empty data type becomes unrestricted again. */
  public removeLiteral(dataTypeId: Id, literalId: Id): RamenChange<Literal> {
    const dataType: DataType = this.requireDataType(dataTypeId);
    const literal: Literal = this.requireLiteral(dataType, literalId);
    const remaining: Literal[] = (dataType.literals ?? []).filter((item: Literal): boolean => item.id !== literalId);

    this.model = ModelEditor.updateDataType(this.model, dataTypeId, {
      literals: remaining.length > 0 ? (remaining as [Literal, ...Literal[]]) : undefined,
    });
    return this.change(literal);
  }

  /** Adds a relation refinement and immediately validates the resulting project. */
  public createRelation(input: CreateRamenRelationInput): RamenChange<Relation> {
    const reference: RamenElementRef = this.resolveRef(input.refines, 'relation');
    const base: Model | undefined = this.findModel(reference.modelId);
    if (!base) throw new Error(`Relation base model not found: '${reference.modelId}'.`);
    const relation: Relation = ModelFactory.createRelation(base, reference.modelId, {
      baseRelationId: reference.elementId,
      fromNodeId: this.nodeReference(input.fromNodeId),
      toNodeId: this.nodeReference(input.toNodeId),
    });
    const narrowed: Relation = {
      ...relation,
      from: { ...relation.from, bounds: input.fromBounds ?? relation.from.bounds },
      to: { ...relation.to, bounds: input.toBounds ?? relation.to.bounds },
    };

    this.model = ModelEditor.addRelation(this.model, narrowed);
    return this.change(narrowed);
  }

  /** Connects local nodes using a chosen suggestion, or infers the unique most specific relation. */
  public connect(from: Node | Id, to: Node | Id, choice?: RelationRefinementSuggestion): RamenChange<Relation> {
    return this.connectBy(from, to, choice);
  }

  /** Creates a RAMEN PART_OF relation when the node types permit it. */
  public partOf(part: Node | Id, whole: Node | Id): RamenChange<Relation> {
    return this.connectBy(part, whole, undefined, 'PART_OF');
  }

  /** Creates a RAMEN HAS_ANNOTATION relation when the node types permit it. */
  public hasAnnotation(subject: Node | Id, annotation: Node | Id): RamenChange<Relation> {
    return this.connectBy(subject, annotation, undefined, 'HAS_ANNOTATION');
  }

  /** Creates a RAMEN REFERS_TO relation when the node types permit it. */
  public refersTo(annotation: Node | Id, target: Node | Id): RamenChange<Relation> {
    return this.connectBy(annotation, target, undefined, 'REFERS_TO');
  }

  private nodeReference(nodeId: Id): Id {
    const owner: RamenElementRef = this.resolveRef(nodeId, 'node');
    return owner.modelId === this.model.id ? owner.elementId : ModelRef.qualify(owner.modelId, owner.elementId);
  }

  private connectBy(
    from: Node | Id,
    to: Node | Id,
    choice?: RelationRefinementSuggestion,
    family?: RamenRelationKind,
  ): RamenChange<Relation> {
    const fromNodeId: Id = this.nodeReference(typeof from === 'string' ? from : from.id);
    const toNodeId: Id = this.nodeReference(typeof to === 'string' ? to : to.id);
    const validation: ProjectValidationResult = this.validate();
    if (!validation.valid) throw new Error('Cannot infer a relation from an invalid RAMEN model.');

    const compatible: readonly RelationRefinementSuggestion[] = this.createAdvisor().suggestRelations(
      this.model.id,
      fromNodeId,
      toNodeId,
    );
    const suggestions: readonly RelationRefinementSuggestion[] = family
      ? compatible.filter((candidate: RelationRefinementSuggestion): boolean =>
          this.belongsToRamenFamily(candidate, family, validation.graph),
        )
      : compatible;
    const mostSpecific: readonly RelationRefinementSuggestion[] = this.mostSpecificRelations(suggestions, validation.graph);

    const selected: RelationRefinementSuggestion | undefined = choice
      ? suggestions.find(
          (item: RelationRefinementSuggestion): boolean =>
            item.modelId === choice.modelId && item.relationId === choice.relationId,
        )
      : mostSpecific[0];

    if (choice && !selected) throw new Error(`Selected relation '${choice.relationId}' does not connect these nodes.`);
    if ((!choice && mostSpecific.length !== 1) || !selected) {
      const names: string = mostSpecific.map((item: RelationRefinementSuggestion): string => item.name).join(', ');
      throw new Error(
        `Expected one relation for '${fromNodeId}' -> '${toNodeId}', found ${mostSpecific.length}${names ? `: ${names}` : ''}.`,
      );
    }
    return this.createRelation({ refines: selected.relationId, fromNodeId: fromNodeId, toNodeId: toNodeId });
  }

  private belongsToRamenFamily(candidate: RelationRefinementSuggestion, family: RamenRelationKind, graph: ProjectGraph): boolean {
    return RAMEN_MODEL.relations.some(
      (base: Relation): boolean =>
        base.name === family &&
        graph.isRelationRefSameOrSubtype(candidate.modelId, candidate.relationId, RAMEN_MODEL.id, base.id),
    );
  }

  private mostSpecificRelations(
    suggestions: readonly RelationRefinementSuggestion[],
    graph: ProjectGraph,
  ): readonly RelationRefinementSuggestion[] {
    return suggestions.filter(
      (candidate: RelationRefinementSuggestion): boolean =>
        !suggestions.some(
          (other: RelationRefinementSuggestion): boolean =>
            other !== candidate &&
            graph.isRelationRefSameOrSubtype(other.modelId, other.relationId, candidate.modelId, candidate.relationId),
        ),
    );
  }

  /** Updates a local relation and validates the resulting project. */
  public updateRelation(relationId: Id, input: UpdateRelationInput): RamenChange<Relation> {
    this.requireRelation(relationId);
    this.model = ModelEditor.updateRelation(this.model, relationId, input);

    return this.change(this.requireRelation(relationId));
  }

  /** Removes a local relation and validates the resulting project. */
  public removeRelation(relationId: Id): RamenChange<Relation> {
    const relation: Relation = this.requireRelation(relationId);

    this.model = ModelEditor.removeRelationById(this.model, relationId);
    this.cleanAnnotationReferences({ relationIds: new Set<Id>([relationId]) });

    return this.change(relation);
  }

  private change<T>(element: T): RamenChange<T> {
    return { element: structuredClone(element), validation: this.validate() };
  }

  private validationInputs(): readonly Model[] {
    const models: Map<Id, Model> = new Map<Id, Model>(this.dependencies);
    models.set(this.model.id, this.model);
    return [...models.values()];
  }

  private findModel(modelId: Id): Model | undefined {
    if (modelId === this.model.id) return this.model;
    return this.dependencies.get(modelId);
  }

  private resolveRef(input: RamenRef, kind: 'node' | 'relation'): RamenElementRef {
    if (typeof input !== 'string') return input;
    if (ModelRef.isQualified(input)) {
      const parts: { readonly modelId: Id; readonly refId: Id } = ModelRef.splitQualified(input);
      return { modelId: parts.modelId, elementId: parts.refId };
    }

    const matches: RamenElementRef[] = this.validationInputs()
      .filter((model: Model): boolean => {
        if (kind === 'relation') return model.relations.some((relation: Relation): boolean => relation.id === input);
        return model.classifiers.some((item: Classifier): boolean => item.kind === 'Node' && item.id === input);
      })
      .map((model: Model): RamenElementRef => ({ modelId: model.id, elementId: input }));

    if (matches.length !== 1 || !matches[0]) throw new Error(`Expected one ${kind} with id '${input}', found ${matches.length}.`);
    return matches[0];
  }

  private requireNode(nodeId: Id): Node {
    const classifier: Classifier | undefined = this.model.classifiers.find((item: Classifier): boolean => item.id === nodeId);

    if (classifier?.kind !== 'Node') throw new Error(`Node not found: '${nodeId}'.`);

    return classifier;
  }

  private requireDataType(dataTypeId: Id): DataType {
    const classifier: Classifier | undefined = this.model.classifiers.find((item: Classifier): boolean => item.id === dataTypeId);

    if (classifier?.kind !== 'DataType') throw new Error(`Data type not found: '${dataTypeId}'.`);

    return classifier;
  }

  private requireLiteral(dataType: DataType, literalId: Id): Literal {
    const literal: Literal | undefined = dataType.literals?.find((item: Literal): boolean => item.id === literalId);
    if (!literal) throw new Error(`Literal not found: '${literalId}'.`);

    return literal;
  }

  private requireAttribute(nodeId: Id, attributeId: Id): Attribute {
    const attribute: Attribute | undefined = this.requireNode(nodeId).attributes.find(
      (item: Attribute): boolean => item.id === attributeId,
    );

    if (!attribute) throw new Error(`Attribute not found: '${attributeId}'.`);

    return attribute;
  }

  private requireRelation(relationId: Id): Relation {
    const relation: Relation | undefined = this.model.relations.find((item: Relation): boolean => item.id === relationId);

    if (!relation) throw new Error(`Relation not found: '${relationId}'.`);

    return relation;
  }

  private remainingRelations(
    relations: readonly RamenAnnotationRelation[],
    removed?: ReadonlySet<Id>,
  ): readonly RamenAnnotationRelation[] {
    return relations.flatMap((relation: RamenAnnotationRelation): RamenAnnotationRelation[] => {
      const refs: readonly Id[] = RamenAnnotations.relationRefs(relation).filter((ref: Id): boolean => !removed?.has(ref));
      const relationId: Id | undefined = refs[0];
      if (!relationId) return [];
      const { alternatives: _alternatives, ...rest }: RamenAnnotationRelation = relation;
      return [{ ...rest, relationId, ...(refs.length > 1 ? { alternatives: refs.slice(1) } : {}) }];
    });
  }

  private cleanAnnotationReferences(input: {
    readonly nodeId?: Id;
    readonly attributeId?: Id;
    readonly relationIds?: ReadonlySet<Id>;
  }): void {
    for (const annotation of this.getAnnotations()) {
      if (annotation.annotationId === input.nodeId) {
        this.model = RamenAnnotations.remove(this.model, annotation.id);
        continue;
      }
      const properties: readonly RamenAnnotationProperty[] = annotation.properties.filter(
        (property: RamenAnnotationProperty): boolean =>
          !('attributeId' in property) || property.attributeId !== input.attributeId,
      );
      const relations: readonly RamenAnnotationRelation[] = this.remainingRelations(annotation.relations, input.relationIds);

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
