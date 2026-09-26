import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { compileSchema } from 'json-schema-library';
import type { SchemaNode } from 'json-schema-library';
import { EffectiveModel, ModelRef, ModelRelationScope } from '../../dist/model/index.js';
import type {
  Attribute,
  Classifier,
  Constraint,
  DataType,
  Model,
  Node,
  ProjectGraph,
  Relation,
  RelationEnd,
  ResolvedElement,
  ValidProjectResult,
} from '../../dist/model/index.js';
import { RAMEN_ELEMENT, RamenModel, RamenModelFormat } from '../../dist/ramen/index.js';

interface NodeView extends Omit<Node, 'superTypes'> {
  readonly ref: string;
}

interface EndView extends RelationEnd {
  readonly accepts: readonly string[];
}

interface RelationView extends Omit<Relation, 'superTypes' | 'from' | 'to'> {
  readonly ref: string;
  readonly from: EndView;
  readonly to: EndView;
}

interface Declaration<T> {
  readonly modelId: string;
  readonly value: T;
}

interface Export {
  readonly $schema: string;
  readonly model: {
    readonly id: string;
    readonly name: string;
    readonly version: string;
    readonly nodes: readonly NodeView[];
    readonly dataTypes: readonly (DataType & { readonly ref: string })[];
    readonly relations: readonly RelationView[];
  };
  readonly origin: {
    readonly models: readonly Omit<Model, 'classifiers' | 'relations'>[];
    readonly classifiers: readonly Declaration<Classifier>[];
    readonly relations: readonly Declaration<Relation>[];
  };
}

function qualify(modelId: string, ref: string): string {
  const builtin: boolean = ['String', 'Boolean', 'Integer', 'Float'].includes(ref);
  return builtin || ModelRef.isQualified(ref) ? ref : ModelRef.qualify(modelId, ref);
}

function resolveNode(graph: ProjectGraph, item: ResolvedElement<Node>): NodeView {
  const effective: ReturnType<typeof EffectiveModel.resolveNode> = EffectiveModel.resolveNode(
    graph,
    item.modelId,
    item.element.id,
  );
  assert.ok(effective);
  const { superTypes: _superTypes, ...node }: Node = item.element;
  return {
    ...node,
    ref: ModelRef.qualify(item.modelId, node.id),
    attributes: effective.attributes.map((attribute: Attribute): Attribute => ({
      ...attribute,
      typeId: qualify(item.modelId, attribute.typeId),
    })),
    constraints: [...effective.constraints],
  };
}

function resolveEnd(graph: ProjectGraph, owner: string, end: RelationEnd, nodes: readonly ResolvedElement<Node>[]): EndView {
  return {
    ...end,
    nodeId: qualify(owner, end.nodeId),
    accepts: nodes
      .filter((node: ResolvedElement<Node>): boolean => graph.acceptsNode(owner, end.nodeId, node))
      .map((node: ResolvedElement<Node>): string => ModelRef.qualify(node.modelId, node.element.id)),
  };
}

function resolveRelation(
  graph: ProjectGraph,
  item: ResolvedElement<Relation>,
  nodes: readonly ResolvedElement<Node>[],
): RelationView {
  const { superTypes: _superTypes, ...relation }: Relation = item.element;
  const lineage: readonly Relation[] = [
    ...graph
      .getRelationAncestors(item.modelId, relation.id)
      .map((ancestor: ResolvedElement<Relation>): Relation => ancestor.element)
      .reverse(),
    item.element,
  ];
  return {
    ...relation,
    ref: ModelRef.qualify(item.modelId, relation.id),
    from: {
      ...resolveEnd(graph, item.modelId, relation.from, nodes),
      constraints: lineage.flatMap((value: Relation): Constraint[] => value.from.constraints ?? []),
    },
    to: {
      ...resolveEnd(graph, item.modelId, relation.to, nodes),
      constraints: lineage.flatMap((value: Relation): Constraint[] => value.to.constraints ?? []),
    },
    constraints: lineage.flatMap((value: Relation): Constraint[] => value.constraints ?? []),
  };
}

function provenance(models: readonly Model[]): Export['origin'] {
  return {
    models: models.map((model: Model): Omit<Model, 'classifiers' | 'relations'> => {
      const { classifiers: _classifiers, relations: _relations, ...header }: Model = model;
      return header;
    }),
    classifiers: models.flatMap((model: Model): Declaration<Classifier>[] =>
      model.classifiers.map((value: Classifier): Declaration<Classifier> => ({ modelId: model.id, value })),
    ),
    relations: models.flatMap((model: Model): Declaration<Relation>[] =>
      model.relations.map((value: Relation): Declaration<Relation> => ({ modelId: model.id, value })),
    ),
  };
}

