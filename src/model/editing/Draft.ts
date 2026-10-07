import { ModelConnections, RelationChoice, RelationSelection } from './Connections.js';
import { ModelEditor, UpdateAttributeInput, UpdateDataTypeInput, UpdateNodeInput, UpdateRelationInput } from './Editor.js';
import { ModelFactory, CreateModelInput, CreateDataTypeInput } from './Factory.js';
import type {
  AttributeInput,
  ElementInput,
  ElementRef,
  LiteralInput,
  LiteralUpdate,
  ModelChange,
  ModelInput,
  NodeInput,
  RelationEndInput,
  RelationInput,
  Removal,
} from './Inputs.js';
import {
  ModelAdvisor,
  AttributeInfo,
  DataTypeSuggestion,
  NodeSuggestion,
  RelationSuggestion,
  NodeLineageItem,
  NodeRelationSuggestion,
  AttributeNameResult,
} from '../Advisor.js';
import {
  ModelWorkspace,
  ModelRemovalPreview,
  ModelUpdate,
  NodeRemovalPreview,
  RelationRemovalPreview,
  WorkspaceElement,
} from './Workspace.js';
import { ConstraintOwners, type ConstraintLocation, type ConstraintOwnerInput } from './ConstraintOwner.js';
import { ModelRef } from '../graph/References.js';
import type { RelationSelections } from '../graph/RelationScope.js';
import type { ResolvedElement } from '../graph/ProjectGraph.js';
import { DiagnosticPath, type Diagnostic } from '../validation/Diagnostics.js';
import { NodeDiagnostics } from '../validation/NodeDiagnostics.js';
import { BuiltinDataTypes } from '../Builtins.js';
import { ConstraintRegistry } from '../validation/Constraints.js';
import { ValueValidator } from '../data/ValueValidator.js';
import { InstanceValueValidator } from '../data/InstanceValues.js';
import { EffectiveModel, EffectiveNode } from '../graph/EffectiveModel.js';
import type { ProjectValidationResult, ValidProjectResult, ValidationResult } from '../validation/ModelValidator.js';
import type {
  Attribute,
  Bounds,
  BuiltinType,
  Classifier,
  Constraint,
  DataType,
  Id,
  Literal,
  Model,
  Node,
  Ref,
  Relation,
  RelationEnd,
} from '../Types.js';

/** Additional effects supplied by a modelling language before an atomic removal. */
export interface RemovalEffect {
  readonly dependants: readonly string[];
  readonly clean: (model: Model) => Model;
}

/** Shared editing state for generic and domain-specific modelling facades. */
export abstract class ModelDraft<A extends ModelAdvisor> {
  protected readonly workspace: ModelWorkspace;
  private readonly modelId: Id;
  private validatedRevision: number = -1;
  private validation: ProjectValidationResult | undefined;
  private advisor: A | undefined;

  protected constructor(model: Model, dependencies: readonly Model[], workspace?: ModelWorkspace, attach: boolean = false) {
    this.workspace = workspace ?? new ModelWorkspace([...dependencies, model]);
    this.modelId = model.id;
    if (workspace && !attach) this.workspace.add(model);
  }

  protected get model(): Model {
    const model: Model | undefined = this.workspace.get(this.modelId);
    if (!model) throw new Error(`Model not found: '${this.modelId}'.`);
    return model;
  }

  protected set model(model: Model) {
    this.workspace.update(model);
  }

  protected get dependencies(): ReadonlyMap<Id, Model> {
    return this.workspace.dependenciesOf(this.modelId);
  }

  /** Returns a detached snapshot of the current project model. */
  public getModel(): Model {
    return structuredClone(this.model);
  }

  /** Returns detached snapshots of the current model and every transitive dependency. */
  public getModels(): readonly Model[] {
    return this.validationInputs().map((model: Model): Model => structuredClone(model));
  }

  /** Returns a detached local or imported node, or undefined when absent. Ambiguous local IDs require a qualified reference. */
  public getNode(input: ElementInput): Node | undefined {
    const owner: ElementRef | undefined = this.findRef(input, 'node');
    if (!owner) return undefined;

    const node: Node | undefined = this.findModel(owner.modelId)?.classifiers.find(
      (item: Classifier): item is Node => item.kind === 'Node' && item.id === owner.elementId,
    );
    return node ? structuredClone(node) : undefined;
  }

  /** Returns a detached declared data type, or undefined when absent. Built-in types have no declaration. */
  public getDataType(input: ElementInput): DataType | undefined {
    const owner: ElementRef | undefined = this.findRef(input, 'dataType');
    if (!owner) return undefined;

    const dataType: DataType | undefined = this.findModel(owner.modelId)?.classifiers.find(
      (item: Classifier): item is DataType => item.kind === 'DataType' && item.id === owner.elementId,
    );
    return dataType ? structuredClone(dataType) : undefined;
  }

