---
title: Use RAMEN Data Types
group: RAMEN
---

# Use RAMEN Data Types

RAMEN defines reusable data types on top of [RMF's built-in types](../rmf/data-types.md). They are part of the RAMEN reference model, so a project can use them without declaring them again.

| Type       | Stored value | Check during data validation                                           |
| ---------- | ------------ | ---------------------------------------------------------------------- |
| `UUID`     | String       | UUID format                                                            |
| `Date`     | String       | Calendar date, such as `2026-09-22`                                    |
| `DateTime` | String       | Date and time with an offset, such as `2026-09-22T10:30:00Z`           |
| `URI`      | String       | Absolute URI                                                           |
| `Email`    | String       | Email address format                                                   |
| `Selector` | Object       | RAMEN also requires a `type` field when used as an Annotation selector |

These are named data types, not new JSON primitive types. `Date` and `DateTime` are stored as strings. The format rules run when {@link ramen.RamenModel.validateInstances | validateInstances()} checks recorded data. A valid model can therefore contain a `Date` property even when no records have been checked yet. See [Validate RAMEN Data](validation.md) for an example.

## Use a reference type

For example, give Person an optional birth date and profile URI:

```ts
import type { Node } from '@ramen-suite/core/model';
import { RAMEN_ELEMENT, RAMEN_MODEL, RamenModel } from '@ramen-suite/core/ramen';

const edition: RamenModel = RamenModel.create('Edition');
const person: Node = edition.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;

edition.createAttribute(person, {
  name: 'birthDate',
  typeId: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.DATE}`,
});
edition.createAttribute(person, {
  name: 'profile',
  typeId: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.URI}`,
});
```

The qualified reference identifies the type in the imported RAMEN model. The inherited `uuid` property already uses RAMEN's `UUID` type. [Define Annotation Types](annotations.md#locate-a-selected-part) explains `Selector`, which has its own RAMEN rule in addition to its RMF `Object` base type.