// Experimental compiler for structural models. Annotation variants are deliberately rejected until their export is specified.
function resolve(project: RamenModel): Export {
  const validation: ReturnType<RamenModel['validate']> = project.validate();
  assert.equal(validation.valid, true);
  if (!validation.valid) throw new Error('Invalid project.');
  const result: ValidProjectResult = validation;
  const models: readonly Model[] = project.getModels();
  assert.ok(models.every((model: Model): boolean => !RamenModelFormat.isDocument(model) || model.annotations.length === 0));
  const model: Model = project.getModel();
  const nodes: readonly ResolvedElement<Node>[] = result.graph.getAvailableNodes(model.id);
  const scope: ModelRelationScope = new ModelRelationScope(result.graph);
  const dataTypes: readonly (DataType & { readonly ref: string })[] = models.flatMap(
    (source: Model): (DataType & { readonly ref: string })[] =>
      source.classifiers
        .filter((item: Classifier): item is DataType => item.kind === 'DataType')
        .map((type: DataType): DataType & { readonly ref: string } => ({ ...type, ref: ModelRef.qualify(source.id, type.id) })),
  );
  return structuredClone({
    $schema: 'https://ramen-schema.org/draft/resolved.schema.json',
    model: {
      id: model.id,
      name: model.name,
      version: model.version,
      nodes: nodes.map((node: ResolvedElement<Node>): NodeView => resolveNode(result.graph, node)),
      dataTypes,
      relations: scope
        .available(model.id)
        .map((relation: ResolvedElement<Relation>): RelationView => resolveRelation(result.graph, relation, nodes)),
    },
    origin: provenance(models),
  });
}

function split(value: Export): readonly Model[] {
  return structuredClone(
    value.origin.models.map((header: Omit<Model, 'classifiers' | 'relations'>): Model => ({
      ...header,
      classifiers: value.origin.classifiers
        .filter((item: Declaration<Classifier>): boolean => item.modelId === header.id)
        .map((item: Declaration<Classifier>): Classifier => item.value),
      relations: value.origin.relations
        .filter((item: Declaration<Relation>): boolean => item.modelId === header.id)
        .map((item: Declaration<Relation>): Relation => item.value),
    })),
  );
}

const base: RamenModel = RamenModel.create('Correspondence');
const letter: Node = base.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
const witness: Node = base.createNode({ name: 'Witness', refines: RAMEN_ELEMENT.COLLECTION }).element;
const text: Node = base.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
base.createAttribute(letter, { name: 'title', typeId: 'String' });
base.partOf(witness, letter);
base.partOf(text, witness);

const edition: RamenModel = base.createNextLevel('Edition');
const editionLetter: Node = edition.createNode({ name: 'EditionLetter', refines: letter }).element;
const manuscript: Node = edition.createNode({ name: 'Manuscript', refines: witness }).element;
edition.partOf(manuscript, editionLetter);
// Text → Witness is not selected in this edition and must not reappear in the resolved model.
const output: Export = resolve(edition);
const restored: readonly Model[] = split(output);
assert.deepEqual(restored, edition.getModels());
assert.equal(output.model.relations.length, 1);
assert.equal(output.model.relations[0]?.from.nodeId, `${edition.getModel().id}:${manuscript.id}`);
assert.equal(
  output.model.nodes
    .find((node: NodeView): boolean => node.id === editionLetter.id)
    ?.attributes.some((attribute: Attribute): boolean => attribute.name === 'title'),
  true,
);
assert.equal(editionLetter.attributes.length, 0);

const sourceSchema: SchemaNode = compileSchema(
  JSON.parse(readFileSync(new URL('../../src/resources/schemas/model.schema.json', import.meta.url), 'utf8')) as object,
);
const schema: SchemaNode = compileSchema(
  JSON.parse(readFileSync(new URL('./resolved.schema.json', import.meta.url), 'utf8')) as object,
  { remote: sourceSchema },
);
assert.equal(schema.validate(output).valid, true);
assert.equal(schema.validate({ ...output, rootModelId: edition.getModel().id }).valid, false);
const restoredModel: Model | undefined = restored.find((model: Model): boolean => model.id === output.model.id);
assert.ok(restoredModel);
const loaded: RamenModel = RamenModel.load(
  restoredModel,
  restored.filter((model: Model): boolean => model.id !== restoredModel.id),
);
assert.deepEqual(resolve(loaded), output);

// The draft importer validates both the JSON structure and agreement with the original declarations.
function restore(input: unknown): RamenModel {
  assert.equal(schema.validate(input).valid, true, 'Invalid resolved export structure.');
  const document: Export = input as Export;
  const models: readonly Model[] = split(document);
  const current: Model | undefined = models.find((model: Model): boolean => model.id === document.model.id);
  assert.ok(current, 'Missing project origin.');
  const project: RamenModel = RamenModel.load(
    current,
    models.filter((model: Model): boolean => model.id !== current.id),
  );
  assert.deepEqual(resolve(project), document, 'Effective model and origin disagree.');
  return project;
}

const parsed: unknown = JSON.parse(JSON.stringify(output));
assert.deepEqual(restore(parsed).getModels(), edition.getModels());
const changed: Export = structuredClone(output);
changed.model.nodes[0]?.attributes.pop();
assert.throws((): RamenModel => restore(changed), /Effective model and origin disagree/);
assert.throws((): RamenModel => restore({ ...output, origin: {} }), /Invalid resolved export structure/);
if (process.argv.includes('--write'))
  writeFileSync(new URL('./edition.json', import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
console.log('Resolved export: schema, inherited properties, relation scope and lossless roundtrip passed.');
