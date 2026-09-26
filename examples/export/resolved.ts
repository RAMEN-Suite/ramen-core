import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import type { Attribute, Model, Node, Relation } from '../../dist/model/index.js';
import { RAMEN_ELEMENT, RamenModel } from '../../dist/ramen/index.js';
import { resolve, restore, schema } from './resolve.ts';
import type { Export, RelationView } from './resolve.ts';

const base: RamenModel = RamenModel.create('Correspondence');
const letter: Node = base.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
const witness: Node = base.createNode({ name: 'Witness', refines: RAMEN_ELEMENT.COLLECTION }).element;
const text: Node = base.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
base.createAttribute(letter, { name: 'title', typeId: 'String' });
base.partOf(witness, letter);
base.partOf(text, witness);

// Annotation types belong to this same correspondence model; no separate export is needed.
const image: Node = base.createNode({ name: 'Image', refines: RAMEN_ELEMENT.CONTENT }).element;
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

const edition: RamenModel = base.createNextLevel('Edition');
const editionLetter: Node = edition.createNode({ name: 'EditionLetter', refines: letter }).element;
const manuscript: Node = edition.createNode({ name: 'Manuscript', refines: witness }).element;
edition.partOf(manuscript, editionLetter);
edition.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION);
edition.hasAnnotation(image, RAMEN_ELEMENT.ANNOTATION);
// Text → Witness is not selected in this edition and must not reappear in the resolved model.
const output: Export = resolve(edition);
const restored: readonly Model[] = restore(output).getModels();
assert.deepEqual(restored, edition.getModels());
assert.equal(output.model.relations.length, 3);
assert.equal(output.model.annotations.length, 2);
assert.equal(
  output.model.relations.some(
    (relation: RelationView): boolean =>
      relation.name === 'PART_OF' && relation.from.nodeId === `${base.getModel().id}:${text.id}`,
  ),
  false,
);
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
