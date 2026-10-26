---
route: ramen/annotations
title: Use Annotations
group: RAMEN
children:
  - constrain-annotations.md
  - selectors.md
  - refine-annotations.md
  - suggest-annotations.md
---

# Use Annotations

An **Annotation node** contains fields shared by annotations. An **annotation shape** adds its own properties and defines permitted relationships for one kind of annotation, such as `person`. RAMEN has no fixed type list: each project declares the types it uses.

Names may come from a vocabulary such as [TEI's persName](https://tei-c.org/release/doc/tei-p5-doc/en/html/ref-persName.html), but the project defines the rules behind each name. Recorded annotations with undeclared types, properties or links fail validation.

## Allow the connections

Use the imported Annotation node for both Text and Image. Create their types:

```ts
import type { Node, Relation } from '@ramen-suite/core/model';
import { RAMEN_ELEMENT, RamenModel } from '@ramen-suite/core/ramen';

const media: RamenModel = RamenModel.create('Media');

const text: Node = media.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
const image: Node = media.createNode({ name: 'Image', refines: RAMEN_ELEMENT.CONTENT }).element;
const person: Node = media.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;
const place: Node = media.createNode({ name: 'Place', refines: RAMEN_ELEMENT.ENTITY }).element;
```

Then apply the relationships this project permits:

```ts
const textLink: Relation = media.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION).element;
const imageLink: Relation = media.hasAnnotation(image, RAMEN_ELEMENT.ANNOTATION).element;
const personLink: Relation = media.refersTo(RAMEN_ELEMENT.ANNOTATION, person).element;
const placeLink: Relation = media.refersTo(RAMEN_ELEMENT.ANNOTATION, place).element;
```

Text and Image each have a `HAS_ANNOTATION` definition. Annotation can refer to Person or Place. These definitions do not yet say which annotation shape may use them.

## Declare `person`

Declare `person` with **at least one** Text or Image attachment and exactly one Person reference:

```ts
import type { AnnotationShape } from '@ramen-suite/core/ramen';

const personType: AnnotationShape = media.createAnnotationShape({
  nodeId: RAMEN_ELEMENT.ANNOTATION,
  type: 'person',
  relations: [
    { relations: [textLink, imageLink], direction: 'incoming', bounds: { lowerBound: 1, upperBound: -1 } },
    { relation: personLink, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } },
  ],
}).element;
```

The grouped `relations` count Text and Image attachments **together**. At least one is required. The other rule requires exactly one Person link. Person's `label` holds the name, so this annotation needs no extra property.

`person` selects existing relationship definitions. It does not create another node or relationship. The same Annotation node can serve other types with different rules.

For example, `place` can require a Text attachment and one Place reference:

```ts
media.createAnnotationShape({
  nodeId: RAMEN_ELEMENT.ANNOTATION,
  type: 'place',
  relations: [
    { relation: textLink, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } },
    { relation: placeLink, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } },
  ],
});
```

Neither type permits a link to the other entity. Tools can [suggest which types](suggest-annotations.md) fit a selected Text or Image.

{@link ramen.RamenModel.getAnnotationShapes | getAnnotationShapes()} lists declarations made on this project level. Use {@link ramen.RamenModel.updateAnnotationShape | updateAnnotationShape()} or {@link ramen.RamenModel.removeAnnotationShape | removeAnnotationShape()} with the declaration's ID, such as `personType.id`, to change or remove one.

Next, [Add Properties](constrain-annotations.md) adds a type-owned property. [Use Selectors](selectors.md) shows how a recorded annotation can point to part of Text or Image. [Refine Nodes](refine-annotations.md) separates node families when a project needs that distinction. [Suggestions](suggest-annotations.md) shows the choices a tool can offer.

## Tool metadata

Annotation shapes accept an optional `ext` object for tool-specific definitions, for example `ext: { "org.example.editor": { widget: "textarea" } }`. Core preserves this metadata through editing and exchange without interpreting it.
