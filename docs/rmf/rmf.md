---
title: RAMEN Model Format
group: RMF
---

# RAMEN Model Format

## Understand RMF

**RAMEN Model Format (RMF)** describes data models in JSON.
You define which types, properties and relationships tools can use to collect data. This guide builds a Filing model, then refines it into a Website model.
Each step continues the previous one.

| Concept                | Purpose                    | Example                        |
| ---------------------- | -------------------------- | ------------------------------ |
| {@link model.Model     | Model}                     | A versioned set of definitions | Filing                        |
| {@link model.Node      | Node}                      | An object type                 | Document                      |
| {@link model.Attribute | Attribute}                 | A typed property               | title                         |
| {@link model.DataType  | Data type}                 | Allowed property values        | String                        |
| {@link model.Relation  | Relation}                  | A permitted connection         | FILED_IN                      |
| {@link model.Import    | Import}                    | An exact model dependency      | Use Filing from another model |
| Refinement             | A more specific definition | A specialised Document type    |

{@link model.Modeller | Modeller} is the class you use to edit a model.
`Model`, `Node`, `Attribute` and `Relation` are data interfaces.
Node objects hold definitions; editing methods belong to Modeller.

## Create a model

Create Filing with {@link model.Modeller.create | Modeller.create()}.
Add its two node types with {@link model.Modeller.createNode | createNode()}:

```ts
import { Modeller } from '@ramen-suite/core/model';
import type { Node } from '@ramen-suite/core/model';

const model: Modeller = Modeller.create('Filing');
const document: Node = model.createNode('Document').element;
const folder: Node = model.createNode('Folder').element;
```

**Filing** is the model. **Document** and **Folder** are the types it defines.
This defines a schema; it does not create individual documents or folders.

Editing methods return a {@link model.ModelChange | ModelChange}: `{ element, validation }`.
This is the library’s edit result: the changed definition and the validation of the resulting model.
Use `.element` to keep the definition for later steps.
The API generates IDs and a model URI; the version defaults to `1.0.0`.

## Add properties to nodes

In RMF, {@link model.Node | node types} own {@link model.Attribute | attributes}, such as a Document's title.
They define which values objects of that type may contain.
Refined node types inherit attributes and can add their own. Use {@link model.Modeller.createAttribute | createAttribute()} to give Document a required title:

```ts
import { DataTypes } from '@ramen-suite/core/model';

model.createAttribute(document, {
  name: 'title',
  typeId: DataTypes.String,
  bounds: { lowerBound: 1, upperBound: 1 },
});
```

`typeId` selects the property's data type. `bounds` requires exactly one value.
Each captured Document must have a string title.

### Define data types

{@link model.DataTypes | DataTypes} provides `String`, `Boolean`, `Integer`, `Float` and `Object`. `Object` accepts a JSON object, but not an array or `null`. RMF does not inspect its fields. Use a {@link model.Node | Node} when fields or relationships need to be modelled.

To add a property to Folder, pass it to the model’s editing method:

```ts
model.createAttribute(folder, { name: 'description', typeId: DataTypes.String });
```

Create a custom {@link model.DataType | DataType} with {@link model.Modeller.createDataType | createDataType()}.
For example, Visibility is a string type limited to two values:

```ts
import type { DataType } from '@ramen-suite/core/model';

const visibility: DataType = model.createDataType({ name: 'Visibility', baseType: DataTypes.String }).element;
model.createLiteral(visibility.id, { name: 'Public', literal: 'public' });
model.createLiteral(visibility.id, { name: 'Private', literal: 'private' });
model.createAttribute(folder, { name: 'visibility', type: visibility });
```

