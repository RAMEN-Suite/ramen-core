# Core audit — 2026-09-27

## Scope

Reviewed every source module and resource below: 49 TypeScript files and 9 JSON files.
Generated schemas were checked against their reviewed generator and input schemas.
The review covered responsibility, public contracts, imports, reference scope,
mutation, error handling and existing test scenarios. It is not a proof of all inputs.

## Verification

- 165 tests and 7 executable examples pass.
- Schema generation check, build, lint, formatting and type checks pass.
- Built-bundle coverage: 87.67% lines, 80.92% branches, 88.91% functions.
- Bundles contain repeated code. These percentages are not unique source-function coverage.
- Added 17 tests, including 16 refinement combinations inside one parameterized scenario.
- Scale cases: 1000 node types plus 1000 relation types; 120 model levels;
  1000 RAMEN annotation records with carrier rules before/after file exchange.
- Scale assertions check results, not machine-dependent timing. They establish tested sizes,
  not unlimited capacity or a performance guarantee.

## File-by-file findings

Paths below are relative to `src/`. A retained file was reviewed but did not need a change.

| File                                              | Result                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `index.ts`                                        | Public package entry; delegates to the two module entries.                                             |
| `model/Advisor.ts`                                | Suggestions use graph ancestry and explicit relation scope.                                            |
| `model/Builtins.ts`                               | Four primitive representations; no domain vocabulary.                                                  |
| `model/Modeler.ts`                                | Generic facade; creation, levels, exchange, data validation and comparison.                            |
| `model/Names.ts`                                  | Fixed length limits after adding a valid prefix.                                                       |
| `model/Types.ts`                                  | Generic declarations; one supertype, scalar domains and data constraints. Clarified RMF wording.       |
| `model/data/InstanceRelations.ts`                 | Endpoint checks and indexed edge counts; large graph and missing-edge tests.                           |
| `model/data/InstanceSchema.ts`                    | Closed graph envelope; properties checked against the effective model.                                 |
| `model/data/InstanceTypes.ts`                     | Captured data stays separate from model declarations.                                                  |
| `model/data/InstanceValidator.ts`                 | Rejects data selecting a different model context, including an ancestor.                               |
| `model/data/InstanceValues.ts`                    | Only own data properties count; project-owned annotation datatypes resolve in the data context.        |
| `model/editing/Connections.ts`                    | Explicit choice or unique most-specific relation; ambiguity stays an error.                            |
| `model/editing/Draft.ts`                          | Shared editing state and snapshot invalidation. Large, but one editing workflow; no new wrapper added. |
| `model/editing/Editor.ts`                         | Immutable updates; local deletion and qualified endpoints checked.                                     |
| `model/editing/Factory.ts`                        | Fixed bound aliasing and qualified local references during duplication; tested nested identities.      |
| `model/exchange/Bundle.ts`                        | Legacy compatibility path; retained, not the recommended format.                                       |
| `model/exchange/Comparison.ts`                    | Detects owner changes and preserves **proto** JSON keys during comparison.                             |
| `model/exchange/File.ts`                          | Shared declarations, ownership, detached reads and complete import closure.                            |
| `model/graph/BuildGraph.ts`                       | Fixed reference visibility: each declaring model needs its own import path.                            |
| `model/graph/EffectiveModel.ts`                   | Clarified that global structural relation inspection is not permission at a level.                     |
| `model/graph/ElementIndex.ts`                     | Separate node, datatype and relation indexes; no semantic policy.                                      |
| `model/graph/ProjectGraph.ts`                     | Same visibility rule for lookup; import traversal is iterative and deterministic.                      |
| `model/graph/References.ts`                       | Local and qualified identities remain distinct.                                                        |
| `model/graph/RelationScope.ts`                    | Explicit selections at each level; distant imports cannot reopen omitted relations.                    |
| `model/index.ts`                                  | Generic public exports; no RAMEN dependencies.                                                         |
| `model/validation/Cardinality.ts`                 | Interval narrowing; schema supplies integer and minimum checks.                                        |
| `model/validation/Codes.ts`                       | Added INSTANCE_MODEL_MISMATCH; existing codes retained.                                                |
| `model/validation/Constraints.ts`                 | Registered languages; invalid input, unknown languages, duplicate registration and severity tested.    |
| `model/validation/Diagnostics.ts`                 | Escapes slash and tilde in path segments; regression tested.                                           |
| `model/validation/ModelRules.ts`                  | Attribute conflicts, refinement endpoints, cardinalities, roles and composition.                       |
| `model/validation/ModelSchema.ts`                 | Unknown JSON boundary and structured validation errors.                                                |
| `model/validation/ModelValidator.ts`              | Schema, graph, then rules; invalid graphs are not exposed.                                             |
| `ramen/Advisor.ts`                                | Carrier suggestions follow selected relations and annotation definitions.                              |
| `ramen/Document.ts`                               | Schema marker recognition is explicitly distinguished from content validation.                         |
| `ramen/RamenModel.ts`                             | Wrapper delegates editing; annotation cleanup and relation convenience methods remain here.            |
| `ramen/ReferenceModel.ts`                         | Versioned vocabulary and stable IDs; base model unchanged.                                             |
| `ramen/annotations/Advisor.ts`                    | Returned bounds are detached; editing advice cannot alter later results.                               |
| `ramen/annotations/AnnotationIndex.ts`            | Annotations scoped by declaring model and Annotation-node ancestry.                                    |
| `ramen/annotations/Definitions.ts`                | Closed type declarations, inline properties and selected relation groups.                              |
| `ramen/annotations/Properties.ts`                 | Node attribute selection and type-owned properties stay separate.                                      |
| `ramen/annotations/Rules.ts`                      | Duplicate types, property compatibility, grouped bounds and overlap checks.                            |
| `ramen/annotations/Schema.ts`                     | Standalone assertion success and failure now tested.                                                   |
| `ramen/data/InstanceValidator.ts`                 | Stops on context mismatch; 1000 annotation records and a missing carrier tested.                       |
| `ramen/exchange/Bundle.ts`                        | Legacy round trips retained; malformed envelope tested.                                                |
| `ramen/exchange/Comparison.ts`                    | Annotation changes separated from generic changes; no data migration.                                  |
| `ramen/exchange/File.ts`                          | Annotation ownership and shared graph reconstruction checked.                                          |
| `ramen/index.ts`                                  | RAMEN exports remain separate from the generic entry.                                                  |
| `ramen/validation/ModelValidator.ts`              | Generic rules first, RAMEN requirements and annotation rules afterward.                                |
| `ramen/validation/ProjectSchema.ts`               | Standalone assertion success and failure now tested.                                                   |
| `resources/models/ramen.model.json`               | Reviewed classifiers, attributes and all ten relations; unchanged.                                     |
| `resources/schemas/model-bundle.schema.json`      | Legacy envelope; nested documents checked by the reader.                                               |
| `resources/schemas/model-file.schema.json`        | Generated generic ownership schema; generator and drift check reviewed.                                |
| `resources/schemas/model-instances.schema.json`   | Documented required validation context.                                                                |
| `resources/schemas/model.schema.json`             | Reviewed all definitions and modifier meanings; no fields removed.                                     |
| `resources/schemas/ramen-annotations.schema.json` | Closed type properties and grouped relation cardinalities.                                             |
| `resources/schemas/ramen-bundle.schema.json`      | Legacy envelope; nested documents checked by RAMEN validation.                                         |
| `resources/schemas/ramen-file.schema.json`        | Generated RAMEN graph schema; generator and drift check reviewed.                                      |
| `resources/schemas/ramen-project.schema.json`     | Generated project schema; generic and annotation definitions remain synchronized.                      |

## Boundaries to keep explicit

- `buildProjectGraph` resolves structure. Use a model validator before interpreting
  semantic validity; schema validation belongs at the JSON boundary.
- The low-level format permits new root node declarations in imported documents.
  The guided `createNode` API asks for a base node on a derived level. A stronger
  closed-language policy would need an explicit decision and matching generic rules.
- Key uniqueness across records, edit-history rules and data migration are not implemented.
  Schema descriptions already distinguish these from snapshot validation.
- Constraint evaluators execute data rules; there is no general satisfiability solver.
- Import and inheritance cycle detection still uses recursion. Tested depth is 120 levels;
  adversarially deep inputs need a separate resource-limit/iterative-traversal policy.
- Legacy bundles remain a second exchange API. Retire them in a deliberate API cleanup.

See [model levels](model-levels.md) for the implemented semantics and the boundary to MLM.