  /** Returns a detached local or imported relation, or undefined when absent. */
  public getRelation(input: ElementInput): Relation | undefined {
    const owner: ElementRef | undefined = this.findRef(input, 'relation');
    if (!owner) return undefined;

    const relation: Relation | undefined = this.findModel(owner.modelId)?.relations.find(
      (item: Relation): boolean => item.id === owner.elementId,
    );
    return relation ? structuredClone(relation) : undefined;
  }

  /** Lists attributes visible on a local or imported node. */
  public getAttributes(node: ElementInput): readonly AttributeInfo[] {
    const owner: ElementRef = this.resolveRef(node, 'node');
    return this.getAdvisor().getAttributes(owner.modelId, owner.elementId);
  }

  /** Returns the node's base-first refinement lineage. */
  public getNodeLineage(node: ElementInput): readonly NodeLineageItem[] {
    return this.getAdvisor().getNodeLineage(this.model.id, this.nodeReference(node));
  }

  /** Returns the node that refines every selected node, or undefined for separate branches. */
  public getMostSpecificNode(nodes: readonly ElementInput[]): Node | undefined {
    const refs: readonly Ref[] = nodes.map((node: ElementInput): Ref => this.nodeReference(node));
    const selected: NodeLineageItem | undefined = this.getAdvisor().getMostSpecificNode(this.model.id, refs);
    return selected ? this.getNode({ modelId: selected.modelId, elementId: selected.nodeId }) : undefined;
  }

  /**
   * Lists existing relationships with exact endpoints, including permitted predecessor definitions.
   * Returns an empty list for no matches and all matches for parallel relationships; never edits the model.
   * Requires valid node references and a valid model snapshot.
   */
  public getRelations(from: ElementInput, to: ElementInput): readonly RelationSelection[] {
    return this.getAdvisor().getRelations(this.model.id, this.nodeReference(from), this.nodeReference(to));
  }

  /** Returns the rules declared directly on an element, including one from an imported model. */
  public getConstraints(owner: ConstraintOwnerInput): readonly Constraint[] {
    const location: ConstraintLocation = ConstraintOwners.find(this.validationInputs(), owner);
    return structuredClone(location.constraints);
  }

  /** Returns an advisor or explains why the current model cannot provide suggestions. */
  public getAdvisor(): A {
    const result: ProjectValidationResult = this.validate();
    if (!result.valid) throw new Error(`Cannot query an invalid model: ${result.diagnostics[0]?.message ?? 'Unknown error.'}`);

    this.advisor ??= this.buildAdvisor(result);
    return this.advisor;
  }

  /** Lists local and imported node types that this level can refine. */
  public suggestNodes(): readonly NodeSuggestion[] {
    return this.getAdvisor().suggestNodes(this.model.id);
  }

  /** Lists primitive and project-defined data types. */
  public suggestDataTypes(): readonly DataTypeSuggestion[] {
    return this.getAdvisor().suggestDataTypes(this.model.id);
  }

  /** Lists possible relations and their compatible targets for one node. */
  public suggestConnections(node: ElementInput): readonly NodeRelationSuggestion[] {
    return this.getAdvisor().suggestConnections(this.model.id, this.nodeReference(node));
  }

  /** Lists relations that can connect two nodes in this model. */
  public suggestRelations(from: ElementInput, to: ElementInput): readonly RelationSuggestion[] {
    return this.getAdvisor().suggestRelations(this.model.id, this.nodeReference(from), this.nodeReference(to));
  }

  /**
   * Validates the complete current project and returns its graph on success.
   * Findings are returned in `diagnostics`; see [Diagnostics](../../../docs/rmf/diagnostics.md).
   */
  public validate(): ProjectValidationResult {
    if (this.validatedRevision === this.workspace.version && this.validation) return this.validation;
    const result: ProjectValidationResult = this.check();
    this.validatedRevision = this.workspace.version;
    this.advisor = undefined;
    this.validation = Object.freeze({
      ...result,
      diagnostics: Object.freeze(result.diagnostics.map((diagnostic: Diagnostic): Diagnostic => Object.freeze(diagnostic))),
    });
    return this.validation;
  }

  /** Returns project-wide findings plus findings attached to a node, its ancestors or incident relations. */
  public validateNode(input: ElementInput): ValidationResult {
    const owner: ElementRef = this.resolveRef(input, 'node');
    const diagnostics: NodeDiagnostics = new NodeDiagnostics(this.validationInputs());
    const lineage: readonly ElementRef[] = diagnostics.lineage(owner);
    return diagnostics.select(lineage, this.validate().diagnostics, this.nodeDiagnosticPaths(lineage));
  }

