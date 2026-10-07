---
title: Validate Data
group: RMF
---

# Validate Recorded Data

{@link model.Modeller.validateInstances | validateInstances(data)} checks recorded objects and links against a valid model. A tool first translates its stored data into a complete {@link model.ModelInstanceGraph | ModelInstanceGraph} because RMF does not read databases or tool-specific file formats.

## Missing required values

Document requires a title, but the recorded Document below has none:

```ts
import { DataTypes, Modeller } from '@ramen-suite/core/model';
import type { ModelInstanceGraph, Node, ValidationResult } from '@ramen-suite/core/model';

const model: Modeller = Modeller.create('Filing');
const document: Node = model.createNode('Document').element;
model.createAttribute(document, {
  name: 'title',
  typeId: DataTypes.String,
  bounds: { lowerBound: 1, upperBound: 1 },
});

const data: ModelInstanceGraph = {
  nodes: [{ id: 'record1', typeId: document.id, properties: {} }],
  relations: [],
};
const checked: ValidationResult = model.validateInstances(data);
console.log(checked.diagnostics);
// INSTANCE_PROPERTY_REQUIRED at /nodes/0/properties/title.
```

`record1` identifies the recorded object. `document.id` identifies its model type. The model already supplies the validation context, so the data graph has no model ID. [Read Diagnostics](diagnostics.md) explains the path.

## Too many links

A relationship can limit how many Folders one Document may have. Here the limit is one:

```ts
import type { Relation } from '@ramen-suite/core/model';

const folder: Node = model.createNode('Folder').element;
const filedIn: Relation = model.createRelation({
  name: 'FILED_IN',
  from: { node: document },
  to: { node: folder, bounds: { lowerBound: 0, upperBound: 1 } },
}).element;

const links: ModelInstanceGraph = {
  nodes: [
    { id: 'doc1', typeId: document.id, properties: { title: 'Example' } },
    { id: 'folder1', typeId: folder.id, properties: {} },
    { id: 'folder2', typeId: folder.id, properties: {} },
  ],
  relations: [
    { id: 'link1', typeId: filedIn.id, fromId: 'doc1', toId: 'folder1' },
    { id: 'link2', typeId: filedIn.id, fromId: 'doc1', toId: 'folder2' },
  ],
};

const linkResult: ValidationResult = model.validateInstances(links);
console.log(linkResult.diagnostics);
// INSTANCE_CARDINALITY_INVALID
```

The input is the **complete proposed graph**, including both links. When checking an edit, add it to a copy of the complete graph before validation. Checking only the new link would leave out existing links and could give a wrong result.

Validation checks declared properties, data types, endpoints, selected relationships, cardinalities and applicable [constraints](constraints.md). It cannot establish whether a recorded statement is factually correct. Express project rules in the model or register a custom evaluator.
