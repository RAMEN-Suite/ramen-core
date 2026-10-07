---
title: Add Constraints
group: RMF
---

# Add Constraints

A constraint is a rule attached to a model element. Choose the owner by the value the rule must inspect. [Constraint Languages](../constraint-languages.md) explains the built-in expressions.

| Owner                 | Value checked                                                        | Built-in languages that fit the value                            | Typical use                                              |
| --------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| Data type             | One value of its `baseType`                                          | `regex` and `format` for String, `json-schema` for any base type | Reusable value rule                                      |
| Property              | One value of that property                                           | Same as its data type                                            | Rule for one field                                       |
| Node                  | All recorded properties of one node                                  | `json-schema`                                                    | Condition between properties                             |
| Relation              | One recorded link (`id`, `typeId`, `fromId`, `toId`)                 | `json-schema`                                                    | Rarely useful because custom graph rules are more common |
| Source or target node | The complete recorded node at `from` or `to`, including `properties` | `json-schema`                                                    | Condition that applies when this link exists             |
| Literal               | Its fixed value, only when that literal is selected                  | Same as its data type                                            | Usually redundant unless a custom rule is needed         |

`regex` and `format` require a string value. A JSON Schema on a node should express a condition **between** properties, rather than repeat their RMF definitions. A recorded relation has no properties beyond its IDs, so JSON Schema adds little there. [Validate Models and Data](validation.md) explains when each rule runs.

Custom languages can be attached to every owner. **Current behaviour:** The editing API accepts any language on every owner without rejecting unsuitable combinations when the rule is attached. Model validation checks whether a `json-schema` expression can be compiled. `regex` and `format` require a string at data validation time. A custom language needs a registered evaluator in the validating tool.

The examples below share this small model:

```ts
import { DataTypes, Modeller } from '@ramen-suite/core/model';
import type { Attribute, Constraint, DataType, Literal, Node, Relation } from '@ramen-suite/core/model';

const model: Modeller = Modeller.create('Filing');
const document: Node = model.createNode('Document').element;
const folder: Node = model.createNode('Folder').element;
```

## Data type: reuse a value rule

Put a rule on a named data type when several properties should accept the same values. `PublicationDate` stores a string checked as a calendar date:

```ts
const publicationDate: DataType = model.createDataType({
  name: 'PublicationDate',
  baseType: DataTypes.String,
  constraints: [{ id: 'publicationDate01', name: 'Calendar date', language: 'format', expression: 'date' }],
}).element;

model.createAttribute(document, { name: 'publishedAt', type: publicationDate });
```

For a structured Object value, `json-schema` can describe fields inside that **one value**. It does not create RMF nodes or relationships:

```ts
const contact: DataType = model.createDataType({
  name: 'Contact',
  baseType: DataTypes.Object,
  constraints: [
    {
      id: 'contactFields001',
      name: 'Contact fields',
      language: 'json-schema',
      expression: { properties: { city: { type: 'string' } }, required: ['city'] },
    },
  ],
}).element;

model.createAttribute(folder, { name: 'contact', type: contact });
```

See [Add Data Types](data-types.md) for literals and other ways to define a value domain.

## Property: restrict one field

Put a rule on a property when it applies only there. This Document title must begin with a capital letter:

```ts
const capitalised: Constraint = {
  id: 'capitalTitleRule01',
  name: 'Capitalised title',
  language: 'regex',
  expression: '^[A-Z]',
};

const title: Attribute = model.createAttribute(document, {
  name: 'title',
  typeId: DataTypes.String,
  constraints: [capitalised],
}).element;
```

The rule checks each title value. `bounds` controls how many values may be present rather than expressing a value constraint. [Add Properties](properties.md) explains those bounds.

## Node: compare its properties

A node rule receives the complete property map. Here `publishedAt` becomes necessary only when `status` is `published`:

```ts
const status: DataType = model.createDataType({ name: 'Status', baseType: DataTypes.String }).element;
const draft: Literal = model.createLiteral(status.id, { name: 'Draft', literal: 'draft' }).element;
model.createLiteral(status.id, { name: 'Published', literal: 'published' });
model.createAttribute(document, { name: 'status', type: status });

const publicationRule: Constraint = {
  id: 'publicationRule01',
  name: 'Published documents have a date',
  language: 'json-schema',
  expression: {
    if: { properties: { status: { const: 'published' } }, required: ['status'] },
    then: { required: ['publishedAt'] },
  },
};

model.updateNode(document.id, { constraints: [publicationRule] });
```

The properties themselves remain declared as RMF attributes. A node rule needs a complete recorded node, so {@link model.Modeller.validateAttributeValue | validateAttributeValue()} cannot evaluate a rule that refers to another property.

