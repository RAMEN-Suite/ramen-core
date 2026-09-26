import assert from 'node:assert/strict';
import type { Attribute, Node } from '../dist/model/index.js';
import { RAMEN_ELEMENT, RamenModel } from '../dist/ramen/index.js';
import type { AttributeSuggestion } from '../dist/ramen/index.js';

// First project level: a reusable correspondence model.
const base: RamenModel = RamenModel.create('Correspondence');
const letter: Node = base.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
const witness: Node = base.createNode({ name: 'Witness', refines: RAMEN_ELEMENT.COLLECTION }).element;
const text: Node = base.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
const title: Attribute = base.createAttribute(letter, { name: 'title', typeId: 'String' }).element;
base.partOf(witness, letter);
base.partOf(text, witness);

// Second project level: refine selected types and reuse Text unchanged.
const edition: RamenModel = base.createNextLevel('Historical edition');
const editionLetter: Node = edition.createNode({ name: 'EditionLetter', refines: letter }).element;
const manuscript: Node = edition.createNode({ name: 'Manuscript', refines: witness }).element;
assert.deepEqual(edition.getModel().relations, []);
edition.partOf(manuscript, editionLetter);
edition.partOf(text, manuscript);

// Title is inherited. Do not create it again on EditionLetter.
const properties: readonly AttributeSuggestion[] = edition.suggestAttributes(editionLetter);
assert.ok(properties.some((property: AttributeSuggestion): boolean => property.attributeId === title.id));
assert.equal(editionLetter.attributes.length, 0);
assert.equal(edition.validate().valid, true);
console.log('EditionLetter inherits title; Text is reused; each relation is selected again.');