  /** Checks whether a new attribute name conflicts with visible attributes. */
  public validateAttributeName(node: ElementInput, name: string): AttributeNameResult {
    return this.getAdvisor().validateAttributeName(this.model.id, this.nodeReference(node), name);
  }

  /** Checks one value against a built-in or declared data type, including literals and value rules. */
  public validateValue(
    type: ElementInput,
    value: unknown,
    registry: ConstraintRegistry = ConstraintRegistry.createDefault(),
  ): ValidationResult {
    const result: ProjectValidationResult = this.validate();
    if (!result.valid) return { diagnostics: result.diagnostics, hasErrors: true };

    const reference: Ref = this.inputRef(type);
    let selected: BuiltinType | ResolvedElement<DataType>;

    if (BuiltinDataTypes.isBuiltin(reference)) {
      selected = reference;
    } else {
      const owner: ElementRef = this.resolveRef(type, 'dataType');
      const dataType: DataType | undefined = result.graph.getDataType(owner.modelId, owner.elementId);
      if (!dataType) throw new Error(`Data type not found: '${reference}'.`);
      selected = { modelId: owner.modelId, element: dataType };
    }

    const validator: ValueValidator = new ValueValidator(registry);
    return validator.validate(selected, value, { path: DiagnosticPath.root().property('value'), label: 'Value' });
  }

  /** Checks one local or inherited attribute input. Custom evaluators must work without a data graph. */
  public validateAttributeValue(
    node: ElementInput,
    name: string,
    value: unknown,
    registry: ConstraintRegistry = ConstraintRegistry.createDefault(),
  ): ValidationResult {
    const result: ProjectValidationResult = this.validate();
    if (!result.valid) return { diagnostics: result.diagnostics, hasErrors: true };

    const owner: ElementRef = this.resolveRef(node, 'node');
    const effective: EffectiveNode | undefined = EffectiveModel.resolveNode(result.graph, owner.modelId, owner.elementId);
    const attribute: Attribute | undefined = effective?.attributes.find((item: Attribute): boolean => item.name === name);

    if (!attribute) throw new Error(`Attribute '${name}' not found on node '${owner.elementId}'.`);

    return new InstanceValueValidator(registry).validateOneAttribute(result.graph, owner.modelId, attribute, value);
  }

  /** Updates this model's identity and the exact imports used by later levels. */
  public updateModel(patch: ModelUpdate): ModelChange<Model> {
    const updated: Model = this.workspace.updateModel(this.model.id, patch);
    return this.change(updated);
  }

  /** Updates a level that directly imports this model. */
  public updateNextLevel(modelId: Id, patch: ModelUpdate): Model {
    this.requireNextLevel(modelId);
    return this.workspace.updateModel(modelId, patch);
  }

  /** Shows the chosen next level and every later level that imports it. */
  public previewNextLevelRemoval(modelId: Id): ModelRemovalPreview {
    this.requireNextLevel(modelId);
    return this.workspace.previewModelRemoval(modelId);
  }

  /** Removes a next level; cascade also removes every level that depends on it. */
  public removeNextLevel(modelId: Id, options: { readonly cascade?: boolean } = {}): ModelRemovalPreview {
    const preview: ModelRemovalPreview = this.previewNextLevelRemoval(modelId);
    const blockers: readonly string[] = preview.models.slice(1).map((model): string => `${model.name} (${model.id})`);

    if (!options.cascade && blockers.length > 0) {
      throw new Error(`Cannot remove model '${modelId}': still used by ${blockers.join(', ')}.`);
    }

    this.workspace.removeModels(preview);
    return preview;
  }

  /** Creates a root node or a refinement and validates the resulting model. */
  public createNode(input: NodeInput | string): ModelChange<Node> {
    const values: NodeInput = typeof input === 'string' ? { name: input } : input;
    const node: Node = this.newNode(values);

    this.model = ModelEditor.addClassifier(this.model, node);
    return this.change(node);
  }

  /** Updates a local node and immediately validates the resulting project. */
  public updateNode(nodeId: Id, input: UpdateNodeInput): ModelChange<Node> {
    this.requireNode(nodeId);
    this.model = ModelEditor.updateNode(this.model, nodeId, input);

    return this.change(this.requireNode(nodeId));
  }

