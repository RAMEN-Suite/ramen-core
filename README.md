# RAMEN Core

RAMEN Core is a TypeScript library for defining data models in JSON. Its generic RAMEN Model Format (RMF) handles types, relationships, refinement, validation and single-file exchange. The RAMEN layer adds the reference model and annotation rules.

## Install

The package is being prepared for its first release. Once published:

```bash
npm install @ramen-suite/core
```

It provides ESM entry points, TypeScript declarations and JSON schemas. It has no UI framework dependency.

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
import type { Node, Relation } from '@ramen-suite/core/model';

const edition: RamenModel = RamenModel.create('Edition');
const letter: Node = edition.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
const text: Node = edition.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;

edition.partOf(text, letter);
const textLink: Relation = edition.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION).element;
edition.createAnnotation({
  nodeId: RAMEN_ELEMENT.ANNOTATION,
  type: 'p',
  relations: [{ relation: textLink, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } }],
});
```

The [RAMEN guide](docs/ramen/ramen.md) covers the reference model, project relationships and annotation definitions.

## What the package checks

- Model structure, identities, imports, inheritance and permitted relationships.
- Recorded values and links supplied as a `ModelInstanceGraph`.
- Property counts, keys, literals and constraints written with regex, format, JSON Schema or a registered evaluator.
- RAMEN annotation types, their allowed properties and relationships, and selector type declarations.

Tools translate their own data into the instance graph and interpret selector details. Editor requirements and database translations belong to the consuming tools.

## Guides and examples

- [RAMEN Model Format](docs/rmf/rmf.md) and [RAMEN modelling](docs/ramen/ramen.md)
- [Constraint languages](docs/constraint-languages.md) and [validation](docs/rmf/validation.md)
- [Website example](docs/examples/website.md) and [digital edition example](docs/examples/correspondence-edition.md)

## Work on the package

Run `npm run verify` for type checks, schema checks, lint, formatting, tests, documentation and package contents. Run `npm run docs:serve` to browse the guides and API reference locally.

The build writes the publishable package to `dist/ramen-core` and the documentation to `dist/api-doc`. The package check installs a real tarball in a temporary consumer and checks its runtime exports, declarations and schemas.

See [Contributing](CONTRIBUTING.md) for setup, conventions and release handover, [Security](SECURITY.md) for vulnerability reports, and the [Code of Conduct](CODE_OF_CONDUCT.md) for participation guidelines. RAMEN Core uses the [MIT licence](LICENSE).
