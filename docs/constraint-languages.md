---
route: rmf/constraint-languages
title: Constraint Languages
group: RMF
---

# Constraint Languages

A constraint declares a rule in the model. Its `language` chooses how to read `expression`. RMF includes three languages:

| Language      | Expression            | Use                                      |
| ------------- | --------------------- | ---------------------------------------- |
| `regex`       | Regular expression    | Match a string pattern                   |
| `format`      | Supported format name | Check a date, URI, email address or UUID |
| `json-schema` | JSON Schema object    | Check a value, including an `Object`     |

These rules check recorded values. The model's `baseType` or property's `typeId` still decides the value type. RMF checks that type before evaluating its constraints. [Add Constraints](rmf/constraints.md) shows where to attach rules, and [Validate Models and Data](rmf/validation.md) shows how to run them.

Model validation also checks built-in expressions: regular expressions must compile, format names must be supported, and JSON Schema expressions must be valid. Custom language declarations remain available for tools to evaluate.

## Regular expressions

Use `regex` for a string pattern. This rule accepts identifiers beginning with `P-`:

```ts
const code = model.createDataType({
  name: 'PersonCode',
  baseType: DataTypes.String,
  constraints: [{ id: 'personCodeRule01', name: 'Person code', language: 'regex', expression: '^P-[0-9]+$' }],
}).element;
```

`regex` uses a JavaScript regular expression. Anchor it with `^` and `$` when the entire string must match.

## Formats

Use `format` for `uuid`, `date`, `date-time`, `email` or `uri`. A URI must be absolute:

```ts
const website = model.createDataType({
  name: 'WebsiteURL',
  baseType: DataTypes.String,
  constraints: [{ id: 'websiteFormat001', name: 'Website URI', language: 'format', expression: 'uri' }],
}).element;
```

`format` remains separate from `json-schema`. A `format` keyword inside a JSON Schema expression is treated as an annotation and does not check the value. Add a `format` constraint when validation is required.

## JSON Schema values

Use `json-schema` for standard value rules. The expression is a JSON Schema object interpreted with Draft 2020-12. You may omit its top-level `type`: RMF already checks the declared base type. Nested object fields need their own types where relevant. [JSON Schema's reference](https://json-schema.org/understanding-json-schema/reference) describes the available keywords.

Start with a model and one node type:

```ts
import { DataTypes, Modeller } from '@ramen-suite/core/model';
import type { Node } from '@ramen-suite/core/model';

const model: Modeller = Modeller.create('People');
const person: Node = model.createNode('Person').element;
```

### String

Limit a name to 2–80 characters:

```ts
const name = model.createDataType({
  name: 'PersonName',
  baseType: DataTypes.String,
  constraints: [
    {
      id: 'personNameRule01',
      name: 'Name length',
      language: 'json-schema',
      expression: { minLength: 2, maxLength: 80 },
    },
  ],
}).element;

model.createAttribute(person, { name: 'name', type: name });
```

Use `regex` for a pattern on its own and RMF literals for named choices. Within one JSON Schema rule, `pattern` or `enum` can be combined with other conditions such as `minLength`.

### Boolean

Restrict a Boolean to `true` when a flag must be set:

```ts
const confirmed = model.createDataType({
  name: 'Confirmed',
  baseType: DataTypes.Boolean,
  constraints: [{ id: 'confirmedRule001', name: 'Confirmed', language: 'json-schema', expression: { const: true } }],
}).element;
```

Most Boolean properties need no constraint: `DataTypes.Boolean` already accepts only `true` or `false`.

### Integer and Float

Use numeric keywords for ranges. `Integer` rejects fractions before constraints run, while `Float` accepts finite whole and fractional numbers:

```ts
const age = model.createDataType({
  name: 'AdultAge',
  baseType: DataTypes.Integer,
  constraints: [{ id: 'adultAgeRule0001', name: 'Adult age', language: 'json-schema', expression: { minimum: 18 } }],
}).element;

const score = model.createDataType({
  name: 'Score',
  baseType: DataTypes.Float,
  constraints: [{ id: 'scoreRangeRule01', name: 'Score range', language: 'json-schema', expression: { minimum: 0, maximum: 1 } }],
}).element;
```

### Object

`DataTypes.Object` accepts a JSON object. JSON Schema can define its internal fields without turning them into RMF nodes:

```ts
const contact = model.createDataType({
  name: 'Contact',
  baseType: DataTypes.Object,
  constraints: [
    {
      id: 'contactRule00001',
      name: 'Contact fields',
      language: 'json-schema',
      expression: {
        properties: { city: { type: 'string', minLength: 2 }, postcode: { type: 'string' } },
        required: ['city'],
        additionalProperties: false,
      },
    },
  ],
}).element;

model.createAttribute(person, { name: 'contact', type: contact });
```

Here `city` and `postcode` belong to the stored Object value. Use RMF nodes and relationships when those parts need independent IDs, inheritance or links.

JSON Schema expressions may use local `$defs` and `$ref`, but they must be self-contained. Unresolved external references make the model invalid. Model validation reports a schema the evaluator cannot compile as `CONSTRAINT_EXPRESSION_INVALID`. A recorded value that fails a valid schema produces `CONSTRAINT_JSON_SCHEMA_MISMATCH`. [Read Diagnostics](rmf/diagnostics.md) explains these findings.

## Custom languages

For a rule that needs other recorded nodes or relationships, register a {@link model.ConstraintEvaluator | ConstraintEvaluator} with {@link model.ConstraintRegistry | ConstraintRegistry}. Its code lives in the validating tool, so every tool that checks that language needs the same implementation. [Add Constraints](rmf/constraints.md#register-a-custom-evaluator) shows the extension point.