  /** Shows every declaration that would be removed with this node. */
  public previewNodeRemoval(nodeId: Id): NodeRemovalPreview {
    this.requireNode(nodeId);
    const target: WorkspaceElement = { modelId: this.model.id, elementId: nodeId };
    return this.workspace.previewNodeRemoval(target);
  }

  /** Removes an unused node, or atomically removes its dependent definitions with cascade. */
  public removeNode(nodeId: Id, options: { readonly cascade?: boolean } = {}): ModelChange<Node> {
    const node: Node = this.requireNode(nodeId);
    const preview: NodeRemovalPreview = this.workspace.previewNodeRemoval({ modelId: this.model.id, elementId: nodeId });
    const effect: RemovalEffect = this.removalEffect(preview);
    const blockers: readonly string[] = [
      ...preview.nodes.slice(1).map((item: WorkspaceElement): string => this.removalLabel(item, 'node')),
      ...preview.relations.map((item: WorkspaceElement): string => this.removalLabel(item, 'relation')),
      ...effect.dependants,
    ];

    if (!options.cascade && blockers.length > 0) {
      throw new Error(`Cannot remove node '${node.name}' (${nodeId}): still used by ${blockers.join(', ')}.`);
    }

    const nodeKeys: ReadonlySet<string> = new Set<string>(
      preview.nodes.map((item: WorkspaceElement): string => `${item.modelId}:${item.elementId}`),
    );
    const relationKeys: ReadonlySet<string> = new Set<string>(
      preview.relations.map((item: WorkspaceElement): string => `${item.modelId}:${item.elementId}`),
    );
    const replacements: Model[] = this.workspace.all().map((model: Model): Model => {
      const remaining: Model = {
        ...model,
        classifiers: model.classifiers.filter((item: Classifier): boolean => !nodeKeys.has(`${model.id}:${item.id}`)),
        relations: model.relations.filter((item: Relation): boolean => !relationKeys.has(`${model.id}:${item.id}`)),
      };
      return effect.clean(remaining);
    });

    this.workspace.updateMany(replacements);

    return this.change(node);
  }

  /** Adds an attribute to a local node and immediately validates the resulting project. */
  public createAttribute(owner: ElementInput, input: AttributeInput): ModelChange<Attribute> {
    const nodeId: Id = this.localNode(owner);
    const attribute: Attribute = ModelFactory.createAttribute({
      ...input,
      typeId: this.attributeType(input),
      bounds: input.bounds ?? { lowerBound: 0, upperBound: 1 },
    });

    this.model = ModelEditor.addAttribute(this.model, nodeId, attribute);
    return this.change(attribute);
  }

  /** Updates an attribute by stable identifier and validates the resulting project. */
  public updateAttribute(nodeId: Id, attributeId: Id, input: UpdateAttributeInput): ModelChange<Attribute> {
    this.requireAttribute(nodeId, attributeId);
    this.model = ModelEditor.updateAttribute(this.model, nodeId, attributeId, input);

    return this.change(this.requireAttribute(nodeId, attributeId));
  }

  /** Removes an attribute by stable identifier and validates the resulting project. */
  public removeAttribute(nodeId: Id, attributeId: Id): ModelChange<Attribute> {
    const attribute: Attribute = this.requireAttribute(nodeId, attributeId);

    this.model = ModelEditor.removeAttribute(this.model, nodeId, attributeId);
    this.onRemove({ attributeId: attributeId });

    return this.change(attribute);
  }

  /** Adds a named data type and immediately validates the resulting project. */
  public createDataType(input: CreateDataTypeInput): ModelChange<DataType> {
    const dataType: DataType = ModelFactory.createDataType(input);
    this.model = ModelEditor.addClassifier(this.model, dataType);
    return this.change(dataType);
  }

  /** Updates a local data type and validates the resulting project. */
  public updateDataType(dataTypeId: Id, input: UpdateDataTypeInput): ModelChange<DataType> {
    this.requireDataType(dataTypeId);
    this.model = ModelEditor.updateDataType(this.model, dataTypeId, input);

    return this.change(this.requireDataType(dataTypeId));
  }

  /** Removes a local data type; unresolved references remain visible in validation diagnostics. */
  public removeDataType(dataTypeId: Id): ModelChange<DataType> {
    const dataType: DataType = this.requireDataType(dataTypeId);
    this.model = ModelEditor.removeClassifierById(this.model, dataTypeId);

    return this.change(dataType);
  }

  /** Adds one named literal to a local data type. */
  public createLiteral(dataTypeId: Id, input: LiteralInput): ModelChange<Literal> {
    const dataType: DataType = this.requireDataType(dataTypeId);
    const literal: Literal = ModelFactory.createLiteral(input.name, input.literal, input.value);
    const literals: [Literal, ...Literal[]] = [literal, ...(dataType.literals ?? [])];

    this.model = ModelEditor.updateDataType(this.model, dataTypeId, { literals: literals });
    return this.change(literal);
  }

