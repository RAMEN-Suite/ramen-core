---
title: Modeling with RAMEN
group: Guides
---

# Modeling with RAMEN

Each `RamenModel` edits one model document. `RamenModel.create()` creates the first document, which imports the RAMEN reference model. `createNextLevel()` creates a separate document that imports the previous one. The bundle keeps all documents and their imports together for exchange.

## Refine only what changes

```ts
import { RAMEN_ELEMENT, RamenModel } from '@ramen-suite/core/ramen';

const correspondence = RamenModel.create({
  id: 'correspondence0001',
  uri: 'https://example.org/models/correspondence',
  name: 'Correspondence',
  version: '1.0.0',
});
const person = correspondence.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;

const edition = correspondence.createNextLevel({
  id: 'editionModel0001',
  uri: 'https://example.org/models/edition',
  name: 'Edition',
  version: '1.0.0',
});
const historicalPerson = edition.createNode({ name: 'HistoricalPerson', refines: person.id }).element;
```

The edition imports the correspondence model. It can directly reuse any imported element it does not change. A new element may refine an element from any reachable ancestor. An element ID is enough when unique; a qualified reference or `{ modelId, elementId }` identifies an element explicitly.

## Let RAMEN find a relation

The RAMEN reference model defines three relation families. Use `model.partOf(part, whole)`, `model.hasAnnotation(subject, annotation)`, or `model.refersTo(annotation, target)` directly. These methods check endpoint compatibility and refine the most specific matching relation. For custom or ambiguous cases, `model.suggestRelations(from.id, to.id)` lists the options; pass a selected option to `model.connect(from, to, selected)`.

An annotation definition is separate from an Annotation node. It names a project-specific `type` and restricts the modeled properties and relations allowed for that type. You can declare a new type on the imported RAMEN Annotation node without refining that node:

```ts
const note = correspondence.createAnnotation({ annotationId: RAMEN_ELEMENT.ANNOTATION, type: 'note' }).element;
const types = correspondence.suggestAnnotations(RAMEN_ELEMENT.ANNOTATION);
```

Create a node refinement when Annotation needs a new structural attribute. Declare a new annotation type for a new `type` value. To narrow an existing type at a later level, call `refineAnnotation()` with the inherited definition ID; this also works when both definitions use the same imported Annotation node. Narrowing may invalidate existing data, so compare model states before migrating data.

## Validate and exchange

`model.validate()` checks the complete model chain. `model.validateInstances(data)` checks complete data against it. `model.exportBundle()` returns one JSON container holding the reachable documents; `RamenModel.importBundle(value)` restores the editable root model.

Individual changes return both the edited element and the current validation result. Semantically invalid edits stay in the model so an editor can correct them. Structurally invalid annotation definitions are rejected before they are saved. Export succeeds only after validation passes.
