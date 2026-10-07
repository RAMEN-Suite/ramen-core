---
route: rmf/preview-removal
title: Preview a Removal
group: RMF
---

# Preview a Removal

Removing a model definition can affect later levels. {@link model.Modeller.previewNodeRemoval | previewNodeRemoval()} and {@link model.Modeller.previewRelationRemoval | previewRelationRemoval()} show the effects **without changing the model**.

## Preview a node

Page refines Document. Removing Document would also remove Page:

```ts
import { Modeller } from '@ramen-suite/core/model';
import type { Node, NodeRemovalPreview } from '@ramen-suite/core/model';

const filing: Modeller = Modeller.create('Filing');
const document: Node = filing.createNode('Document').element;
const website: Modeller = filing.createNextLevel('Website');
const page: Node = website.createNode({ name: 'Page', refines: document }).element;

const preview: NodeRemovalPreview = filing.previewNodeRemoval(document.id);
console.log(preview.nodes);
// Document in Filing; Page in Website.
```

Each preview item has a `modelId` and `elementId`, so a tool can identify the affected definition and level. `preview.relations` lists relationships that would also be removed. Domain extensions may fill `annotations` and `updatedAnnotations` with other affected definitions.

{@link model.Modeller.removeNode | removeNode(document.id)} throws while Page depends on Document and leaves the draft unchanged. After showing the preview, a tool may request the full removal explicitly:

```ts
filing.removeNode(document.id, { cascade: true });
// Document and Page are removed together.
```

## Preview a relationship

The same rule applies to a relationship selected on a later level. In a fresh model, Website applies Filing's `FILED_IN` relationship:

```ts
import type { Relation, RelationRemovalPreview } from '@ramen-suite/core/model';

const base: Modeller = Modeller.create('Filing');
const record: Node = base.createNode('Record').element;
const folder: Node = base.createNode('Folder').element;
const filedIn: Relation = base.createRelation({
  name: 'FILED_IN',
  from: { node: record },
  to: { node: folder },
}).element;

const next: Modeller = base.createNextLevel('Website');
const pageType: Node = next.createNode({ name: 'Page', refines: record }).element;
next.createRelation({ refines: filedIn, from: { node: pageType }, to: { node: folder } });

const links: RelationRemovalPreview = base.previewRelationRemoval(filedIn.id);
console.log(links.relations);
// FILED_IN and its Website refinement.
```

{@link model.Modeller.removeRelation | removeRelation(filedIn.id)} throws while the later relationship depends on it. `{ cascade: true }` removes both. A preview lists the effects of one proposed removal, while {@link model.Modeller.snapshot | snapshot()} saves an independent copy of the whole editable workspace.
