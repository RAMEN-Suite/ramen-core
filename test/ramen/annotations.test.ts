import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConstraintRegistry,
  Diagnostics,
  RAMEN_ELEMENT,
  RAMEN_MODEL,
  RamenInstanceValidator,
  RamenModel,
} from '../../dist/ramen-core/index.js';
import type {
  AnnotationOptions,
  AnnotationSuggestion,
  PropertyOption,
  Classifier,
  Constraint,
  ConstraintContext,
  Diagnostic,
  ModelInstanceGraph,
  ProjectValidationResult,
  RamenAnnotation,
  RamenChange,
  RamenModelDocument,
  Node,
  Relation,
  ValidationResult,
} from '../../dist/ramen-core/index.js';
import { createCorrespondenceFixture } from './fixtures.ts';
import type { CorrespondenceFixture } from './fixtures.ts';

void test('declares and reuses annotation types without refining the imported Annotation node', (): void => {
  const first: RamenModel = RamenModel.create({
    id: 'annotationReuseOne01',
    uri: 'https://example.org/models/annotation-reuse-one',
    name: 'First level',
    version: '1.0.0',
  });
  const text: Node = first.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
  const note: RamenChange<RamenAnnotation> = first.createAnnotation({ annotationId: RAMEN_ELEMENT.ANNOTATION, type: 'note' });

  assert.equal(note.validation.valid, true);
  assert.deepEqual(
    first.suggestAnnotations(RAMEN_ELEMENT.ANNOTATION).map((item: AnnotationSuggestion): string => item.type),
    ['note'],
  );
  assert.deepEqual(
    first
      .getAdvisor()
      .suggestAnnotationsForNode(first.getModel().id, text.id)
      .map((item: AnnotationSuggestion): string => item.type),
    [],
  );

  const second: RamenModel = first.createNextLevel({
    id: 'annotationReuseTwo01',
    uri: 'https://example.org/models/annotation-reuse-two',
    name: 'Second level',
    version: '1.0.0',
  });
  const comment: RamenChange<RamenAnnotation> = second.createAnnotation({
    annotationId: RAMEN_ELEMENT.ANNOTATION,
    type: 'comment',
  });
  const annotations: readonly string[] = second
    .suggestAnnotations(RAMEN_ELEMENT.ANNOTATION)
    .map((item: AnnotationSuggestion): string => item.type);

  assert.equal(comment.validation.valid, true);
  assert.deepEqual(annotations, ['comment', 'note']);

  for (const type of annotations) assertValidReusedAnnotation(second, type);
});

