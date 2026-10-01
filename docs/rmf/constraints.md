---
title: Writing Constraints
group: RMF
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
  nodes: [{ id: 'documentRecord001', typeId: document.id, properties: { title: 'lowercase' } }],
  relations: [],
};
const result: ValidationResult = model.validateInstances(data);
console.log(result.diagnostics);
```

The lowercase title fails the rule. A tool must translate its own records into RMF's instance format before this; see [Validate Models and Data](validation.md).

## Built-in languages

| Language | Expression                                    | Checks               |
| -------- | --------------------------------------------- | -------------------- |
| `regex`  | Regular expression string                     | String value pattern |
| `format` | `uuid`, `date`, `date-time`, `email` or `uri` | String format        |

A constraint can also set `message`, `code` and `severity` (`error`, `warn` or `info`).

## Validate an object value

`Object` checks only that a value is a JSON object. Give it a named {@link model.DataType | data type} and a constraint when its inner fields need a rule. This Region requires `start` to be smaller than `end`:

```ts
import type { DataType } from '@ramen-suite/core/model';

const regionRule: Constraint = {
  id: 'regionOrderRule01',
  name: 'Region order',
  language: 'example:region-order',
  expression: {},
};
const region: DataType = model.createDataType({
  name: 'Region',
  baseType: DataTypes.Object,
  constraints: [regionRule],
}).element;

model.createAttribute(document, { name: 'region', type: region });
```

The model stores the rule, while the application supplies its evaluator. Register it before validating data:

```ts
import { ConstraintRegistry, Diagnostics } from '@ramen-suite/core/model';
import type { ConstraintContext, ConstraintEvaluator, Diagnostic } from '@ramen-suite/core/model';

class RegionEvaluator implements ConstraintEvaluator {
  public readonly language: string = 'example:region-order';

  public evaluate(_constraint: Constraint, context: ConstraintContext): readonly Diagnostic[] {
    const value: unknown = context.value;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];

    const fields: Record<string, unknown> = value as Record<string, unknown>;
    if (typeof fields.start === 'number' && typeof fields.end === 'number' && fields.start < fields.end) return [];
    return [Diagnostics.error({ code: 'REGION_ORDER_INVALID', message: 'Invalid region.', path: context.path })];
  }
}

const registry: ConstraintRegistry = ConstraintRegistry.createDefault();
registry.register(new RegionEvaluator());

const regionData: ModelInstanceGraph = {
  nodes: [{ id: 'documentRecord002', typeId: document.id, properties: { title: 'Example', region: { start: 8, end: 2 } } }],
  relations: [],
};
const checked: ValidationResult = model.validateInstances(regionData, registry);
console.log(checked.diagnostics);
```

The result reports `REGION_ORDER_INVALID`. If a rule names an unregistered language, validation reports that as a diagnostic. The evaluator's code stays in the application; the model stores only the language and expression.
