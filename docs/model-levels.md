# Model levels and one shared graph

RAMEN Core keeps virtual model levels inside one graph file. Inheritance remains explicit.
Each declaration occurs once and carries its original `modelId`. Model headers retain names,
versions and imports. Properties remain on the node that declares them.

```ts
const file: RamenFile = edition.export();
const restored: RamenModel = RamenModel.import(file);
```

See the [complete example](../examples/export/edition.ts) and its [JSON export](../examples/export/edition.json).
The [RAMEN file schema](../src/resources/schemas/ramen-file.schema.json) is generated from the existing format definitions.

## How a tool reads it

The library resolves inheritance and annotation types when queried. The file's `id` identifies
the exported project, so consumers do not select a model after import. It has no separate
`rootModelId`, copied inherited properties, or `origin` section.

All original relations are present for reconstruction. Their presence does not grant permission
at every level: each project level must select its relations. Reused nodes retain their owner.
Local references resolve within that owner; qualified references use `modelId:elementId`.

## Scientific position

TOTEM distinguishes native MLM from approaches embedded in two-level technology. Its
meta-model extension approach emulates instantiation through inheritance and adds controls
for instance facets and extension. RAMEN shares the representation idea, but does not currently
implement TOTEM's full semantics. See [TOTEM, sections 3–4](https://www.miso.es/pubs/CSI.pdf).

The rationale by Frank treats multiple classification levels and the class/object distinction
as central. An inheritance chain alone does not establish these semantics. See
[Multi-level modeling: cornerstones of a rationale, section 2](https://link.springer.com/article/10.1007/s10270-021-00955-1).

For now, describe RAMEN as **refinement-based modeling with virtual levels in a shared graph,
related to embedded MLM approaches**. A stronger claim needs an explicit mapping of refinement
to classification semantics. Deep instantiation is not a product requirement.

## Responsibilities and tests

| Layer                   | Responsibility                                                 |
| ----------------------- | -------------------------------------------------------------- |
| Generic format          | Nodes, attributes, data types, relations and inheritance       |
| Graph and generic rules | Identities, imports, references, refinement and relation scope |
| RAMEN                   | Reference vocabulary and closed annotation types               |
| Exchange                | Store declarations once and reconstruct their owners           |
| Consumer API            | Editing, suggestions and validation in the project context     |

Tests cover generic merge/split, malformed files, identity collisions, inherited properties,
unchanged and refined Annotation nodes, Text/Image suggestions, shared cardinalities, edits,
and data validation before and after JSON transport. Tests call package exports, not example helpers.
The legacy bundle API remains available; new examples use `export()` and `import()`.

## Reading the code

Start at `model/Modeler.ts` or `ramen/RamenModel.ts`. These are the consumer entry points.
Then follow the operation into one folder:

| Folder              | Owns                                                  |
| ------------------- | ----------------------------------------------------- |
| `model/editing`     | Draft state, element creation, edits and connections  |
| `model/graph`       | Reference lookup, ancestors and allowed relations     |
| `model/validation`  | Model structure and refinement rules                  |
| `model/data`        | Captured values and their relations                   |
| `model/exchange`    | Shared files, legacy bundles and change reports       |
| `ramen/annotations` | Annotation definitions, inheritance, advice and rules |
| `ramen/validation`  | RAMEN model checks on top of generic checks           |
| `ramen/data`        | Additional annotation checks for captured data        |
| `ramen/exchange`    | Exchange with annotation definitions included         |
| `resources`         | Reference model and JSON schemas                      |

`ramen/ReferenceModel.ts` loads the RAMEN vocabulary. `ramen/Document.ts` defines a
project document. Generic code never imports RAMEN code.

Run `npm run verify` for all quality checks and executable examples.
Run `npm run test:coverage` to measure executed lines, branches and functions.
This measures built entry bundles; shared code occurs in several bundles. It is a
regression aid, not proof that every modeling case is covered.

Scenario tests build models through the public API. They cover selection, refinement,
annotation advice, correction after an invalid edit, exchange and change reports.
A generic scenario checks five consecutive refinements and verifies that an omitted
relation cannot return on a later level. Larger graphs and generated combinations of
valid and invalid refinements still need dedicated tests.
