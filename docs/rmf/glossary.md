---
title: Glossary
---

# Glossary

Use these names when reading the guides or extending the code. A **definition** describes permitted data, while a **record** contains data collected under those definitions.

## Models and graphs

| Term               | Meaning                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **RMF model**      | One versioned JSON {@link model.Model model} containing type definitions, relationships and imports.                                                               |
| **Model level**    | One model in an import chain. A later level imports its predecessor without copying its definitions.                                                               |
| **Workspace**      | All models being edited together, including sibling levels. A {@link model.Modeller Modeller} opens one level.                                                     |
| **Project graph**  | The resolved, read-only {@link model.ProjectGraph graph} of a selected model and its imports. Validation and suggestions use it. It is not the editable workspace. |
| **Effective node** | A node viewed with inherited attributes and constraints. The definitions stay on their declaring nodes.                                                            |
| **Instance graph** | An {@link model.ModelInstanceGraph instance graph} contains recorded nodes and links supplied by a tool for data validation. It is separate from the model graph.  |

## Definitions and references

| Term                     | Meaning                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Node**                 | A {@link model.Node node} is an object type, such as Document or Person, rather than one recorded person.                                                                             |
| **Attribute / property** | An {@link model.Attribute attribute} defines a property whose value a record stores under the attribute's `name`.                                                                     |
| **Data type**            | A {@link model.DataType data type} defines values for an attribute. Its recorded values have no node identity or relationships.                                                       |
| **Relation**             | A {@link model.Relation relation} permits links between node types. A recorded link has no additional properties.                                                                     |
| **Refinement**           | A node or relation specialises an existing definition through `superTypes`, within one model or on a later level.                                                                     |
| **Reuse**                | A later level uses an imported definition unchanged, without creating a local definition.                                                                                             |
| **ID / reference**       | An ID identifies a declaration in its model. A qualified reference also names the owning model. API {@link model.ElementInput element input} accepts an object or a string reference. |

## API results

| Term                       | Meaning                                                                                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Suggestion**             | A permitted choice for a modelling action. `suggest*` reads the current model without editing it.                                                                                         |
| **ModelChange**            | The immediate result of `create*`, `update*` or `remove*`: the affected `element` and validation of the edited model. It is not a before/after difference.                                |
| **Diagnostic**             | One validation finding with severity, code, message and, when available, a path and reference.                                                                                            |
| **NodeRemovalPreview**     | Declarations that `removeNode(id, { cascade: true })` would affect. {@link model.Modeller.previewNodeRemoval previewNodeRemoval()} changes nothing, and removal recalculates the preview. |
| **RelationRemovalPreview** | Relations that `removeRelation(id, { cascade: true })` would delete. {@link model.Modeller.previewRelationRemoval previewRelationRemoval()} changes nothing.                              |
| **Snapshot**               | A detached copy of the whole editable workspace at one point in time. The copy can itself be edited.                                                                                      |
| **EvolutionReport**        | A before/after comparison of workspace definitions and validation findings. It does not migrate recorded data.                                                                            |
| **Model file**             | One JSON exchange form: model metadata plus declarations tagged with their owning model ID. Import restores the levels.                                                                   |

## Method names

`get*` reads an existing definition or resolved view. `suggest*` lists permitted choices. `preview*` shows the impact of an edit without performing it. `validate*` checks rules. `create*`, `update*` and `remove*` edit definitions. `snapshot()` copies the workspace, and `compareTo()` describes differences between two states. `export()` and `import()` exchange model files.
