import { CreateAttributeInput, CreateDataTypeInput, CreateModelInput, ModelFactory } from '../gcore/model/Create';
import { ModelEditor } from '../gcore/model/Edit';
import { Bounds, GAttribute, GDataType, GModel, GNode, GRelation, Id } from '../gcore/model/Types';
import { ProjectValidationResult } from '../gcore/validation/Validate';
import { RamenAdvisor } from './Advisor';
import { RamenAnnotation, RamenAnnotationProperty, RamenAnnotationRelation, RamenAnnotations } from './Annotations';
import { RAMEN_MODEL } from './Model';
import { RamenValidator } from './ModelValidation';

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
  private model: GModel;
  private readonly dependencies: ReadonlyMap<Id, GModel>;
  private readonly validator: RamenValidator = new RamenValidator();

  private constructor(model: GModel, dependencies: readonly GModel[]) {
    this.model = structuredClone(model);
    this.dependencies = new Map<Id, GModel>(dependencies.map((item: GModel): [Id, GModel] => [item.id, structuredClone(item)]));
  }

  /** Creates an empty project that imports the current RAMEN reference model. */
  public static create(input: CreateModelInput): RamenProject {
    return this.createLevel(RAMEN_MODEL, input);
  }

  /** Creates another model level that imports an existing RAMEN project model. */
  public static createLevel(base: GModel, input: CreateModelInput, dependencies: readonly GModel[] = []): RamenProject {
    const models: Map<Id, GModel> = new Map<Id, GModel>([
      [RAMEN_MODEL.id, RAMEN_MODEL],
      ...dependencies.map((model: GModel): [Id, GModel] => [model.id, model]),
      [base.id, base],
    ]);
    return new RamenProject(ModelFactory.createModel(base, input), [...models.values()]);
  }

  /** Loads a project with all models needed to resolve its imports. */
  public static load(model: GModel, dependencies: readonly GModel[] = [RAMEN_MODEL]): RamenProject {
    return new RamenProject(model, dependencies);
  }

  /** Returns a detached snapshot of the current project model. */
  public getModel(): GModel {
    return structuredClone(this.model);
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
  public createNode(input: CreateRamenNodeInput): RamenChange<GNode> {
    const node: GNode = ModelFactory.createNode(input.refines.modelId, {
      name: input.name,
      baseNodeId: input.refines.elementId,
    });
    this.model = ModelEditor.addClassifier(this.model, node);
    return this.change(node);
  }

  /** Returns the closed annotation variants declared directly by the project model. */
  public getAnnotations(): readonly RamenAnnotation[] {
    return RamenAnnotations.get(this.model);
  }

  /** Declares a new annotation variant without creating another GCore node. */
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
  public createAttribute(nodeId: Id, input: CreateAttributeInput): RamenChange<GAttribute> {
    const attribute: GAttribute = ModelFactory.createAttribute(input);
    this.model = ModelEditor.addAttribute(this.model, nodeId, attribute);
    return this.change(attribute);
  }

  /** Adds a scalar data type and immediately validates the resulting project. */
  public createDataType(input: CreateDataTypeInput): RamenChange<GDataType> {
    const dataType: GDataType = ModelFactory.createDataType(input);
    this.model = ModelEditor.addClassifier(this.model, dataType);
    return this.change(dataType);
  }

  /** Adds a relation refinement and immediately validates the resulting project. */
  public createRelation(input: CreateRamenRelationInput): RamenChange<GRelation> {
    const base: GModel | undefined = this.findModel(input.refines.modelId);
    if (!base) throw new Error(`Relation base model not found: '${input.refines.modelId}'.`);
    const relation: GRelation = ModelFactory.createRelation(base, input.refines.modelId, {
      baseRelationId: input.refines.elementId,
      fromNodeId: input.fromNodeId,
      toNodeId: input.toNodeId,
    });
    const narrowed: GRelation = {
      ...relation,
      from: { ...relation.from, bounds: input.fromBounds ?? relation.from.bounds },
      to: { ...relation.to, bounds: input.toBounds ?? relation.to.bounds },
    };
    this.model = ModelEditor.addRelation(this.model, narrowed);
    return this.change(narrowed);
  }

  private change<T>(element: T): RamenChange<T> {
    return { element: structuredClone(element), validation: this.validate() };
  }

  private validationInputs(): readonly GModel[] {
    const models: Map<Id, GModel> = new Map<Id, GModel>(this.dependencies);
    models.set(this.model.id, this.model);
    return [...models.values()];
  }

  private findModel(modelId: Id): GModel | undefined {
    if (modelId === this.model.id) return this.model;
    return this.dependencies.get(modelId);
  }

  private findAnnotation(reference: RamenElementRef): RamenAnnotation | undefined {
    const model: GModel | undefined = this.findModel(reference.modelId);
    if (!model) return undefined;
    return RamenAnnotations.get(model).find((annotation: RamenAnnotation): boolean => annotation.id === reference.elementId);
  }
}
