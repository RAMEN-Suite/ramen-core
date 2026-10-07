---
route: ramen/model-changes
title: Track Changes
group: RAMEN
---

# Track Changes

Use {@link ramen.RamenModel.snapshot | snapshot()} before editing a RAMEN model and {@link ramen.RamenModel.compareTo | compareTo()} afterward. The report includes generic model changes and changes to annotation definitions. [Track Model Changes](../rmf/model-changes.md) explains the generic report.

## Compare an Edition model

Continue from the [Edition model](ramen.md#create-a-project-model). Save its current state, then add a `person` annotation type and a property on Letter:

```ts
import { DataTypes } from '@ramen-suite/core/model';
import type { Attribute } from '@ramen-suite/core/model';
import type { RamenAnnotation, RamenModel } from '@ramen-suite/core/ramen';

const before: RamenModel = edition.snapshot();

const personType: RamenAnnotation = edition.createAnnotation({
  node: RAMEN_ELEMENT.ANNOTATION,
  type: 'person',
  relations: [
    { relation: textAnnotation, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } },
    { relation: annotationPerson, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } },
  ],
}).element;

const title: Attribute = edition.createAttribute(letter, { name: 'title', typeId: DataTypes.String }).element;
```

Read the two kinds of changes separately:

```ts
import type { EvolutionChange } from '@ramen-suite/core/model';
import type { RamenAnnotationChange, RamenEvolutionReport } from '@ramen-suite/core/ramen';

const report: RamenEvolutionReport = before.compareTo(edition);
const titleChange: EvolutionChange | undefined = report.changes.find(
  (change: EvolutionChange): boolean => change.elementId === title.id,
);
const typeChange: RamenAnnotationChange | undefined = report.annotationChanges.find(
  (change: RamenAnnotationChange): boolean => change.annotationId === personType.id,
);

console.log(titleChange?.action); // 'added'
console.log(typeChange?.action); // 'added'
```

`changes` contains the RMF property change. `annotationChanges` contains the RAMEN type declaration, with its owning `modelId` and its `before` or `after` definition. The report also carries `beforeDiagnostics` and `afterDiagnostics` from validation. It describes model differences; it does not migrate recorded data.
