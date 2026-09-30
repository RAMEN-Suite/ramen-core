---
title: Suggestions
group: Guides
---

# Suggestions

Use suggestions when a user needs to choose a type or relationship.
For direct programming with a known choice, use the methods in [RAMEN Model Format](rmf.md).

## Query names

| Prefix     | Purpose                                  | Example                                     |
| ---------- | ---------------------------------------- | ------------------------------------------- |
| `get`      | Read existing definitions or an overview | {@link model.Modeller.getAttributes         | getAttributes(node)}               |
| `suggest`  | Offer permitted modelling choices        | {@link model.Modeller.suggestRelations      | suggestRelations(from, to)}        |
| `validate` | Check model rules or a proposed input    | {@link model.Modeller.validateAttributeName | validateAttributeName(node, name)} |

Queries do not edit the model. Lists return `[]` when no option is available.
The editing API requires known node references and a valid model.

## Example setup

This is the same Filing → Website example as the RMF guide:

```ts
import { DataTypes, Modeller } from '@ramen-suite/core/model';
import type { Node } from '@ramen-suite/core/model';

const model: Modeller = Modeller.create('Filing');
const document: Node = model.createNode('Document').element;
const folder: Node = model.createNode('Folder').element;

model.createAttribute(document, { name: 'title', typeId: DataTypes.String });
model.createRelation({ name: 'FILED_IN', fromNode: document, toNode: folder });

const project: Modeller = model.createNextLevel('Website');
const page: Node = project.createNode({ name: 'Page', refines: document }).element;
const section: Node = project.createNode({ name: 'Section', refines: folder }).element;
```

## Select a data type

{@link model.Modeller.suggestDataTypes | suggestDataTypes()} includes built-in and declared data types.
Give this list to a selection field:

```ts
import type { DataTypeSuggestion } from '@ramen-suite/core/model';

const types: readonly DataTypeSuggestion[] = project.suggestDataTypes();
console.log(types.map((type: DataTypeSuggestion): string => type.name));
// ['Boolean', 'Float', 'Integer', 'String']
```

Pass the selected object directly when the user confirms:

```ts
function addDescription(selected: DataTypeSuggestion): void {
  project.createAttribute(page, { name: 'description', type: selected });
}
```

The caller supplies the selected option. No manual ID lookup is needed.

## Select a relation

{@link model.Modeller.suggestRelations | suggestRelations()} returns relations allowed by the preceding model level:

```ts
import type { RelationSuggestion } from '@ramen-suite/core/model';

const choices: readonly RelationSuggestion[] = project.suggestRelations(page, section);
console.log(choices.map((choice: RelationSuggestion): string => choice.name));
// ['FILED_IN']
```

Here the list contains one option:

| Field         | Value                                        |
| ------------- | -------------------------------------------- |
| `name`        | FILED_IN                                     |
| `ref`         | A qualified reference to Filing's relation   |
| `actions`     | `['reuse', 'refine']`                        |
| `explanation` | Why Document → Folder accepts Page → Section |

Apply the selected option:

```ts
function connectTypes(selected: RelationSuggestion): void {
  project.createRelation({ fromNode: page, toNode: section, refines: selected });
}
```

Before applying it, `project.getRelations(page, section)` is empty.
Reading suggestions does not select a relationship for the model.
The reverse query, `project.suggestRelations(section, page)`, returns `[]`.

## Read a node and check a property name

{@link model.Modeller.getAttributes | getAttributes(page)} reads local and inherited attributes.
{@link model.Modeller.getNodeInfo | getNodeInfo(page)} adds lineage and connection options.
These methods do not propose new attributes.

```ts
import type { AttributeNameResult } from '@ramen-suite/core/model';

const result: AttributeNameResult = project.validateAttributeName(page, 'title');
console.log(result);
// { allowed: false, conflicts: ['attribute'] }
```

Page already inherits `title`, so it cannot declare that name again.

## RAMEN annotations

{@link ramen.RamenModel | RamenModel} provides the same generic queries and adds annotation choices:

| Method                                             | Purpose                                       |
| -------------------------------------------------- | --------------------------------------------- |
| {@link ramen.RamenModel.suggestAnnotations         | suggestAnnotations(annotation)}               | Choose a declared type for an Annotation node                                  |
| {@link ramen.RamenModel.suggestAnnotationsForNode  | suggestAnnotationsForNode(text)}              | Choose a type allowed on Text through modelled relations                       |
| {@link ramen.RamenModel.suggestAnnotationOptions   | suggestAnnotationOptions(annotation)}         | Get permitted properties, relations and bounds for a new annotation definition |
| {@link ramen.RamenModel.getAttributesForAnnotation | getAttributesForAnnotation(annotation, type)} | Read the properties of an existing type                                        |
| {@link ramen.RamenModel.getRelationsForAnnotation  | getRelationsForAnnotation(annotation, type)}  | Read its allowed relations and bounds                                          |
