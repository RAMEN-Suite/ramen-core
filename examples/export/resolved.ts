import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import type { Attribute, Model, Node, Relation } from '../../dist/model/index.js';
import { RAMEN_ELEMENT, RamenModel } from '../../dist/ramen/index.js';
import { resolve, restore, schema } from './resolve.ts';
import type { Export } from './resolve.ts';

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
const restored: readonly Model[] = restore(output).getModels();
assert.deepEqual(restored, edition.getModels());
assert.equal(output.model.relations.length, 1);
assert.equal(output.model.relations[0]?.from.nodeId, `${edition.getModel().id}:${manuscript.id}`);
assert.equal(
  output.model.nodes
    .find((node: Export['model']['nodes'][number]): boolean => node.id === editionLetter.id)
    ?.attributes.some((attribute: Attribute): boolean => attribute.name === 'title'),
  true,
);
assert.equal(editionLetter.attributes.length, 0);

assert.equal(schema.validate(output).valid, true);
assert.equal(schema.validate({ ...output, rootModelId: edition.getModel().id }).valid, false);
const restoredModel: Model | undefined = restored.find((model: Model): boolean => model.id === output.model.id);
assert.ok(restoredModel);
const loaded: RamenModel = RamenModel.load(
  restoredModel,
  restored.filter((model: Model): boolean => model.id !== restoredModel.id),
);
assert.deepEqual(resolve(loaded), output);

const parsed: unknown = JSON.parse(JSON.stringify(output));
assert.deepEqual(restore(parsed).getModels(), edition.getModels());
const changed: Export = structuredClone(output);
changed.model.nodes[0]?.attributes.pop();
assert.throws((): RamenModel => restore(changed), /Effective model and origin disagree/);
assert.throws((): RamenModel => restore({ ...output, origin: {} }), /Invalid resolved export structure/);
if (process.argv.includes('--write'))
  writeFileSync(new URL('./edition.json', import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
console.log('Resolved export: schema, inherited properties, relation scope and lossless roundtrip passed.');

// Reuse Annotation unchanged; the two carrier relations distinguish the types.
const media: RamenModel = RamenModel.create('Annotated media');
const mediaText: Node = media.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
const image: Node = media.createNode({ name: 'Image', refines: RAMEN_ELEMENT.CONTENT }).element;
const textLink: Relation = media.hasAnnotation(mediaText, RAMEN_ELEMENT.ANNOTATION).element;
const imageLink: Relation = media.hasAnnotation(image, RAMEN_ELEMENT.ANNOTATION).element;
media.createAnnotation({
  annotationId: RAMEN_ELEMENT.ANNOTATION,
  type: 'caption',
  relations: [{ relationId: textLink.id, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } }],
});
media.createAnnotation({
  annotationId: RAMEN_ELEMENT.ANNOTATION,
  type: 'region',
  relations: [{ relationId: imageLink.id, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } }],
});

const annotated: Export = resolve(media);
assert.deepEqual(restore(JSON.parse(JSON.stringify(annotated)) as unknown).getModels(), media.getModels());
assert.equal(annotated.model.annotations.length, 2);
if (process.argv.includes('--write'))
  writeFileSync(new URL('./annotations.json', import.meta.url), `${JSON.stringify(annotated, null, 2)}\n`);
