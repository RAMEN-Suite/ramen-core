# RAMEN Core

[![License: MIT](https://img.shields.io/badge/license-MIT-7a0712?labelColor=282a36)](https://github.com/RAMEN-Suite/ramen-core/blob/main/LICENSE)
[![npm version](https://img.shields.io/npm/v/%40ramen-suite%2Fcore?labelColor=282a36&color=7a0712)](https://www.npmjs.com/package/@ramen-suite/core)
[![CI](https://img.shields.io/github/actions/workflow/status/ramen-suite/ramen-core/ci.yml?branch=main&label=CI&labelColor=282a36)](https://github.com/RAMEN-Suite/ramen-core/actions/workflows/ci.yml?query=branch%3Amain)
[![Documentation](https://img.shields.io/badge/docs-Guides-996400?labelColor=282a36)](https://ramen-suite.github.io/ramen-core/)
[![RAMEN Schema](https://img.shields.io/badge/docs-Concepts-996400?labelColor=282a36)](https://ramen-schema.org/)

RAMEN Core is a TypeScript library for tools that create, refine, validate and exchange data models. Define which objects, properties and relationships your application supports, then check recorded data against those definitions.

It provides a generic modelling API based on the **RAMEN Model Format (RMF)** and a **RAMEN** API for digital scholarly editions. Use `@ramen-suite/core` in Node.js or browser bundles without a UI framework dependency.

## What you can build

- Model editors that define object types, properties, relationships and constraints.
- Project models that specialise shared definitions through inheritance across model levels.
- Data-entry and publishing tools that validate recorded objects and links against a project model.
- Integrations that exchange models as JSON while retaining declaration identities, dependencies and inheritance.

Core handles model definitions, validation, suggestions and model comparison. Your application supplies the interface, storage and recorded data. Comparing model versions reports changes; it does not migrate records automatically.

## RMF and RAMEN

**RMF** defines the generic model structure: nodes, data types, properties, relationships, constraints and imports. Use it to create a modelling language for your own domain.

**RAMEN** (Reusable Abstraction Model for Editorial Needs) builds on RMF for digital scholarly editions. Its shared Collection, Content, Entity and Annotation types describe editorial structures, source content, scholarly entities and annotations. Project models refine those types and declare the relationships and annotation shapes they need.

See [RAMEN Schema](https://ramen-schema.org/) for the conceptual background and specification project, starting with [What is RAMEN?](https://ramen-schema.org/concepts). The [Core guides](https://ramen-suite.github.io/ramen-core/) explain how to use the library APIs.

## Install

```bash
npm install @ramen-suite/core
```

The package provides ESM modules, TypeScript declarations and [JSON schemas](https://ramen-suite.github.io/ramen-core/guides/schemas.html).

| Import                        | Use                                     |
| ----------------------------- | --------------------------------------- |
| `@ramen-suite/core`           | Access both modelling APIs.             |
| `@ramen-suite/core/model`     | Create and validate generic RMF models. |
| `@ramen-suite/core/ramen`     | Create project models based on RAMEN.   |
| `@ramen-suite/core/schemas/*` | Use the packaged JSON schemas.          |

## Create a generic model

Define a Document type with a title property, then export the model:

```ts
import { DataTypes, Modeller } from '@ramen-suite/core/model';
import type { ModelFile, Node } from '@ramen-suite/core/model';

const model: Modeller = Modeller.create('Filing');
const document: Node = model.createNode('Document').element;

model.createAttribute(document, { name: 'title', typeId: DataTypes.String });
const file: ModelFile = model.export();
```

`file` is JSON-serialisable and contains the selected model and its imported predecessors. Restore it with `Modeller.import(file)`. Use `model.validate()` to inspect model diagnostics and `model.validateInstances(data)` to check recorded objects and links.

Continue with the [RMF guide](https://ramen-suite.github.io/ramen-core/guides/rmf/overview.html) or the complete [Website example](https://ramen-suite.github.io/ramen-core/guides/examples/website.html).

## Build on RAMEN

For a correspondence edition, refine Collection into Letter, Content into Text, and Entity into Person:

```ts
import { RAMEN_ELEMENT, RamenModel } from '@ramen-suite/core/ramen';
import type { Node } from '@ramen-suite/core/model';

const edition: RamenModel = RamenModel.create('Edition');
const letter: Node = edition.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
const text: Node = edition.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
const person: Node = edition.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;

edition.partOf(text, letter);
edition.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION);
edition.refersTo(RAMEN_ELEMENT.ANNOTATION, person);
```

Letter, Text and Person inherit the properties of their RAMEN base types. The project reuses Annotation without refining it. These relationships permit texts to belong to letters and carry annotations that refer to persons.

[Use Annotations](https://ramen-suite.github.io/ramen-core/guides/ramen/annotations.html) shows how to declare annotation shapes such as `person` or `comment`, each with its own properties and permitted relationships. The [digital edition example](https://ramen-suite.github.io/ramen-core/guides/examples/correspondence-edition.html) develops a complete project model.

## Validation

Core checks both **model definitions** and **recorded data**:

- Model structure, identities, imports, inheritance and refinement rules.
- Recorded nodes, property values and relationships supplied as a `ModelInstanceGraph`.
- Cardinalities, keys, literals and constraints written with regex, format, JSON Schema or a registered evaluator.
- RAMEN project conformance, including annotation shapes, their permitted properties and relationships, and selector type declarations.

JSON schemas check document structure. Core also resolves model references and applies semantic rules and inherited constraints. Findings include diagnostic codes, severities and paths for your application to display.

Tools translate their data into the instance graph and interpret selector details. See [Validate Models and Data](https://ramen-suite.github.io/ramen-core/guides/rmf/validation.html) and [Read Diagnostics](https://ramen-suite.github.io/ramen-core/guides/rmf/diagnostics.html).

## Documentation and specifications

Browse the [guides and API reference](https://ramen-suite.github.io/ramen-core/) online:

- [RMF guide](https://ramen-suite.github.io/ramen-core/guides/rmf/overview.html), create and refine generic models.
- [RAMEN guide](https://ramen-suite.github.io/ramen-core/guides/ramen/overview.html), build editorial project models.
- [Constraints](https://ramen-suite.github.io/ramen-core/guides/rmf/constraint-languages.html) and [JSON schemas](https://ramen-suite.github.io/ramen-core/guides/schemas.html), validation languages and packaged formats.
- [RAMEN Schema](https://ramen-schema.org/), concepts, examples and the [specification project](https://ramen-schema.org/specification).

For a local preview from a repository checkout:

```bash
nvm use
npm ci
npm run docs:serve
```

Open `http://127.0.0.1:5173`. For automatic rebuilds, run `npm run docs:watch` in a second terminal and refresh the browser after changes.

## Contribute

Run `npm run verify` before handing off a change. It checks types, schemas, lint, formatting, tests, documentation and an independently installed package consumer, including browser bundling.

- [Contribution workflow and coding conventions](https://github.com/RAMEN-Suite/ramen-core/blob/main/CONTRIBUTING.md)
- [Report a bug or suggest an improvement](https://github.com/RAMEN-Suite/ramen-core/issues/new/choose)
- [Code of Conduct](https://github.com/RAMEN-Suite/ramen-core/blob/main/CODE_OF_CONDUCT.md)
- [Security policy](https://github.com/RAMEN-Suite/ramen-core/blob/main/SECURITY.md)

## Licence

RAMEN Core is available under the [MIT licence](https://github.com/RAMEN-Suite/ramen-core/blob/main/LICENSE).