function assertValidReusedAnnotation(model: RamenModel, type: string): void {
  const data: ModelInstanceGraph = {
    modelId: model.getModel().id,
    nodes: [
      {
        id: 'annotationValue001',
        typeId: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.ANNOTATION}`,
        properties: { uuid: 'abac88bd-b3e3-418a-8afe-6ac14409b9a1', type: type },
      },
    ],
    relations: [],
  };
  const result: ValidationResult = model.validateInstances(data);

  assert.deepEqual(result.diagnostics, []);
}

void test('suggests different types for Text and Image sharing the imported Annotation node', (): void => {
  const attachment: Relation | undefined = RAMEN_MODEL.relations.find(
    (relation: Relation): boolean => relation.name === 'HAS_ANNOTATION' && relation.from.nodeId === RAMEN_ELEMENT.CONTENT,
  );
  assert.ok(attachment);

  const project: RamenModel = RamenModel.create({
    id: 'sharedAnnotation01',
    uri: 'https://example.org/models/shared-annotation',
    name: 'Shared Annotation',
    version: '1.0.0',
  });
  const text: Node = project.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
  const image: Node = project.createNode({ name: 'Image', refines: RAMEN_ELEMENT.CONTENT }).element;
  const textAttachment: Relation = project.createRelation({
    refines: attachment.id,
    fromNodeId: text.id,
    toNodeId: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.ANNOTATION}`,
  }).element;
  const imageAttachment: Relation = project.createRelation({
    refines: attachment.id,
    fromNodeId: image.id,
    toNodeId: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.ANNOTATION}`,
  }).element;

  project.createAnnotation({
    annotationId: RAMEN_ELEMENT.ANNOTATION,
    type: 'emphasis',
    relations: [{ relationId: textAttachment.id, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } }],
  });
  project.createAnnotation({
    annotationId: RAMEN_ELEMENT.ANNOTATION,
    type: 'imageRegion',
    relations: [{ relationId: imageAttachment.id, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } }],
  });

  assert.equal(project.validate().valid, true, JSON.stringify(project.validate().diagnostics));
  assert.deepEqual(annotationTypesForNode(project, text), ['emphasis']);
  assert.deepEqual(annotationTypesForNode(project, image), ['imageRegion']);

  assertInheritedTextSuggestion(project, text);
});

function assertInheritedTextSuggestion(project: RamenModel, text: Node): void {
  const next: RamenModel = project.createNextLevel({
    id: 'sharedAnnotationNext01',
    uri: 'https://example.org/models/shared-annotation-next',
    name: 'Shared Annotation Next',
    version: '1.0.0',
  });
  const refinedText: Node = next.createNode({ name: 'NormalizedText', refines: text.id }).element;

  assert.deepEqual(annotationTypesForNode(next, refinedText), []);
  next.hasAnnotation(refinedText, RAMEN_ELEMENT.ANNOTATION);

  assert.deepEqual(annotationTypesForNode(next, refinedText), ['emphasis']);
  assert.equal(next.suggestAnnotationsForNode(refinedText.id, RAMEN_ELEMENT.ANNOTATION)[0]?.type, 'emphasis');
  assert.equal(next.validate().valid, true);
}

void test('suggests types of separate TextAnnotation and ImageAnnotation nodes', (): void => {
  const project: RamenModel = RamenModel.create({
    id: 'separateAnnotation01',
    uri: 'https://example.org/models/separate-annotation',
    name: 'Separate Annotations',
    version: '1.0.0',
  });
  const text: Node = project.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
  const image: Node = project.createNode({ name: 'Image', refines: RAMEN_ELEMENT.CONTENT }).element;
  const textAnnotation: Node = project.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const imageAnnotation: Node = project.createNode({ name: 'ImageAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const textAttachment: Relation = project.hasAnnotation(text, textAnnotation).element;
  const imageAttachment: Relation = project.hasAnnotation(image, imageAnnotation).element;

  project.createAnnotation({
    annotationId: textAnnotation.id,
    type: 'emphasis',
    relations: [{ relationId: textAttachment.id, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } }],
  });
  project.createAnnotation({
    annotationId: imageAnnotation.id,
    type: 'imageRegion',
    relations: [{ relationId: imageAttachment.id, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } }],
  });

  assert.equal(project.validate().valid, true);
  assert.deepEqual(annotationTypesForNode(project, text), ['emphasis']);
  assert.deepEqual(annotationTypesForNode(project, image), ['imageRegion']);
  assertSelectedTargets(project, text, image, textAnnotation, imageAnnotation);
});

function assertSelectedTargets(project: RamenModel, text: Node, image: Node, textAnnotation: Node, imageAnnotation: Node): void {
  const types: readonly string[] = project
    .suggestAnnotationsForNode(text.id, textAnnotation.id)
    .map((item: AnnotationSuggestion): string => item.type);
  assert.deepEqual(types, ['emphasis']);
  assert.deepEqual(project.suggestAnnotationsForNode(text.id, imageAnnotation.id), []);
  assert.deepEqual(project.suggestAnnotationsForNode(image.id, textAnnotation.id), []);
}

function annotationTypesForNode(model: RamenModel, node: Node): readonly string[] {
  return model
    .getAdvisor()
    .suggestAnnotationsForNode(model.getModel().id, node.id)
    .map((item: AnnotationSuggestion): string => item.type);
}

void test('inherits an annotation type unchanged while reusing the same imported node', (): void => {
  const reference: Relation | undefined = RAMEN_MODEL.relations.find(
    (relation: Relation): boolean => relation.name === 'REFERS_TO' && relation.to.nodeId === RAMEN_ELEMENT.ENTITY,
  );
  assert.ok(reference);

  const first: RamenModel = RamenModel.create({
    id: 'sameNodeRefineOne',
    uri: 'https://example.org/models/same-node-one',
    name: 'First level',
    version: '1.0.0',
  });
  const original: RamenChange<RamenAnnotation> = first.createAnnotation({
    annotationId: RAMEN_ELEMENT.ANNOTATION,
    type: 'entityLink',
    relations: [
      { relationId: `${RAMEN_MODEL.id}:${reference.id}`, direction: 'outgoing', bounds: { lowerBound: 0, upperBound: -1 } },
    ],
  });
  const second: RamenModel = first.createNextLevel({
    id: 'sameNodeRefineTwo',
    uri: 'https://example.org/models/same-node-two',
    name: 'Second level',
    version: '1.0.0',
  });
  assert.equal(second.validate().valid, true);
  assert.equal(second.suggestAnnotations(RAMEN_ELEMENT.ANNOTATION).length, 1);
  assert.equal(second.suggestAnnotations(RAMEN_ELEMENT.ANNOTATION)[0]?.annotationId, original.element.id);
});

void test('rejects redeclaration of an inherited annotation type', (): void => {
  const first: RamenModel = RamenModel.create({
    id: 'annotationBaseType01',
    uri: 'https://example.org/models/annotation-base-type',
    name: 'Base type',
    version: '1.0.0',
  });
  first.createAnnotation({ annotationId: RAMEN_ELEMENT.ANNOTATION, type: 'note' });

  const second: RamenModel = first.createNextLevel({
    id: 'annotationRepeat01',
    uri: 'https://example.org/models/annotation-repeat',
    name: 'Repeated type',
    version: '1.0.0',
  });
  const replacement: RamenChange<RamenAnnotation> = second.createAnnotation({
    annotationId: RAMEN_ELEMENT.ANNOTATION,
    type: 'note',
  });

  assert.equal(replacement.validation.valid, false);
  assert.ok(
    replacement.validation.diagnostics.some(
      (diagnostic: Diagnostic): boolean => diagnostic.code === 'RAMEN_ANNOTATION_TYPE_DUPLICATE',
    ),
  );
});

void test('uses an imported Annotation node and relation in project data', (): void => {
  const relation: Relation | undefined = RAMEN_MODEL.relations.find(
    (candidate: Relation): boolean => candidate.name === 'HAS_ANNOTATION' && candidate.from.nodeId === RAMEN_ELEMENT.CONTENT,
  );
  assert.ok(relation);

  const model: RamenModel = RamenModel.create({
    id: 'directAnnotationUse01',
    uri: 'https://example.org/models/direct-annotation-use',
    name: 'Direct annotation use',
    version: '1.0.0',
  });
  const text: Node = model.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
  const definition: RamenChange<RamenAnnotation> = model.createAnnotation({
    annotationId: RAMEN_ELEMENT.ANNOTATION,
    type: 'note',
    relations: [
      { relationId: `${RAMEN_MODEL.id}:${relation.id}`, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } },
    ],
  });
  const data: ModelInstanceGraph = linkedAnnotationData(model.getModel().id, text.id, relation.id);

  assert.equal(definition.validation.valid, true);
  assert.deepEqual(model.validateInstances(data).diagnostics, []);
});

function linkedAnnotationData(modelId: string, textTypeId: string, relationTypeId: string): ModelInstanceGraph {
  return {
    modelId: modelId,
    nodes: [
      { id: 'textObject000001', typeId: textTypeId, properties: { uuid: 'abac88bd-b3e3-418a-8afe-6ac14409b9a1' } },
      {
        id: 'noteObject000001',
        typeId: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.ANNOTATION}`,
        properties: { uuid: '68ec6fb5-f6de-4b69-b107-96ee89881448', type: 'note' },
      },
    ],
    relations: [
      {
        id: 'noteRelation0001',
        typeId: `${RAMEN_MODEL.id}:${relationTypeId}`,
        fromId: 'textObject000001',
        toId: 'noteObject000001',
      },
    ],
  };
}

