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
