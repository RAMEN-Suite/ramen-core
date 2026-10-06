---
title: Validate RAMEN Data
group: RAMEN
children:
  - diagnostics.md
---

# Validate RAMEN Data

First check the **data model**. Then check whether **recorded data** follow it. RAMEN adds annotation rules to the [generic RMF validation](../rmf/validation.md); problems are returned as [diagnostics](diagnostics.md).

## Check the model

This model allows a `person` annotation on Text. Each such annotation must refer to one Person:

```ts
import type { Node, ProjectValidationResult, Relation } from '@ramen-suite/core/model';
import { RAMEN_ELEMENT, RamenModel } from '@ramen-suite/core/ramen';

const media: RamenModel = RamenModel.create('Media');
const text: Node = media.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
const person: Node = media.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;

const textLink: Relation = media.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION).element;
const personLink: Relation = media.refersTo(RAMEN_ELEMENT.ANNOTATION, person).element;

media.createAnnotation({
  nodeId: RAMEN_ELEMENT.ANNOTATION,
  type: 'person',
  relations: [
    { relation: textLink, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } },
    { relation: personLink, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } },
  ],
});

const modelResult: ProjectValidationResult = media.validate();
if (!modelResult.valid) console.log(modelResult.diagnostics);
```

{@link ramen.RamenModel.validate | validate()} checks the model's structure and RAMEN rules. An invalid model cannot be exported.

## Check recorded data

A tool supplies its records as a {@link model.ModelInstanceGraph | ModelInstanceGraph}. This graph contains a Text, its `person` annotation and the referenced Person. IDs are shortened for illustration:

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

Now remove the Person reference. The annotation still exists, but no longer satisfies its type rule:

```ts
const withoutReference: ModelInstanceGraph = { ...data, relations: data.relations.slice(0, 1) };
const invalid: ValidationResult = media.validateInstances(withoutReference);

console.log(invalid.diagnostics.map((item: Diagnostic): string => item.code));
// ['RAMEN_INSTANCE_ANNOTATION_RELATION_CARDINALITY']
```

`typeId` points to a model definition; `properties.type` chooses the annotation type. The graph needs no model ID because `media` supplies it.

## Use data from a tool

A tool translates its own records into `ModelInstanceGraph` before validation. RAMEN checks annotation types, allowed properties and links, and that `selector` has a `type`; the tool interprets selector details such as `start` and `end`. See [Constrain Annotations](constrain-annotations.md) for fixed value lists and [Add Constraints](../rmf/constraints.md) for custom checks.
