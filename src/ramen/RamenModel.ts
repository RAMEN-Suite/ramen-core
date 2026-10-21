import { ModelDraft, type RemovalEffect } from '../model/editing/Draft.js';
import {
  type NodeRemovalPreview,
  type RelationRemovalPreview,
  type WorkspaceElement,
  type ElementInput,
  type ElementRef,
  type AttributeInput,
  type ModelInput,
  type ModelChange,
  ModelFactory,
  ModelRef,
  type ProjectMetadata,
  type RelationSelection,
  type RelationSelections,
  ConstraintRegistry,
  type ResolvedElement,
  type Diagnostic,
  type ProjectValidationResult,
  type ValidProjectResult,
  type ValidationResult,
  type Attribute,
  type Bounds,
  type Id,
  type Model,
  type Node,
  type Ref,
  type Relation,
} from '../model/index.js';
import { ModelWorkspace } from '../model/editing/Workspace.js';

import { InstanceValueValidator } from '../model/data/InstanceValues.js';
import { AnnotationIndex, ResolvedAnnotationShape } from './annotations/AnnotationIndex.js';
import { AnnotationProperties } from './annotations/Properties.js';

import {
  AnnotationShape,
  AnnotationShapeProperty,
  AnnotationShapeRelation,
  AnnotationShapes,
} from './annotations/Definitions.js';
import { AnnotationRemoval, type RamenNodeRemovalPreview, type RamenRelationRemovalPreview } from './annotations/Removal.js';
import { RamenModelFormat, RamenModelDocument } from './Document.js';
import { RAMEN_MODEL } from './ReferenceModel.js';
import { RamenValidator } from './validation/ModelValidator.js';
import { RamenInstanceValidator } from './data/InstanceValidator.js';
import type { AnnotationShapeOptions, PropertyOption, RelationOption } from './annotations/Advisor.js';
import { RamenAdvisor, AnnotationShapeSuggestion } from './Advisor.js';
import { RamenFiles, RamenFile } from './exchange/File.js';
import { RamenEvolution, RamenEvolutionReport } from './exchange/Comparison.js';

/** Select a permitted relationship by its other endpoint and annotation-side cardinality. */
export type AnnotationLink = {
  readonly bounds: Bounds;
} & ({ readonly from: ElementInput; readonly to?: never } | { readonly to: ElementInput; readonly from?: never });

/** Apply a selected relationship to an annotation shape with its own cardinality. */
export interface AnnotationConnection {
  readonly connection: RelationSelection;
  readonly bounds: Bounds;
}

/** Count selected relations under one cardinality rule. */
export interface AnnotationShapeRelationGroupInput {
  readonly relations: readonly Relation[];
  readonly direction: 'outgoing' | 'incoming';
  readonly bounds: Bounds;
}

/** Declare a property owned only by this annotation shape. */
export type AnnotationShapePropertyInput = AnnotationShapeProperty | AttributeInput;

/** Select relationships by objects, IDs or endpoints. */
export type AnnotationShapeRelationInput =
  | AnnotationShapeRelation
  | AnnotationShapeRelationGroupInput
  | {
      readonly relation: Relation;
      readonly relationId?: Ref;
      readonly direction: 'outgoing' | 'incoming';
      readonly bounds: Bounds;
    }
  | { readonly relationId: Ref; readonly direction: 'outgoing' | 'incoming'; readonly bounds: Bounds }
  | AnnotationLink
  | AnnotationConnection;

/** Select the Annotation node by object or ID; the object takes precedence. */
export type AnnotationShapeInput = {
  readonly type: string;
  readonly description?: string;
  readonly properties?: readonly AnnotationShapePropertyInput[];
  readonly relations?: readonly AnnotationShapeRelationInput[];
} & ({ readonly node: Node; readonly nodeId?: Ref } | { readonly node?: Node; readonly nodeId: Ref });

