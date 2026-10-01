---
title: Annotation Suggestions
group: RAMEN
---

# Annotation Suggestions

These queries help an editor offer only annotation choices allowed by the current RAMEN model. The [RMF Suggestions guide](../rmf/suggestions.md) covers generic nodes, data types and relationships.

## Example model

This small model uses the imported Annotation node without refining it. A `person` annotation may be attached to Text or Image and refers to a Person. The two carrier relationships count together: each annotation needs exactly one carrier.

```ts
import type { Node, Relation } from '@ramen-suite/core/model';
import { RAMEN_ELEMENT, RamenModel } from '@ramen-suite/core/ramen';

const edition: RamenModel = RamenModel.create('Edition');
const text: Node = edition.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
const image: Node = edition.createNode({ name: 'Image', refines: RAMEN_ELEMENT.CONTENT }).element;
const person: Node = edition.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;

const textLink: Relation = edition.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION).element;
const imageLink: Relation = edition.hasAnnotation(image, RAMEN_ELEMENT.ANNOTATION).element;
const personLink: Relation = edition.refersTo(RAMEN_ELEMENT.ANNOTATION, person).element;

edition.createAnnotation({
  nodeId: RAMEN_ELEMENT.ANNOTATION,
  type: 'person',
  relations: [
    {
      relation: textLink,
      alternatives: [imageLink.id],
      direction: 'incoming',
      bounds: { lowerBound: 1, upperBound: 1 },
    },
    { relation: personLink, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } },
  ],
});
```

Text and Image are separate Content refinements. Their `HAS_ANNOTATION` relationships both target the same imported Annotation node. The annotation type selects those relationships and the reference to Person.

## Suggest a type for a node

{@link ramen.RamenModel.suggestAnnotationsForNode | suggestAnnotationsForNode(node)} returns types that can be attached to the selected node:

```ts
import type { AnnotationSuggestion } from '@ramen-suite/core/ramen';

function annotationChoices(node: Node): readonly AnnotationSuggestion[] {
  return edition.suggestAnnotationsForNode(node);
}

console.log(annotationChoices(text).map((choice: AnnotationSuggestion): string => choice.type));
// ['person']
console.log(annotationChoices(image).map((choice: AnnotationSuggestion): string => choice.type));
// ['person']
```

An editor can call the same function when a user selects Text or Image. The result follows the modelled relationships; the tool does not need a hard-coded list of annotation types for each carrier.

## List types on the Annotation node

{@link ramen.RamenModel.suggestAnnotations | suggestAnnotations(annotation)} lists types on an Annotation node without selecting a carrier:

```ts
const types: readonly AnnotationSuggestion[] = edition.suggestAnnotations(RAMEN_ELEMENT.ANNOTATION);
console.log(types.map((choice: AnnotationSuggestion): string => choice.type));
// ['person']
```

## Suggest options for another type

{@link ramen.RamenModel.suggestAnnotationOptions | suggestAnnotationOptions(annotation)} shows shared node properties and modelled relationships that a new annotation type could select:

```ts
import type { AnnotationOptions, PropertyOption, RelationOption } from '@ramen-suite/core/ramen';

const options: AnnotationOptions | undefined = edition.suggestAnnotationOptions(RAMEN_ELEMENT.ANNOTATION);
console.log(options?.properties.map((property: PropertyOption): string => property.name));
// []
console.log(options?.relations.map((relation: RelationOption): string => relation.targetName).sort());
// ['Image', 'Person', 'Text']
```

`uuid`, `type` and the optional `selector` are common Annotation properties, so they are not offered as type-specific options. RAMEN declares `Selector` as an object-valued data type. Its `type` field names the selection method; tools interpret the remaining fields. A new annotation type may also declare its own properties; those are created with the type and are not shared with other types.

## Read a selected type

After a user chooses `person`, {@link ramen.RamenModel.getRelationsForAnnotation | getRelationsForAnnotation(annotation, type)} shows its selected relationships and cardinalities. {@link ramen.RamenModel.getAttributesForAnnotation | getAttributesForAnnotation(annotation, type)} shows its selected or type-owned properties:

```ts
const relations: readonly RelationOption[] = edition.getRelationsForAnnotation(RAMEN_ELEMENT.ANNOTATION, 'person');
const properties: readonly PropertyOption[] = edition.getAttributesForAnnotation(RAMEN_ELEMENT.ANNOTATION, 'person');

console.log(relations.map((relation: RelationOption): string => `${relation.direction}: ${relation.targetName}`));
// ['incoming: Text', 'incoming: Image', 'outgoing: Person']
console.log(properties);
// []
```

The `person` type needs no extra properties here. If a project adds type-owned properties later, this query includes their names, data types and cardinalities. The generic `getAttributes(annotation)` instead lists attributes of the shared Annotation node.
