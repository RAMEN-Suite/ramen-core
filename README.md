# RAMEN Core

`@ramen-suite/core` provides a JSON model format, project graph, validator, and RAMEN modeling API. A project model refines the versioned RAMEN reference model. Later project models can refine earlier ones, while references can reuse imported elements directly.

## Create a project model

A project model describes allowed object types and relations. It does not contain the concrete letters, people, or annotations. The project imports the RAMEN reference model and refines its four node types.

```ts
import { RAMEN_ELEMENT, RAMEN_MODEL, RamenProject } from '@ramen-suite/core/ramen';

const project = RamenProject.create({
  id: 'correspondence0001',
  uri: 'https://example.org/models/correspondence',
  name: 'Correspondence',
  version: '1.0.0',
});

const person = project.createNode({
  name: 'Person',
  refines: { modelId: RAMEN_MODEL.id, elementId: RAMEN_ELEMENT.ENTITY },
});
const annotation = project.createNode({
  name: 'TextAnnotation',
  refines: { modelId: RAMEN_MODEL.id, elementId: RAMEN_ELEMENT.ANNOTATION },
});

project.createAttribute(person.element.id, {
  name: 'authorityId',
  typeId: 'String',
  bounds: { lowerBound: 0, upperBound: 1 },
});

const validation = project.validate();
const advisor = project.createAdvisor();
const availableAttributes = advisor?.suggestAttributes(project.getModel().id, person.element.id);
```

The advisor can identify a RAMEN relation compatible with the two project nodes. The project can then require it for one closed annotation type:

```ts
const refersTo = advisor
  ?.suggestRelations(project.getModel().id, annotation.element.id, person.element.id)
  .find((relation) => relation.name === 'REFERS_TO');
if (!refersTo) throw new Error('No compatible relation found.');

const personReference = project.createRelation({
  refines: { modelId: refersTo.modelId, elementId: refersTo.relationId },
  fromNodeId: annotation.element.id,
  toNodeId: person.element.id,
});
project.createAnnotation({
  annotationId: annotation.element.id,
  type: 'persName',
  relations: [{ relationId: personReference.element.id, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } }],
});

const exported = project.exportBundle();
if (!exported.ok) throw new Error(JSON.stringify(exported.diagnostics));
const projectJson = JSON.stringify(exported.bundle, null, 2);
```

`projectJson` contains the project model and its RAMEN dependency in one file. The models retain their separate identities and imports. Every edit returns its element and a validation result. Edits stay in the project when validation reports an error, so an editor can guide the next edit. `exportBundle()` only succeeds when the complete RAMEN project is valid.

Project-defined scalar types can restrict values with named literals:

```ts
const status = project.createDataType({ name: 'EditorialStatus', baseType: 'String' });
project.createLiteral(status.element.id, { name: 'Draft', literal: 'draft' });
project.createLiteral(status.element.id, { name: 'Reviewed', literal: 'reviewed' });
```

`updateLiteral(typeId, literalId, patch)` and `removeLiteral(typeId, literalId)` edit these values by stable ID. Removing the last literal makes the data type unrestricted again.

## Constraint languages

Constraints in a model name their `language` and carry a string or JSON `expression`. The package evaluates `regex` and selected `format` constraints by default. A consumer can register a versioned language name and an evaluator with `ConstraintRegistry`, then pass the registry to `RamenInstanceValidator.withConstraints(registry)`. An unknown language produces `CONSTRAINT_LANGUAGE_UNSUPPORTED` during instance validation. Model JSON is never executed as code.

The evaluator receives the constraint, the actual value, its target kind, and a diagnostic path. Keep the evaluator deterministic and test it with valid and invalid instance graphs. Model validation currently checks the constraint's JSON shape; it does not parse every custom expression before an instance is validated.

## Refinement and exchange

Use `createNextLevel(...)` to build another model that imports the complete dependency chain. A new node names the earlier node in `refines`; an imported node can also be referenced directly where no refinement is needed. `exportBundle()` packs all reachable models into one JSON object. `RamenProject.importBundle(value)` restores the root as an editable project and preserves the other models as dependencies.

`ModelEvolution.compare(beforeRootId, beforeModels, afterRootId, afterModels)` returns an explicit before/after change artifact and validation diagnostics for both states. It identifies elements by stable IDs. It does not migrate instance data.

For two RAMEN projects, `earlier.compareTo(later)` also reports annotation definitions by stable ID in `annotationChanges`, with RAMEN-specific validation findings. `exportBundle()` returns diagnostics instead of a bundle while the RAMEN project is invalid; `importBundle()` rejects invalid RAMEN content.
