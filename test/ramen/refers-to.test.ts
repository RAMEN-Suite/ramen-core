import assert from 'node:assert/strict';
import test from 'node:test';
import { type ElementInput, type Model, type Node, type Relation, type RelationSuggestion } from '@ramen-suite/core/model';
import { RAMEN_ELEMENT, RamenModel } from '@ramen-suite/core/ramen';

void test('REFERS_TO cannot target Annotation or its refinements on any model level', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const text: Node = model.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const next: RamenModel = model.createNextLevel('Research');
  const research: Node = next.createNode({ name: 'ResearchAnnotation', refines: text }).element;

  for (const level of [model, next]) {
    const nodes: readonly ElementInput[] =
      level === model ? [RAMEN_ELEMENT.ANNOTATION, text] : [RAMEN_ELEMENT.ANNOTATION, text, research];
    const before: Model = level.getModel();

    for (const from of nodes) {
      for (const to of nodes) {
        assert.equal(
          level.suggestRelations(from, to).some((item: RelationSuggestion): boolean => item.name === 'REFERS_TO'),
          false,
        );
        assert.throws((): unknown => level.refersTo(from, to), /Expected one relation, found 0/);
      }
    }

    assert.deepEqual(level.getModel(), before);
    assert.equal(level.validate().valid, true);
  }
});

void test('REFERS_TO still supports Collection, Content and Entity and their refinements', (): void => {
  for (const target of [RAMEN_ELEMENT.COLLECTION, RAMEN_ELEMENT.CONTENT, RAMEN_ELEMENT.ENTITY]) {
    const model: RamenModel = RamenModel.create('Edition');
    const annotation: Node = model.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
    const refined: Node = model.createNode({ name: 'Target', refines: target }).element;

    assert.equal(model.refersTo(RAMEN_ELEMENT.ANNOTATION, target).element.name, 'REFERS_TO');
    assert.equal(model.refersTo(annotation, refined).element.name, 'REFERS_TO');
    assert.equal(model.validate().valid, true);
    assert.equal(RamenModel.import(model.export()).validate().valid, true);
  }
});

void test('Annotation can still carry annotations through HAS_ANNOTATION', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const text: Node = model.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const relation: Relation = model.hasAnnotation(text, text).element;

  assert.equal(relation.name, 'HAS_ANNOTATION');
  assert.equal(model.validate().valid, true);
});
