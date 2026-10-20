---
route: examples/correspondence-edition
title: RAMEN Model
group: Examples
---

# RAMEN Model

An edition defines its vocabulary on top of RAMEN. This model has letters with witnesses and text, plus persons and places mentioned in the text:

```ts
import { DataTypes, RAMEN_ELEMENT, RamenModel } from '@ramen-suite/core';
import type { AnnotationShapeRelationInput, DataType, Node, Relation } from '@ramen-suite/core';

const edition: RamenModel = RamenModel.create('Correspondence edition');
const letter: Node = edition.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
const witness: Node = edition.createNode({ name: 'Witness', refines: RAMEN_ELEMENT.COLLECTION }).element;
const text: Node = edition.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
const person: Node = edition.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;
const place: Node = edition.createNode({ name: 'Place', refines: RAMEN_ELEMENT.ENTITY }).element;

edition.createAttribute(letter, { name: 'sentOn', typeId: RAMEN_ELEMENT.DATE });
edition.partOf(witness, letter);
edition.partOf(text, witness);

const carrier: Relation = edition.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION).element;
const personLink: Relation = edition.refersTo(RAMEN_ELEMENT.ANNOTATION, person).element;
const placeLink: Relation = edition.refersTo(RAMEN_ELEMENT.ANNOTATION, place).element;
```

The imported Annotation node can be used without refining it. Each annotation shape selects its own allowed properties and relationships:

```ts
const onText: AnnotationShapeRelationInput = {
  relation: carrier,
  direction: 'incoming',
  bounds: { lowerBound: 1, upperBound: 1 },
};
const toPerson: AnnotationShapeRelationInput = {
  relation: personLink,
  direction: 'outgoing',
  bounds: { lowerBound: 1, upperBound: 1 },
};
const toPlace: AnnotationShapeRelationInput = {
  relation: placeLink,
  direction: 'outgoing',
  bounds: { lowerBound: 1, upperBound: 1 },
};

edition.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'persName', relations: [onText, toPerson] });
edition.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'placeName', relations: [onText, toPlace] });
edition.createAnnotationShape({
  nodeId: RAMEN_ELEMENT.ANNOTATION,
  type: 'date',
  properties: [{ name: 'when', typeId: RAMEN_ELEMENT.DATE, bounds: { lowerBound: 1, upperBound: 1 } }],
  relations: [onText],
});
edition.createAnnotationShape({
  nodeId: RAMEN_ELEMENT.ANNOTATION,
  type: 'hi',
  properties: [{ name: 'rendition', typeId: DataTypes.String }],
  relations: [onText],
});
edition.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'note', relations: [onText] });
```

A separate `role` annotation uses a custom data type with fixed values:

```ts
const roleName: DataType = edition.createDataType({ name: 'RoleName', baseType: DataTypes.String }).element;
edition.createLiteral(roleName.id, { name: 'Sender', literal: 'sender' });
edition.createLiteral(roleName.id, { name: 'Recipient', literal: 'recipient' });

edition.createAnnotationShape({
  nodeId: RAMEN_ELEMENT.ANNOTATION,
  type: 'role',
  properties: [{ name: 'name', type: roleName, bounds: { lowerBound: 1, upperBound: 1 } }],
  relations: [onText, toPerson],
});
```

An additional level can specialise Person while continuing to use the existing Letter, Witness, Text, Place and Annotation shapes:

```ts
const research: RamenModel = edition.createNextLevel('Research edition');
const correspondent: Node = research.createNode({ name: 'Correspondent', refines: person }).element;

research.partOf(witness, letter);
research.partOf(text, witness);
research.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION);
research.refersTo(RAMEN_ELEMENT.ANNOTATION, place);
research.refersTo(RAMEN_ELEMENT.ANNOTATION, correspondent);
```

Every level chooses its permitted relationships again. The six annotation definitions remain available without being declared again. See [Use Annotations](../ramen/annotations.md) for their rules.