/** Editable fields of a locally declared annotation definition. */
export interface AnnotationShapeUpdate {
  readonly type?: string;
  readonly description?: string;
  readonly properties?: readonly AnnotationShapePropertyInput[];
  readonly relations?: readonly AnnotationShapeRelationInput[];
}

/** Adds the RAMEN vocabulary and annotation rules to shared generic editing. */
export class RamenModel extends ModelDraft<RamenAdvisor> {
  private constructor(
    model: RamenModelDocument,
    dependencies: readonly Model[],
    workspace?: ModelWorkspace,
    attach: boolean = false,
  ) {
    super(model, dependencies, workspace, attach);
  }

  protected check(): ProjectValidationResult {
    return new RamenValidator().validateProject(this.model.id, this.validationInputs());
  }

  protected buildAdvisor(result: ValidProjectResult): RamenAdvisor {
    return new RamenAdvisor(result, this.validationInputs());
  }

  protected override selections(): RelationSelections {
    return AnnotationShapes.relationSelections(this.validationInputs());
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

  /** Loads a project with all models needed to resolve its imports. */
  public static load(model: Model, dependencies: readonly Model[] = [RAMEN_MODEL]): RamenModel {
    if (!RamenModelFormat.isDocument(model)) throw new Error('Expected a RAMEN project model.');
    return new RamenModel(model, dependencies);
  }

  /** Restores an editable project from a shared graph and validates every model level. */
  public static import(input: unknown): RamenModel {
    const models: readonly Model[] = RamenFiles.read(input);
    const file: RamenFile = input as RamenFile;
    const id: Id = file.id;
    const model: Model | undefined = models.find((item: Model): boolean => item.id === id);
    if (!model) throw new Error('Exported RAMEN model not found.');
    if (!RamenModelFormat.isDocument(model)) throw new Error('Expected a RAMEN project model.');
    return new RamenModel(model, [], new ModelWorkspace(models, file.project), true);
  }

  /** Creates another level in the same editable model workspace. */
  public createNextLevel(input: ModelInput | string): RamenModel {
    const next: Model = ModelFactory.createModel(this.model, RamenModel.options(input));
    return new RamenModel(RamenModelFormat.create(next), [], this.workspace);
  }

  /** Opens an imported RAMEN project level for editing; the packaged reference model stays read-only. */
  public openLevel(modelId: Id): RamenModel {
    const model: Model | undefined = this.workspace.get(modelId);
    if (!model) throw new Error(`Model not found in workspace: '${modelId}'.`);
    if (!RamenModelFormat.isDocument(model)) throw new Error('The RAMEN reference model is read-only.');
    return new RamenModel(model, [], this.workspace, true);
  }

  /** Captures the entire editable RAMEN workspace, including sibling levels, as an independent state. */
  public snapshot(): RamenModel {
    return new RamenModel(this.getModel(), [], this.workspace.snapshot(), true);
  }

  /** Exports a single RAMEN graph. Annotation shapes and inherited declarations are stored once. */
  public export(project: ProjectMetadata | undefined = this.getProjectMetadata()): RamenFile {
    return RamenFiles.write(this.model.id, this.validationInputs(), project);
  }

  /** Compares complete RAMEN workspaces and includes validation findings from both states. */
  public compareTo(next: RamenModel): RamenEvolutionReport {
    return RamenEvolution.compare(this.model.id, this.workspace.all(), next.model.id, next.workspace.all());
  }

  /** Returns a detached snapshot of the current project model. */
  public override getModel(): RamenModelDocument {
    return structuredClone(this.model) as RamenModelDocument;
  }

  /** Returns the annotation shapes declared directly by the project model. */
  public getAnnotationShapes(): readonly AnnotationShape[] {
    return AnnotationShapes.get(this.model);
  }

  /** Lists all shared and shape-owned properties of one annotation shape. */
  public getPropertiesForAnnotationShape(annotation: ElementInput, type: string): readonly PropertyOption[] {
    return this.getAdvisor().getPropertiesForAnnotationShape(this.model.id, this.nodeReference(annotation), type);
  }

  /** Lists current-level relations allowed by one annotation shape, including its cardinality rules. */
  public getRelationsForAnnotationShape(node: ElementInput, type: string): readonly RelationOption[] {
    return this.getAdvisor().getRelationsForAnnotationShape(this.model.id, this.nodeReference(node), type);
  }

  /** Lists annotation shapes available on a local or imported node. */
  public suggestAnnotationShapes(annotation: ElementInput): readonly AnnotationShapeSuggestion[] {
    const owner: ElementRef = this.resolveRef(annotation, 'node');
    const reference: Id = owner.modelId === this.model.id ? owner.elementId : ModelRef.qualify(owner.modelId, owner.elementId);
    return this.getAdvisor().suggestAnnotationShapes(this.model.id, reference);
  }

  /** Lists annotation shapes allowed on a carrier, optionally for one chosen Annotation node. */
  public suggestAnnotationShapesForNode(node: ElementInput, annotation?: ElementInput): readonly AnnotationShapeSuggestion[] {
    const target: Id | undefined = annotation ? this.nodeReference(annotation) : undefined;
    return this.getAdvisor().suggestAnnotationShapesForNode(this.model.id, this.nodeReference(node), target);
  }

  /** Lists properties and selected model relations available when declaring an annotation shape. */
  public suggestAnnotationShapeOptions(node: ElementInput): AnnotationShapeOptions | undefined {
    return this.getAdvisor().suggestAnnotationShapeOptions(this.model.id, this.nodeReference(node));
  }

  /** Validates a complete data graph against this RAMEN model. */
  public validateInstances(input: unknown, constraints?: ConstraintRegistry): ValidationResult {
    const validator: RamenInstanceValidator = constraints
      ? RamenInstanceValidator.withConstraints(constraints)
      : new RamenInstanceValidator();

    return validator.validate(this.model.id, this.validationInputs(), input);
  }

  /**
   * Checks one property input for an annotation shape without requiring recorded nodes or links.
   * Throws if the type or property is unavailable. Cross-record rules require validateInstances().
   */
  public validateAnnotationValue(
    node: ElementInput,
    type: string,
    name: string,
    value: unknown,
    constraints: ConstraintRegistry = ConstraintRegistry.createDefault(),
  ): ValidationResult {
    const project: ProjectValidationResult = this.validate();
    if (!project.valid) return { hasErrors: true, diagnostics: project.diagnostics };

    const reference: Ref = this.nodeReference(node);
    const annotations: AnnotationIndex = new AnnotationIndex(project.graph, this.validationInputs());
    const actual: ResolvedElement<Node> | undefined = project.graph.resolveNode(this.model.id, reference);
    const selected: ResolvedAnnotationShape | undefined = annotations.findEffective(this.model.id, reference, type);
    if (!actual || !selected) throw new Error(`Annotation shape '${type}' not found on node '${reference}'.`);
    const attribute: Attribute | undefined = AnnotationProperties.allowed(project.graph, selected, actual).find(
      (item: Attribute): boolean => item.name === name,
    );
    if (!attribute) throw new Error(`Property '${name}' is not allowed for annotation '${type}'.`);

    const result: ValidationResult = new InstanceValueValidator(constraints).validateOneAttribute(
      project.graph,
      actual.modelId,
      attribute,
      value,
    );
    if (name !== 'selector') return result;
    const diagnostics: ValidationResult['diagnostics'] = [
      ...result.diagnostics,
      ...RamenInstanceValidator.validateSelector(value),
    ];
    return { diagnostics, hasErrors: diagnostics.some((item: Diagnostic): boolean => item.severity === 'error') };
  }

  /**
   * Declares an annotation shape. Relationship selections refer to existing allowed definitions; declaring a shape never creates relations.
   * Throws on unavailable or ambiguous selections without changing the model. Object selections are stored as references.
   */
  public createAnnotationShape(input: AnnotationShapeInput): ModelChange<AnnotationShape> {
    const annotationNode: ElementInput | undefined = input.node ?? input.nodeId;
    if (annotationNode === undefined) throw new Error('Select an Annotation node.');
    const owner: ElementRef = this.resolveRef(annotationNode, 'node');
    const annotation: AnnotationShape = {
      id: ModelFactory.createIdentifier(),
      annotationId: owner.modelId === this.model.id ? owner.elementId : ModelRef.qualify(owner.modelId, owner.elementId),
      type: input.type,
      description: input.description,
      properties: this.annotationProperties(input.properties ?? []),
      relations: this.annotationRelations(annotationNode, input.relations ?? []),
    };

    this.model = AnnotationShapes.add(this.model, annotation);
    return this.change(annotation);
  }

  /** Updates a local annotation shape, resolving endpoint selections or preserving supplied references, then validates the project. */
  public updateAnnotationShape(annotationId: Id, input: AnnotationShapeUpdate): ModelChange<AnnotationShape> {
    const current: AnnotationShape | undefined = this.getAnnotationShapes().find(
      (annotation: AnnotationShape): boolean => annotation.id === annotationId,
    );
    if (!current) throw new Error(`Annotation not found: '${annotationId}'.`);

    const annotation: AnnotationShape = {
      ...current,
      type: input.type ?? current.type,
      ...('description' in input ? { description: input.description } : {}),
      properties: this.annotationProperties(input.properties ?? current.properties),
      relations: this.annotationRelations(current.annotationId, input.relations ?? current.relations),
    };

    this.model = AnnotationShapes.update(this.model, annotationId, annotation);
    return this.change(annotation);
  }

  /** Removes a locally declared annotation and validates the complete project. */
  public removeAnnotationShape(annotationId: Id): ModelChange<AnnotationShape> {
    const current: AnnotationShape | undefined = this.getAnnotationShapes().find(
      (annotation: AnnotationShape): boolean => annotation.id === annotationId,
    );

    if (!current) throw new Error(`Annotation not found: '${annotationId}'.`);
    this.model = AnnotationShapes.remove(this.model, annotationId);
    return this.change(current);
  }

  /** Creates a RAMEN PART_OF relation when the node types permit it. */
  public partOf(part: ElementInput, whole: ElementInput): ModelChange<Relation> {
    return this.connectBy(part, whole, undefined, this.family('PART_OF'));
  }

  /** Creates a RAMEN HAS_ANNOTATION relation when the node types permit it. */
  public hasAnnotation(subject: ElementInput, annotation: ElementInput): ModelChange<Relation> {
    return this.connectBy(subject, annotation, undefined, this.family('HAS_ANNOTATION'));
  }

  /** Connects an Annotation to a Collection, Content or Entity, including their refinements. */
  public refersTo(annotation: ElementInput, target: ElementInput): ModelChange<Relation> {
    return this.connectBy(annotation, target, undefined, this.family('REFERS_TO'));
  }

  /** Shows nodes, relationships and annotation declarations affected by removing a node. */
  public override previewNodeRemoval(nodeId: Id): RamenNodeRemovalPreview {
    return new AnnotationRemoval(this.workspace).preview(super.previewNodeRemoval(nodeId));
  }

  /** Shows relationships and annotation declarations affected by removing a relationship. */
  public override previewRelationRemoval(relationId: Id): RamenRelationRemovalPreview {
    const preview: RelationRemovalPreview = super.previewRelationRemoval(relationId);
    const details: RamenNodeRemovalPreview = new AnnotationRemoval(this.workspace).preview({
      nodes: [],
      relations: preview.relations,
    });
    return { ...preview, updatedAnnotations: details.updatedAnnotations };
  }

  private annotationProperties(inputs: readonly AnnotationShapePropertyInput[]): readonly AnnotationShapeProperty[] {
    return inputs.map((input: AnnotationShapePropertyInput): AnnotationShapeProperty => {
      if ('id' in input) return structuredClone(input);
      return ModelFactory.createAttribute({
        ...input,
        typeId: this.attributeType(input),
        bounds: input.bounds ?? { lowerBound: 0, upperBound: 1 },
      });
    });
  }

  private annotationRelations(
    owner: ElementInput,
    inputs: readonly AnnotationShapeRelationInput[],
  ): readonly AnnotationShapeRelation[] {
    return inputs.map((input: AnnotationShapeRelationInput): AnnotationShapeRelation => {
      if ('relations' in input) {
        return {
          relationIds: input.relations.map((relation: Relation): Ref => this.relationReference(relation)),
          direction: input.direction,
          bounds: { ...input.bounds },
        };
      }

      if ('relation' in input) {
        return {
          relationIds: [this.relationReference(input.relation)],
          direction: input.direction,
          bounds: { ...input.bounds },
        };
      }
      if ('relationIds' in input) return structuredClone(input);
      if ('relationId' in input) {
        return { relationIds: [input.relationId], direction: input.direction, bounds: { ...input.bounds } };
      }
      if ('connection' in input) return this.connectionRule(owner, input);
      const from: ElementInput = input.from ?? owner;
      const to: ElementInput = input.to ?? owner;
      const connection: RelationSelection = this.requireConnection(from, to);
      return this.connectionRule(owner, { connection, bounds: input.bounds });
    });
  }

  private relationReference(relation: Relation): Ref {
    const selected: ElementRef = this.resolveRef(relation, 'relation');
    return selected.modelId === this.model.id ? selected.elementId : ModelRef.qualify(selected.modelId, selected.elementId);
  }

  private requireConnection(from: ElementInput, to: ElementInput, ref?: Ref): RelationSelection {
    const matches: readonly RelationSelection[] = this.getRelations(from, to).filter(
      (item: RelationSelection): boolean => ref === undefined || item.ref === ref,
    );
    const selected: RelationSelection | undefined = matches[0];

    if (matches.length !== 1 || !selected) {
      throw new Error(`Annotation rule requires one selected relationship, found ${matches.length}.`);
    }
    return selected;
  }

  private connectionRule(owner: ElementInput, input: AnnotationConnection): AnnotationShapeRelation {
    const reference: ElementRef = this.resolveRef(owner, 'node');
    const node: Ref = ModelRef.qualify(reference.modelId, reference.elementId);
    const connection: RelationSelection = input.connection;

    if (connection.from !== node && connection.to !== node)
      throw new Error('Selected relationship does not involve this Annotation node.');

    if (connection.from === node && connection.to === node)
      throw new Error('Select an explicit direction for a self-relationship.');

    const selected: RelationSelection = this.requireConnection(connection.from, connection.to, connection.ref);
    const direction: 'incoming' | 'outgoing' = selected.to === node ? 'incoming' : 'outgoing';
    const relationId: Ref =
      ModelRef.isQualified(selected.ref) && ModelRef.splitQualified(selected.ref).modelId === this.model.id
        ? ModelRef.localId(selected.ref)
        : selected.ref;
    return { relationIds: [relationId], direction, bounds: { ...input.bounds } };
  }

  protected override nodeDiagnosticPaths(lineage: readonly ElementRef[]): readonly string[] {
    return new AnnotationRemoval(this.workspace).diagnosticPaths(this.validationInputs(), lineage);
  }

  protected override removalEffect(preview: NodeRemovalPreview): RemovalEffect {
    const removal: AnnotationRemoval = new AnnotationRemoval(this.workspace);
    const details: RamenNodeRemovalPreview = removal.preview(preview);
    const dependants: readonly string[] = [...details.annotations, ...details.updatedAnnotations].map(
      (item: WorkspaceElement): string => {
        const model: Model | undefined = this.workspace.get(item.modelId);
        return `annotation '${removal.name(item)}' (${item.elementId}) in model '${model?.name ?? item.modelId}'`;
      },
    );
    return { dependants, clean: (model: Model): Model => removal.clean(model, details) };
  }
}