  /** Updates one literal by stable identifier. */
  public updateLiteral(dataTypeId: Id, literalId: Id, input: LiteralUpdate): ModelChange<Literal> {
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
  public removeLiteral(dataTypeId: Id, literalId: Id): ModelChange<Literal> {
    const dataType: DataType = this.requireDataType(dataTypeId);
    const literal: Literal = this.requireLiteral(dataType, literalId);
    const remaining: Literal[] = (dataType.literals ?? []).filter((item: Literal): boolean => item.id !== literalId);

    this.model = ModelEditor.updateDataType(this.model, dataTypeId, {
      literals: remaining.length > 0 ? (remaining as [Literal, ...Literal[]]) : undefined,
    });
    return this.change(literal);
  }

  /** Creates a root relation or a refinement and validates the resulting model. */
  public createRelation(input: RelationInput): ModelChange<Relation> {
    const [fromInput, toInput]: readonly [RelationEndInput, RelationEndInput] = this.relationEndInputs(input);
    const relation: Relation = this.newRelation(input);
    const configured: Relation = {
      ...relation,
      name: input.name ?? relation.name,
      constraints: structuredClone([...(input.constraints ?? relation.constraints ?? [])]),
      from: this.configureRelationEnd(relation.from, fromInput),
      to: this.configureRelationEnd(relation.to, toInput),
    };

    this.model = ModelEditor.addRelation(this.model, configured);
    return this.change(configured);
  }

  /** Updates a local relation and validates the resulting project. */
  public updateRelation(relationId: Id, input: UpdateRelationInput): ModelChange<Relation> {
    this.requireRelation(relationId);
    this.model = ModelEditor.updateRelation(this.model, relationId, input);

    return this.change(this.requireRelation(relationId));
  }

  /** Shows relation refinements affected by removal. */
  public previewRelationRemoval(relationId: Id): RelationRemovalPreview {
    this.requireRelation(relationId);
    const target: WorkspaceElement = { modelId: this.model.id, elementId: relationId };
    return this.workspace.previewRelationRemoval(target);
  }

  /** Removes an unused relation, or its dependants with explicit cascade. */
  public removeRelation(relationId: Id, options: { readonly cascade?: boolean } = {}): ModelChange<Relation> {
    const relation: Relation = this.requireRelation(relationId);
    const preview: RelationRemovalPreview = this.workspace.previewRelationRemoval({
      modelId: this.model.id,
      elementId: relationId,
    });
    const removal: NodeRemovalPreview = { nodes: [], relations: preview.relations };
    const effect: RemovalEffect = this.removalEffect(removal);
    const blockers: readonly string[] = [
      ...preview.relations.slice(1).map((item: WorkspaceElement): string => this.removalLabel(item, 'relation')),
      ...effect.dependants,
    ];

    if (!options.cascade && blockers.length > 0) {
      throw new Error(`Cannot remove relation '${relation.name}' (${relationId}): still used by ${blockers.join(', ')}.`);
    }

    const relationKeys: ReadonlySet<string> = new Set<string>(
      preview.relations.map((item: WorkspaceElement): string => `${item.modelId}:${item.elementId}`),
    );
    const replacements: Model[] = this.workspace.all().map((model: Model): Model => {
      const remaining: Model = {
        ...model,
        relations: model.relations.filter((item: Relation): boolean => !relationKeys.has(`${model.id}:${item.id}`)),
      };
      return effect.clean(remaining);
    });

    this.workspace.updateMany(replacements);

    return this.change(relation);
  }

  /** Adds one rule to a local element without replacing its existing rules. */
  public addConstraint(owner: ConstraintOwnerInput, rule: Constraint): ModelChange<Constraint> {
    const location: ConstraintLocation = this.localConstraintOwner(owner);
    if (location.constraints.some((item: Constraint): boolean => item.id === rule.id)) {
      throw new Error(`Constraint already exists: '${rule.id}'.`);
    }

    const validation: ProjectValidationResult = this.replaceConstraints(location, [...location.constraints, rule]);
    return { element: structuredClone(rule), validation };
  }

  /** Updates one rule by ID on a local element while preserving its other rules. */
  public updateConstraint(
    owner: ConstraintOwnerInput,
    ruleId: Id,
    patch: Partial<Omit<Constraint, 'id'>>,
  ): ModelChange<Constraint> {
    const location: ConstraintLocation = this.localConstraintOwner(owner);
    const current: Constraint | undefined = location.constraints.find((item: Constraint): boolean => item.id === ruleId);
    if (!current) throw new Error(`Constraint not found: '${ruleId}'.`);
    const updated: Constraint = { ...current, ...structuredClone(patch) };
    const rules: readonly Constraint[] = location.constraints.map((item: Constraint): Constraint =>
      item.id === ruleId ? updated : item,
    );
    const validation: ProjectValidationResult = this.replaceConstraints(location, rules);
    return { element: structuredClone(updated), validation };
  }

  /** Removes one rule by ID from a local element while preserving its other rules. */
  public removeConstraint(owner: ConstraintOwnerInput, ruleId: Id): ModelChange<Constraint> {
    const location: ConstraintLocation = this.localConstraintOwner(owner);
    const removed: Constraint | undefined = location.constraints.find((item: Constraint): boolean => item.id === ruleId);
    if (!removed) throw new Error(`Constraint not found: '${ruleId}'.`);
    const rules: readonly Constraint[] = location.constraints.filter((item: Constraint): boolean => item.id !== ruleId);
    const validation: ProjectValidationResult = this.replaceConstraints(location, rules);
    return { element: structuredClone(removed), validation };
  }

  protected abstract check(): ProjectValidationResult;

  protected abstract buildAdvisor(result: ValidProjectResult): A;

  protected selections(): RelationSelections | undefined {
    return undefined;
  }

  protected onRemove(_input: Removal): void {
    /* Domain extensions may clean up references after an edit. */
  }

  protected nodeDiagnosticPaths(_lineage: readonly ElementRef[]): readonly string[] {
    return [];
  }

  protected removalEffect(_preview: NodeRemovalPreview): RemovalEffect {
    return { dependants: [], clean: (model: Model): Model => model };
  }

  protected static options(input: ModelInput | string): CreateModelInput {
    const values: ModelInput = typeof input === 'string' ? { name: input } : input;
    const id: Id = values.id ?? ModelFactory.createIdentifier();
    return { id, name: values.name, uri: values.uri ?? `urn:rmf:model:${id}`, version: values.version ?? '1.0.0' };
  }

  protected nodeReference(nodeId: ElementInput): Id {
    const owner: ElementRef = this.resolveRef(nodeId, 'node');
    return owner.modelId === this.model.id ? owner.elementId : ModelRef.qualify(owner.modelId, owner.elementId);
  }

  protected change<T>(element: T): ModelChange<T> {
    return { element: structuredClone(element), validation: this.validate() };
  }

  protected validationInputs(): readonly Model[] {
    const models: Map<Id, Model> = new Map<Id, Model>(this.dependencies);
    models.set(this.model.id, this.model);
    return [...models.values()];
  }

  protected findModel(modelId: Id): Model | undefined {
    if (modelId === this.model.id) return this.model;
    return this.dependencies.get(modelId);
  }

  private requireNextLevel(modelId: Id): Model {
    const model: Model | undefined = this.workspace.get(modelId);
    if (!model) throw new Error(`Model not found: '${modelId}'.`);
    if (!model.imports.some((entry): boolean => entry.modelId === this.model.id)) {
      throw new Error(`Model '${modelId}' does not directly import '${this.model.id}'.`);
    }
    return model;
  }

  protected resolveRef(input: ElementInput, kind: 'node' | 'relation' | 'dataType'): ElementRef {
    const owner: ElementRef | undefined = this.findRef(input, kind);
    if (owner) return owner;

    const reference: Ref = this.inputRef(input);
    if (ModelRef.isQualified(reference)) throw new Error(`Unknown ${kind}: '${reference}'.`);
    throw new Error(`Expected one ${kind} with id '${reference}', found 0.`);
  }

  private findRef(input: ElementInput, kind: 'node' | 'relation' | 'dataType'): ElementRef | undefined {
    const reference: Ref = this.inputRef(input);
    if (ModelRef.isQualified(reference)) {
      const parts: { readonly modelId: Id; readonly refId: Id } = ModelRef.splitQualified(reference);
      const model: Model | undefined = this.findModel(parts.modelId);
      return model && this.hasElement(model, parts.refId, kind) ? { modelId: parts.modelId, elementId: parts.refId } : undefined;
    }

    const matches: readonly Model[] = this.validationInputs().filter((model: Model): boolean =>
      this.hasElement(model, reference, kind),
    );
    const owner: Model | undefined = matches[0];

    if (matches.length > 1) throw new Error(`Expected one ${kind} with id '${reference}', found ${matches.length}.`);
    return owner ? { modelId: owner.id, elementId: reference } : undefined;
  }

  protected connectBy(
    from: ElementInput,
    to: ElementInput,
    choice?: RelationChoice,
    family?: readonly Ref[],
  ): ModelChange<Relation> {
    const fromRef: Ref = this.nodeReference(from);
    const toRef: Ref = this.nodeReference(to);
    const result: ProjectValidationResult = this.validate();
    if (!result.valid) throw new Error('Cannot infer a relation from an invalid model.');
    const connections: ModelConnections = new ModelConnections(result, this.selections());
    const suggestions: readonly RelationSuggestion[] = connections.suggestRelations(fromRef, toRef);
    const candidates: readonly RelationSuggestion[] = this.selectFamily(result, suggestions, family);
    const selected: RelationSuggestion = connections.select(candidates, choice);
    const input: RelationInput = { refines: selected.ref, from: { nodeId: fromRef }, to: { nodeId: toRef } };
    const relation: Relation = this.newRelation(input);

    this.model = ModelEditor.addRelation(this.model, relation);
    return this.change(relation);
  }

  private requireNode(nodeId: Id): Node {
    const classifier: Classifier | undefined = this.model.classifiers.find((item: Classifier): boolean => item.id === nodeId);
    if (classifier?.kind !== 'Node') throw new Error(`Node not found: '${nodeId}'.`);
    return classifier;
  }

  private localConstraintOwner(owner: ConstraintOwnerInput): ConstraintLocation {
    const location: ConstraintLocation = ConstraintOwners.find(this.validationInputs(), owner);
    if (location.modelId !== this.model.id) {
      throw new Error(`Constraint owner '${location.id}' belongs to another model. Open that level to edit it.`);
    }
    return location;
  }

  private replaceConstraints(location: ConstraintLocation, rules: readonly Constraint[]): ProjectValidationResult {
    const constraints: Constraint[] = structuredClone([...rules]);
    const parentId: Id | undefined = location.parentId;
    if (location.kind === 'node') return this.updateNode(location.id, { constraints }).validation;
    if (location.kind === 'dataType') return this.updateDataType(location.id, { constraints }).validation;
    if (location.kind === 'relation') return this.updateRelation(location.id, { constraints }).validation;

    if (!parentId) throw new Error(`Constraint owner '${location.id}' has no parent.`);
    if (location.kind === 'attribute') return this.updateAttribute(parentId, location.id, { constraints }).validation;
    if (location.kind === 'literal') return this.updateLiteral(parentId, location.id, { constraints }).validation;

    const relation: Relation = this.requireRelation(parentId);
    const end: RelationEnd = relation[location.kind];
    return this.updateRelation(parentId, { [location.kind]: { ...end, constraints } }).validation;
  }

  private removalLabel(item: WorkspaceElement, kind: 'node' | 'relation'): string {
    const model: Model | undefined = this.workspace.get(item.modelId);
    let name: string = item.elementId;

    if (kind === 'node')
      name = model?.classifiers.find((entry: Classifier): boolean => entry.id === item.elementId)?.name ?? name;

    if (kind === 'relation')
      name = model?.relations.find((entry: Relation): boolean => entry.id === item.elementId)?.name ?? name;

    return `${kind} '${name}' (${item.elementId}) in model '${model?.name ?? item.modelId}'`;
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
    const node: Node = this.requireNode(nodeId);
    const attribute: Attribute | undefined = node.attributes.find((item: Attribute): boolean => item.id === attributeId);

    if (!attribute) throw new Error(`Attribute not found: '${attributeId}'.`);
    return attribute;
  }

  private requireRelation(relationId: Id): Relation {
    const relation: Relation | undefined = this.model.relations.find((item: Relation): boolean => item.id === relationId);
    if (!relation) throw new Error(`Relation not found: '${relationId}'.`);
    return relation;
  }

  private newNode(input: NodeInput): Node {
    const constraints: Constraint[] = structuredClone([...(input.constraints ?? [])]);
    if (input.refines !== undefined) {
      const base: ElementRef = this.resolveRef(input.refines, 'node');
      const node: Node = ModelFactory.createNode(base.modelId, { name: input.name, baseNodeId: base.elementId });
      return { ...node, constraints: constraints };
    }
    if (this.model.imports.length > 0) throw new Error('Select a node to refine from the imported models.');
    return {
      kind: 'Node',
      id: ModelFactory.createIdentifier(),
      name: input.name,
      superTypes: [],
      attributes: [],
      constraints: constraints,
    };
  }

  private relationNodes(input: RelationInput): readonly [from: Ref, to: Ref] {
    const [fromInput, toInput]: readonly [RelationEndInput, RelationEndInput] = this.relationEndInputs(input);
    const from: ElementInput | undefined = fromInput.node ?? fromInput.nodeId;
    const to: ElementInput | undefined = toInput.node ?? toInput.nodeId;

    if (from === undefined || to === undefined) throw new Error('A relation requires source and target nodes or IDs.');
    return [this.nodeReference(from), this.nodeReference(to)];
  }

  private relationEndInputs(input: RelationInput): readonly [RelationEndInput, RelationEndInput] {
    if (!input.from || !input.to) throw new Error('A relation requires source and target nodes or IDs.');
    return [input.from, input.to];
  }

  private configureRelationEnd(end: RelationEnd, input: RelationEndInput): RelationEnd {
    return {
      ...end,
      bounds: input.bounds ?? end.bounds,
      constraints: structuredClone([...(input.constraints ?? end.constraints ?? [])]),
    };
  }

  private newRelation(input: RelationInput): Relation {
    const [from, to]: readonly [Ref, Ref] = this.relationNodes(input);
    if (input.refines !== undefined) {
      const reference: ElementRef = this.resolveRef(input.refines, 'relation');
      const base: Model | undefined = this.findModel(reference.modelId);

      if (!base) throw new Error(`Unknown model: '${reference.modelId}'.`);
      return ModelFactory.createRelation(base, base.id, { baseRelationId: reference.elementId, fromNodeId: from, toNodeId: to });
    }
    if (this.model.imports.length > 0) return this.inferRelation(from, to);
    if (!input.name) throw new Error('A root relation needs a name.');
    const defaultBounds: Bounds = { lowerBound: 0, upperBound: -1 };

    return {
      kind: 'Relation',
      id: ModelFactory.createIdentifier(),
      name: input.name,
      superTypes: [],
      constraints: [],
      from: ModelFactory.createRelationEnd(from, defaultBounds),
      to: ModelFactory.createRelationEnd(to, defaultBounds),
    };
  }

  private inferRelation(from: Ref, to: Ref): Relation {
    const result: ProjectValidationResult = this.validate();
    if (!result.valid) throw new Error('Cannot infer a relation from an invalid model.');

    const connections: ModelConnections = new ModelConnections(result, this.selections());
    return connections.createRelation({ fromNode: from, toNode: to });
  }

  private inputRef(input: ElementInput): Ref {
    if (typeof input === 'string') return input;
    if ('ref' in input) return input.ref;
    if ('id' in input) return input.id;
    return ModelRef.qualify(input.modelId, input.elementId);
  }

  private hasElement(model: Model, id: Id, kind: 'node' | 'relation' | 'dataType'): boolean {
    if (kind === 'relation') return model.relations.some((item: Relation): boolean => item.id === id);
    return model.classifiers.some(
      (item: Classifier): boolean => item.id === id && item.kind === (kind === 'node' ? 'Node' : 'DataType'),
    );
  }

  private localNode(input: ElementInput): Id {
    const reference: ElementRef = this.resolveRef(input, 'node');
    if (reference.modelId !== this.model.id) throw new Error('Only local nodes can be edited. Refine the imported node first.');
    return reference.elementId;
  }

  protected attributeType(input: AttributeInput): Ref {
    const type: ElementInput | undefined = input.type ?? input.typeId;
    if (type === undefined) throw new Error('An attribute requires a data type or type ID.');
    if (input.type !== undefined && typeof input.type === 'string') throw new Error('Use typeId for string references.');
    if (input.type === undefined && typeof input.typeId !== 'string') throw new Error('Use type for data type objects.');
    return this.typeReference(type);
  }

  private typeReference(input: ElementInput): Ref {
    const reference: Ref = this.inputRef(input);
    if (BuiltinDataTypes.isBuiltin(reference)) return reference;
    const owner: ElementRef = this.resolveRef(reference, 'dataType');
    return owner.modelId === this.model.id ? owner.elementId : ModelRef.qualify(owner.modelId, owner.elementId);
  }

  private selectFamily(
    project: ValidProjectResult,
    suggestions: readonly RelationSuggestion[],
    family?: readonly Ref[],
  ): readonly RelationSuggestion[] {
    if (!family) return suggestions;
    const roots: ReadonlySet<Ref> = new Set<Ref>(family);

    return suggestions.filter((choice: RelationSuggestion): boolean => {
      if (roots.has(choice.ref)) return true;
      const ancestors: readonly ResolvedElement<Relation>[] = project.graph.getRelationAncestors(
        choice.modelId,
        choice.relationId,
      );

      return ancestors.some((ancestor: ResolvedElement<Relation>): boolean =>
        roots.has(ModelRef.qualify(ancestor.modelId, ancestor.element.id)),
      );
    });
  }
}
