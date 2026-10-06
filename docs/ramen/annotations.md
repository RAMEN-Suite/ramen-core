---
title: Define Annotation Types
group: RAMEN
children:
  - constrain-annotations.md
  - suggest-annotations.md
---

# Define Annotation Types

The `Annotation` **node** defines what all annotations share. An annotation **type**, such as `person`, selects the properties and relationships permitted for one variant. Projects declare types with {@link ramen.RamenModel.createAnnotation | createAnnotation()}; RAMEN has no fixed list. Validation rejects recorded annotations with an undeclared type, property or connection.

Projects may borrow names such as [persName](https://tei-c.org/release/doc/tei-p5-doc/en/html/ref-persName.html) and [placeName](https://tei-c.org/release/doc/tei-p5-doc/en/html/ref-placeName.html) from the [TEI Guidelines](https://tei-c.org/release/doc/tei-p5-doc/en/html/). They still define each type's rules in RAMEN.

## Build the shared model

Use the same imported Annotation node for Text and Image. First create the model and its nodes:

```ts
import type { Node, Relation } from '@ramen-suite/core/model';
import { RAMEN_ELEMENT, RamenModel } from '@ramen-suite/core/ramen';

const media: RamenModel = RamenModel.create('Media');

const text: Node = media.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
const image: Node = media.createNode({ name: 'Image', refines: RAMEN_ELEMENT.CONTENT }).element;
const person: Node = media.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;
```

Then define the available relationships:

```ts
const textLink: Relation = media.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION).element;
const imageLink: Relation = media.hasAnnotation(image, RAMEN_ELEMENT.ANNOTATION).element;
const personLink: Relation = media.refersTo(RAMEN_ELEMENT.ANNOTATION, person).element;
```

Text and Image have separate `HAS_ANNOTATION` relationships. A type can therefore allow either one, even though both lead to the same Annotation node.

## Declare a type

Declare `person` with **at least one** Text or Image attachment and exactly one Person reference:

```ts
import type { RamenAnnotation } from '@ramen-suite/core/ramen';

const personType: RamenAnnotation = media.createAnnotation({
  nodeId: RAMEN_ELEMENT.ANNOTATION,
  type: 'person',
  relations: [
    { relations: [textLink, imageLink], direction: 'incoming', bounds: { lowerBound: 1, upperBound: -1 } },
    { relation: personLink, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } },
  ],
}).element;
```

The grouped `relations` count Text and Image links **together**: one or more must exist. The person's name belongs on the referenced Person's `label`, not on this annotation.

The type selects existing relationships; it does not create them. See [Suggest Annotations](suggest-annotations.md) for choices an editor can offer.

## Add properties and constraints

Types can declare their own properties. The [Role annotation example](constrain-annotations.md) adds an independent `role` type with a `name: RoleName` property restricted by the generic literal validator. The shared Annotation fields `uuid`, `type` and `selector` remain available to every type.

## Locate a selected part

An Annotation may contain one optional `selector` object. It follows the [Web Annotation selector idea](https://www.w3.org/TR/annotation-model/#selectors), without requiring the full Web Annotation format. A recorded `person` annotation on Text could contain:

```json
{
  "type": "person",
  "selector": { "type": "TextPositionSelector", "start": 4, "end": 9 }
}
```

A `person` annotation on Image could select a rectangle with a [Fragment Selector](https://www.w3.org/TR/annotation-model/#fragment-selector):

```json
{
  "type": "person",
  "selector": { "type": "FragmentSelector", "value": "xywh=50,40,120,90" }
}
```

These are property snippets from recorded annotations; their Text or Image links are stored separately. `selector` is an object, not a JSON string. {@link ramen.RAMEN_ELEMENT | RAMEN_ELEMENT.SELECTOR} identifies its [RAMEN data type](data-types.md). RAMEN checks that `selector.type` is present; the consuming tool interprets `start`, `end` or `value`. See [Validate RAMEN Data](validation.md).

## Refine the Annotation node when needed

The shared node is enough for the examples above. A project can also give text annotations their own node type:

```ts
const textAnnotation: Node = media.createNode({
  name: 'TextAnnotation',
  refines: RAMEN_ELEMENT.ANNOTATION,
}).element;
```

Then define its relationship and a text-specific type. An `unclearReading` can record why a passage is uncertain:

```ts
import { DataTypes } from '@ramen-suite/core/model';

const unclearLink: Relation = media.hasAnnotation(text, textAnnotation).element;
media.createAnnotation({
  node: textAnnotation,
  type: 'unclearReading',
  properties: [{ name: 'reason', typeId: DataTypes.String, bounds: { lowerBound: 0, upperBound: 1 } }],
  relations: [{ relation: unclearLink, direction: 'incoming', bounds: { lowerBound: 1, upperBound: -1 } }],
});
```

The same approach works for Image:

```ts
const imageAnnotation: Node = media.createNode({
  name: 'ImageAnnotation',
  refines: RAMEN_ELEMENT.ANNOTATION,
}).element;

const damageLink: Relation = media.hasAnnotation(image, imageAnnotation).element;
media.createAnnotation({
  node: imageAnnotation,
  type: 'damage',
  properties: [{ name: 'severity', typeId: DataTypes.String, bounds: { lowerBound: 1, upperBound: 1 } }],
  relations: [{ relation: damageLink, direction: 'incoming', bounds: { lowerBound: 1, upperBound: -1 } }],
});
```

Both refined nodes inherit the common fields and the `person` type. `unclearReading` belongs only to `TextAnnotation`; `damage` belongs only to `ImageAnnotation`. Later refinements inherit these types and may add new ones. See [Refine by Inheritance](../rmf/inheritance.md).
