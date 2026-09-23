# RAMEN Core

`@ramen-suite/core` provides a JSON model format, project graph, validator, and RAMEN modeling API. A project model refines the versioned RAMEN reference model. Later project models can refine earlier ones, while references can reuse imported elements directly.

## Start a project

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

project.createAttribute(person.element.id, {
  name: 'authorityId',
  typeId: 'String',
  bounds: { lowerBound: 0, upperBound: 1 },
});

const validation = project.validate();
const advisor = project.createAdvisor();
const availableAttributes = advisor?.suggestAttributes(project.getModel().id, person.element.id);
```

Every edit returns its element and a validation result. The edit stays in the project when validation reports an error, so an editor can show diagnostics while the user completes a model. Call `validate()` before saving or consuming the project.

## Refinement and exchange

Use `createNextLevel(...)` to build another model that imports the complete dependency chain. A new node names the earlier node in `refines`; an imported node can also be referenced directly where no refinement is needed. `exportBundle()` packs all reachable models into one JSON object. `RamenProject.importBundle(value)` restores the root as an editable project and preserves the other models as dependencies.

`ModelEvolution.compare(beforeRootId, beforeModels, afterRootId, afterModels)` returns an explicit before/after change artifact and validation diagnostics for both states. It identifies elements by stable IDs. It does not migrate instance data.

See [Architecture and evolution](docs/architecture.md) for the model boundaries, validation sequence, metadata policy, and research context.
