import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelValidator } from '../../dist/index.js';
import type { Model, Node, Relation, Import, ProjectValidationResult } from '../../dist/index.js';
import { attribute, model, node, relation } from '../models.ts';

void test('validates all reachable levels instead of one base-derived pair', () => {
  const base: Model = model('baseProjectLevel');

  base.classifiers.push(node('baseProjectNode1', 'Entity'));

  const middle: Model = model('middleProjectLvl', [base]);

  middle.classifiers.push(node('middleProjectNode', 'Person', [`${base.id}:baseProjectNode1`]));

  const root: Model = model('rootProjectLevel', [middle]);
  const refined: Node = node('rootProjectNode01', 'Author', [`${middle.id}:middleProjectNode`]);

  refined.attributes.push(attribute('invalidBounds001', 'name', 'String', { lowerBound: 2, upperBound: 1 }));
  root.classifiers.push(refined);

  const result: ProjectValidationResult = new ModelValidator().validateProject(root.id, [root, middle, base]);

  assert.equal(result.hasErrors, true);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'ATTRIBUTE_BOUNDS_INVALID'));
});

void test('allows direct reuse and structurally rejects multiple refinement supertypes', () => {
  const base: Model = model('baseReuseModel01');

  base.classifiers.push(node('firstBaseNode001', 'Entity'), node('secondBaseNode01', 'Content'));

  const project: Model = model('projectReuseModel', [base]);

  project.classifiers.push(node('invalidChildNode', 'Mixed', [`${base.id}:firstBaseNode001`, `${base.id}:secondBaseNode01`]));
  project.relations.push(relation('directReuseRel01', 'USES', `${base.id}:firstBaseNode001`, `${base.id}:secondBaseNode01`));

  const result: ProjectValidationResult = new ModelValidator().validateProject(project.id, [project, base]);

  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'SCHEMA_INVALID'));
  assert.ok(!result.diagnostics.some((diagnostic) => diagnostic.ref === 'directReuseRel01'));
});

void test('rejects relation refinements that widen cardinalities', () => {
  const base: Model = model('baseRelationModel');

  base.classifiers.push(node('baseSourceNode01', 'Source'), node('baseTargetNode01', 'Target'));

  const baseRelation: Relation = relation('baseRelation0001', 'LINKS', 'baseSourceNode01', 'baseTargetNode01', {
    lowerBound: 1,
    upperBound: 1,
  });

  base.relations.push(baseRelation);

  const project: Model = model('projectRelation01', [base]);

  project.classifiers.push(
    node('projectSource001', 'SourceKind', [`${base.id}:baseSourceNode01`]),
    node('projectTarget001', 'TargetKind', [`${base.id}:baseTargetNode01`]),
  );

  const refined: Relation = relation('refinedRelation1', 'LINKS', 'projectSource001', 'projectTarget001');

  refined.superTypes = [`${base.id}:${baseRelation.id}`];
  project.relations.push(refined);

  const result: ProjectValidationResult = new ModelValidator().validateProject(project.id, [project, base]);

  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'RELATION_BOUNDS_WIDENED'));
});

void test('validates duplicate imports and data type literals across the project', () => {
  const base: Model = model('baseLiteralModel1');

  base.classifiers.push({
    kind: 'DataType',
    id: 'statusDataType01',
    name: 'Status',
    baseType: 'String',
    literals: [
      { id: 'statusLiteral001', name: 'Open', literal: 'open' },
      { id: 'statusLiteral002', name: 'Other', literal: 'open' },
    ],
  });

  const project: Model = model('projectLiteral01', [base]);
  const firstImport: Import | undefined = project.imports[0];

  assert.ok(firstImport);
  project.imports.push({ ...firstImport });

  const result: ProjectValidationResult = new ModelValidator().validateProject(project.id, [project, base]);

  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'IMPORT_MODEL_ID_DUPLICATE'));
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'DATATYPE_LITERAL_SERIALIZED_DUPLICATE'));
});
