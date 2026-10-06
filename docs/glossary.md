---
title: Glossary
---

# Glossary

Use these names when reading the guides or extending the code. A **definition** describes permitted data; a **record** is data collected under those definitions.

## Models and graphs

| Term                      | Meaning                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **RMF model**             | One versioned JSON {@link model.Model} containing type definitions, relationships and imports.                                                               |
| **RAMEN reference model** | The packaged {@link ramen.RAMEN_MODEL} defines Collection, Entity, Content and Annotation. It is an RMF model.                                               |
| **RAMEN project model**   | A model based on RAMEN. Its {@link ramen.RamenModelDocument} also contains closed annotation type definitions.                                               |
| **Model level**           | One model in an import chain. A later level imports its predecessor; it does not copy its definitions.                                                       |
| **Workspace**             | All models being edited together, including sibling levels. {@link model.Modeller} or {@link ramen.RamenModel} opens one level.                              |
| **Project graph**         | The resolved, read-only {@link model.ProjectGraph} of a selected model and its imports. Validation and suggestions use it. It is not the editable workspace. |
| **Effective node**        | A node viewed with inherited attributes and constraints. The definitions stay on their declaring nodes.                                                      |
| **Instance graph**        | {@link model.ModelInstanceGraph} contains recorded nodes and links supplied by a tool for data validation. It is separate from the model graph.              |

## Definitions and references

| Term                     | Meaning                                                                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Node**                 | An {@link model.Node} is an object type, such as Document or Person, rather than one recorded person.                                                                   |
| **Attribute / property** | An {@link model.Attribute} defines a property; a record stores its value under the attribute's `name`.                                                                  |
| **Data type**            | A {@link model.DataType} defines values for an attribute. Its recorded values have no node identity or relationships.                                                   |
| **Relation**             | A {@link model.Relation} permits links between node types. A recorded link has no additional properties.                                                                |
| **Refinement**           | A node or relation specialises an existing definition through `superTypes`, within one model or on a later level.                                                       |
| **Reuse**                | A later level uses an imported definition unchanged, without creating a local definition.                                                                               |
| **Annotation node**      | The RAMEN Node named Annotation, or a project refinement of it. It may be reused unchanged.                                                                             |
| **Annotation type**      | A closed {@link ramen.RamenAnnotation} with a `type` value and selected properties and relationships. It is not another RMF node.                                       |
| **ID / reference**       | An ID identifies a declaration in its model. A qualified reference also names the owning model. API {@link model.ElementInput} accepts an object or a string reference. |

## API results

| Term                       | Meaning                                                                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Suggestion**             | A permitted choice for a modelling action. `suggest*` reads the current model; it does not edit it.                                                                                 |
| **Option**                 | A configurable property or relationship offered while declaring an annotation type. It is not yet selected.                                                                         |
| **ModelChange**            | The immediate result of `create*`, `update*` or `remove*`: the affected `element` and validation of the edited model. It is not a before/after difference.                          |
| **Diagnostic**             | One validation finding with severity, code, message and, when available, a path and reference.                                                                                      |
| **NodeRemovalPreview**     | Declarations that `removeNode(id, { cascade: true })` would affect. {@link model.Modeller.previewNodeRemoval} changes nothing; removal recalculates the preview.                    |
| **RelationRemovalPreview** | Relations that would be deleted and annotation types that would change with `removeRelation(id, { cascade: true })`. {@link model.Modeller.previewRelationRemoval} changes nothing. |
| **Snapshot**               | A detached copy of the whole editable workspace at one point in time. The copy can itself be edited.                                                                                |
| **EvolutionReport**        | A before/after comparison of workspace definitions and validation findings. It does not migrate recorded data.                                                                      |
| **Model file**             | One JSON exchange form: model metadata plus declarations tagged with their owning model ID. Import restores the levels.                                                             |

## Method names

`get*` reads an existing definition or resolved view. `suggest*` lists permitted choices. `preview*` shows the impact of an edit without performing it. `validate*` checks rules. `create*`, `update*` and `remove*` edit definitions. `snapshot()` copies the workspace; `compareTo()` describes differences between two states. `export()` and `import()` exchange model files.
