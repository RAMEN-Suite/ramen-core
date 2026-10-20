---
route: ramen/suggest-annotations
title: Suggestions
group: RAMEN
---

# Suggestions

These queries help a tool offer annotation choices allowed by the current model. Continue from [Use Annotations](annotations.md): `person` works on Text and Image, while `place` works on Text. The [RMF Suggestions guide](../rmf/suggestions.md) covers generic nodes, data types and relationships.

## Suggest a type for a node

{@link ramen.RamenModel.suggestAnnotationsForNode | suggestAnnotationsForNode(node)} returns types that can be attached to the selected node:

```ts
import type { AnnotationSuggestion } from '@ramen-suite/core/ramen';
import type { Node } from '@ramen-suite/core/model';

function annotationChoices(node: Node): readonly AnnotationSuggestion[] {
  return media.suggestAnnotationsForNode(node);
}

console.log(annotationChoices(text).map((choice: AnnotationSuggestion): string => choice.type));
// ['person', 'place']
console.log(annotationChoices(image).map((choice: AnnotationSuggestion): string => choice.type));
// ['person']
```

An editor can call the function after the user selects a carrier. The different results come from the modelled relationships, not a type list hard-coded into the tool.

## List types on the Annotation node

{@link ramen.RamenModel.suggestAnnotations | suggestAnnotations(annotation)} lists types on an Annotation node without selecting a carrier:

```ts
import { RAMEN_ELEMENT } from '@ramen-suite/core/ramen';

const types: readonly AnnotationSuggestion[] = media.suggestAnnotations(RAMEN_ELEMENT.ANNOTATION);
console.log(types.map((choice: AnnotationSuggestion): string => choice.type));
// ['person', 'place']
```

## Suggest options for another type

{@link ramen.RamenModel.suggestAnnotationOptions | suggestAnnotationOptions(annotation)} shows the automatically shared node properties and modelled relationships available for a new annotation shape:

```ts
import type { AnnotationOptions, PropertyOption, RelationOption } from '@ramen-suite/core/ramen';

const options: AnnotationOptions | undefined = media.suggestAnnotationOptions(RAMEN_ELEMENT.ANNOTATION);
console.log(options?.properties.map((property: PropertyOption): string => property.name));
// []
console.log(options?.relations.map((relation: RelationOption): string => relation.targetName).sort());
// ['Image', 'Person', 'Place', 'Text']
```

`uuid`, `type` and the optional `selector` are common Annotation properties, so they are not offered as type-specific options. RAMEN declares `Selector` as an object-valued data type. Its `type` field names the selection method, and tools interpret the remaining fields. A new annotation type may also declare properties that belong only to that type.

## Read a selected type

After a user chooses `person`, {@link ramen.RamenModel.getRelationsForAnnotation | getRelationsForAnnotation(annotation, type)} shows its selected relationships and cardinalities. {@link ramen.RamenModel.getAttributesForAnnotation | getAttributesForAnnotation(annotation, type)} shows its automatically shared and shape-owned properties:

```ts
const relations: readonly RelationOption[] = media.getRelationsForAnnotation(RAMEN_ELEMENT.ANNOTATION, 'person');
const properties: readonly PropertyOption[] = media.getAttributesForAnnotation(RAMEN_ELEMENT.ANNOTATION, 'person');

console.log(relations.map((relation: RelationOption): string => `${relation.direction}: ${relation.targetName}`));
// ['incoming: Text', 'incoming: Image', 'outgoing: Person']
console.log(properties);
// []
```

The `person` type needs no extra properties here. If a project adds type-owned properties later, this query includes their names, data types and cardinalities. The generic {@link model.Modeller.getAttributes | getAttributes(annotation)} instead lists attributes of the shared Annotation node.
