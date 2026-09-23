import { ModelEditor, ModelFactory, createModelBundle, parseModelBundle } from '../../model/index';
import type {
  Bounds,
  Classifier,
  CreateBundleResult,
  CreateAttributeInput,
  CreateDataTypeInput,
  CreateModelInput,
  Attribute,
  DataType,
  Model,
  ModelBundle,
  Node,
  Relation,
  Id,
  ProjectValidationResult,
  UpdateAttributeInput,
  UpdateDataTypeInput,
  UpdateNodeInput,
  UpdateRelationInput,
} from '../../model/index';
import { RamenAnnotation, RamenAnnotationProperty, RamenAnnotationRelation, RamenAnnotations } from '../model/Annotations';
import { RAMEN_MODEL } from '../model/ReferenceModel';
import { RamenValidator } from '../validation/ModelValidator';
import { RamenAdvisor } from './Advisor';

/** Reference to one node or relation in a specific model. */
export interface RamenElementRef {
  readonly modelId: Id;
  readonly elementId: Id;
}

/** Values needed to create a project node refining an existing node. */
export interface CreateRamenNodeInput {
  readonly name: string;
  readonly refines: RamenElementRef;
}

/** Values needed to create a project relation refining an existing relation. */
export interface CreateRamenRelationInput {
  readonly refines: RamenElementRef;
  readonly fromNodeId: Id;
  readonly toNodeId: Id;
  readonly fromBounds?: Bounds;
  readonly toBounds?: Bounds;
}

/** Values needed to declare one closed annotation variant for a local Annotation node. */
export interface CreateRamenAnnotationInput {
  readonly annotationId: Id;
  readonly type: string;
  readonly properties?: readonly RamenAnnotationProperty[];
  readonly relations?: readonly RamenAnnotationRelation[];
}

/** Values needed to narrow an inherited annotation definition for a refined Annotation node. */
export interface RefineRamenAnnotationInput {
  readonly annotationId: Id;
  readonly refines: RamenElementRef;
  readonly properties?: readonly RamenAnnotationProperty[];
  readonly relations?: readonly RamenAnnotationRelation[];
}

/** Editable fields of a locally declared annotation definition. */
export interface UpdateRamenAnnotationInput {
  readonly type?: string;
  readonly properties?: readonly RamenAnnotationProperty[];
  readonly relations?: readonly RamenAnnotationRelation[];
}

/** Result of a model change together with immediate whole-project validation. */
export interface RamenChange<T> {
  readonly element: T;
  readonly validation: ProjectValidationResult;
}

/** Stateful convenience API for creating and validating one RAMEN project model. */
export class RamenProject {
  private model: Model;
  private readonly dependencies: ReadonlyMap<Id, Model>;
  private readonly validator: RamenValidator = new RamenValidator();

  private constructor(model: Model, dependencies: readonly Model[]) {
    this.model = structuredClone(model);
    this.dependencies = new Map<Id, Model>(dependencies.map((item: Model): [Id, Model] => [item.id, structuredClone(item)]));
  }

  /** Creates an empty project that imports the current RAMEN reference model. */
  public static create(input: CreateModelInput): RamenProject {
    return this.createLevel(RAMEN_MODEL, input);
  }

  /** Creates another model level that imports an existing RAMEN project model. */
  public static createLevel(base: Model, input: CreateModelInput, dependencies: readonly Model[] = []): RamenProject {
    const models: Map<Id, Model> = new Map<Id, Model>([
      [RAMEN_MODEL.id, RAMEN_MODEL],
      ...dependencies.map((model: Model): [Id, Model] => [model.id, model]),
      [base.id, base],
    ]);
    return new RamenProject(ModelFactory.createModel(base, input), [...models.values()]);
  }

  /** Creates the next model level while retaining the complete dependency chain. */
  public createNextLevel(input: CreateModelInput): RamenProject {
    return RamenProject.createLevel(this.model, input, [...this.dependencies.values()]);
  }

  /** Loads a project with all models needed to resolve its imports. */
  public static load(model: Model, dependencies: readonly Model[] = [RAMEN_MODEL]): RamenProject {
    return new RamenProject(model, dependencies);
  }

