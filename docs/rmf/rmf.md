---
route: rmf/overview
title: RAMEN Model Format
group: RMF
children:
  - nodes.md
  - properties.md
  - data-types.md
  - relationships.md
  - constraints.md
  - glossary.md
---

# RAMEN Model Format

## Understand RMF

**RAMEN Model Format (RMF)** describes data models in JSON.
You define which types, properties and relationships tools can use to collect data. This page builds a small Filing model and then a Website model based on it. Each step continues the previous one, with links to guides that explain the choices.

| Concept                 | Purpose                        | Example                       |
| ----------------------- | ------------------------------ | ----------------------------- |
| {@link model.Model}     | A versioned set of definitions | Filing                        |
| {@link model.Node}      | An object type                 | Document                      |
| {@link model.Attribute} | A typed property               | title                         |
| {@link model.DataType}  | Allowed property values        | String                        |
| {@link model.Relation}  | A permitted connection         | FILED_IN                      |
| {@link model.Import}    | An exact model dependency      | Use Filing from another model |
| Refinement              | A more specific definition     | A specialised Document type   |

{@link model.Modeller | Modeller} is the class you use to edit a model.
`Model`, `Node`, `Attribute` and `Relation` are data interfaces.
Node objects hold definitions, and Modeller provides the editing methods.
The [Glossary](glossary.md) distinguishes model levels, graphs, records and API results.
The [RMF Model example](../examples/website.md) shows a complete two-level website model.

## Create a model

Create Filing and its two node types:

```ts
import { Modeller } from '@ramen-suite/core/model';
import type { Node } from '@ramen-suite/core/model';

const model: Modeller = Modeller.create('Filing');
const document: Node = model.createNode('Document').element;
const folder: Node = model.createNode('Folder').element;
```

**Filing** is the model. **Document** and **Folder** are the types it defines.
This defines a schema for documents and folders rather than creating individual records.

Editing methods return a {@link model.ModelChange | ModelChange}: `{ element, validation }`. Use `.element` to keep a definition. The API generates IDs and a model URI, with `1.0.0` as the default version. [Create Nodes](nodes.md) covers creation, editing and deletion of node types.

## Add properties to nodes

Give Document a required string title:

```ts
import { DataTypes } from '@ramen-suite/core/model';

model.createAttribute(document, {
  name: 'title',
  typeId: DataTypes.String,
  bounds: { lowerBound: 1, upperBound: 1 },
});
```

`typeId` selects the value type, while `bounds` requires exactly one value. Add optional Folder properties:

```ts
model.createAttribute(folder, { name: 'description', typeId: DataTypes.String });
```

The default cardinality is `0..1`, and refined nodes inherit these properties. [Add Properties](properties.md) explains cardinality and flags such as `isKey`, `isUnique` and `isOrdered`. [Add Data Types](data-types.md) shows literals and web formats.

## Add relationships

Allow Document → Folder and at most one Folder per Document:

```ts
import type { Relation } from '@ramen-suite/core/model';

const filedIn: Relation = model.createRelation({
  name: 'FILED_IN',
  from: { node: document },
  to: { node: folder, bounds: { lowerBound: 0, upperBound: 1 } },
}).element;
```

`FILED_IN` defines a permitted relationship, not a recorded link. [Add Relationships](relationships.md) explains both cardinalities, endpoint options and relation selection on another level.

## Validate the model

Use {@link model.Modeller.validate | validate()} to check structure, references and model rules:

```ts
import type { ProjectValidationResult } from '@ramen-suite/core/model';

const result: ProjectValidationResult = model.validate();
if (!result.valid) {
  console.log(result.diagnostics);
}
```

Export requires a valid model. See [Validate Models and Data](validation.md), [Add Constraints](constraints.md), [Constraint Languages](../constraint-languages.md) and [Read Diagnostics](diagnostics.md).

## Refine the model

Create Website from Filing and refine its imported types:

```ts
const project: Modeller = model.createNextLevel('Website');
const page: Node = project.createNode({ name: 'Page', refines: document }).element;
const section: Node = project.createNode({ name: 'Section', refines: folder }).element;

project.createRelation({ refines: filedIn, from: { node: page }, to: { node: section } });
```

Page inherits `title`, and Section inherits `description`. Website explicitly applies Filing's relationship. [Refine by Inheritance](inheritance.md) compares inheritance in one model with a new level.

## Describe definitions

Models, nodes, relations, properties, data types, literals, constraints and RAMEN annotation shapes accept optional `description` metadata. It is plain text, may contain line breaks and is limited to 2,000 Unicode code points (`DESCRIPTION_MAX_LENGTH`). Empty or whitespace-only descriptions are omitted; other text is preserved. Updates retain the description unless explicitly supplied, and an empty string clears it.

Descriptions stay with their declaring definitions through duplication, inherited-property lookup and model import/export. They do not create captured-data fields or change validation rules; a constraint's description explains the rule, while its `message` reports a violation. Invalid or oversized descriptions are rejected without truncation. Project-level `ProjectMetadata.description` remains a separate, unchanged field.

## Export and import

{@link model.Modeller.export | export()} writes Website and Filing into one file. {@link model.Modeller.import | import()} restores both levels:

```ts
import type { ModelFile } from '@ramen-suite/core/model';

const file: ModelFile = project.export();
const json: string = JSON.stringify(file, null, 2);

const parsed: unknown = JSON.parse(json);
const restored: Modeller = Modeller.import(parsed);
```

The file follows the [RMF file schema](https://ramen-schema.org/model/1.0.0/file.schema.json). [Export and Import](exchange.md) explains how one graph preserves each level's ownership.