void test('stores five closed annotation definitions outside the model node list', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const annotations: readonly RamenAnnotation[] = fixture.project.getAnnotations();
  const types: readonly string[] = annotations.map((annotation: RamenAnnotation): string => annotation.type).sort();

  assert.equal(fixture.model.classifiers.filter((item: Classifier): boolean => item.kind === 'Node').length, 6);
  assert.deepEqual(types, ['comment', 'date', 'externalReference', 'persName', 'placeName']);
  assert.deepEqual(fixture.model.annotations, annotations);
});

void test('suggests selectable annotation properties and their cardinalities', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const options: AnnotationOptions | undefined = fixture.project
    .getAdvisor()
    .suggestAnnotationOptions(fixture.model.id, fixture.nodes.annotation.id);

  assert.ok(options);
  const url: PropertyOption | undefined = options.properties.find(
    (property: PropertyOption): boolean => property.attributeId === fixture.url.id,
  );

  assert.ok(url);
  assert.deepEqual(url.cardinalityOptions, [
    { lowerBound: 0, upperBound: 1 },
    { lowerBound: 1, upperBound: 1 },
  ]);
});

void test('validates an annotation instance against its selected property set', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const validator: RamenInstanceValidator = new RamenInstanceValidator();
  const invalidGraph: ModelInstanceGraph = annotationGraph(fixture, 'persName', { url: 'https://example.org' });
  const validGraph: ModelInstanceGraph = annotationGraph(fixture, 'externalReference', { url: 'https://example.org' });
  const invalid: ValidationResult = validator.validate(fixture.model.id, [fixture.model, RAMEN_MODEL], invalidGraph);
  const valid: ValidationResult = validator.validate(fixture.model.id, [fixture.model, RAMEN_MODEL], validGraph);

  assert.ok(
    invalid.diagnostics.some(
      (diagnostic: Diagnostic): boolean => diagnostic.code === 'RAMEN_INSTANCE_ANNOTATION_PROPERTY_NOT_ALLOWED',
    ),
  );
  assert.deepEqual(valid.diagnostics, []);
});

