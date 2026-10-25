---
route: rmf/validate-model
title: Validate a Model
group: RMF
---

# Validate a Model

{@link model.Modeller.validate | validate()} checks definitions in the selected model and its transitive imports. It checks the JSON structure, imports, references, inheritance and model rules. It does not check recorded objects.

## Check the whole model

This model defines a Document with a required title:

```ts
import { DataTypes, Modeller } from '@ramen-suite/core/model';
import type { Node, ProjectValidationResult } from '@ramen-suite/core/model';

const model: Modeller = Modeller.create('Filing');
const document: Node = model.createNode('Document').element;

model.createAttribute(document, {
  name: 'title',
  typeId: DataTypes.String,
  bounds: { lowerBound: 1, upperBound: 1 },
});

const result: ProjectValidationResult = model.validate();
console.log(result.valid, result.diagnostics);
```

When `result.valid` is `true`, `result.graph` contains the resolved model definitions and inherited features. It contains no recorded Documents. [Validate Recorded Data](validate-data.md) checks those later.

## Find a modelling error

An edit returns both its new `.element` and a `.validation` result. Here an attempted refinement creates an inheritance cycle:

```ts
import type { ModelChange } from '@ramen-suite/core/model';

const page: Node = model.createNode({ name: 'Page', refines: document }).element;
const change: ModelChange<Node> = model.updateNode(document.id, { superTypes: [page.id] });

console.log(change.validation.diagnostics);
// Includes INHERITANCE_CYCLE.
```

The invalid definition remains in the editable draft so a tool can show and repair it. The result has no safe project graph, and export requires a valid model. Remove the cycle, then check again:

```ts
model.updateNode(document.id, { superTypes: [] });
console.log(model.validate().valid); // true
```

## Show findings beside one node

{@link model.Modeller.validateNode | validateNode(document)} filters the complete model check to findings on that node, its ancestors and incident relationships. Project-wide findings, such as inheritance cycles, remain visible because they prevent a safe resolved graph. This helps an editor place a message beside a type:

```ts
import type { ValidationResult } from '@ramen-suite/core/model';

const nodeResult: ValidationResult = model.validateNode(document);
console.log(nodeResult.diagnostics);
```

Use `validate()` for the final model check. [Read Diagnostics](diagnostics.md) explains the returned codes and locations.
