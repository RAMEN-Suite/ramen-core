---
title: Add Relationships
group: RMF
---

# Add Relationships

A {@link model.Relation | Relation} permits links between node types. Define Document → Folder in a root model:

```ts
import type { Node, Relation } from '@ramen-suite/core/model';
import { Modeller } from '@ramen-suite/core/model';

const filing: Modeller = Modeller.create('Filing');
const document: Node = filing.createNode('Document').element;
const folder: Node = filing.createNode('Folder').element;

const filedIn: Relation = filing.createRelation({
  name: 'FILED_IN',
  from: { node: document },
  to: {
    node: folder,
    bounds: { lowerBound: 0, upperBound: 1 },
  },
}).element;
```

`FILED_IN` permits each Document to link to at most one Folder. It defines a possible connection without creating a recorded link.
Recorded links have an ID, a relation type and two endpoint IDs. Put information that needs additional properties on a node because recorded links cannot carry them. A relation definition may have constraints or `ext` metadata, but neither adds fields to recorded links.
You can set `constraints` on a relationship or either end in {@link model.Modeller.createRelation | createRelation()}, and change them later with {@link model.Modeller.updateRelation | updateRelation()}. [Add Constraints](constraints.md) explains how rules are evaluated.

## Count both ends

Both bounds default to `0..*` on a new root relation:

| Field         | Counts               |
| ------------- | -------------------- |
| `to.bounds`   | Folders per Document |
| `from.bounds` | Documents per Folder |

For exactly one Folder per Document, set `to.bounds` to `{ lowerBound: 1, upperBound: 1 }`. A Folder may still contain any number of Documents unless `from.bounds` is narrowed too. The same `-1` notation used for [properties](properties.md#choose-a-value-count) means unlimited.

## Select an inherited relationship

Creating Page and Section on the next level does not apply `FILED_IN` there. Select it explicitly:

```ts
const website: Modeller = filing.createNextLevel('Website');
const page: Node = website.createNode({ name: 'Page', refines: document }).element;
const section: Node = website.createNode({ name: 'Section', refines: folder }).element;

website.createRelation({ refines: filedIn, from: { node: page }, to: { node: section } });
```

The new relation inherits `FILED_IN`'s name and bounds. Set `name` in {@link model.Modeller.createRelation | createRelation()} if the local relationship needs another name. You may narrow inherited bounds, but you cannot widen them. Use `nodeId` instead of `node` to pass an ID for either end. If you supply both, the Node object takes precedence. [Refine by Inheritance](inheritance.md) explains why each level must apply its own relationships.

If several permitted relations connect the same node types, pass the intended one as `refines`. [Request Suggestions](suggestions.md#choose-a-relationship) shows how to present those choices in an editor.

## Update a relationship

{@link model.Modeller.updateRelation | updateRelation()} changes a local relation's name, ends, constraints or extension metadata. Its ID and refinement stay fixed. When changing an end, pass the complete end object to keep its ID, node reference and bounds:

```ts
filing.updateRelation(filedIn.id, {
  from: { ...filedIn.from, bounds: { lowerBound: 0, upperBound: 10 } },
});
```

## Remove a relationship

{@link model.Modeller.previewRelationRemoval | previewRelationRemoval()} lists the relation and its refinements in later levels.

```ts
const preview = filing.previewRelationRemoval(filedIn.id);
```

{@link model.Modeller.removeRelation | removeRelation()} rejects the edit while another definition depends on the relation. To remove all relations in the preview, request a cascade:

```ts
filing.removeRelation(filedIn.id, { cascade: true });
```

The cascade also reaches later levels and sibling branches. Check the preview before using it.