  /** Imports a validated single-file bundle and restores its editable root project. */
  public static importBundle(input: unknown): RamenProject {
    const bundle: ModelBundle = parseModelBundle(input);
    const root: Model | undefined = bundle.models.find((model: Model): boolean => model.id === bundle.rootModelId);

    if (!root) throw new Error(`Root model not found: '${bundle.rootModelId}'.`);
    const dependencies: readonly Model[] = bundle.models.filter((model: Model): boolean => model.id !== root.id);

    return new RamenProject(root, dependencies);
  }

  /** Returns a detached snapshot of the current project model. */
  public getModel(): Model {
    return structuredClone(this.model);
  }

  /** Returns detached snapshots of the current model and every transitive dependency. */
  public getModels(): readonly Model[] {
    return this.validationInputs().map((model: Model): Model => structuredClone(model));
  }

  /** Exports the current project and every reachable dependency as one portable bundle. */
  public exportBundle(): CreateBundleResult {
    return createModelBundle(this.model.id, this.validationInputs());
  }

  /** Validates the complete current project and returns its graph on success. */
  public validate(): ProjectValidationResult {
    return this.validator.validateProject(this.model.id, this.validationInputs());
  }

  /** Creates an advisor when the current project is valid. */
  public createAdvisor(): RamenAdvisor | undefined {
    const result: ProjectValidationResult = this.validate();
    return result.valid ? new RamenAdvisor(result) : undefined;
  }

  /** Adds a node refinement and immediately validates the resulting project. */
  public createNode(input: CreateRamenNodeInput): RamenChange<Node> {
    const node: Node = ModelFactory.createNode(input.refines.modelId, {
      name: input.name,
      baseNodeId: input.refines.elementId,
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
    const annotation: RamenAnnotation = {
      id: ModelFactory.createIdentifier(),
      annotationId: input.annotationId,
      type: input.type,
      properties: structuredClone(input.properties ?? []),
      relations: structuredClone(input.relations ?? []),
    };

    this.model = RamenAnnotations.add(this.model, annotation);
    return this.change(annotation);
  }

  /** Narrows an inherited annotation definition for a refined local Annotation node. */
  public refineAnnotation(input: RefineRamenAnnotationInput): RamenChange<RamenAnnotation> {
    const parent: RamenAnnotation | undefined = this.findAnnotation(input.refines);
    if (!parent) throw new Error(`Annotation definition not found: '${input.refines.modelId}:${input.refines.elementId}'.`);
    const annotation: RamenAnnotation = {
      id: ModelFactory.createIdentifier(),
      annotationId: input.annotationId,
      type: parent.type,
      refines: `${input.refines.modelId}:${input.refines.elementId}`,
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

  /** Adds a relation refinement and immediately validates the resulting project. */
  public createRelation(input: CreateRamenRelationInput): RamenChange<Relation> {
    const base: Model | undefined = this.findModel(input.refines.modelId);
    if (!base) throw new Error(`Relation base model not found: '${input.refines.modelId}'.`);
    const relation: Relation = ModelFactory.createRelation(base, input.refines.modelId, {
      baseRelationId: input.refines.elementId,
      fromNodeId: input.fromNodeId,
      toNodeId: input.toNodeId,
    });
    const narrowed: Relation = {
      ...relation,
      from: { ...relation.from, bounds: input.fromBounds ?? relation.from.bounds },
      to: { ...relation.to, bounds: input.toBounds ?? relation.to.bounds },
    };

    this.model = ModelEditor.addRelation(this.model, narrowed);
    return this.change(narrowed);
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

  private findAnnotation(reference: RamenElementRef): RamenAnnotation | undefined {
    const model: Model | undefined = this.findModel(reference.modelId);
    if (!model) return undefined;
    return RamenAnnotations.get(model).find((annotation: RamenAnnotation): boolean => annotation.id === reference.elementId);
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
        (property: RamenAnnotationProperty): boolean => property.attributeId !== input.attributeId,
      );
      const relations: readonly RamenAnnotationRelation[] = annotation.relations.filter(
        (relation: RamenAnnotationRelation): boolean => !input.relationIds?.has(relation.relationId),
      );

      if (properties.length === annotation.properties.length && relations.length === annotation.relations.length) continue;
      this.model = RamenAnnotations.update(this.model, annotation.id, {
        ...annotation,
        properties: properties,
        relations: relations,
      });
    }
  }
}
