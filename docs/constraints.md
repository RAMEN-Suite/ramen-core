---
title: Writing Constraints
group: Guides
---

# Writing Constraints

An RMF model defines which data is allowed. A constraint adds a rule for its values, such as a title starting with a capital letter. {@link model.Modeller.validate | validate()} checks the model; {@link model.Modeller.validateInstances | validateInstances(data)} checks recorded values against it.

## Add a value rule

Recreate the [Filing example](rmf.md#create-a-model) with a rule on Document’s required title:

```ts
import { DataTypes, Modeller } from '@ramen-suite/core/model';
import type { Constraint, Node } from '@ramen-suite/core/model';

const model: Modeller = Modeller.create('Filing');
const document: Node = model.createNode('Document').element;
const rule: Constraint = {
  id: 'capitalTitleRule01',
  name: 'Capitalised title',
  language: 'regex',
  expression: '^[A-Z]',
};

model.createAttribute(document, {
  name: 'title',
  typeId: DataTypes.String,
  bounds: { lowerBound: 1, upperBound: 1 },
  constraints: [rule],
});
```

The rule now belongs to the `title` attribute. Check a data graph against the model:

```ts
import type { ModelInstanceGraph, ValidationResult } from '@ramen-suite/core/model';

const data: ModelInstanceGraph = {
  modelId: model.getModel().id,
  nodes: [{ id: 'documentRecord001', typeId: document.id, properties: { title: 'lowercase' } }],
  relations: [],
};
const result: ValidationResult = model.validateInstances(data);
console.log(result.diagnostics);
```

The lowercase title fails the rule. A tool must translate its own records into RMF's instance format before this check; see [Validation](validation.md).

## Built-in languages

| Language | Expression                                    | Checks               |
| -------- | --------------------------------------------- | -------------------- |
| `regex`  | Regular expression string                     | String value pattern |
| `format` | `uuid`, `date`, `date-time`, `email` or `uri` | String format        |

A constraint can also set `message`, `code` and `severity` (`error`, `warn` or `info`).

## Evaluate a custom language

Declare the language and expression in the model, just as with a built-in rule:

```ts
const prefixRule: Constraint = {
  id: 'documentPrefix01',
  name: 'Document prefix',
  language: 'prefix',
  expression: 'DOC-',
};
model.createAttribute(document, { name: 'reference', typeId: DataTypes.String, constraints: [prefixRule] });
```

The application implements `prefix` and registers its evaluator:

```ts
import { ConstraintRegistry, Diagnostics } from '@ramen-suite/core/model';
import type { ConstraintContext, ConstraintEvaluator, Diagnostic } from '@ramen-suite/core/model';

class PrefixEvaluator implements ConstraintEvaluator {
  public readonly language: string = 'prefix';

  public evaluate(constraint: Constraint, context: ConstraintContext): readonly Diagnostic[] {
    if (typeof constraint.expression !== 'string' || typeof context.value !== 'string') {
      return [Diagnostics.error({ code: 'PREFIX_INPUT_INVALID', message: 'Expected strings.', path: context.path })];
    }
    if (context.value.startsWith(constraint.expression)) return [];
    return [Diagnostics.error({ code: 'PREFIX_MISMATCH', message: 'Wrong prefix.', path: context.path })];
  }
}

const registry: ConstraintRegistry = ConstraintRegistry.createDefault();
registry.register(new PrefixEvaluator());
```

Pass the registry when checking recorded values. [Validation](validation.md) explains the data format and the check in more detail:

```ts
const customData: ModelInstanceGraph = {
  modelId: model.getModel().id,
  nodes: [{ id: 'documentRecord002', typeId: document.id, properties: { title: 'Example', reference: 'wrong' } }],
  relations: [],
};
const checked: ValidationResult = model.validateInstances(customData, registry);
console.log(checked.diagnostics);
```

The default registry keeps `regex` and `format` available. If a constraint names an unregistered language, validation reports a diagnostic. The evaluator runs in the application; its code is not stored in the model.
