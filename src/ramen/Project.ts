import { CreateAttributeInput, CreateDataTypeInput, CreateModelInput, ModelFactory } from '../gcore/model/Create';
import { ModelEditor } from '../gcore/model/Edit';
import { Bounds, GAttribute, GDataType, GModel, GNode, GRelation, Id } from '../gcore/model/Types';
import { ProjectValidationResult } from '../gcore/validation/Validate';
import { RamenAdvisor } from './Advisor';
import { AnnotationTypes } from './AnnotationTypes';
import { RAMEN_ELEMENT } from './Elements';
import { RAMEN_MODEL } from './Model';
import { RamenValidator } from './Validate';

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

/** Values needed to create a concrete annotation type in a project model. */
export interface CreateAnnotationTypeInput {
  readonly name: string;
  readonly typeValue: string;
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
    return new RamenProject(ModelFactory.createModel(RAMEN_MODEL, input), [RAMEN_MODEL]);
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

  /** Adds a node refining RAMEN Annotation and associates its stable serialized type value. */
  public createAnnotationType(input: CreateAnnotationTypeInput): RamenChange<GNode> {
    const node: GNode = AnnotationTypes.write(
      ModelFactory.createNode(RAMEN_MODEL.id, { name: input.name, baseNodeId: RAMEN_ELEMENT.ANNOTATION }),
      input.typeValue,
    );
    this.model = ModelEditor.addClassifier(this.model, node);
    return this.change(node);
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
}
