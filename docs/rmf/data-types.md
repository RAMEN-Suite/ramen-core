---
route: rmf/data-types
title: Add Data Types
group: RMF
---

# Add Data Types

An attribute uses a built-in type or a named {@link model.DataType | DataType}. RMF provides these built-in references:

| Reference           | Accepted value                                                  |
| ------------------- | --------------------------------------------------------------- |
| `DataTypes.String`  | String                                                          |
| `DataTypes.Boolean` | Boolean                                                         |
| `DataTypes.Integer` | Whole number                                                    |
| `DataTypes.Float`   | Finite number, including fractions                              |
| `DataTypes.Object`  | JSON object with unmodelled fields, excluding arrays and `null` |

Custom data types use one of these built-in types as their `baseType`. Use a {@link model.Node | Node} instead of `Object` when fields or relationships need their own definitions.

Nodes and named data types share one classifier namespace per model: distinct classifiers declared or explicitly used there must have different names. The same name is allowed in separate models. Names that may collide after case or Unicode compatibility normalisation produce a warning because generators or file names may treat them as equal.

The built-in names `String`, `Boolean`, `Integer`, `Float` and `Object` are reserved for primitive types and cannot be used as named data types, including case and Unicode compatibility variants.

Node and data type names contain 1–40 Unicode code points, starting with a letter and followed only by letters, combining marks, numbers or underscores. Creating or editing a classifier stores its name in NFC; comparisons also recognise canonically equivalent spellings. Import preserves the stored spelling, including decomposed Unicode. PascalCase is recommended; use `ModelNames.toPascalName()` to convert labels such as `my status!` to `MyStatus`. Model titles and literal labels can still contain spaces and punctuation.

After NFC normalisation, at most two consecutive combining marks are allowed. Joining controls ZWJ (U+200D) and ZWNJ (U+200C) are currently excluded from classifier names; context-sensitive support is not implemented. These restrictions do not apply to recorded string values.

Core reports invalid names as `CLASSIFIER_NAME_INVALID` at the `name` field. The JSON Schemas check string length; Unicode identifier syntax is checked by Core so the schemas remain usable with validators such as Python `jsonschema`.

## Limit a string to literals

Use {@link model.Modeller.createDataType | createDataType()} and {@link model.Modeller.createLiteral | createLiteral()} to limit a string to `draft` or `published`:

```ts
import type { Attribute, DataType, Literal, Node } from '@ramen-suite/core/model';
import { DataTypes, Modeller } from '@ramen-suite/core/model';

const model: Modeller = Modeller.create('Filing');
const document: Node = model.createNode('Document').element;
const status: DataType = model.createDataType({ name: 'Status', baseType: DataTypes.String }).element;

const draft: Literal = model.createLiteral(status.id, { name: 'Draft', literal: 'draft' }).element;
model.createLiteral(status.id, { name: 'Published', literal: 'published' });

const statusProperty: Attribute = model.createAttribute(document, { name: 'status', type: status }).element;
```

Pass a DataType object as `type`, or a built-in name or ID as `typeId`. For literals, `name` is the label and `literal` is the stored string. Without `literal`, the name is stored. Numeric types use `value`. `Integer` requires a whole number, while `Float` also accepts fractions such as `0.5`:

```ts
const priority: DataType = model.createDataType({ name: 'Priority', baseType: DataTypes.Integer }).element;
model.createLiteral(priority.id, { name: 'Low', value: 1 });
model.createLiteral(priority.id, { name: 'High', value: 2 });
```

Data validation rejects recorded values outside these lists.

### Edit a literal

{@link model.Modeller.updateLiteral | updateLiteral()} changes a literal while keeping its ID. {@link model.Modeller.removeLiteral | removeLiteral()} removes one allowed value:

```ts
model.updateLiteral(status.id, draft.id, { name: 'Planned', literal: 'planned' });
model.removeLiteral(status.id, draft.id);
```

Status now accepts only `published`. Removing its last literal makes the type unrestricted again.

## Define a web format

JSON has no native date or URI value type. Represent such values as strings with a format constraint. For example:

```ts
const publishedDate: DataType = model.createDataType({
  name: 'PublishedDate',
  baseType: DataTypes.String,
  constraints: [{ id: 'publishedDateRule01', name: 'Valid date', language: 'format', expression: 'date' }],
}).element;

model.createAttribute(document, { name: 'published', type: publishedDate });
```

The default evaluator recognises `uuid`, `date`, `date-time`, `email` and `uri`. A `uri` must be absolute. These are constraint expressions rather than new primitive types. [Add Constraints](constraints.md) covers custom evaluators, and [Request Suggestions](suggestions.md#choose-a-data-type) covers type pickers.

Use `json-schema` when a data type needs standard value rules such as `minLength`, `minimum` or nested Object fields. [Constraint Languages](../constraint-languages.md) gives examples for every built-in base type.

## Read a data type

{@link model.Modeller.getDataType | getDataType()} reads a local or imported declaration by ID. It returns a copy, or `undefined` when the ID is unknown:

```ts
const current: DataType | undefined = model.getDataType(status.id);
console.log(current?.name); // 'Status'
```

Built-in references such as `DataTypes.String` have no DataType declaration, so `getDataType(DataTypes.String)` returns `undefined`.
If two imported models use the same local ID, pass a qualified reference.

## Update a data type

{@link model.Modeller.updateDataType | updateDataType()} changes a local type without changing its ID:

```ts
model.updateDataType(status.id, { name: 'PublicationStatus' });
```

You can also change its `baseType`, `constraints`, `ext` or literals. Use the literal methods for individual values. The returned validation reports conflicts caused by an edit.

## Remove a data type

{@link model.Modeller.removeDataType | removeDataType()} removes the declaration even if properties still refer to it. The draft remains editable, and validation reports each missing reference at its property:

```ts
model.removeDataType(status.id);
console.log(model.validateNode(document).diagnostics);

model.updateAttribute(document.id, statusProperty.id, { typeId: DataTypes.String });
```

The final edit repairs the reference. Export requires a valid model. Built-in types cannot be removed.

Existing levels in the same workspace see the removal. Call {@link model.Modeller.snapshot | snapshot()} before editing when you need an independent state for comparison.
