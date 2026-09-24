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

An annotation definition is separate from an Annotation node. It names a project-specific `type` and restricts the modeled properties and relations allowed for that type. A refined Annotation node inherits existing definitions; call `refineAnnotation()` only when a definition needs to become more specific.

## Validate and exchange

`model.validate()` checks the complete model chain. `model.validateInstances(data)` checks complete data against it. `model.exportBundle()` returns one JSON container holding the reachable documents; `RamenModel.importBundle(value)` restores the editable root model. Individual changes return both the created or edited element and the current validation result. An invalid change remains available for an editor to correct; export succeeds only after validation passes.
