import assert from 'node:assert/strict';
import type { Node } from '../dist/ramen-core/model/index.js';
import { RAMEN_ELEMENT, RamenModel } from '../dist/ramen-core/ramen/index.js';

// One project level: Letter contains Witness, and Witness contains Text.
const project: RamenModel = RamenModel.create('Correspondence');
const letter: Node = project.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
const witness: Node = project.createNode({ name: 'Witness', refines: RAMEN_ELEMENT.COLLECTION }).element;
const text: Node = project.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
project.partOf(witness, letter);
project.partOf(text, witness);

assert.equal(project.validate().valid, true);
console.log('Allowed: Witness → Letter and Text → Witness.');
