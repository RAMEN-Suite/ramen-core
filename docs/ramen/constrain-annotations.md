---
route: ramen/annotation-properties
title: Add Properties
group: RAMEN
---

# Add Properties

An annotation type may declare properties that do not belong to the shared Annotation node. Here a separate `role` type has a required `name`. Its `RoleName` data type allows only three values.

A type must select every required property on its Annotation node. This also applies to inherited types when a node is refined. Optional node properties may be left out. Invalid JSON Schema expressions on type-owned properties are reported during model validation.

Annotation definitions, their own properties and constraints share the owning model's ID space. Each declaration needs a unique ID. Several annotation types may reference the same existing node attribute.

## Allow a role annotation

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

## Limit the property values

Declare `RoleName` with three permitted string literals:

```ts
import { DataTypes } from '@ramen-suite/core/model';
import type { DataType } from '@ramen-suite/core/model';

const roleName: DataType = media.createDataType({ name: 'RoleName', baseType: DataTypes.String }).element;
media.createLiteral(roleName.id, { name: 'Sender', literal: 'sender' });
media.createLiteral(roleName.id, { name: 'Recipient', literal: 'recipient' });
media.createLiteral(roleName.id, { name: 'Mentioned', literal: 'mentioned' });
```

Now declare `role`. Its `name` property belongs only to this type, while `uuid`, `type` and `selector` remain on the shared Annotation node:

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

## Check a recorded value

The relevant properties of a recorded Role annotation are:

```json
{ "type": "role", "name": "sender" }
```

{@link ramen.RamenModel.validateAnnotationValue | validateAnnotationValue()} checks this input without recorded nodes or links. In a complete data graph with the required Text and Person links, {@link ramen.RamenModel.validateInstances | validateInstances()} also accepts `sender`. The literal check rejects `editor`, and omitting `name` violates `1..1`. See [Validate RAMEN Data](validation.md) for both checks and [Add Constraints](../rmf/constraints.md) for rules beyond a value list.
