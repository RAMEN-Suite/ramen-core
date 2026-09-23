import assert from 'node:assert/strict';
import { RAMEN_ELEMENT, RAMEN_MODEL, RamenProject } from '../../dist/index.js';
import type {
  Attribute,
  Model,
  Node,
  Relation,
  RamenAdvisor,
  RamenAnnotation,
  RamenChange,
  RelationRefinementSuggestion,
} from '../../dist/index.js';

export const CORRESPONDENCE_MODEL_ID: string = 'correspondence01';
export const SCHOLARLY_MODEL_ID: string = 'scholarlyCorrespondence01';

export interface CorrespondenceNodes {
  readonly letter: Node;
  readonly witness: Node;
  readonly person: Node;
  readonly place: Node;
  readonly text: Node;
  readonly annotation: Node;
}

export interface CorrespondenceRelations {
  readonly witnessInLetter: Relation;
  readonly textInWitness: Relation;
  readonly textAnnotation: Relation;
  readonly personAnnotation: Relation;
  readonly refersPerson: Relation;
  readonly refersPlace: Relation;
  readonly annotatesAnnotation: Relation;
}

export interface CorrespondenceAnnotations {
  readonly persName: RamenAnnotation;
  readonly placeName: RamenAnnotation;
  readonly date: RamenAnnotation;
  readonly comment: RamenAnnotation;
  readonly externalReference: RamenAnnotation;
}

export interface CorrespondenceFixture {
  readonly project: RamenProject;
  readonly model: Model;
  readonly nodes: CorrespondenceNodes;
  readonly relations: CorrespondenceRelations;
  readonly annotations: CorrespondenceAnnotations;
  readonly url: Attribute;
}

export interface ScholarlyFixture {
  readonly project: RamenProject;
  readonly model: Model;
  readonly nodes: CorrespondenceNodes;
  readonly persName: RamenAnnotation;
}