void test('evaluates a registered project constraint language on annotation data', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const constraint: Constraint = {
    id: 'archiveUrlRule01',
    name: 'Archive URL',
    language: 'https://example.org/constraints/prefix/1',
    expression: 'https://archives.example/',
  };
  fixture.project.updateAttribute(fixture.nodes.annotation.id, fixture.url.id, { constraints: [constraint] });

  const registry: ConstraintRegistry = ConstraintRegistry.createDefault();
  registry.register({
    language: constraint.language,
    evaluate(rule: Constraint, context: ConstraintContext): readonly Diagnostic[] {
      if (typeof context.value === 'string' && typeof rule.expression === 'string' && context.value.startsWith(rule.expression))
        return [];
      return [Diagnostics.error({ code: 'ARCHIVE_URL_REQUIRED', message: 'Expected an archive URL.', path: context.path })];
    },
  });

  const validator: RamenInstanceValidator = RamenInstanceValidator.withConstraints(registry);
  const graph: ModelInstanceGraph = annotationGraph(fixture, 'externalReference', { url: 'https://example.org/record' });
  const result: ValidationResult = validator.validate(fixture.model.id, fixture.project.getModels(), graph);
  const acceptedGraph: ModelInstanceGraph = annotationGraph(fixture, 'externalReference', {
    url: 'https://archives.example/record',
  });
  const accepted: ValidationResult = validator.validate(fixture.model.id, fixture.project.getModels(), acceptedGraph);

  assert.ok(result.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'ARCHIVE_URL_REQUIRED'));
  assert.deepEqual(accepted.diagnostics, []);
});

void test('requires the modeled person relation for a persName annotation', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const validator: RamenInstanceValidator = new RamenInstanceValidator();
  const missing: ModelInstanceGraph = annotationGraph(fixture, 'persName', {});
  const result: ValidationResult = validator.validate(fixture.model.id, [fixture.model, RAMEN_MODEL], missing);

  assert.equal(result.hasErrors, true);
  assert.ok(
    result.diagnostics.some(
      (diagnostic: Diagnostic): boolean => diagnostic.code === 'RAMEN_INSTANCE_ANNOTATION_RELATION_CARDINALITY',
    ),
  );
});

