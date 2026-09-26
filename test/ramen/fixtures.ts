import assert from 'node:assert/strict';
import { RAMEN_ELEMENT, RAMEN_MODEL, RamenModel } from '../../dist/index.js';
import type {
  Attribute,
  Node,
  Relation,
  RamenAnnotation,
  AnnotationRelation,
  RamenChange,
  RamenModelDocument,
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
  readonly project: RamenModel;
  readonly model: RamenModelDocument;
  readonly nodes: CorrespondenceNodes;
  readonly relations: CorrespondenceRelations;
  readonly annotations: CorrespondenceAnnotations;
  readonly url: Attribute;
}

export interface ScholarlyFixture {
  readonly project: RamenModel;
  readonly model: RamenModelDocument;
  readonly nodes: CorrespondenceNodes;
}

export function createCorrespondenceFixture(): CorrespondenceFixture {
  const project: RamenModel = RamenModel.create({
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
  const model: RamenModelDocument = project.getModel();

  assert.equal(project.validate().valid, true, JSON.stringify(project.validate().diagnostics));
  return { project: project, model: model, nodes: nodes, relations: relations, annotations: annotations, url: url };
}

export function createScholarlyFixture(base: CorrespondenceFixture): ScholarlyFixture {
  const project: RamenModel = base.project.createNextLevel({
    uri: 'https://example.org/models/scholarly-correspondence',
    id: SCHOLARLY_MODEL_ID,
    name: 'Scholarly Correspondence',
    version: '1.0.0',
  });
  const nodes: CorrespondenceNodes = createRefinedNodes(project, base);

  createRefinedRelations(project, base, nodes);
  const model: RamenModelDocument = project.getModel();

  assert.equal(project.validate().valid, true, JSON.stringify(project.validate().diagnostics));
  return { project: project, model: model, nodes: nodes };
}

function createBaseNodes(project: RamenModel): CorrespondenceNodes {
  return {
    letter: createNode(project, 'Letter', RAMEN_ELEMENT.COLLECTION),
    witness: createNode(project, 'Witness', RAMEN_ELEMENT.COLLECTION),
    person: createNode(project, 'Person', RAMEN_ELEMENT.ENTITY),
    place: createNode(project, 'Place', RAMEN_ELEMENT.ENTITY),
    text: createNode(project, 'Text', RAMEN_ELEMENT.CONTENT),
    annotation: createNode(project, 'TextAnnotation', RAMEN_ELEMENT.ANNOTATION),
  };
}

function createRefinedNodes(project: RamenModel, base: CorrespondenceFixture): CorrespondenceNodes {
  return {
    letter: createNode(project, 'CorrespondenceLetter', base.nodes.letter.id),
    witness: createNode(project, 'PhysicalWitness', base.nodes.witness.id),
    person: createNode(project, 'HistoricalPerson', base.nodes.person.id),
    place: createNode(project, 'HistoricalPlace', base.nodes.place.id),
    text: createNode(project, 'NormalizedText', base.nodes.text.id),
    annotation: createNode(project, 'ScholarlyAnnotation', base.nodes.annotation.id),
  };
}

function createNode(project: RamenModel, name: string, elementId: string): Node {
  const change: RamenChange<Node> = project.createNode({ name: name, refines: elementId });
  return change.element;
}

function createBaseRelations(project: RamenModel, nodes: CorrespondenceNodes): CorrespondenceRelations {
  return {
    witnessInLetter: project.partOf(nodes.witness, nodes.letter).element,
    textInWitness: project.partOf(nodes.text, nodes.witness).element,
    textAnnotation: project.hasAnnotation(nodes.text, nodes.annotation).element,
    personAnnotation: project.hasAnnotation(nodes.person, nodes.annotation).element,
    refersPerson: project.refersTo(nodes.annotation, nodes.person).element,
    refersPlace: project.refersTo(nodes.annotation, nodes.place).element,
    annotatesAnnotation: project.hasAnnotation(nodes.annotation, nodes.annotation).element,
  };
}

function createRefinedRelations(project: RamenModel, base: CorrespondenceFixture, nodes: CorrespondenceNodes): void {
  createRelationFromBase(project, base.relations.witnessInLetter, nodes.witness.id, nodes.letter.id);
  createRelationFromBase(project, base.relations.textInWitness, nodes.text.id, nodes.witness.id);
  createRelationFromBase(project, base.relations.textAnnotation, nodes.text.id, nodes.annotation.id);
  createRelationFromBase(project, base.relations.personAnnotation, nodes.person.id, nodes.annotation.id);
  createRelationFromBase(project, base.relations.refersPerson, nodes.annotation.id, nodes.person.id);
  createRelationFromBase(project, base.relations.refersPlace, nodes.annotation.id, nodes.place.id);
  createRelationFromBase(project, base.relations.annotatesAnnotation, nodes.annotation.id, nodes.annotation.id);
}

function createRelationFromBase(project: RamenModel, base: Pick<Relation, 'id'>, fromId: string, toId: string): Relation {
  const change: RamenChange<Relation> = project.createRelation({
    refines: base.id,
    fromNodeId: fromId,
    toNodeId: toId,
  });
  return change.element;
}

function createAnnotations(
  project: RamenModel,
  nodes: CorrespondenceNodes,
  relations: CorrespondenceRelations,
  url: Attribute,
): CorrespondenceAnnotations {
  const attachments: readonly AnnotationRelation[] = attachmentRelations(relations);
  const persName: RamenAnnotation = createReferenceAnnotation(
    project,
    nodes.annotation,
    'persName',
    relations.refersPerson,
    attachments,
  );
  const placeName: RamenAnnotation = createReferenceAnnotation(
    project,
    nodes.annotation,
    'placeName',
    relations.refersPlace,
    attachments,
  );
  const other: Pick<CorrespondenceAnnotations, 'date' | 'comment' | 'externalReference'> = createOtherAnnotations(
    project,
    nodes.annotation,
    relations,
    url,
    attachments,
  );

  return { persName: persName, placeName: placeName, ...other };
}

function createOtherAnnotations(
  project: RamenModel,
  owner: Node,
  relations: CorrespondenceRelations,
  url: Attribute,
  attachments: readonly AnnotationRelation[],
): Pick<CorrespondenceAnnotations, 'date' | 'comment' | 'externalReference'> {
  const date: RamenAnnotation = project.createAnnotation({
    annotationId: owner.id,
    type: 'date',
    relations: attachments,
  }).element;
  const comment: RamenAnnotation = project.createAnnotation({
    annotationId: owner.id,
    type: 'comment',
    relations: [
      ...attachments,
      { relationId: relations.annotatesAnnotation.id, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } },
    ],
  }).element;
  const externalReference: RamenAnnotation = project.createAnnotation({
    annotationId: owner.id,
    type: 'externalReference',
    properties: [{ attributeId: url.id, bounds: { lowerBound: 1, upperBound: 1 } }],
    relations: attachments,
  }).element;

  return {
    date: date,
    comment: comment,
    externalReference: externalReference,
  };
}

function attachmentRelations(relations: CorrespondenceRelations): readonly AnnotationRelation[] {
  return [
    { relationId: relations.textAnnotation.id, direction: 'incoming', bounds: { lowerBound: 0, upperBound: -1 } },
    { relationId: relations.personAnnotation.id, direction: 'incoming', bounds: { lowerBound: 0, upperBound: -1 } },
  ];
}

function createReferenceAnnotation(
  project: RamenModel,
  owner: Node,
  type: string,
  reference: Relation,
  attachments: readonly AnnotationRelation[],
): RamenAnnotation {
  return project.createAnnotation({
    annotationId: owner.id,
    type: type,
    relations: [...attachments, { relationId: reference.id, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } }],
  }).element;
}
