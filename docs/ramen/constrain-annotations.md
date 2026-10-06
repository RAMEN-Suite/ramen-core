---
title: Constrain Annotations
group: RAMEN
---

# Constrain Annotations

An annotation property can use a custom {@link model.DataType | data type}. For a fixed list of values, declare **literals** as in [Add Data Types](../rmf/data-types.md): the generic validator checks them automatically. This example gives a separate `role` annotation a required `name`. [Add Constraints](../rmf/constraints.md) covers rules that need an expression or evaluator.

## Create the model

Define the nodes and relationships that `role` may use:

```ts
import type { Node, Relation } from '@ramen-suite/core/model';
import { RAMEN_ELEMENT, RamenModel } from '@ramen-suite/core/ramen';

const media: RamenModel = RamenModel.create('Media');
const text: Node = media.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
const person: Node = media.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;

const textLink: Relation = media.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION).element;
const personLink: Relation = media.refersTo(RAMEN_ELEMENT.ANNOTATION, person).element;
```

## Define RoleName

`RoleName` stores a string and permits three literals:

```ts
import { DataTypes } from '@ramen-suite/core/model';
import type { DataType } from '@ramen-suite/core/model';

const roleName: DataType = media.createDataType({ name: 'RoleName', baseType: DataTypes.String }).element;
media.createLiteral(roleName.id, { name: 'Sender', literal: 'sender' });
media.createLiteral(roleName.id, { name: 'Recipient', literal: 'recipient' });
media.createLiteral(roleName.id, { name: 'Mentioned', literal: 'mentioned' });
```

Declare `role` as its own annotation type. It is not a property of `person`:

```ts
media.createAnnotation({
  nodeId: RAMEN_ELEMENT.ANNOTATION,
  type: 'role',
  properties: [{ name: 'name', type: roleName, bounds: { lowerBound: 1, upperBound: 1 } }],
  relations: [
    { relation: textLink, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } },
    { relation: personLink, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } },
  ],
});
```

## Check recorded roles

The relevant properties of a recorded Role annotation are:

```json
{ "type": "role", "name": "sender" }
```

In a complete data graph with the required Text and Person links, {@link ramen.RamenModel.validateInstances | media.validateInstances(data)} accepts `sender`. An `editor` value reports `INSTANCE_PROPERTY_LITERAL_INVALID`; a missing `name` violates `1..1`. [Validate RAMEN Data](validation.md) shows the complete graph format.
