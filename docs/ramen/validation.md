---
route: ramen/validation
title: Validate RAMEN Data
group: RAMEN
children:
  - diagnostics.md
---

# Validate RAMEN Data

Validation checks two things: whether the project model is valid, and whether recorded data follow it. RAMEN adds annotation rules to [RMF validation](../rmf/validation.md). Problems appear as [diagnostics](diagnostics.md).

## Check the model

Continue from the [Media model](annotations.md), where `person` can annotate Text or Image and must refer to one Person:

```ts
import type { ProjectValidationResult } from '@ramen-suite/core/model';

const modelResult: ProjectValidationResult = media.validate();
if (!modelResult.valid) {
  console.log(modelResult.diagnostics);
}
```

{@link ramen.RamenModel.validate | validate()} checks the model definitions before export or data validation.

## Check one input

Use {@link ramen.RamenModel.validateAnnotationValue | validateAnnotationValue()} for a property of one annotation shape. Continue from [Add Properties](constrain-annotations.md), where `role.name` uses the `RoleName` value list:

```ts
import type { ValidationResult } from '@ramen-suite/core/model';

const valid: ValidationResult = media.validateAnnotationValue(RAMEN_ELEMENT.ANNOTATION, 'role', 'name', 'sender');
const invalid: ValidationResult = media.validateAnnotationValue(RAMEN_ELEMENT.ANNOTATION, 'role', 'name', 'editor');

console.log(valid.hasErrors); // false
console.log(invalid.diagnostics); // INSTANCE_PROPERTY_LITERAL_INVALID
```

This checks the property's bounds, data type and constraints, including inherited annotation shapes. An unavailable type or property throws an error. You can pass a {@link model.ConstraintRegistry | ConstraintRegistry} as the last argument for custom evaluators. Links and uniqueness across records need a complete data graph.

## Check recorded data

A tool supplies its records as a {@link model.ModelInstanceGraph | ModelInstanceGraph}. This example has one Text record, one `person` annotation and one Person record. The record IDs are short for readability:

```ts
import type { Diagnostic, ModelInstanceGraph, ValidationResult } from '@ramen-suite/core/model';
import { RAMEN_MODEL } from '@ramen-suite/core/ramen';

const data: ModelInstanceGraph = {
  nodes: [
    {
      id: 'text',
      typeId: text.id,
      properties: { uuid: crypto.randomUUID() },
    },
    {
      id: 'annotation',
      typeId: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.ANNOTATION}`,
      properties: {
        uuid: crypto.randomUUID(),
        type: 'person',
        selector: { type: 'TextPositionSelector', start: 4, end: 9 },
      },
    },
    {
      id: 'person',
      typeId: person.id,
      properties: { uuid: crypto.randomUUID(), label: 'Alex Morgan' },
    },
  ],
  relations: [
    { id: 'textLink', typeId: textLink.id, fromId: 'text', toId: 'annotation' },
    { id: 'personLink', typeId: personLink.id, fromId: 'annotation', toId: 'person' },
  ],
};

const result: ValidationResult = media.validateInstances(data);
console.log(result.diagnostics);
```

Remove the Person link and check again:

```ts
const withoutReference: ModelInstanceGraph = { ...data, relations: data.relations.slice(0, 1) };
const invalid: ValidationResult = media.validateInstances(withoutReference);

console.log(invalid.diagnostics.map((item: Diagnostic): string => item.code));
// ['RAMEN_INSTANCE_ANNOTATION_RELATION_CARDINALITY']
```

`typeId` points to a model definition, while `properties.type` chooses the annotation shape. The graph needs no model ID because `media` supplies it.

## Use data from a tool

A tool translates its own records into `ModelInstanceGraph` before validation. RAMEN checks annotation shapes, allowed properties and links, and that `selector` has a `type`. The tool interprets selector details such as `start` and `end`. See [Add Properties](constrain-annotations.md) for fixed value lists and [Add Constraints](../rmf/constraints.md) for custom checks.
