---
route: rmf/nodes
title: Create Nodes
group: RMF
---

# Create Nodes

A {@link model.Node | Node} defines a record type. Start with two types in a model:

```ts
import type { Node, NodeLineageItem, NodeRemovalPreview } from '@ramen-suite/core/model';
import { Modeller } from '@ramen-suite/core/model';

const filing: Modeller = Modeller.create('Filing');
const document: Node = filing.createNode('Document').element;
const folder: Node = filing.createNode('Folder').element;
```

{@link model.Modeller.createNode | createNode()} generates the node's ID. `.element` returns the definition for later calls.

Node names must be unique among nodes declared or explicitly used within a model, including relationship endpoints and RAMEN annotation definitions. A refinement on another model level may reuse its base's name, provided that level does not also use the base directly. `Annotation` and `TextAnnotation` may coexist; two distinct nodes named `Annotation` may not. Imports and inheritance references alone do not count as direct use. Validation reports conflicts as `NODE_NAME_DUPLICATE`.

| Input         | Meaning                                                     | Example               |
| ------------- | ----------------------------------------------------------- | --------------------- |
| `name`        | Required name of the node type.                             | `Document`            |
| `refines`     | Optional in a root model but required on a new model level. | `refines: document`   |
| `constraints` | Optional rules for records of this node and its subtypes.   | `constraints: [rule]` |

Properties and relationships are defined separately in [Add Properties](properties.md) and [Add Relationships](relationships.md). For node rules, see [Add Constraints](constraints.md).

## Refine a node

Letter is a kind of Document. Both belong to Filing:

```ts
const letter: Node = filing.createNode({ name: 'Letter', refines: document }).element;
```

Letter inherits Document's properties. A relationship that accepts Document also accepts Letter. See [Refine by Inheritance](inheritance.md).

A new level imports its predecessor. Its local nodes must refine an available node:

```ts
const website: Modeller = filing.createNextLevel('Website');
const page: Node = website.createNode({ name: 'Page', refines: document }).element;
```

Page belongs to Website, while Document stays in Filing. Website can use Folder without refining it. New nodes on this level need a base node.

## Read a node definition

{@link model.Modeller.getNode | getNode()} reads a local or imported definition by ID. It returns a copy, or `undefined` when the ID is unknown:

```ts
const found: Node | undefined = website.getNode(document.id);
console.log(found?.name); // 'Document'
```

If two imported models use the same local ID, pass a qualified reference such as `ModelRef.qualify(modelId, nodeId)`.

The stored Node has a name, supertypes and local attributes. Inherited attributes stay on their declaring node. {@link model.Modeller.getNodeLineage | getNodeLineage()} lists ancestors first:

```ts
const lineage: readonly NodeLineageItem[] = website.getNodeLineage(page);
console.log(lineage.map((item: NodeLineageItem): string => item.name));
// ['Document', 'Page']
```

## Update a node

{@link model.Modeller.updateNode | updateNode()} changes a local node's `name`, `superTypes`, `constraints` or `ext`. Its ID and kind stay fixed. Renaming Document also changes Letter's lineage:

```ts
filing.updateNode(document.id, { name: 'Record' });
console.log(filing.getNodeLineage(letter).map((item: NodeLineageItem): string => item.name));
// ['Record', 'Letter']
```

## Remove a node

{@link model.Modeller.removeNode | removeNode()} rejects a node used by refinements or relations anywhere in the open workspace. It lists the blockers so you can remove them deliberately.

To remove the node and its dependent definitions together, inspect {@link model.Modeller.previewNodeRemoval | previewNodeRemoval()} first:

```ts
const preview: NodeRemovalPreview = filing.previewNodeRemoval(document.id);
console.log(preview.nodes, preview.relations);

filing.removeNode(document.id, { cascade: true });
```

The cascade also removes Letter and Page, because both refine Document, and removes their affected relationships. Other nodes, such as Folder, remain.