Folder's optional `visibility` accepts only `"public"` or `"private"`.
Use `type` for data type objects and `typeId` for string references, such as `DataTypes.String`.
If both are supplied, `type` takes precedence.
For a type picker in an editor, see [Data type suggestions](suggestions.md#choose-a-data-type).

### Set cardinality

{@link model.Bounds | Bounds} specify how many values are allowed.
The title uses `1..1`. The description uses the attribute default, `0..1`.

| Bounds                              | Notation | Meaning                                |
| ----------------------------------- | -------- | -------------------------------------- |
| `{ lowerBound: 0, upperBound: 0 }`  | `0..0`   | No values allowed                      |
| `{ lowerBound: 0, upperBound: 1 }`  | `0..1`   | Optional, at most one                  |
| `{ lowerBound: 1, upperBound: 1 }`  | `1..1`   | Exactly one                            |
| `{ lowerBound: 0, upperBound: -1 }` | `0..*`   | Zero or more; `-1` means unlimited     |
| `{ lowerBound: 1, upperBound: -1 }` | `1..*`   | One or more; `-1` means unlimited      |
| `{ lowerBound: n, upperBound: m }`  | `n..m`   | Between n and m values                 |
| `{ lowerBound: n, upperBound: -1 }` | `n..*`   | At least n values, with no upper limit |

`n` is any non-negative integer; `m` is an integer at least as large as `n`.
These patterns cover all valid intervals. `-1` is allowed only for `upperBound`.

## Create relationships

Use {@link model.Modeller.createRelation | createRelation()} to allow connections between node types.
For a new root relation, both bounds are optional and default to `0..*`:

| Option       | Counts             | Default                             |
| ------------ | ------------------ | ----------------------------------- |
| `toBounds`   | Targets per source | `{ lowerBound: 0, upperBound: -1 }` |
| `fromBounds` | Sources per target | `{ lowerBound: 0, upperBound: -1 }` |

For example, allow Document → Folder and restrict only the number of Folders per Document:

```ts
import type { Relation } from '@ramen-suite/core/model';

const filedIn: Relation = model.createRelation({
  name: 'FILED_IN',
  fromNode: document,
  toNode: folder,
  toBounds: { lowerBound: 0, upperBound: 1 },
}).element;
```

`fromNode` and `toNode` select the source and target Node objects.
For IDs, use `fromNodeId: document.id` and `toNodeId: folder.id` instead.
You can use an object at one end and an ID at the other.
When both are supplied for an endpoint, the Node object takes precedence.

FILED_IN defines a permitted relationship between the two types.
It allows each Document to be filed in at most one Folder.

## Validate the model

Use {@link model.Modeller.validate | validate()} to check structure, references and model rules:

```ts
import type { ProjectValidationResult } from '@ramen-suite/core/model';

const result: ProjectValidationResult = model.validate();
if (!result.valid) {
  console.log(result.diagnostics);
}
```

Export requires a valid model.
See [Validate Models and Data](validation.md), [Writing Constraints](constraints.md) and [Read Diagnostics](diagnostics.md).

## Refine the model

Refinement creates a more specific node type from an existing one.
For example, Page refines Document: it is a kind of Document and inherits its attributes.
It can add its own attributes, but must respect the preceding model's rules.
The original Document definition stays in Filing; Page belongs to the new Website model.

| Base node in Filing | Refined node in Website | Properties inherited from the base node                            |
| ------------------- | ----------------------- | ------------------------------------------------------------------ |
| Document            | Page                    | Page also has Document's required `title`.                         |
| Folder              | Section                 | Section also has Folder's optional `description` and `visibility`. |

For example, create **Website** as a new level based on **Filing**, then declare these refinements:

```ts
const project: Modeller = model.createNextLevel('Website');
const page: Node = project.createNode({ name: 'Page', refines: document }).element;
const section: Node = project.createNode({ name: 'Section', refines: folder }).element;
```

Two operations happen here:

- **Import:** {@link model.Modeller.createNextLevel | createNextLevel()} creates a model that depends on Filing. Its types become available in Website.
- **Refinement:** `createNode({ name: 'Page', refines: document })` defines Page as a specialisation of Document.

Import makes definitions available; refinement creates a more specific definition.
You can also use Document unchanged in Website, without declaring Page.
The two models remain separate virtual levels.

### Read inherited properties

Page inherits `title`. Read it with {@link model.Modeller.getAttributes | getAttributes()}:

```ts
import type { AttributeInfo } from '@ramen-suite/core/model';

const attributes: readonly AttributeInfo[] = project.getAttributes(page);
console.log(attributes.map((attribute: AttributeInfo): string => attribute.name));
// ['title']
```

Each {@link model.AttributeInfo | AttributeInfo} includes its type, bounds, declaring node and `inherited` flag.
Page's own `attributes` list is empty; inherited definitions stay on Document.
Section likewise inherits Folder's optional description and visibility.

Refined nodes can add properties. They cannot redeclare an inherited property with the same name.

### Refine relationships

Each level selects its own relationships. Page and Section do not automatically inherit FILED_IN. If it is the only permitted choice, {@link model.Modeller.createRelation | createRelation()} can select it from the endpoints:

```ts
project.createRelation({ fromNode: page, toNode: section });
```

This permits Page → Section, with at most one Section per Page. You can also name the base relation explicitly:

```ts
project.createRelation({ refines: filedIn, fromNode: page, toNode: section });
```

If several relations fit, choose one with {@link model.Modeller.suggestRelations | suggestRelations()} and pass it as `refines`. See [Relation suggestions](suggestions.md#choose-a-relationship).

### Further levels

For example, a Blog model can refine Website's Page into Post and Section into Category:

```ts
const blog: Modeller = project.createNextLevel('Blog');
const post: Node = blog.createNode({ name: 'Post', refines: page }).element;
const category: Node = blog.createNode({ name: 'Category', refines: section }).element;
blog.createRelation({ fromNode: post, toNode: category });
```

Blog can also use Section directly from Website without refining it:

```ts
blog.createRelation({ fromNode: post, toNode: section });
```

Post belongs to Blog; Section remains defined in Website. The same rules apply at each level:

- New nodes must refine existing nodes. Imported nodes may be reused unchanged.
- Each level selects relationships from its predecessor.
- A level cannot restore a relationship excluded by an intermediate level.
- Refinements may narrow relation endpoints and cardinalities; they cannot widen them.
- New properties must not conflict with inherited names.

## Export and import

{@link model.Modeller.export | export()} writes Website and its imported Filing model to one file. `models` holds their metadata; `classifiers` and `relations` hold their declarations with an owning `modelId`. `superTypes` preserve refinements. {@link model.Modeller.import | import()} restores the two model levels from this information.

The file follows the [RMF file schema](https://ramen-schema.org/model/1.0.0/file.schema.json), which ships in `@ramen-suite/core/schemas/`.

```ts
import type { ModelFile } from '@ramen-suite/core/model';

const file: ModelFile = project.export();
const json: string = JSON.stringify(file, null, 2);
const restored: Modeller = Modeller.import(JSON.parse(json) as unknown);
```
