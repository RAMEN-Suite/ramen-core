import { ModelConnections, RelationChoice } from './Connections';
import { ModelEditor, UpdateAttributeInput, UpdateDataTypeInput, UpdateNodeInput, UpdateRelationInput } from './Editor';
import { ModelFactory, CreateModelInput, CreateAttributeInput, CreateDataTypeInput } from './Factory';
import { ModelAdvisor, AttributeSuggestion, DataTypeSuggestion, NodeSuggestion, RelationSuggestion } from '../Advisor';
import { ModelRef } from '../graph/References';
import type { RelationSelections } from '../graph/RelationScope';
import type { ResolvedElement } from '../graph/ProjectGraph';
import type { Diagnostic } from '../validation/Diagnostics';
import { BuiltinDataTypes } from '../Builtins';
import type { ProjectValidationResult, ValidProjectResult } from '../validation/ModelValidator';
import type { Attribute, Bounds, Classifier, DataType, Id, Literal, Model, Node, Ref, Relation } from '../Types';

/** Model identity; omitted IDs and URIs are generated, and version defaults to 1.0.0. */
export interface ModelInput {
  readonly name: string;
  readonly id?: Id;
  readonly uri?: string;
  readonly version?: string;
}

/** An element identified within its declaring model. */
export interface ElementRef {
  readonly modelId: Id;
  readonly elementId: Id;
}

/** Pass an ID, a qualified reference, an element, or a suggestion directly. */
export type ElementInput = Ref | ElementRef | { readonly id: Id } | { readonly ref: Ref };

/** Declare a root node, or select an existing node to refine on a derived level. */
export interface NodeInput {
  readonly name: string;
  readonly refines?: ElementInput;
}

/** A primitive or selected data type; attributes default to optional scalar values (0..1). */
export type AttributeInput = Omit<CreateAttributeInput, 'typeId' | 'bounds'> & {
  readonly typeId: ElementInput;
  readonly bounds?: Bounds;
};

/** Select a base relation, or declare a named root relation. Unspecified root bounds are 0..*. */
export interface RelationInput {
  readonly refines?: ElementInput;
  readonly name?: string;
  readonly fromNodeId: ElementInput;
  readonly toNodeId: ElementInput;
  readonly fromBounds?: Bounds;
  readonly toBounds?: Bounds;
  readonly fromRole?: string;
  readonly toRole?: string;
}

/** Values of one data type literal. */
export interface LiteralInput {
  readonly name: string;
  readonly literal?: string;
  readonly value?: number;
}

/** Editable fields of a literal. */
export type LiteralUpdate = Partial<Pick<Literal, 'name' | 'literal' | 'value' | 'constraints' | 'ext'>>;

/** A detached edited element and immediate validation of the resulting model. */
export interface ModelChange<T> {
  readonly element: T;
  readonly validation: ProjectValidationResult;
}

/** References removed by a generic edit; extensions can clean up their own references. */
export interface Removal {
  readonly nodeId?: Id;
  readonly attributeId?: Id;
  readonly relationIds?: ReadonlySet<Id>;
}

/** Shared editing state for generic and domain-specific modeling facades. */
export abstract class ModelDraft<A extends ModelAdvisor> {
  protected model: Model;
  protected readonly dependencies: ReadonlyMap<Id, Model>;
  private validatedModel: Model | undefined;
  private validation: ProjectValidationResult | undefined;
  private advisor: A | undefined;

  protected constructor(model: Model, dependencies: readonly Model[]) {
    this.model = structuredClone(model);
    this.dependencies = new Map<Id, Model>(dependencies.map((item: Model): [Id, Model] => [item.id, structuredClone(item)]));
  }

  /** Lists imported node types that this level can refine. */
  public suggestNodes(): readonly NodeSuggestion[] {
    return this.createAdvisor().suggestNodeRefinements(this.model.id);
  }

  /** Lists primitive and project-defined data types. */
  public suggestDataTypes(): readonly DataTypeSuggestion[] {
    return this.createAdvisor().suggestDataTypes(this.model.id);
  }

