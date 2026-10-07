---
route: ramen/data-types
title: RAMEN Nodes
group: RAMEN
---

# RAMEN Nodes

RAMEN provides four node types for a project to refine or reuse:

| Node         | What it represents               |
| ------------ | -------------------------------- |
| `Collection` | A group such as a letter or book |
| `Content`    | Text, image or other content     |
| `Entity`     | A person, place or other entity  |
| `Annotation` | A statement attached to content  |

Collection and Entity have `uuid` and `label`. Content and Annotation have `uuid`; Annotation also has `type` and an optional `selector`. These are inherited by project nodes.

## Reuse RAMEN data types

The reference model also supplies named data types. Projects use them without declaring them again. [RMF's built-in types](../rmf/data-types.md) provide their underlying String and Object values.

| Type       | Value  | Example or rule                   |
| ---------- | ------ | --------------------------------- |
| `UUID`     | String | UUID format                       |
| `Date`     | String | `2026-09-22`                      |
| `DateTime` | String | `2026-09-22T10:30:00Z`            |
| `URI`      | String | Absolute URI                      |
| `Email`    | String | Email address format              |
| `Selector` | Object | RAMEN requires a non-empty `type` |

`Date` and `DateTime` remain strings in JSON. {@link ramen.RamenModel.validateInstances | validateInstances()} checks their formats in recorded data. Model validation checks that a property refers to an available data type.

## Use a reference type

Give Person an optional birth date and profile URI:

```ts
import type { Node } from '@ramen-suite/core/model';
import { RAMEN_ELEMENT, RamenModel } from '@ramen-suite/core/ramen';

const edition: RamenModel = RamenModel.create('Edition');
const person: Node = edition.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;

edition.createAttribute(person, {
  name: 'birthDate',
  typeId: RAMEN_ELEMENT.DATE,
});
edition.createAttribute(person, {
  name: 'profile',
  typeId: RAMEN_ELEMENT.URI,
});
```

The modeller resolves these IDs to the imported RAMEN data types. Use {@link ramen.RamenModel.getDataType | getDataType()} to inspect a declaration. Person already inherits a required `uuid`. [Use Selectors](selectors.md) explains the Object-valued Selector type.
