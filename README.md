# RAMEN Core

RAMEN Core is a TypeScript library for creating, refining, validating and exchanging data models.

## RMF and RAMEN

**RAMEN Model Format (RMF)** is the generic foundation. It describes nodes, properties, data types, relationships and constraints in JSON, with inheritance across model levels.

**RAMEN** is a data model built with RMF for digital scholarly editions. It defines Collection, Content, Entity and Annotation, their properties, data types and permitted relationships. Project models specialise these elements and choose the relationships they need. RAMEN also supports project-defined annotation types and their rules.

The library provides a generic modeller and a RAMEN-specific API for working with these models.

## Install

The package is being prepared for its first release. Once published:

```bash
npm install @ramen-suite/core
```

It provides ESM entry points, TypeScript declarations and [JSON schemas](docs/schemas.md). It has no UI framework dependency.

| Import                        | Use                                     |
| ----------------------------- | --------------------------------------- |
| `@ramen-suite/core/model`     | Create and validate generic RMF models. |
| `@ramen-suite/core/ramen`     | Create project models based on RAMEN.   |
| `@ramen-suite/core/schemas/*` | Read the packaged JSON schemas.         |

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
import type { Node } from '@ramen-suite/core/model';

const edition: RamenModel = RamenModel.create('Edition');
const letter: Node = edition.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
const text: Node = edition.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
const person: Node = edition.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;
const place: Node = edition.createNode({ name: 'Place', refines: RAMEN_ELEMENT.ENTITY }).element;

edition.partOf(text, letter);
edition.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION);
edition.refersTo(RAMEN_ELEMENT.ANNOTATION, person);
edition.refersTo(RAMEN_ELEMENT.ANNOTATION, place);
```

Letter, Text, Person and Place inherit the properties of their RAMEN base nodes. The project reuses Annotation without refining it. These relationships define what recorded data may contain.

The [RAMEN guide](docs/ramen/ramen.md) builds the project step by step. [Use Annotations](docs/ramen/annotations.md) shows how to declare annotation types such as `person` and `place` before recording annotations.

## What the package checks

- Model structure, identities, imports, inheritance and permitted relationships.
- Recorded values and links supplied as a `ModelInstanceGraph`.
- Property counts, keys, literals and constraints written with regex, format, JSON Schema or a registered evaluator.
- Project conformance to the RAMEN reference model, including annotation types, their permitted properties and relationships, and selector type declarations.

Tools translate their own data into the instance graph and interpret selector details. Editor requirements and database translations belong to the consuming tools.

## Guides and examples

- [RAMEN Model Format](docs/rmf/rmf.md) and [RAMEN modelling](docs/ramen/ramen.md)
- [Constraint languages](docs/constraint-languages.md) and [validation](docs/rmf/validation.md)
- [Website example](docs/examples/website.md) and [digital edition example](docs/examples/correspondence-edition.md)

## Work on the package

Run `npm run verify` for type checks, schema checks, lint, formatting, tests, documentation and package contents. Run `npm run docs:serve` to browse the guides and API reference locally.

The build writes JavaScript, declarations and schemas to `dist/ramen-core`, and documentation to `dist/api-doc`. `npm pack` packages the library from the repository root using `files` and `exports` in `package.json`. The package check installs a real tarball in a temporary consumer and checks its runtime exports, declarations and schemas.

See [Contributing](CONTRIBUTING.md) for setup, conventions and release handover, [Security](SECURITY.md) for vulnerability reports, and the [Code of Conduct](CODE_OF_CONDUCT.md) for participation guidelines. RAMEN Core uses the [MIT licence](LICENSE).
