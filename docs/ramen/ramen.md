---
title: Model with RAMEN
group: RAMEN
---

# Model with RAMEN

RAMEN is a reference model built with the [RAMEN Model Format](../rmf/rmf.md). This guide creates an Edition **data model**: it defines what tools may record, not individual letters or people.
The [Glossary](../glossary.md) distinguishes the reference model, project models, annotation nodes and annotation types.

## Start from the reference model

The {@link ramen.RAMEN_MODEL | RAMEN reference model} provides four node types:

| RAMEN type   | Example project type |
| ------------ | -------------------- |
| `Collection` | Letter               |
| `Entity`     | Person, Place        |
| `Content`    | Text                 |
| `Annotation` | TextAnnotation       |

It also offers three relationship families:

| Relationship     | Example             |
| ---------------- | ------------------- |
| `PART_OF`        | Text → Letter       |
| `HAS_ANNOTATION` | Text → Annotation   |
| `REFERS_TO`      | Annotation → Person |

The project chooses which of these to use. RAMEN permits `0..*` at both ends; a project may narrow that. Every node has a required `uuid`; Collection and Entity also have a `label`. Annotation has a `type` and an optional `selector` ([details](annotations.md)).

## Create an Edition model

{@link ramen.RamenModel.create | RamenModel.create()} imports RAMEN for the new project model:

```ts
import type { Node } from '@ramen-suite/core/model';
import { RAMEN_ELEMENT, RamenModel } from '@ramen-suite/core/ramen';

const edition: RamenModel = RamenModel.create('Edition');
```

Refine three RAMEN types to define Letter, Text, Person and Place:

```ts
const letter: Node = edition.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
const text: Node = edition.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
const person: Node = edition.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;
const place: Node = edition.createNode({ name: 'Place', refines: RAMEN_ELEMENT.ENTITY }).element;
```

Letter, Person and Place inherit `uuid` and `label`; Text inherits `uuid`. This model reuses `RAMEN_ELEMENT.ANNOTATION` unchanged. It could [refine Annotation](annotations.md#refine-the-annotation-node-when-needed) too.

For attributes, use [Add Properties](../rmf/properties.md). [Use RAMEN Data Types](data-types.md) shows the reference model's Date, DateTime, URI and other reusable types; [Add Data Types](../rmf/data-types.md) explains how to create your own.

## Choose relationships

Apply `PART_OF` to allow Text inside Letter:

```ts
import type { Relation } from '@ramen-suite/core/model';

const textInLetter: Relation = edition.partOf(text, letter).element;
```

Allow Text annotations that can refer to Person or Place:

```ts
const textAnnotation: Relation = edition.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION).element;
const annotationPerson: Relation = edition.refersTo(RAMEN_ELEMENT.ANNOTATION, person).element;
const annotationPlace: Relation = edition.refersTo(RAMEN_ELEMENT.ANNOTATION, place).element;
```

These methods create **permitted relationship definitions**, not links between recorded data. An annotation type can later select `textAnnotation`, `annotationPerson` or `annotationPlace` ([example](annotations.md#declare-a-type)).

The generic API is an alternative. **Instead of** {@link ramen.RamenModel.partOf | partOf(text, letter)}, use:

```ts
edition.createRelation({ from: { node: text }, to: { node: letter } });
```

It infers `PART_OF` when only one relationship fits. For multiple matches, use [relationship suggestions](../rmf/suggestions.md#choose-a-relationship).

## Check the model

Check the finished model with {@link ramen.RamenModel.validate | validate()}:

```ts
import type { ProjectValidationResult } from '@ramen-suite/core/model';

const result: ProjectValidationResult = edition.validate();
if (!result.valid) console.log(result.diagnostics);
```

Edition can be valid without annotation types. Before recording annotations, [declare their types](annotations.md). See [Validate RAMEN Data](validation.md) for data checks and [RAMEN Diagnostics](diagnostics.md) for error codes.