  /** Returns a detached snapshot of the current project model. */
  public getModel(): Model {
    return structuredClone(this.model);
  }

  /** Returns detached snapshots of the current model and every transitive dependency. */
  public getModels(): readonly Model[] {
    return this.validationInputs().map((model: Model): Model => structuredClone(model));
  }

  /** Validates the complete current project and returns its graph on success. */
  public validate(): ProjectValidationResult {
    if (this.validatedModel === this.model && this.validation) return this.validation;
    const result: ProjectValidationResult = this.check();
    this.validatedModel = this.model;
    this.advisor = undefined;
    this.validation = Object.freeze({
      ...result,
      diagnostics: Object.freeze(result.diagnostics.map((diagnostic: Diagnostic): Diagnostic => Object.freeze(diagnostic))),
    });
    return this.validation;
  }

  /** Returns an advisor or explains why the current model cannot provide suggestions. */
  public createAdvisor(): A {
    const result: ProjectValidationResult = this.validate();
    if (!result.valid) throw new Error(`Cannot advise an invalid model: ${result.diagnostics[0]?.message ?? 'Unknown error.'}`);

    this.advisor ??= this.advise(result);
    return this.advisor;
  }

  /** Lists attributes visible on a local or imported node. */
  public suggestAttributes(nodeId: ElementInput): readonly AttributeSuggestion[] {
    const owner: ElementRef = this.resolveRef(nodeId, 'node');
    return this.createAdvisor().suggestAttributes(owner.modelId, owner.elementId);
  }

