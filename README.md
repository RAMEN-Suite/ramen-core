# RAMEN Core

`@ramen-suite/core` provides a JSON model format, project graph, validator, and RAMEN modeling API. A project model refines the versioned RAMEN reference model. Later project models can refine earlier ones, while references can reuse imported elements directly.

## Choose an API

| Task                                          | Entry point                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| Create or edit a generic model                | `ModelFactory`, `ModelEditor` from `@ramen-suite/core/model`           |
| Resolve imports and validate generic models   | `ModelValidator` from `@ramen-suite/core/model`                        |
| Bundle generic models                         | `createModelBundle`, `splitModelBundle` from `@ramen-suite/core/model` |
| Create, refine, and inspect a RAMEN project   | `RamenProject` and its advisor from `@ramen-suite/core/ramen`          |
| Validate RAMEN data                           | `project.validateInstances(data)`                                      |
| Exchange a RAMEN project and its dependencies | `project.exportBundle()` and `RamenProject.importBundle(value)`        |

The two bundle formats serve different contracts. A generic bundle contains generic models only. A RAMEN bundle contains the generic reference model and RAMEN project documents, preserving first-class annotation definitions and validating their semantics. Use the RAMEN bundle for RAMEN projects.

## Generic model format

The generic layer defines models, imports, nodes, relations, attributes, data types, literals, cardinalities, constraints, and refinement references. `ModelFactory` creates elements, `ModelEditor` updates immutable model documents, and `ModelValidator.validateProject(rootId, models)` checks their structure, imports, references, and refinement rules. `InstanceValidator.validate(graph, data)` checks a complete data graph against a validated project graph. These APIs do not assume Collection, Entity, Content, Annotation, or any project vocabulary.

Use the generic bundle only when every document follows the generic model schema. A RAMEN project document has an additional `annotations` section and must travel in a RAMEN bundle; generic graph algorithms still operate on its modeled nodes and relations.

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

The advisor can identify a RAMEN relation compatible with the two project nodes. The project can then require it for a closed annotation type. Here the project calls the type `person`; another project may choose a different name:

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
  type: 'person',
  relations: [{ relationId: personReference.element.id, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } }],
});

const exported = project.exportBundle();
if (!exported.ok) throw new Error(JSON.stringify(exported.diagnostics));
const projectJson = JSON.stringify(exported.bundle, null, 2);
```

Importing the JSON restores an editable project. Concrete data uses the modeled node ID and selects one of that node's annotation types:

```ts
const restored = RamenProject.importBundle(JSON.parse(projectJson));
const result = restored.validateInstances({
  modelId: restored.getModel().id,
  nodes: [
    {
      id: 'annotationRecord01',
      typeId: annotation.element.id,
      properties: { uuid: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6', type: 'person' },
    },
  ],
  relations: [],
});
// This result reports the missing required Person relation.
```

`projectJson` contains the project model and its RAMEN dependency in one file. The project model has its own RAMEN schema and stores `annotations` beside `classifiers` and `relations`. The generic model format and the RAMEN reference model do not declare annotation variants. Each definition belongs to an Annotation node; definitions on an ancestor remain available to refined nodes. The models retain their separate identities and imports.

Every edit returns its element and a validation result. Edits stay in the project when validation reports an error, so an editor can guide the next edit. `exportBundle()` only succeeds when the complete RAMEN project is valid.

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

During complete instance validation, an evaluator also receives `context.instanceId` and `context.graph`. The latter provides the project graph and the full instance graph, so a registered language can inspect related objects. These fields are absent when calling `ConstraintRegistry.evaluate()` directly without a graph. The package does not interpret or execute an arbitrary expression language on its own.

## Refinement and exchange

Use `createNextLevel(...)` to build another model that imports the complete dependency chain. A new node names the earlier node in `refines`; an imported node can also be referenced directly where no refinement is needed. `exportBundle()` packs all reachable models into one RAMEN bundle. `RamenProject.importBundle(value)` restores the root as an editable project and preserves the other models as dependencies. `splitRamenBundle(value)` returns the separate model documents.

`ModelEvolution.compare(beforeRootId, beforeModels, afterRootId, afterModels)` returns an explicit before/after change artifact and validation diagnostics for both states. It identifies elements by stable IDs. It does not migrate instance data.

For two RAMEN projects, `earlier.compareTo(later)` also reports annotation definitions by stable ID in `annotationChanges`, with RAMEN-specific validation findings. `exportBundle()` returns diagnostics instead of a bundle while the RAMEN project is invalid; `importBundle()` rejects invalid RAMEN content.
