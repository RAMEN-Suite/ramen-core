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

## What a level transition means

Use `createNextLevel()` for a new modeling context. Use `compareTo()` to compare
revisions of a model. These are different operations.

The [correspondence example](../examples/ramen-levels.ts) has three modeling contexts:

| Context        | Declares                        | Meaning                             |
| -------------- | ------------------------------- | ----------------------------------- |
| RAMEN          | Collection, Content, Annotation | Shared vocabulary                   |
| Correspondence | Letter, Witness, Text           | Reusable domain types               |
| Edition        | EditionLetter, Manuscript       | More specific types; Text is reused |

`EditionLetter` specializes `Letter`. It does not represent one historical letter.
The new context also selects permitted relations again and retains the exact versions
of its dependencies. These context rules are what the transition adds to ordinary
node specialization. A model import is a dependency; it is not itself a classification link.

### Type and object roles

`Letter` is a type for captured letter records. As a model element, it is represented
using the generic `Node` construct. This is its linguistic classification.
`Collection` is its domain supertype in the current implementation.

An individual letter record has a `typeId` and values such as `label`. A `Letter`
model declaration has attribute definitions, not values for Collection's attributes.
Being a JSON object does not give it an MLM object facet.

A possible future MLM example would define `DocumentKind.retentionYears`, assign
`LetterKind.retentionYears = 30` at the next modeling level, and let LetterKind
also define `sentOn` for captured letters. That needs explicit semantics for values
on model types. RMF currently has no such slot mechanism. This is an illustration,
not a proposed new field or an implemented feature.

### Rules across levels

| Concern               | Current rule                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| Node reuse            | Reference the original node; no copy or empty refinement is needed.                                |
| Node refinement       | One supertype; local new attributes are allowed.                                                   |
| Inherited attributes  | Keep their definitions. Redeclaring the same name is rejected.                                     |
| Relations             | Select at every level, from the nearest predecessor contexts.                                      |
| Relation refinement   | Endpoints stay the same or become subtypes; cardinalities may narrow.                              |
| Roles and composition | Preserve the predecessor's meaning.                                                                |
| Constraints           | Data rules accumulate through node and relation ancestry. Evaluate them with registered languages. |
| Annotation types      | Inherit unchanged along their Annotation node. No redeclaration of an inherited type.              |
| Annotation properties | Select attributes, optionally narrow their bounds, or declare type-owned attributes.               |
| Annotation carriers   | Selected relations determine applicability to Text, Image or another node.                         |
| Export                | Keep declarations and ownership once; resolve inherited features when queried.                     |

A valid model is structurally consistent with these rules. Validation does not prove
that arbitrary custom constraints are satisfiable. It also does not mean every child
data document is byte-for-byte valid against its parent: type references, selected
relations and locally added attributes differ.

### Scientific claim and next decision

Our implemented contribution is a lightweight, model-driven approach with virtual
refinement contexts, explicit relation selection and one shared graph representation.
TOTEM provides a precedent for embedding MLM in an inheritance representation, while
also defining how instantiation and object facets are encoded. Its distinction between
linguistic and domain typing helps explain the boundary above. See
[TOTEM, sections 2.4 and 4](https://www.miso.es/pubs/CSI.pdf).

For a stronger MLM claim, first identify a domain requirement that needs a type to
carry model-level values while remaining a type. Then specify its semantics and test
the encoding. Adding potency or calling every specialization an instantiation would
not establish that claim. Frank's discussion of concretization is useful here;
it is one explicit MLM account, not a universal conformance standard. See
[Frank, section 2](https://link.springer.com/article/10.1007/s10270-021-00955-1).
