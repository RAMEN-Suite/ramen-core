---
title: Constraints
group: Guides
---

# Constraints

Constraints add rules for **captured values** to an RMF model. Model validation checks the definitions; {@link model.Modeller.validateInstances | validateInstances()} evaluates the rules against a data graph.

## Add a value rule

This example requires a Document title to start with a capital letter:

```ts
import { DataTypes, Modeller } from '@ramen-suite/core/model';
import type { Attribute, Constraint, ModelInstanceGraph, Node, ValidationResult } from '@ramen-suite/core/model';

const model: Modeller = Modeller.create('Documents');
const document: Node = model.createNode('Document').element;
const title: Attribute = model.createAttribute(document, { name: 'title', typeId: DataTypes.String }).element;
const rule: Constraint = {
  id: 'capitalTitleRule01',
  name: 'Capitalised title',
  language: 'regex',
  expression: '^[A-Z]',
};

model.updateAttribute(document.id, title.id, { constraints: [rule] });

const data: ModelInstanceGraph = {
  modelId: model.getModel().id,
  nodes: [{ id: 'documentRecord001', typeId: document.id, properties: { title: 'lowercase' } }],
  relations: [],
};
const result: ValidationResult = model.validateInstances(data);
console.log(result.diagnostics);
```

The rule is stored on the attribute. The data graph uses RMF's instance format; a tool must translate its own records into this format before validation. See [Validation](validation.md).

## Built-in languages

| Language | Expression                                    | Checks               |
| -------- | --------------------------------------------- | -------------------- |
| `regex`  | Regular expression string                     | String value pattern |
| `format` | `uuid`, `date`, `date-time`, `email` or `uri` | String format        |

A constraint can also set `message`, `code` and `severity` (`error`, `warn` or `info`). An unregistered language produces a diagnostic. Tools can register their own {@link model.ConstraintEvaluator | ConstraintEvaluator} through {@link model.ConstraintRegistry | ConstraintRegistry} and pass the registry to `validateInstances()`.
