---
route: ramen/refine-annotations
title: Refine Nodes
group: RAMEN
---

# Refine Nodes

[Use Annotations](annotations.md) used the imported Annotation node for both Text and Image. Keep that approach when the types and their relationships provide enough distinction. Refine the node when a project needs a separate node family with shared properties or relationships.

## Define a text annotation node

Start from the [Media example](annotations.md#allow-the-connections). Add a node under RAMEN Annotation, then apply a Text relationship to it:

```ts
const textAnnotation: Node = media.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
const textAnnotationLink: Relation = media.hasAnnotation(text, textAnnotation).element;
```

Declare a type on this new node:

```ts
import { DataTypes } from '@ramen-suite/core/model';

media.createAnnotationShape({
  node: textAnnotation,
  type: 'unclearReading',
  properties: [{ name: 'reason', typeId: DataTypes.String }],
  relations: [{ relation: textAnnotationLink, direction: 'incoming', bounds: { lowerBound: 1, upperBound: -1 } }],
});
```

`reason` belongs only to `unclearReading`. The refined node inherits the shared `uuid`, `type` and `selector` fields.

## Add an image family

The same model can also have an ImageAnnotation node and a `damage` type:

```ts
const imageAnnotation: Node = media.createNode({ name: 'ImageAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
const imageAnnotationLink: Relation = media.hasAnnotation(image, imageAnnotation).element;

media.createAnnotationShape({
  node: imageAnnotation,
  type: 'damage',
  properties: [{ name: 'severity', typeId: DataTypes.String }],
  relations: [{ relation: imageAnnotationLink, direction: 'incoming', bounds: { lowerBound: 1, upperBound: -1 } }],
});
```

The imported Annotation node still carries the earlier `person` and `place` types. Both refined nodes inherit them, while `unclearReading` belongs to TextAnnotation and `damage` to ImageAnnotation. A later model level can refine either node again. [Refine by Inheritance](../rmf/inheritance.md) explains the general rule.