  /** Lists relations that can connect two nodes in this model. */
  public suggestRelations(from: ElementInput, to: ElementInput): readonly RelationSuggestion[] {
    return this.createAdvisor().suggestRelations(this.model.id, this.nodeReference(from), this.nodeReference(to));
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

  /** Removes a local node and its connected local relations. */
  public removeNode(nodeId: Id): ModelChange<Node> {
    const node: Node = this.requireNode(nodeId);
    const relationIds: Set<Id> = new Set<Id>(
      this.model.relations
        .filter(
          (relation: Relation): boolean =>
            ModelRef.matches(relation.from.nodeId, this.model.id, nodeId) ||
            ModelRef.matches(relation.to.nodeId, this.model.id, nodeId),
        )
        .map((relation: Relation): Id => relation.id),
    );

    this.model = ModelEditor.removeNode(this.model, nodeId);
    this.onRemove({ nodeId: nodeId, relationIds: relationIds });

    return this.change(node);
  }

  /** Adds an attribute to a local node and immediately validates the resulting project. */
  public createAttribute(owner: ElementInput, input: AttributeInput): ModelChange<Attribute> {
    const nodeId: Id = this.localNode(owner);
    const attribute: Attribute = ModelFactory.createAttribute({
      ...input,
      typeId: this.typeReference(input.typeId),
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

  /** Adds a scalar data type and immediately validates the resulting project. */
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

  /** Removes a local data type and validates the resulting project. */
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
    const relation: Relation = this.newRelation(input);
    const narrowed: Relation = {
      ...relation,
      from: { ...relation.from, bounds: input.fromBounds ?? relation.from.bounds },
      to: { ...relation.to, bounds: input.toBounds ?? relation.to.bounds },
    };

    this.model = ModelEditor.addRelation(this.model, narrowed);
    return this.change(narrowed);
  }

  /** Connects local nodes using a chosen suggestion, or infers the unique most specific relation. */
  public connect(from: ElementInput, to: ElementInput, choice?: RelationChoice): ModelChange<Relation> {
    return this.connectBy(from, to, choice);
  }

  /** Updates a local relation and validates the resulting project. */
  public updateRelation(relationId: Id, input: UpdateRelationInput): ModelChange<Relation> {
    this.requireRelation(relationId);
    this.model = ModelEditor.updateRelation(this.model, relationId, input);

    return this.change(this.requireRelation(relationId));
  }

  /** Removes a local relation and validates the resulting project. */
  public removeRelation(relationId: Id): ModelChange<Relation> {
    const relation: Relation = this.requireRelation(relationId);

    this.model = ModelEditor.removeRelationById(this.model, relationId);
    this.onRemove({ relationIds: new Set<Id>([relationId]) });

    return this.change(relation);
  }

  protected abstract check(): ProjectValidationResult;

  protected abstract advise(result: ValidProjectResult): A;

  protected selections(): RelationSelections | undefined {
    return undefined;
  }

  protected onRemove(_input: Removal): void {
    /* Domain extensions may clean up references after an edit. */
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

  protected resolveRef(input: ElementInput, kind: 'node' | 'relation' | 'dataType'): ElementRef {
    const reference: Ref = this.inputRef(input);
    if (ModelRef.isQualified(reference)) {
      const parts: { readonly modelId: Id; readonly refId: Id } = ModelRef.splitQualified(reference);
      const model: Model | undefined = this.findModel(parts.modelId);
      if (!model || !this.hasElement(model, parts.refId, kind)) throw new Error(`Unknown ${kind}: '${reference}'.`);
      return { modelId: parts.modelId, elementId: parts.refId };
    }
    const matches: readonly Model[] = this.validationInputs().filter((model: Model): boolean =>
      this.hasElement(model, reference, kind),
    );
    const owner: Model | undefined = matches[0];
    if (matches.length !== 1 || !owner) throw new Error(`Expected one ${kind} with id '${reference}', found ${matches.length}.`);
    return { modelId: owner.id, elementId: reference };
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
    const suggestions: readonly RelationSuggestion[] = connections.suggest(fromRef, toRef);
    const candidates: readonly RelationSuggestion[] = this.selectFamily(result, suggestions, family);
    const selected: RelationSuggestion = connections.select(candidates, choice);
    const input: RelationInput = { refines: selected.ref, fromNodeId: fromRef, toNodeId: toRef };
    const relation: Relation = this.newRelation(input);
    this.model = ModelEditor.addRelation(this.model, relation);
    return this.change(relation);
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
    if (input.refines !== undefined) {
      const base: ElementRef = this.resolveRef(input.refines, 'node');
      return ModelFactory.createNode(base.modelId, { name: input.name, baseNodeId: base.elementId });
    }
    if (this.model.imports.length > 0) throw new Error('Select a node to refine from the imported models.');
    return {
      kind: 'Node',
      id: ModelFactory.createIdentifier(),
      name: input.name,
      superTypes: [],
      attributes: [],
      constraints: [],
    };
  }

  private newRelation(input: RelationInput): Relation {
    const from: Ref = this.nodeReference(input.fromNodeId);
    const to: Ref = this.nodeReference(input.toNodeId);
    if (input.refines !== undefined) {
      const reference: ElementRef = this.resolveRef(input.refines, 'relation');
      const base: Model | undefined = this.findModel(reference.modelId);
      if (!base) throw new Error(`Unknown model: '${reference.modelId}'.`);
      return ModelFactory.createRelation(base, base.id, { baseRelationId: reference.elementId, fromNodeId: from, toNodeId: to });
    }
    if (this.model.imports.length > 0) throw new Error('Select a relation permitted by the preceding model level.');
    if (!input.name) throw new Error('A root relation needs a name.');
    const fromBounds: Bounds = input.fromBounds ?? { lowerBound: 0, upperBound: -1 };
    const toBounds: Bounds = input.toBounds ?? { lowerBound: 0, upperBound: -1 };

    return {
      kind: 'Relation',
      id: ModelFactory.createIdentifier(),
      name: input.name,
      superTypes: [],
      constraints: [],
      from: ModelFactory.createRelationEnd(from, input.fromRole ?? 'source', fromBounds),
      to: ModelFactory.createRelationEnd(to, input.toRole ?? 'target', toBounds),
    };
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
