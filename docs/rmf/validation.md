---
title: Validate Models and Data
group: RMF
---

# Validate Models and Data

Validation answers two questions: Is the **model** well formed, and do **recorded values** follow that model? It checks structure and the rules expressed by the model, including inheritance, permitted relationships and cardinalities. Both checks return [diagnostics](diagnostics.md) on problems.

## Check a model

{@link model.Modeller.validate | validate()} checks the model's JSON structure, imports, references, inheritance and rules. It needs the complete model and its imported levels.

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

const modelResult: ProjectValidationResult = model.validate();
if (!modelResult.valid) console.log(modelResult.diagnostics);
```

A valid result exposes `modelResult.graph`. This is the **model graph**: it resolves types, imports and inherited features. It contains no recorded Documents. See the [RMF guide](rmf.md) to build and refine a model.

## Check recorded data

{@link model.Modeller.validateInstances | validateInstances(data)} checks a **complete data graph** against the model. The model cannot supply this graph because it does not contain the records collected by a tool. The small graph below is one record written out to show the input format; its Document lacks the required `title`:

```ts
import type { ModelInstanceGraph, ValidationResult } from '@ramen-suite/core/model';

const data: ModelInstanceGraph = {
  nodes: [{ id: 'documentRecord001', typeId: document.id, properties: {} }],
  relations: [],
};
const dataResult: ValidationResult = model.validateInstances(data);
console.log(dataResult.diagnostics);
```

The model being validated supplies the context. `typeId` selects a node type in that model, while each record's `id` identifies a data node.

The validator checks declared properties, values, relations, endpoints, cardinalities and [constraints](constraints.md). A missing `title` produces a diagnostic whose path points to the first record's `title`. See [Read Diagnostics](diagnostics.md) for the path format and record lookup.

Pass the full graph, including its relations. In an application, an adapter builds this graph from stored records before calling `validateInstances()`. This package does not read a database or translate tool-specific data.

## What validation cannot establish

A valid result does not prove that a recorded statement is factually correct. Domain rules must be expressed in the model or supplied by a registered [constraint evaluator](constraints.md#validate-an-object-value). Translating stored data remains the tool's responsibility.

Applications can register their own constraint evaluators for domain rules. The structural validator used by `Modeller` cannot be replaced through this class.
