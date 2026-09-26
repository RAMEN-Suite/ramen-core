import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
import { RamenModel, RamenModelFormat, RamenAnnotationSchemaValidator } from '../../dist/ramen/index.js';
import { Annotations } from './annotations.ts';
import type { AnnotationView } from './annotations.ts';
import type { RamenAnnotation } from '../../dist/ramen/index.js';

interface NodeView extends Omit<Node, 'superTypes'> {
  readonly ref: string;
}

interface EndView extends RelationEnd {
  readonly accepts: readonly string[];
}

export interface RelationView extends Omit<Relation, 'superTypes' | 'from' | 'to'> {
  readonly ref: string;
  readonly from: EndView;
  readonly to: EndView;
}

interface Declaration<T> {
  readonly modelId: string;
  readonly value: T;
}

export interface Export {
  readonly $schema: string;
  readonly model: {
    readonly id: string;
    readonly name: string;
    readonly version: string;
    readonly nodes: readonly NodeView[];
    readonly dataTypes: readonly (DataType & { readonly ref: string })[];
    readonly relations: readonly RelationView[];
    readonly annotations: readonly AnnotationView[];
  };
  readonly origin: {
    readonly models: readonly Omit<Model, 'classifiers' | 'relations'>[];
    readonly classifiers: readonly Declaration<Classifier>[];
    readonly relations: readonly Declaration<Relation>[];
    readonly annotations: readonly Declaration<RamenAnnotation>[];
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
      if (!RamenModelFormat.isDocument(model)) return header;
      const { annotations: _annotations, ...metadata }: typeof header & { annotations?: readonly RamenAnnotation[] } = header;
      return metadata;
    }),
    classifiers: models.flatMap((model: Model): Declaration<Classifier>[] =>
      model.classifiers.map((value: Classifier): Declaration<Classifier> => ({ modelId: model.id, value })),
    ),
    annotations: models.flatMap((model: Model): Declaration<RamenAnnotation>[] =>
      RamenModelFormat.isDocument(model)
        ? model.annotations.map((value: RamenAnnotation): Declaration<RamenAnnotation> => ({ modelId: model.id, value }))
        : [],
    ),
    relations: models.flatMap((model: Model): Declaration<Relation>[] =>
      model.relations.map((value: Relation): Declaration<Relation> => ({ modelId: model.id, value })),
    ),
  };
}

/** Experimental resolved export; not yet part of the package API. */
export function resolve(project: RamenModel): Export {
  const validation: ReturnType<RamenModel['validate']> = project.validate();
  assert.equal(validation.valid, true);
  if (!validation.valid) throw new Error('Invalid project.');
  const result: ValidProjectResult = validation;
  const models: readonly Model[] = project.getModels();
  const annotations: Annotations = new Annotations(project, result.graph);
  const model: Model = project.getModel();
  const nodes: readonly ResolvedElement<Node>[] = result.graph.getAvailableNodes(model.id);
  const scope: ModelRelationScope = new ModelRelationScope(result.graph, annotations.selections);
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
      annotations: annotations.resolve(nodes, scope.available(model.id)),
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
      ...(RamenModelFormat.isDocument(header)
        ? {
            annotations: value.origin.annotations
              .filter((item: Declaration<RamenAnnotation>): boolean => item.modelId === header.id)
              .map((item: Declaration<RamenAnnotation>): RamenAnnotation => item.value),
          }
        : {}),
      classifiers: value.origin.classifiers
        .filter((item: Declaration<Classifier>): boolean => item.modelId === header.id)
        .map((item: Declaration<Classifier>): Classifier => item.value),
      relations: value.origin.relations
        .filter((item: Declaration<Relation>): boolean => item.modelId === header.id)
        .map((item: Declaration<Relation>): Relation => item.value),
    })),
  );
}

export const schema: SchemaNode = compileSchema(
  JSON.parse(readFileSync(new URL('./resolved.schema.json', import.meta.url), 'utf8')) as object,
  { remote: RamenAnnotationSchemaValidator.getSchemaNode() },
);

// The draft importer validates both the JSON structure and agreement with the original declarations.
export function restore(input: unknown): RamenModel {
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
