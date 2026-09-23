import assert from 'node:assert/strict';
import test from 'node:test';
import type { Diagnostic, ProjectValidationResult, RamenAnnotation, RamenChange, Relation } from '../../dist/index.js';
import { createCorrespondenceFixture, createScholarlyFixture } from './fixtures.ts';
import type { CorrespondenceFixture, ScholarlyFixture } from './fixtures.ts';

void test('allows a refined annotation to select another modeled property', (): void => {
  const base: CorrespondenceFixture = createCorrespondenceFixture();
  const scholarly: ScholarlyFixture = createScholarlyFixture(base);
  const updated: RamenChange<RamenAnnotation> = scholarly.project.updateAnnotation(scholarly.persName.id, {
    properties: [
      {
        attributeId: `${base.model.id}:${base.url.id}`,
        bounds: { lowerBound: 0, upperBound: 1 },
      },
    ],
  });

  assert.equal(updated.validation.valid, true);
  assert.equal(updated.element.properties[0]?.attributeId, `${base.model.id}:${base.url.id}`);
});

void test('rejects a relation introduced only by an annotation refinement', (): void => {
  const base: CorrespondenceFixture = createCorrespondenceFixture();
  const scholarly: ScholarlyFixture = createScholarlyFixture(base);
  const placeRelation: Relation | undefined = scholarly.project
    .getModel()
    .relations.find((relation: Relation): boolean => relation.to.nodeId === scholarly.nodes.place.id);

  assert.ok(placeRelation);
  const updated: RamenChange<RamenAnnotation> = scholarly.project.updateAnnotation(scholarly.persName.id, {
    relations: [
      ...scholarly.persName.relations,
      {
        relationId: placeRelation.id,
        direction: 'outgoing',
        bounds: { lowerBound: 0, upperBound: 1 },
      },
    ],
  });

  assert.equal(updated.validation.valid, false);
  assert.equal(hasDiagnostic(updated.validation, 'RAMEN_ANNOTATION_RELATION_EXTENSION'), true);
});

void test('rejects cardinality widening in an annotation refinement', (): void => {
  const base: CorrespondenceFixture = createCorrespondenceFixture();
  const scholarly: ScholarlyFixture = createScholarlyFixture(base);
  const inheritedRelation: Relation | undefined = scholarly.project
    .getModel()
    .relations.find((relation: Relation): boolean => relation.to.nodeId === scholarly.nodes.person.id);

  assert.ok(inheritedRelation);
  const updated: RamenChange<RamenAnnotation> = scholarly.project.updateAnnotation(scholarly.persName.id, {
    relations: [
      {
        relationId: inheritedRelation.id,
        direction: 'outgoing',
        bounds: { lowerBound: 0, upperBound: 1 },
      },
    ],
  });

  assert.equal(updated.validation.valid, false);
  assert.equal(hasDiagnostic(updated.validation, 'RAMEN_ANNOTATION_BOUNDS_INVALID'), true);
});

function hasDiagnostic(result: ProjectValidationResult, code: string): boolean {
  return result.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === code);
}
