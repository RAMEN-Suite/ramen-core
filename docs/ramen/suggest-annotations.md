---
route: ramen/suggest-annotations
title: Suggestions
group: RAMEN
---

# Suggestions

These queries help a tool offer annotation choices allowed by the current model. Continue from [Use Annotations](annotations.md): `person` works on Text and Image, while `place` works on Text. The [RMF Suggestions guide](../rmf/suggestions.md) covers generic nodes, data types and relationships.

## Suggest a type for a node

{@link ramen.RamenModel.suggestAnnotationShapesForNode | suggestAnnotationShapesForNode(node)} returns types that can be attached to the selected node:

```ts
import type { AnnotationShapeSuggestion } from '@ramen-suite/core/ramen';
import type { Node } from '@ramen-suite/core/model';

function annotationChoices(node: Node): readonly AnnotationShapeSuggestion[] {
  return media.suggestAnnotationShapesForNode(node);
}

console.log(annotationChoices(text).map((choice: AnnotationShapeSuggestion): string => choice.type));
// ['person', 'place']
console.log(annotationChoices(image).map((choice: AnnotationShapeSuggestion): string => choice.type));
// ['person']
```

An editor can call the function after the user selects a carrier. The different results come from the modelled relationships, not a type list hard-coded into the tool.

## List types on the Annotation node

{@link ramen.RamenModel.suggestAnnotationShapes | suggestAnnotationShapes(annotation)} lists types on an Annotation node without selecting a carrier:

```ts
import { RAMEN_ELEMENT } from '@ramen-suite/core/ramen';

const types: readonly AnnotationShapeSuggestion[] = media.suggestAnnotationShapes(RAMEN_ELEMENT.ANNOTATION);
console.log(types.map((choice: AnnotationShapeSuggestion): string => choice.type));
// ['person', 'place']
```

## Suggest options for another type

{@link ramen.RamenModel.suggestAnnotationShapeOptions | suggestAnnotationShapeOptions(annotation)} shows the automatically shared node properties and modelled relationships available for a new annotation shape:

```ts
import type { AnnotationShapeOptions, PropertyOption, RelationOption } from '@ramen-suite/core/ramen';

const options: AnnotationShapeOptions | undefined = media.suggestAnnotationShapeOptions(RAMEN_ELEMENT.ANNOTATION);
console.log(options?.properties.map((property: PropertyOption): string => property.name));
// ['selector', 'type', 'uuid']
console.log(options?.relations.map((relation: RelationOption): string => relation.targetName).sort());
// ['Image', 'Person', 'Place', 'Text']
```

`uuid`, `type` and the optional `selector` are common Annotation properties. They appear in the options automatically and must not be redeclared on the shape. RAMEN declares `Selector` as an object-valued data type. Its `type` field names the selection method, and tools interpret the remaining fields. A new annotation shape may also declare properties that belong only to that type.

## Read a selected type

After a user chooses `person`, {@link ramen.RamenModel.getRelationsForAnnotationShape | getRelationsForAnnotationShape(annotation, type)} shows its selected relationships and cardinalities. {@link ramen.RamenModel.getPropertiesForAnnotationShape | getPropertiesForAnnotationShape(annotation, type)} shows its automatically shared and shape-owned properties:

```ts
const relations: readonly RelationOption[] = media.getRelationsForAnnotationShape(RAMEN_ELEMENT.ANNOTATION, 'person');
const properties: readonly PropertyOption[] = media.getPropertiesForAnnotationShape(RAMEN_ELEMENT.ANNOTATION, 'person');

console.log(relations.map((relation: RelationOption): string => `${relation.direction}: ${relation.targetName}`));
// ['incoming: Text', 'incoming: Image', 'outgoing: Person']
console.log(properties.map((property: PropertyOption): string => property.name));
// ['selector', 'type', 'uuid']
```

The `person` type needs no extra properties here, so the result contains only shared properties. If a project adds type-owned properties later, this query includes those as well. The generic {@link model.Modeller.getAttributes | getAttributes(annotation)} instead lists attributes of the shared Annotation node.
