---
route: rmf/validate-input
title: Check Input Values
group: RMF
---

# Check Input Values

Use a small check while someone enters one value. The model must already be valid. These methods do not need a recorded data graph.

## Check a data type

{@link model.Modeller.validateValue | validateValue()} checks the built-in or declared data type, its literals and its value constraints:

```ts
import { DataTypes, Modeller } from '@ramen-suite/core/model';
import type { ValidationResult } from '@ramen-suite/core/model';

const model: Modeller = Modeller.create('Filing');
const wrongType: ValidationResult = model.validateValue(DataTypes.Integer, 'twelve');
console.log(wrongType.diagnostics);
// INSTANCE_PROPERTY_TYPE_INVALID
```

This is useful before a value has been assigned to a particular property. For a named data type, pass its definition instead of `DataTypes.Integer`.

## Check a property

{@link model.Modeller.validateAttributeValue | validateAttributeValue()} also checks the property's required count and constraints. A subtype can use an inherited property:

```ts
import type { Constraint, Node } from '@ramen-suite/core/model';

const document: Node = model.createNode('Document').element;
const titleRule: Constraint = {
  id: 'capitalTitleRule01',
  name: 'Capitalised title',
  language: 'regex',
  expression: '^[A-Z]',
};
model.createAttribute(document, {
  name: 'title',
  typeId: DataTypes.String,
  bounds: { lowerBound: 1, upperBound: 1 },
  constraints: [titleRule],
});
const letter: Node = model.createNode({ name: 'Letter', refines: document }).element;

const missing: ValidationResult = model.validateAttributeValue(letter, 'title', undefined);
const lowercase: ValidationResult = model.validateAttributeValue(letter, 'title', 'example');
const accepted: ValidationResult = model.validateAttributeValue(letter, 'title', 'Example');
```

`missing` reports the required title, `lowercase` reports the pattern mismatch, and `accepted.hasErrors` is `false`. The rule belongs to `title` on Document and also applies to Letter.

These methods see only one value. They cannot check another property, links or keys across records. For those checks, use [Validate Recorded Data](validate-data.md). A [custom evaluator](constraints.md#register-a-custom-evaluator) can be passed to both methods, but receives no surrounding data graph.

If an evaluator throws, validation returns `CONSTRAINT_EVALUATION_FAILED` for that rule and continues checking the remaining rules. The finding is always an error, even when the rule normally reports a warning.