void test('accepts one modeled person relation and rejects another annotation relation', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const validator: RamenInstanceValidator = new RamenInstanceValidator();
  const valid: ModelInstanceGraph = personAnnotationGraph(fixture);
  const accepted: ValidationResult = validator.validate(fixture.model.id, [fixture.model, RAMEN_MODEL], valid);

  assert.deepEqual(accepted.diagnostics, []);

  const genericAttachment: Relation | undefined = RAMEN_MODEL.relations.find(
    (relation: Relation): boolean => relation.name === 'HAS_ANNOTATION' && relation.from.nodeId === RAMEN_ELEMENT.ENTITY,
  );
  assert.ok(genericAttachment);
  const annotationId: string = valid.nodes[0]?.id ?? '';
  const personId: string = valid.nodes[1]?.id ?? '';
  const invalid: ModelInstanceGraph = {
    ...valid,
    relations: [
      ...valid.relations,
      {
        id: 'hasAnnotation0001',
        typeId: `${RAMEN_MODEL.id}:${genericAttachment.id}`,
        fromId: personId,
        toId: annotationId,
      },
    ],
  };
  const rejected: ValidationResult = validator.validate(fixture.model.id, [fixture.model, RAMEN_MODEL], invalid);

  assert.ok(
    rejected.diagnostics.some(
      (diagnostic: Diagnostic): boolean => diagnostic.code === 'RAMEN_INSTANCE_ANNOTATION_RELATION_NOT_ALLOWED',
    ),
  );
});

function personAnnotationGraph(fixture: CorrespondenceFixture): ModelInstanceGraph {
  const base: ModelInstanceGraph = annotationGraph(fixture, 'persName', {});
  const person: ModelInstanceGraph['nodes'][number] = {
    id: 'personInstance001',
    typeId: fixture.nodes.person.id,
    properties: { uuid: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6', label: 'Ada' },
  };
  return {
    ...base,
    nodes: [...base.nodes, person],
    relations: [
      {
        id: 'refersPerson0001',
        typeId: fixture.relations.refersPerson.id,
        fromId: base.nodes[0]?.id ?? '',
        toId: person.id,
      },
    ],
  };
}

void test('rejects duplicate types on the same node and on a refined node', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const duplicate: RamenChange<RamenAnnotation> = fixture.project.createAnnotation({
    annotationId: fixture.nodes.annotation.id,
    type: 'persName',
  });

  assert.ok(
    duplicate.validation.diagnostics.some(
      (diagnostic: Diagnostic): boolean => diagnostic.code === 'RAMEN_ANNOTATION_TYPE_DUPLICATE',
    ),
  );

  const child: RamenModel = fixture.project.createNextLevel({
    uri: 'https://example.org/models/implicit-replacement',
    id: 'implicitReplacement01',
    name: 'Implicit Replacement',
    version: '1.0.0',
  });
  const annotationId: string = child.createNode({
    name: 'DetailedAnnotation',
    refines: { modelId: fixture.model.id, elementId: fixture.nodes.annotation.id },
  }).element.id;
  const replacement: RamenChange<RamenAnnotation> = child.createAnnotation({ annotationId: annotationId, type: 'persName' });

  assert.ok(
    replacement.validation.diagnostics.some(
      (diagnostic: Diagnostic): boolean => diagnostic.code === 'RAMEN_ANNOTATION_TYPE_DUPLICATE',
    ),
  );
});

void test('rejects malformed project annotation definitions', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const malformed: RamenModelDocument = {
    ...fixture.model,
    annotations: [{ id: 'incomplete' }],
  } as unknown as RamenModelDocument;
  const result: ProjectValidationResult = RamenModel.load(malformed).validate();
  assert.ok(result.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'RAMEN_ANNOTATIONS_INVALID'));
});

function annotationGraph(
  fixture: CorrespondenceFixture,
  type: string,
  extra: Readonly<Record<string, unknown>>,
): ModelInstanceGraph {
  return {
    modelId: fixture.model.id,
    nodes: [
      {
        id: 'annotationInstance01',
        typeId: fixture.nodes.annotation.id,
        properties: { uuid: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6', type: type, ...extra },
      },
    ],
    relations: [],
  };
}
