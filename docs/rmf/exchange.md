---
title: Export and Import
group: RMF
---

# Export and Import

{@link model.Modeller.export | export()} writes the current model and its imported predecessors into **one JSON file**. The file keeps the original definitions and their ownership, so {@link model.Modeller.import | import()} can restore the model levels.

## Export a model

Filing defines Document. Website refines it as Page:

```ts
import { Modeller } from '@ramen-suite/core/model';
import type { ModelFile, Node } from '@ramen-suite/core/model';

const filing: Modeller = Modeller.create('Filing');
const document: Node = filing.createNode('Document').element;

const website: Modeller = filing.createNextLevel('Website');
const page: Node = website.createNode({ name: 'Page', refines: document }).element;

const file: ModelFile = website.export();
const json: string = JSON.stringify(file, null, 2);
```

`website.export()` includes Website and Filing. It does not include an unrelated sibling model. Export checks the model first and throws if its definitions are invalid. Use [Validate a Model](validate-model.md) to show findings before export.

## Understand the file

The file has one list of model headers and shared lists of declarations:

| Field         | What it preserves                                                             |
| ------------- | ----------------------------------------------------------------------------- |
| `$schema`     | The [RMF file schema](https://ramen-schema.org/model/1.0.0/file.schema.json). |
| `id`          | The selected model, Website in this example.                                  |
| `models`      | Website and Filing metadata, including their IDs, versions and imports.       |
| `classifiers` | Page and Document, each tagged with the `modelId` of its declaring model.     |
| `relations`   | Relationship definitions, likewise tagged with their declaring `modelId`.     |

Page still refers to Document through `superTypes`. The export does **not** copy Document's inherited properties onto Page. The array order does not define the levels; imports and `modelId` do. To inspect ownership in the exported file:

```ts
console.log(file.id === website.getModel().id); // true
console.log(file.models.length); // 2
console.log(file.classifiers.length); // 2

const pageOwnedByWebsite: boolean = file.classifiers.some(
  (item: ModelFile['classifiers'][number]): boolean => item.id === page.id && item.modelId === website.getModel().id,
);
console.log(pageOwnedByWebsite); // true
```

The format places declarations in shared arrays for exchange. It keeps the model levels through `models`, `modelId`, imports and refinement references. The same schema also ships in the package as `@ramen-suite/core/schemas/model-file.schema.json`.

## Import and edit a level

Parse the JSON as `unknown`. {@link model.Modeller.import | import()} validates its structure and references before returning a {@link model.Modeller | Modeller}. The file's `id` tells it which model to open:

```ts
const parsed: unknown = JSON.parse(json);
const restored: Modeller = Modeller.import(parsed);
console.log(restored.getModel().name); // Website
```

The returned modeller opens Website. Use {@link model.Modeller.openLevel | openLevel()} to edit its imported Filing level in the same workspace:

```ts
const restoredFiling: Modeller = restored.openLevel(filing.getModel().id);
restoredFiling.updateNode(document.id, { name: 'Record' });

console.log(restored.getNodeLineage(page)[0]?.name); // Record
```

The edit is visible from Website. {@link model.Modeller.getModel | getModel()} returns only the currently opened model document; `export()` combines it with its predecessors again. Import creates an independent workspace, so these edits do not change the original Filing and Website objects. RAMEN uses the same exchange pattern and adds [annotation type definitions](../ramen/export.md).
