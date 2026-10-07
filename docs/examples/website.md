---
route: examples/website
title: RMF Model
group: Examples
---

# RMF Model

The file system model defines two types and one permitted relationship:

```ts
import { DataTypes, Modeller } from '@ramen-suite/core/model';
import type { Node, Relation } from '@ramen-suite/core/model';

const files: Modeller = Modeller.create('File system');
const file: Node = files.createNode('File').element;
const folder: Node = files.createNode('Folder').element;

files.createAttribute(file, { name: 'name', typeId: DataTypes.String });

const inFolder: Relation = files.createRelation({
  name: 'IN_FOLDER',
  from: { node: file },
  to: { node: folder, bounds: { lowerBound: 0, upperBound: 1 } },
}).element;
```

The Website model specialises both types. `Post` specialises `Page` within the same level. It inherits `File.name` through Page.

```ts
const website: Modeller = files.createNextLevel('Website');
const page: Node = website.createNode({ name: 'Page', refines: file }).element;
const section: Node = website.createNode({ name: 'Section', refines: folder }).element;
const post: Node = website.createNode({ name: 'Post', refines: page }).element;

website.createAttribute(post, { name: 'published', typeId: DataTypes.Boolean });
website.createRelation({
  refines: inFolder,
  from: { node: page },
  to: { node: section },
});
```

The second level explicitly applies the permitted `IN_FOLDER` relationship to Page and Section. See [Refine by Inheritance](../rmf/inheritance.md) for the rules behind this model.