export function createCorrespondenceFixture(): CorrespondenceFixture {
  const project: RamenProject = RamenProject.create({
    uri: 'https://example.org/models/correspondence',
    id: CORRESPONDENCE_MODEL_ID,
    name: 'Correspondence',
    version: '1.0.0',
  });
  const nodes: CorrespondenceNodes = createBaseNodes(project);
  const url: Attribute = project.createAttribute(nodes.annotation.id, {
    name: 'url',
    typeId: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.URI}`,
    bounds: { lowerBound: 0, upperBound: 1 },
  }).element;
  const relations: CorrespondenceRelations = createBaseRelations(project, nodes);
  const annotations: CorrespondenceAnnotations = createAnnotations(project, nodes, relations, url);
  const model: Model = project.getModel();
  assert.equal(project.validate().valid, true, JSON.stringify(project.validate().diagnostics));
  return { project: project, model: model, nodes: nodes, relations: relations, annotations: annotations, url: url };
}

export function createScholarlyFixture(base: CorrespondenceFixture): ScholarlyFixture {
  const project: RamenProject = base.project.createNextLevel({
    uri: 'https://example.org/models/scholarly-correspondence',
    id: SCHOLARLY_MODEL_ID,
    name: 'Scholarly Correspondence',
    version: '1.0.0',
  });
  const nodes: CorrespondenceNodes = createRefinedNodes(project, base);
  createRefinedRelations(project, base, nodes);
  const persName: RamenAnnotation = project.refineAnnotation({
    annotationId: nodes.annotation.id,
    refines: { modelId: base.model.id, elementId: base.annotations.persName.id },
    relations: [
      {
        relationId: findRelation(project, nodes.annotation.id, nodes.person.id, 'REFERS_TO').id,
        direction: 'outgoing',
        bounds: { lowerBound: 1, upperBound: 1 },
      },
    ],
  }).element;
  const model: Model = project.getModel();
  assert.equal(project.validate().valid, true, JSON.stringify(project.validate().diagnostics));
  return { project: project, model: model, nodes: nodes, persName: persName };
}

function createBaseNodes(project: RamenProject): CorrespondenceNodes {
  return {
    letter: createNode(project, 'Letter', RAMEN_ELEMENT.COLLECTION, RAMEN_MODEL.id),
    witness: createNode(project, 'Witness', RAMEN_ELEMENT.COLLECTION, RAMEN_MODEL.id),
    person: createNode(project, 'Person', RAMEN_ELEMENT.ENTITY, RAMEN_MODEL.id),
    place: createNode(project, 'Place', RAMEN_ELEMENT.ENTITY, RAMEN_MODEL.id),
    text: createNode(project, 'Text', RAMEN_ELEMENT.CONTENT, RAMEN_MODEL.id),
    annotation: createNode(project, 'TextAnnotation', RAMEN_ELEMENT.ANNOTATION, RAMEN_MODEL.id),
  };
}

function createRefinedNodes(project: RamenProject, base: CorrespondenceFixture): CorrespondenceNodes {
  return {
    letter: createNode(project, 'CorrespondenceLetter', base.nodes.letter.id, base.model.id),
    witness: createNode(project, 'PhysicalWitness', base.nodes.witness.id, base.model.id),
    person: createNode(project, 'HistoricalPerson', base.nodes.person.id, base.model.id),
    place: createNode(project, 'HistoricalPlace', base.nodes.place.id, base.model.id),
    text: createNode(project, 'NormalizedText', base.nodes.text.id, base.model.id),
    annotation: createNode(project, 'ScholarlyAnnotation', base.nodes.annotation.id, base.model.id),
  };
}

function createNode(project: RamenProject, name: string, elementId: string, modelId: string): Node {
  const change: RamenChange<Node> = project.createNode({ name: name, refines: { modelId: modelId, elementId: elementId } });
  return change.element;
}

function createBaseRelations(project: RamenProject, nodes: CorrespondenceNodes): CorrespondenceRelations {
  return {
    witnessInLetter: createRelation(project, nodes.witness.id, nodes.letter.id, 'PART_OF'),
    textInWitness: createRelation(project, nodes.text.id, nodes.witness.id, 'PART_OF'),
    textAnnotation: createRelation(project, nodes.text.id, nodes.annotation.id, 'HAS_ANNOTATION'),
    personAnnotation: createRelation(project, nodes.person.id, nodes.annotation.id, 'HAS_ANNOTATION'),
    refersPerson: createRelation(project, nodes.annotation.id, nodes.person.id, 'REFERS_TO'),
    refersPlace: createRelation(project, nodes.annotation.id, nodes.place.id, 'REFERS_TO'),
    annotatesAnnotation: createRelation(project, nodes.annotation.id, nodes.annotation.id, 'HAS_ANNOTATION'),
  };
}

function createRefinedRelations(project: RamenProject, base: CorrespondenceFixture, nodes: CorrespondenceNodes): void {
  createRelationFromBase(project, base.relations.witnessInLetter, base.model.id, nodes.witness.id, nodes.letter.id);
  createRelationFromBase(project, base.relations.textInWitness, base.model.id, nodes.text.id, nodes.witness.id);
  createRelationFromBase(project, base.relations.textAnnotation, base.model.id, nodes.text.id, nodes.annotation.id);
  createRelationFromBase(project, base.relations.personAnnotation, base.model.id, nodes.person.id, nodes.annotation.id);
  createRelationFromBase(project, base.relations.refersPerson, base.model.id, nodes.annotation.id, nodes.person.id);
  createRelationFromBase(project, base.relations.refersPlace, base.model.id, nodes.annotation.id, nodes.place.id);
  createRelationFromBase(project, base.relations.annotatesAnnotation, base.model.id, nodes.annotation.id, nodes.annotation.id);
}

function createRelation(project: RamenProject, fromId: string, toId: string, name: string): Relation {
  const advisor: RamenAdvisor | undefined = project.createAdvisor();
  assert.ok(advisor);
  const suggestion: RelationRefinementSuggestion | undefined = advisor
    .suggestRelations(project.getModel().id, fromId, toId)
    .find((item: RelationRefinementSuggestion): boolean => item.name === name);
  assert.ok(suggestion, `Missing ${name} suggestion for ${fromId} -> ${toId}`);
  const change: RamenChange<Relation> = project.createRelation({
    refines: { modelId: suggestion.modelId, elementId: suggestion.relationId },
    fromNodeId: fromId,
    toNodeId: toId,
  });
  return change.element;
}

function createRelationFromBase(
  project: RamenProject,
  base: Pick<Relation, 'id'>,
  baseModelId: string,
  fromId: string,
  toId: string,
): Relation {
  const change: RamenChange<Relation> = project.createRelation({
    refines: { modelId: baseModelId, elementId: base.id },
    fromNodeId: fromId,
    toNodeId: toId,
  });
  return change.element;
}

function findRelation(project: RamenProject, fromId: string, toId: string, name: string): Relation {
  const relation: Relation | undefined = project
    .getModel()
    .relations.find(
      (candidate: Relation): boolean =>
        candidate.from.nodeId === fromId && candidate.to.nodeId === toId && candidate.name === name,
    );
  assert.ok(relation);
  return relation;
}

function createAnnotations(
  project: RamenProject,
  nodes: CorrespondenceNodes,
  relations: CorrespondenceRelations,
  url: Attribute,
): CorrespondenceAnnotations {
  const persName: RamenAnnotation = project.createAnnotation({
    annotationId: nodes.annotation.id,
    type: 'persName',
    relations: [{ relationId: relations.refersPerson.id, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } }],
  }).element;
  const placeName: RamenAnnotation = project.createAnnotation({
    annotationId: nodes.annotation.id,
    type: 'placeName',
    relations: [{ relationId: relations.refersPlace.id, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } }],
  }).element;
  const date: RamenAnnotation = project.createAnnotation({ annotationId: nodes.annotation.id, type: 'date' }).element;
  const comment: RamenAnnotation = project.createAnnotation({
    annotationId: nodes.annotation.id,
    type: 'comment',
    relations: [
      { relationId: relations.annotatesAnnotation.id, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } },
    ],
  }).element;
  const externalReference: RamenAnnotation = project.createAnnotation({
    annotationId: nodes.annotation.id,
    type: 'externalReference',
    properties: [{ attributeId: url.id, bounds: { lowerBound: 1, upperBound: 1 } }],
  }).element;
  return {
    persName: persName,
    placeName: placeName,
    date: date,
    comment: comment,
    externalReference: externalReference,
  };
}
