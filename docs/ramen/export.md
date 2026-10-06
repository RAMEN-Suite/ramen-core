---
title: Export a RAMEN Model
group: RAMEN
---

# Export a RAMEN Model

{@link ramen.RamenModel.export | export()} writes the current model and its predecessors into one file, as in generic [Export and Import](../rmf/exchange.md). This example uses the [Edition model](ramen.md#create-an-edition-model):

```ts
import type { RamenFile } from '@ramen-suite/core/ramen';

const file: RamenFile = edition.export();
const json: string = JSON.stringify(file, null, 2);

const parsed: unknown = JSON.parse(json);
const restored: RamenModel = RamenModel.import(parsed);
```

The file follows the [RAMEN file schema](https://ramen-schema.org/ramen/1.0.0/file.schema.json). Its `models` list identifies RAMEN and Edition. Nodes, relationships and annotation types appear once, each with a `modelId` that identifies its owner. Node `superTypes` preserve the refinement chain. After {@link ramen.RamenModel.import | import()}, {@link ramen.RamenModel.openLevel | openLevel()} can open a project predecessor for editing. The packaged RAMEN reference model is read-only.

{@link ramen.RamenModel.getModel | edition.getModel()} returns only the current [RAMEN project document](https://ramen-schema.org/ramen/1.0.0/project.schema.json). Both schemas ship with `@ramen-suite/core` under `schemas/`.