## Relation: inspect a link

A relation rule receives a recorded link. To reject a Document citing itself, use a custom evaluator that compares the link's endpoints:

```ts
const distinctEnds: Constraint = {
  id: 'distinctEndsRule1',
  name: 'No self-citation',
  language: 'example:distinct-ends',
  expression: 'distinct',
};

const cites: Relation = model.createRelation({
  name: 'CITES',
  from: { node: document },
  to: { node: document },
  constraints: [distinctEnds],
}).element;
```

JSON Schema can check a link's individual ID fields, but cannot compare `fromId` with `toId` or follow them to the connected nodes. [Register a custom evaluator](#register-a-custom-evaluator) implements this rule.

## Source or target node

Put a constraint in `from` or `to` to check the **connected node** when a link exists. The rule below checks the Document in `from`: it must have a title when filed in a Folder, although `title` is optional elsewhere.

```ts
const titledSource: Constraint = {
  id: 'titledSourceRule1',
  name: 'Filed documents need a title',
  language: 'json-schema',
  expression: { properties: { properties: { required: ['title'] } } },
};

model.createRelation({
  name: 'FILED_IN',
  from: { node: document, constraints: [titledSource] },
  to: { node: folder },
});
```

The outer `properties` is the JSON Schema keyword, while the inner `properties` is the recorded node's field of that name. [Add Relationships](relationships.md) explains both ends and their cardinalities.

## Literal: react to one selected choice

A literal already fixes its value. Do not repeat that value with `regex`, `format` or JSON Schema. A custom rule is possible if choosing a particular literal needs a broader data check:

```ts
model.updateLiteral(status.id, draft.id, {
  constraints: [
    {
      id: 'draftWorkflowRule1',
      name: 'Draft workflow',
      language: 'example:draft-workflow',
      expression: 'draft',
    },
  ],
});
```

That rule runs only for the `draft` value. It needs a tool-specific evaluator and, for a graph rule, a complete recorded data graph. Prefer a node rule when the condition can be expressed from the node's properties alone.

## Read, change or remove a rule

{@link model.Modeller.getConstraints | getConstraints()} returns the rules declared on one element. It does not include rules inherited from another element. Use the same owner object to change one rule without carrying the other rules along:

```ts
const rules: readonly Constraint[] = model.getConstraints(title);
model.updateConstraint(title, capitalised.id, { expression: '^[A-Z][a-z]+$' });

model.removeConstraint(title, capitalised.id);
```

Element IDs are local to their model. If two models use the same ID, an owner object alone is ambiguous. Supply both identities:

```ts
import type { ConstraintOwnerInput } from '@ramen-suite/core/model';

const owner: ConstraintOwnerInput = { modelId: model.getModel().id, elementId: title.id };
model.getConstraints(owner);
```

{@link model.Modeller.addConstraint | addConstraint()} adds a rule to an existing element. These methods work for all six owners above, including a relation's `from` or `to` object. They preserve the owner's other rules. Open an earlier model level to edit a rule declared there because inherited rules remain with their original owner.

```ts
model.updateAttribute(document.id, title.id, { constraints: [capitalised] });
```

The general `updateNode()`, `updateAttribute()` and other element updates still replace the complete `constraints` list when you supply it. Use those methods when you intentionally want to replace all rules.

Each rule requires `id`, `name`, `language` and `expression`. Optional `message`, `code` and `severity` (`error`, `warn`, `info`) control its finding. [Constraint Languages](../constraint-languages.md) lists the built-in expressions.

## Register a custom evaluator

The model stores `example:distinct-ends`, but not its TypeScript implementation. Register the evaluator in each tool that needs to check it:

```ts
import { ConstraintRegistry, Diagnostics } from '@ramen-suite/core/model';
import type { ConstraintContext, Diagnostic } from '@ramen-suite/core/model';

function checkDistinctEnds(rule: Constraint, context: ConstraintContext): readonly Diagnostic[] {
  if (context.target !== 'relation') return [];
  if (rule.expression !== 'distinct') return [];
  const value: unknown = context.value;
  if (typeof value !== 'object' || value === null || !('fromId' in value) || !('toId' in value)) return [];
  if (value.fromId !== value.toId) return [];

  return [Diagnostics.error({ code: 'SELF_CITATION', message: 'A document cannot cite itself.', path: context.path })];
}

const registry: ConstraintRegistry = ConstraintRegistry.createDefault();
registry.register({ language: 'example:distinct-ends', evaluate: checkDistinctEnds });
```

Pass `registry` to {@link model.Modeller.validateInstances | validateInstances(data, registry)}. A model may declare other custom languages, but a tool cannot evaluate them until it registers their implementations.
