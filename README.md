# RAMEN Core

RAMEN Core is a TypeScript library for defining data models in JSON. Its generic RAMEN Model Format (RMF) handles types, relationships, refinement, validation and single-file exchange. The RAMEN layer adds the reference model and annotation rules.

| Import                        | Use                                                        |
| ----------------------------- | ---------------------------------------------------------- |
| `@ramen-suite/core/model`     | Create and validate generic RMF models.                    |
| `@ramen-suite/core/ramen`     | Build RAMEN project models and define annotation variants. |
| `@ramen-suite/core/schemas/*` | Read the packaged JSON schemas.                            |

## Create a generic model

```ts
import { DataTypes, Modeller } from '@ramen-suite/core/model';
import type { ModelFile, Node } from '@ramen-suite/core/model';

const model: Modeller = Modeller.create('Filing');
const document: Node = model.createNode('Document').element;

model.createAttribute(document, { name: 'title', typeId: DataTypes.String });
const file: ModelFile = model.export();
```

`file` contains the selected model and its imported predecessors. Import it with `Modeller.import(file)`. The [RMF guide](docs/rmf/rmf.md) develops this example and links to the focused API guides.

## Build on RAMEN

```ts
import { RAMEN_ELEMENT, RamenModel } from '@ramen-suite/core/ramen';

const edition: RamenModel = RamenModel.create('Edition');
edition.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION });
```

The [RAMEN guide](docs/ramen/ramen.md) covers the reference model, project relationships and annotation definitions.

## Work on the package

Run `npm run verify` for type checks, schema checks, lint, formatting, tests, documentation and package contents. Run `npm run docs:serve` to browse the guides and API reference locally.
