import assert from 'node:assert/strict';
import type { Node } from '../dist/model/index.js';
import { RAMEN_ELEMENT, RamenModel } from '../dist/ramen/index.js';
import type { AnnotationLink, AnnotationSuggestion } from '../dist/ramen/index.js';

// Reuse RAMEN's Annotation node. Its uuid and type properties already exist.
const project: RamenModel = RamenModel.create('Text annotations');
const annotation: string = RAMEN_ELEMENT.ANNOTATION;
const text: Node = project.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
const person: Node = project.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;
const place: Node = project.createNode({ name: 'Place', refines: RAMEN_ELEMENT.ENTITY }).element;
// The API resolves HAS_ANNOTATION and selects its permitted relationship for Text.
const onText: AnnotationLink = {
  relation: 'HAS_ANNOTATION',
  from: text,
  bounds: { lowerBound: 1, upperBound: 1 },
};

// TEI-inspired project names: highlight, addition and deletion. This is not a TEI schema.
const textTypes: readonly string[] = ['hi', 'add', 'del'];
for (const type of textTypes) {
  project.createAnnotation({ annotationId: annotation, type, relations: [onText] });
}

// Person and place additionally require exactly one outgoing REFERS_TO relation to the respective entity.
project.createAnnotation({
  annotationId: annotation,
  type: 'person',
  relations: [onText, { relation: 'REFERS_TO', to: person, bounds: { lowerBound: 1, upperBound: 1 } }],
});
project.createAnnotation({
  annotationId: annotation,
  type: 'place',
  relations: [onText, { relation: 'REFERS_TO', to: place, bounds: { lowerBound: 1, upperBound: 1 } }],
});

// Result for a type picker: ["add", "del", "hi", "person", "place"].
const choices: readonly AnnotationSuggestion[] = project.suggestAnnotationsForNode(text);
const names: readonly string[] = choices.map((choice: AnnotationSuggestion): string => choice.type);
assert.deepEqual(names, ['add', 'del', 'hi', 'person', 'place']);
assert.equal(project.validate().valid, true);
console.log('Types for Text:', names);
console.log('Stored annotation definitions:', JSON.stringify(project.getAnnotations(), null, 2));
