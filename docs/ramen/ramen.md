---
route: ramen/overview
title: Model with RAMEN
group: RAMEN
children:
  - data-types.md
  - annotations.md
  - validation.md
  - export.md
  - model-changes.md
---

# Model with RAMEN

RAMEN is a ready-made [RMF](../rmf/rmf.md) model. A project model starts from RAMEN and chooses the types and relationships its tools may use. This page builds an **Edition data model**, not individual records.
The [RAMEN Model example](../examples/correspondence-edition.md) shows a complete correspondence edition.

## What RAMEN provides

The {@link ramen.RAMEN_MODEL | reference model} has four node types:

| RAMEN type   | Example project type |
| ------------ | -------------------- |
| `Collection` | Letter               |
| `Content`    | Text                 |
| `Entity`     | Person, Place        |
| `Annotation` | Annotation           |

It offers `PART_OF`, `HAS_ANNOTATION` and `REFERS_TO` relationships. `REFERS_TO` connects Annotation to Collection, Content or Entity, including their refinements. Every node has a required `uuid`. Collection and Entity also have `label`. Annotation has `type` and an optional `selector`.

## Create a project model

{@link ramen.RamenModel.create | RamenModel.create()} starts an Edition model with RAMEN as its base. Define project types by refining its nodes:

```ts
import type { Node } from '@ramen-suite/core/model';
import { RAMEN_ELEMENT, RamenModel } from '@ramen-suite/core/ramen';

const edition: RamenModel = RamenModel.create('Edition');

const letter: Node = edition.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
const text: Node = edition.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
const person: Node = edition.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;
const place: Node = edition.createNode({ name: 'Place', refines: RAMEN_ELEMENT.ENTITY }).element;
```

Letter, Person and Place inherit `uuid` and `label`. Text inherits `uuid`. This project uses the imported Annotation node directly; refining that node is optional.

Use [RMF properties](../rmf/properties.md) to add fields such as a letter's date. [RAMEN data types](data-types.md) include Date, DateTime and URI.

## Allow relationships

Creating nodes does not apply RAMEN's relationships to the project. Choose the ones Edition needs:

```ts
import type { Relation } from '@ramen-suite/core/model';

const textInLetter: Relation = edition.partOf(text, letter).element;
const textAnnotation: Relation = edition.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION).element;
const annotationPerson: Relation = edition.refersTo(RAMEN_ELEMENT.ANNOTATION, person).element;
const annotationPlace: Relation = edition.refersTo(RAMEN_ELEMENT.ANNOTATION, place).element;
```

{@link ramen.RamenModel.partOf | partOf()}, {@link ramen.RamenModel.hasAnnotation | hasAnnotation()} and {@link ramen.RamenModel.refersTo | refersTo()} create **allowed relationship definitions**. They do not connect recorded Text or Person objects. [Annotation shapes](annotations.md) can choose among these definitions.

For a relationship with different bounds or other RMF options, use {@link model.Modeller.createRelation | createRelation()}. [Add Relationships](../rmf/relationships.md) explains its options.

## Check the model

{@link ramen.RamenModel.validate | validate()} checks the definitions before tools use them:

```ts
import type { ProjectValidationResult } from '@ramen-suite/core/model';

const result: ProjectValidationResult = edition.validate();
if (!result.valid) {
  console.log(result.diagnostics);
}
```

Edition is valid without annotation shapes, but a tool cannot record an annotation until the project [declares its type](annotations.md). Continue with [validation](validation.md) when you have recorded data, then [export](export.md) the model for tools. [Track Changes](model-changes.md) compares model revisions.
