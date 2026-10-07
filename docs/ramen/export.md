---
route: ramen/export
title: Export and Import
group: RAMEN
---

# Export and Import

{@link ramen.RamenModel.export | export()} writes the Edition model, its base models and its annotation definitions into one JSON file. This continues the [Edition example](ramen.md#create-a-project-model):

```ts
import type { RamenFile } from '@ramen-suite/core/ramen';

const file: RamenFile = edition.export();
const json: string = JSON.stringify(file, null, 2);

const parsed: unknown = JSON.parse(json);
const restored: RamenModel = RamenModel.import(parsed);
```

The file follows the [RAMEN file schema](https://ramen-schema.org/ramen/1.0.0/file.schema.json). Its `models` list identifies RAMEN and Edition. Each node, relationship and annotation type appears once with the `modelId` of its declaring model. Node `superTypes` preserve inheritance. The importing tool can read the complete model without assembling separate files.

{@link ramen.RamenModel.import | import()} restores the levels. {@link ramen.RamenModel.openLevel | openLevel()} opens a project level for editing; the packaged RAMEN reference model stays read-only. {@link ramen.RamenModel.getModel | getModel()} returns only the current [project document](https://ramen-schema.org/ramen/1.0.0/project.schema.json). Both schemas also ship in `@ramen-suite/core/schemas/`.
