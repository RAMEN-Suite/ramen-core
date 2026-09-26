import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import type { Attribute, Classifier, Node, Owned, Relation } from '../../dist/model/index.js';
import { RAMEN_ELEMENT, RamenModel } from '../../dist/ramen/index.js';
import type { AnnotationSuggestion, RamenFile } from '../../dist/ramen/index.js';

// The first project level declares vocabulary, properties and annotation types.
const base: RamenModel = RamenModel.create('Correspondence');
const letter: Node = base.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
const witness: Node = base.createNode({ name: 'Witness', refines: RAMEN_ELEMENT.COLLECTION }).element;
const text: Node = base.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
const image: Node = base.createNode({ name: 'Image', refines: RAMEN_ELEMENT.CONTENT }).element;
const title: Attribute = base.createAttribute(letter, { name: 'title', typeId: 'String' }).element;
base.partOf(witness, letter);
base.partOf(text, witness);

const textLink: Relation = base.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION).element;
const imageLink: Relation = base.hasAnnotation(image, RAMEN_ELEMENT.ANNOTATION).element;
base.createAnnotation({
  annotationId: RAMEN_ELEMENT.ANNOTATION,
  type: 'caption',
  relations: [{ relationId: textLink.id, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } }],
});
base.createAnnotation({
  annotationId: RAMEN_ELEMENT.ANNOTATION,
  type: 'region',
  relations: [{ relationId: imageLink.id, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } }],
});

// The edition refines two nodes and reuses Text, Image and Annotation unchanged.
const edition: RamenModel = base.createNextLevel('Edition');
const editionLetter: Node = edition.createNode({ name: 'EditionLetter', refines: letter }).element;
const manuscript: Node = edition.createNode({ name: 'Manuscript', refines: witness }).element;
edition.partOf(manuscript, editionLetter);
edition.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION);
// Image attachments are intentionally not selected in this edition.
const file: RamenFile = edition.export();
const restored: RamenModel = RamenModel.import(JSON.parse(JSON.stringify(file)) as unknown);
assert.deepEqual(restored.getModels(), edition.getModels());
assert.deepEqual(restored.export(), file);

// The file contains declarations once; the library resolves inherited information on demand.
const declaration: Owned<Classifier> | undefined = file.classifiers.find(
  (item: Owned<Classifier>): boolean => item.id === editionLetter.id,
);
assert.ok(declaration?.kind === 'Node');
assert.deepEqual(declaration.attributes, []);
assert.ok(restored.suggestAttributes(editionLetter).some((item): boolean => item.attributeId === title.id));
assert.deepEqual(
  restored.suggestAnnotationsForNode(text).map((item: AnnotationSuggestion): string => item.type),
  ['caption'],
);
assert.deepEqual(restored.suggestAnnotationsForNode(image), []);
assert.equal('origin' in file, false);
assert.equal('rootModelId' in file, false);

if (process.argv.includes('--write'))
  writeFileSync(new URL('./edition.json', import.meta.url), `${JSON.stringify(file, null, 2)}\n`);
console.log('One graph: inheritance, annotation selections and model boundaries survive the JSON roundtrip.');
