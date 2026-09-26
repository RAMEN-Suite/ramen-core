---
title: Testing and modeling scenarios
group: Guides
---

# Testing and modeling scenarios

RAMEN Core primarily edits and validates data models. A modeling scenario follows a person building such a model through the public API. Tests of captured data are a separate check of how a tool can interpret that model.

## Test layers

| Layer                  | What it proves                                                                                            | Location                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Focused rules          | Identifiers, references, inheritance, cardinalities, scalar constraints and diagnostics behave correctly. | `test/model`, `test/graph`, `test/validation` |
| Public API integration | Model editing, suggestions, validation and bundles work together.                                         | `test/ramen`                                  |
| Modeling scenarios     | A sequence of modeling decisions remains usable through refinement, correction and export/import.         | Scenario matrix below                         |
| Consumer examples      | The built public entry points and declarations support executable TypeScript examples.                    | `examples`                                    |

Tests import the built package, rather than private rule classes. Run `npm run verify` for schema generation checks, build, lint, formatting, TypeScript, examples, documentation and tests. Passing this command proves the listed cases; it is not a claim that every possible model is covered.

## Implemented modeling scenarios

| ID  | Modeling steps and expected outcome                                                                                                                                                                                                                                                             | Executable tests                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| M01 | Create Letter, Witness, Person, Place and Text; connect them and declare five annotation types. The resulting project model is valid.                                                                                                                                                           | `test/ramen/correspondence.test.ts`                            |
| M02 | Text and Image share the imported Annotation node. Select different incoming relations for their types. Each carrier receives only its own suggestions; a Text refinement retains its suggestions.                                                                                              | `test/ramen/annotations.test.ts`                               |
| M03 | Refine Annotation into TextAnnotation and ImageAnnotation. Declare and attach their types separately. Suggestions remain separated.                                                                                                                                                             | `test/ramen/annotations.test.ts`                               |
| M04 | Refine a correspondence project across additional levels. Inherited attributes, annotation declarations and compatible relations remain available.                                                                                                                                              | `test/ramen/correspondence.test.ts`                            |
| M05 | In another model level, request connection choices, select the predecessor's relation, connect nodes and exchange the complete project through JSON. Model identities, imports and annotation suggestions survive. Rename a restored node and report that change without changing the original. | `test/ramen/modeling-scenarios.test.ts`, `M05`                 |
| M06 | Narrow a collection relation in a project. Attempt to widen it in a child model: diagnostics identify the rule and export fails. Correct the same relation and successfully export/import; the parent remains unchanged.                                                                        | `test/ramen/modeling-scenarios.test.ts`, `M06`                 |
| M07 | Create and edit attributes, data types and literals. Invalid duplicates or inherited-name conflicts are reported; valid edits remain available through the public API.                                                                                                                          | `test/ramen/model-api.test.ts`                                 |
| M08 | Build and exchange a domain model using only the generic RMF API. RAMEN vocabulary is not required.                                                                                                                                                                                             | `examples/generic-model.ts`, `test/graph/model-bundle.test.ts` |

## Open acceptance cases

These are requirements to implement and then test, not passing tests or silently skipped cases.

| ID  | Expected scenario                                                                                                                                 | Remaining work                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M09 | A project omits Letter PART_OF Letter. A child model cannot restore that relation by selecting the more permissive RAMEN ancestor.                | Enforce the project's relation boundary in modeling APIs, suggestions and validation.                                                                       |
| M10 | Two annotation types share a node but have different type-specific properties. Modeling and form suggestions expose only the intended properties. | Decide whether properties are declared directly on the type. The current format selects attributes declared on the node. No field changes without approval. |
| M11 | One annotation type can attach to Text or Image, with a total minimum of one carrier across those alternatives.                                   | Decide how to express aggregate cardinality. Two separate optional relation requirements do not express that total.                                         |
| M12 | A published package is packed, installed in a clean consumer project and used without workspace paths.                                            | Add an install-from-tarball check before release. Existing examples use the local build.                                                                    |
| M13 | Tools interpret keys, read-only properties, ordering, composition and omitted modifier values consistently.                                       | Add contract cases for the documented modifiers; distinguish model rules from editing and persistence behavior owned by a tool.                             |

Keep other boundary cases beside the rule they exercise: missing imports, incompatible versions, malformed JSON, inherited type redeclarations and unsupported constraint languages. Do not duplicate the same workflow in several test folders.

## How to add a scenario

1. Describe the modeler's decision and expected result in this matrix.
2. Use public APIs with concrete domain names and explicit TypeScript types.
3. Assert each meaningful stage: model creation, a selected suggestion, refinement, a rejected edit, recovery or exchange.
4. Assert stable IDs, diagnostic codes and observable model content. Avoid assertions about private helper calls.
5. Give each scenario its own starting model; helpers may organize stages, but must not share mutable state between tests.

## Reading the implementation

Start with `examples/ramen-programmatic.ts`, then M05. Follow the same workflow in these files:

1. `src/ramen/project/RamenModel.ts`: public editing API and model state.
2. `src/ramen/validation/ModelValidator.ts`: RAMEN validation entry point.
3. `src/model/validation/Validate.ts`: generic schema, graph and semantic validation pipeline.
4. `src/model/project/Build.ts` and `Graph.ts`: dependency resolution and graph queries.
5. `src/ramen/project/Advisor.ts`: suggestions derived from a validated model.

The `model` layer must not depend on `ramen`. The `resources` folder holds the reference model and schemas; `ramen-project.schema.json` is generated from the generic and annotation schemas. Files prefixed with `Instance` interpret captured data and are not required to follow the basic modeling workflow.

The current structure separates these responsibilities, but names such as `Validate.ts`, `Project.ts` and `Semantics.ts` need this reading map. Prefer clearer names when changing that area; do not add a separate file for each small method. The public `RamenModel` facade is intentionally one entry point even though it delegates to several focused components.
