import assert from 'node:assert/strict';
import { ModelFactory } from '../dist/model/index.js';
import type { Attribute, Node } from '../dist/model/index.js';
import { RAMEN_ELEMENT, RamenModel } from '../dist/ramen/index.js';
import type {
  AnnotationAdvice,
  AnnotationPropertyAdvice,
  AnnotationRelationAdvice,
  AnnotationSuggestion,
  CreateRamenBundleResult,
  RamenAnnotation,
} from '../dist/ramen/index.js';

// Model the carriers and one shared Annotation node. No annotation data is created here.
const project: RamenModel = RamenModel.create('Media');
const text: Node = project.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
const image: Node = project.createNode({ name: 'Image', refines: RAMEN_ELEMENT.CONTENT }).element;
const annotation: Node = project.createNode({ name: 'MediaAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
project.hasAnnotation(text, annotation);
project.hasAnnotation(image, annotation);

// An existing node attribute can be selected by a type and made mandatory there.
project.createAttribute(annotation, { name: 'label', typeId: 'String' });
const advice: AnnotationAdvice | undefined = project.adviseAnnotation(annotation);
assert.ok(advice);
console.log('Available properties:', JSON.stringify(advice.properties, null, 2));
console.log('Available carrier relations:', JSON.stringify(advice.relations, null, 2));

// A form displays these choices. Here we simulate choosing label and the Text carrier.
const label: AnnotationPropertyAdvice | undefined = advice.properties.find(
  (choice: AnnotationPropertyAdvice): boolean => choice.name === 'label',
);
const textCarrier: AnnotationRelationAdvice | undefined = advice.relations.find(
  (choice: AnnotationRelationAdvice): boolean => choice.direction === 'incoming' && choice.targetNodeId === text.id,
);
assert.ok(label);
assert.ok(textCarrier);

// Each array entry selects one allowed property or relation. 1..1 means exactly one.
const caption: RamenAnnotation = project.createAnnotation({
  annotationId: annotation,
  type: 'caption',
  properties: [{ attributeId: label.ref, bounds: { lowerBound: 1, upperBound: 1 } }],
  relations: [{ relationId: textCarrier.ref, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } }],
}).element;
console.log('Stored caption definition:', JSON.stringify(caption, null, 2));

// A type can also own a property. Width does not become a MediaAnnotation node attribute.
const width: Attribute = ModelFactory.createAttribute({
  name: 'width',
  typeId: 'Integer',
  bounds: { lowerBound: 1, upperBound: 1 },
});
const imageCarrier: AnnotationRelationAdvice | undefined = advice.relations.find(
  (choice: AnnotationRelationAdvice): boolean => choice.direction === 'incoming' && choice.targetNodeId === image.id,
);
assert.ok(imageCarrier);
project.createAnnotation({
  annotationId: annotation,
  type: 'imageRegion',
  properties: [width],
  relations: [{ relationId: imageCarrier.ref, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } }],
});

// The same Annotation node now offers different types for Text and Image.
const textTypes: readonly AnnotationSuggestion[] = project.suggestAnnotationsForNode(text, annotation);
const imageTypes: readonly AnnotationSuggestion[] = project.suggestAnnotationsForNode(image, annotation);
assert.deepEqual(
  textTypes.map((choice: AnnotationSuggestion): string => choice.type),
  ['caption'],
);
assert.deepEqual(
  imageTypes.map((choice: AnnotationSuggestion): string => choice.type),
  ['imageRegion'],
);
assert.deepEqual(project.suggestAttributesForAnnotation(annotation, 'caption')[0]?.suggestedBounds, {
  lowerBound: 1,
  upperBound: 1,
});
assert.equal(project.validate().valid, true);
console.log('Types for Text:', JSON.stringify(textTypes, null, 2));
console.log('Types for Image:', JSON.stringify(imageTypes, null, 2));

// Export keeps the definitions and their property and relation references together.
const exported: CreateRamenBundleResult = project.exportBundle();
assert.ok(exported.ok);
const restored: RamenModel = RamenModel.importBundle(JSON.parse(JSON.stringify(exported.bundle)) as unknown);
assert.deepEqual(restored.getAnnotations(), project.getAnnotations());
assert.deepEqual(restored.suggestAnnotationsForNode(text, annotation), textTypes);
