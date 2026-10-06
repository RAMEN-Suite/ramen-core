---
title: Add Properties
group: RMF
---

# Add Properties

A node owns {@link model.Attribute | properties} that its records may contain. Use {@link model.Modeller.createAttribute | createAttribute()} to give Document one required title:

```ts
import type { Attribute, Node } from '@ramen-suite/core/model';
import { DataTypes, Modeller } from '@ramen-suite/core/model';

const model: Modeller = Modeller.create('Filing');
const document: Node = model.createNode('Document').element;

const title: Attribute = model.createAttribute(document, {
  name: 'title',
  typeId: DataTypes.String,
  bounds: { lowerBound: 1, upperBound: 1 },
}).element;
```

Recorded data stores the property under `name` and checks its value against `typeId`. `bounds` sets how many values a record may contain. Omit it for an optional single value (`0..1`):

```ts
model.createAttribute(document, { name: 'description', typeId: DataTypes.String });
```

## Choose a value count

Use `-1` for an unlimited upper bound. A many-valued property is stored as an array, even when it currently has only one value:

```ts
model.createAttribute(document, {
  name: 'keywords',
  typeId: DataTypes.String,
  bounds: { lowerBound: 0, upperBound: -1 },
});
// Recorded value: { keywords: ['history', 'letters'] }
```

| Bounds           | Meaning                                           |
| ---------------- | ------------------------------------------------- |
| `0..0`           | No value allowed                                  |
| `0..1`           | Optional single value; attribute default          |
| `1..1`           | Required single value                             |
| `0..*` or `1..*` | Any number, or at least one; use `upperBound: -1` |
| `n..m`           | From `n` to `m` values, inclusive                 |

## Set property behaviour

The flags describe different rules; they are not interchangeable:

| Field        | Default | Effect                                                                                                              | Example                                        |
| ------------ | ------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `isKey`      | `false` | One `1..1` property identifies records across a node and its subtypes. A refinement cannot add another key.         | Document uses `reference` as its key.          |
| `isUnique`   | `true`  | Prevents repeated values in one record's multi-valued property.                                                     | With `false`, `['draft', 'draft']` is allowed. |
| `isOrdered`  | `true`  | Array position carries meaning; validation does not impose an order.                                                | `['draft', 'published']` keeps this sequence.  |
| `isReadOnly` | `false` | Tells a tool to prevent changes to a recorded value after creation; validating one record cannot check its history. | A tool locks `reference` after creation.       |

For example, make `reference` a stable key and allow repeated tags whose order does not matter:

```ts
model.createAttribute(document, {
  name: 'reference',
  typeId: DataTypes.String,
  bounds: { lowerBound: 1, upperBound: 1 },
  isKey: true,
  isReadOnly: true,
});
model.createAttribute(document, {
  name: 'tags',
  typeId: DataTypes.String,
  bounds: { lowerBound: 0, upperBound: -1 },
  isUnique: false,
  isOrdered: false,
});
```

To restrict which values a property accepts, [define a data type](data-types.md) or [write a constraint](constraints.md).

## Inherit without redeclaring

A refined node receives its parent's properties. It may add new names but cannot redeclare `title` with another type or bounds. Read inherited properties with {@link model.Modeller.getAttributes | getAttributes(node)}; use [Request Suggestions](suggestions.md#check-an-attribute-name) to check a proposed name before creating it.

## Update a property

{@link model.Modeller.updateAttribute | updateAttribute()} changes a local property. Pass the owning node ID and the property ID. Here title becomes optional:

```ts
model.updateAttribute(document.id, title.id, { bounds: { lowerBound: 0, upperBound: 1 } });
```

Its ID stays the same. You can also change its name, `typeId`, flags, constraints and `ext`. To edit an inherited property, update it on the node that declares it.

## Remove a property

{@link model.Modeller.removeAttribute | removeAttribute()} removes a local property:

```ts
model.removeAttribute(document.id, title.id);
```

Local subtypes then stop inheriting that property. The owner node and its other properties remain.
