# RAMEN Core

`@ramen-suite/core` has two layers:

| Layer                | Use it for                                                        | Main API                                    |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| Generic model format | Nodes, relations, data types, imports, refinement, validation     | `@ramen-suite/core/model`                   |
| RAMEN                | Collection, Entity, Content, Annotation, project annotation types | `RamenModel` from `@ramen-suite/core/ramen` |

The generic layer can model other domains. RAMEN adds its reference model, annotation rules, and a simpler editing API. Each layer has its own bundle: generic bundles contain generic documents; RAMEN bundles contain the reference model and RAMEN project documents.

## Model a project

```ts
import { RAMEN_ELEMENT, RamenModel } from '@ramen-suite/core/ramen';

const model = RamenModel.create({
  id: 'correspondence0001',
  uri: 'https://example.org/models/correspondence',
  name: 'Correspondence',
  version: '1.0.0',
});

const person = model.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;
const annotation = model.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
const reference = model.refersTo(annotation, person).element;

model.createAnnotation({
  annotationId: annotation.id,
  type: 'person',
  relations: [{ relationId: reference.id, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } }],
});
```

`refines` accepts an element ID. The model finds its owner in the imported model chain. Annotation names such as `person` or `place` belong to the project, not the RAMEN reference model.
RAMEN also offers `partOf(part, whole)` and `hasAnnotation(subject, annotation)`. For custom or ambiguous connections, use `suggestRelations()` and pass a selected suggestion to `connect()`.

## Refine and exchange

```ts
const next = model.createNextLevel({
  id: 'editionModel0001',
  uri: 'https://example.org/models/edition',
  name: 'Edition',
  version: '1.0.0',
});
const historicalPerson = next.createNode({ name: 'HistoricalPerson', refines: person.id }).element;
const editionAnnotation = next.createNode({ name: 'EditionAnnotation', refines: annotation.id }).element;
const inherited = next.suggestAnnotations(editionAnnotation.id);

const exported = next.exportBundle();
if (!exported.ok) throw new Error(JSON.stringify(exported.diagnostics));
const restored = RamenModel.importBundle(JSON.parse(JSON.stringify(exported.bundle)));
```

`exportBundle()` keeps all reachable model levels and their imports in one JSON file. `RamenModel.importBundle()` restores the editable root. `validate()` checks model rules; `validateInstances(data)` checks a complete data graph. Edits return `{ element, validation }` and stay in the model even when validation reports an error.

The generic APIs also provide `ModelFactory`, `ModelEditor`, `ModelValidator`, `InstanceValidator`, `createModelBundle`, and `splitModelBundle`. Use those when building without RAMEN-specific rules. Registered constraint languages can inspect the full data and project graph through `ConstraintContext.graph`; model JSON is never executed as code.

See [Modeling with RAMEN](docs/modeling.md) for the model-level workflow and relation selection.

## Runnable examples

- [Complete RAMEN project in code](examples/ramen-programmatic.ts): collections, entities, content, five annotation types, validation, and bundle round trip.
- [Interface-driven connection](examples/ramen-interface.ts): list possible relations, choose one, and connect the nodes.
- [Generic model](examples/generic-model.ts): create a domain model without RAMEN, refine it, validate data, and exchange a bundle.

Run `npm run build && npm run examples:check` to typecheck and execute all three examples.
