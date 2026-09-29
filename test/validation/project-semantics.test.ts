import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelValidator, Modeller } from '../../dist/ramen-core/index.js';
import type { Diagnostic, Model, Node, Relation, Import, ProjectValidationResult } from '../../dist/ramen-core/index.js';
import { attribute, model, node, relation } from '../models.ts';

void test('validates all reachable levels instead of one base-derived pair', (): void => {
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
  assert.ok(result.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'ATTRIBUTE_BOUNDS_INVALID'));
});

void test('allows direct reuse and structurally rejects multiple refinement supertypes', (): void => {
  const base: Model = model('baseReuseModel01');
  base.classifiers.push(node('firstBaseNode001', 'Entity'), node('secondBaseNode01', 'Content'));
  const project: Model = model('projectReuseModel', [base]);
  project.classifiers.push(node('invalidChildNode', 'Mixed', [`${base.id}:firstBaseNode001`, `${base.id}:secondBaseNode01`]));
  project.relations.push(relation('directReuseRel01', 'USES', `${base.id}:firstBaseNode001`, `${base.id}:secondBaseNode01`));

  const result: ProjectValidationResult = new ModelValidator().validateProject(project.id, [project, base]);
  assert.ok(result.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'SCHEMA_INVALID'));
  assert.ok(!result.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.ref === 'directReuseRel01'));
});

void test('rejects relation refinements that widen cardinalities', (): void => {
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
  assert.ok(result.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'RELATION_BOUNDS_WIDENED'));
});

void test('validates duplicate imports and data type literals across the project', (): void => {
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
  assert.ok(result.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'IMPORT_MODEL_ID_DUPLICATE'));
  assert.ok(
    result.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'DATATYPE_LITERAL_SERIALIZED_DUPLICATE'),
  );
});

void test('only models without imports may introduce nodes without a base', (): void => {
  const base: Model = model('baseClosedModel1');
  base.classifiers.push(node('baseClosedNode01', 'Document'));
  const child: Model = model('childClosedModel', [base]);
  child.classifiers.push(node('unrefinedNode001', 'Unrelated'));
  const validator: ModelValidator = new ModelValidator();
  assert.equal(validator.validateProject(base.id, [base]).valid, true);

  const result: ProjectValidationResult = validator.validateProject(child.id, [child, base]);
  const diagnostic: Diagnostic | undefined = result.diagnostics[0];
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(diagnostic?.code, 'NODE_REFINEMENT_REQUIRED');
  assert.equal(diagnostic?.severity, 'error');
  assert.equal(diagnostic?.path, `/models/${child.id}/classifiers/0/superTypes`);
  assert.equal(diagnostic?.ref, 'unrefinedNode001');
  const draft: Modeller = Modeller.load(base).createNextLevel('Edition');
  assert.throws((): void => {
    draft.createNode('Unrelated');
  }, /Select a node to refine/);
});

void test('every imported level rejects unrelated nodes even when a local node refines them', (): void => {
  const base: Model = model('closedBaseModel1');
  base.classifiers.push(node('closedBaseNode01', 'Document'));
  const middle: Model = model('closedMiddleMod1', [base]);
  middle.classifiers.push(node('unrelatedNode001', 'Unrelated'), node('localChildNode01', 'Local', ['unrelatedNode001']));
  const child: Model = model('closedChildMod01', [middle]);
  child.classifiers.push(node('validChildNode01', 'Letter', [`${base.id}:closedBaseNode01`]));

  const result: ProjectValidationResult = new ModelValidator().validateProject(child.id, [child, middle, base]);
  const missing: readonly Diagnostic[] = result.diagnostics.filter(
    (item: Diagnostic): boolean => item.code === 'NODE_REFINEMENT_REQUIRED',
  );
  assert.equal(result.valid, false);
  assert.equal(missing.length, 1);
  assert.equal(missing[0]?.ref, 'unrelatedNode001');
});

void test('derived levels can reuse imported nodes and refine existing nodes without introducing unrelated types', (): void => {
  const base: Modeller = Modeller.create('Documents');
  const document: Node = base.createNode('Document').element;
  const child: Modeller = base.createNextLevel('Edition');
  assert.equal(child.validate().valid, true);
  const letter: Node = child.createNode({ name: 'Letter', refines: document }).element;
  const next: Modeller = child.createNextLevel('Archive');
  next.createNode({ name: 'ArchivedLetter', refines: letter });
  assert.equal(next.validate().valid, true);
  assert.equal(Modeller.import(next.export()).validate().valid, true);
});
