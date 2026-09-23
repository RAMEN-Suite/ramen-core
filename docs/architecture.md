# Model, project, and evolution

## Three distinct things

1. **Model format:** The generic JSON structure for models, nodes, attributes, data types, relations, imports, and constraints. Its schema defines document shape; the project graph resolves references and inheritance.
2. **RAMEN project:** A versioned RAMEN reference model plus one or more project models. A project model refines `Collection`, `Entity`, `Content`, or `Annotation`. Closed annotation variants such as `persName` are project definitions under `ext.ramen.annotations`, attached to an Annotation node.
3. **Evolution:** A comparison of two complete project states. Stable IDs connect an element before and after a change. An added, removed, or changed element appears in a report with its before and after values and validation findings. RAMEN annotation definitions appear separately in `annotationChanges`; their enclosing model may also appear as changed. Migration of existing data needs an explicit transformation and a separate test.

The dependency chain has no fixed maximum depth. Refinement is checked at each link. A reference to an imported element may reuse it without creating another node. `RamenAdvisor` reads the validated graph to suggest legal refinements, attributes, relations, targets, and annotation definitions. There is no second discovery service.

## Validation sequence

1. JSON Schema checks the document structure.
2. The project graph resolves imports, references, identities, and cycles.
3. Generic semantic rules check model and refinement constraints.
4. RAMEN rules check the reference model and annotation definitions.
5. Instance validation checks a complete data graph against the effective project model.

Diagnostics carry stable codes and, when available, model or JSON paths. A model edit can temporarily produce diagnostics; the public project API returns them immediately so an editor can guide the next edit.

## System metadata

The core instance format currently accepts only `id`, `typeId`, and modeled `properties` on a node. `createdAt` and `editedAt` are tool lifecycle data. They are not silently inserted into RAMEN properties, because a closed annotation type must remain closed. Until a shared exchange requirement exists, tools can store and validate lifecycle metadata in their own records. A future portable metadata envelope needs a separately versioned schema and explicit ownership rules.

For example, an annotation instance has a stable `id` and only the properties permitted by its selected annotation definition. A tool may keep `{ annotationId, createdAt, editedAt }` in its own record. It checks that record with its own schema and the referenced annotation instance with `RamenInstanceValidator`. If `isZeroPoint` carries shared domain meaning, a project may declare it as an optional modeled property for the relevant annotation definition. If it only controls one tool's UI, it belongs in that tool's record.

## Research positioning

RAMEN Core uses a small JSON metamodel, graph resolution, and conformance checks in the MDE tradition. The generic format is a modeling kernel; RAMEN is a versioned domain reference model expressed in it. The architecture supports arbitrarily long refinement chains but does not currently implement potency or deferred instantiation. We should therefore describe its precise operations rather than claim equivalence to every multi-level modeling language.

The [OMG MOF specification](https://www.omg.org/spec/MOF/2.5.1) is a reference for model and metamodel infrastructure, not a conformance claim for this package. [Jeusfeld and Frank's MLM rationale](https://link.springer.com/article/10.1007/s10270-021-00955-1) explains why arbitrary levels, class/object duality, and deferred instantiation matter to many MLM approaches; RAMEN deliberately implements a narrower, JSON-first refinement mechanism. [JSON Schema 2020-12](https://json-schema.org/draft/2020-12) supplies the structural validation vocabulary.

MDE literature distinguishes model or metamodel change from the migration of dependent artifacts. The [survey of model evolution and migration](https://hull-repository.worktribe.com/output/447047/evolving-models-in-model-driven-engineering-state-of-the-art-and-future-challenges) frames these as related tasks. [Epsilon Flock](https://eclipse.dev/epsilon/doc/flock/) is an example of explicit model migration rules. Our first evolution artifact records before/after changes and diagnostics; a later migration API should consume that artifact together with human-specified mappings and validate the migrated result.
