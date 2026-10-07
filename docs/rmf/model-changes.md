---
route: rmf/model-changes
title: Track Model Changes
group: RMF
---

# Track Model Changes

Use a {@link model.Modeller.snapshot | snapshot()} to keep an editable copy of the whole workspace before a change. Then use {@link model.Modeller.compareTo | compareTo()} to get an {@link model.EvolutionReport | EvolutionReport} for the before and after states. Both states retain their model levels.

## Keep the earlier state

Create Filing and a Website level that refines it:

```ts
import { DataTypes, Modeller } from '@ramen-suite/core/model';
import type { Attribute, AttributeInfo, DataType, EvolutionChange, EvolutionReport, Node } from '@ramen-suite/core/model';

const filing: Modeller = Modeller.create('Filing');
const document: Node = filing.createNode('Document').element;
const status: DataType = filing.createDataType({ name: 'Status', baseType: DataTypes.String }).element;

const website: Modeller = filing.createNextLevel('Website');
const page: Node = website.createNode({ name: 'Page', refines: document }).element;
const before: Modeller = website.snapshot();
```

The snapshot includes Filing and Website. Edits to either original level leave `before` unchanged.

## Compare the states

Add a property to Filing, rename Page and remove the unused Status type. The renamed node in Website inherits the new property, while the Page in the snapshot keeps its earlier definition:

```ts
const title: Attribute = filing.createAttribute(document, {
  name: 'title',
  typeId: DataTypes.String,
}).element;
website.updateNode(page.id, { name: 'Article' });
filing.removeDataType(status.id);

console.log(website.getAttributes(page).map((item: AttributeInfo): string => item.name)); // ['title']
console.log(before.getAttributes(page)); // []

const report: EvolutionReport = before.compareTo(website);
const titleChange: EvolutionChange | undefined = report.changes.find(
  (change: EvolutionChange): boolean => change.element === 'attribute' && change.elementId === title.id,
);

console.log(titleChange?.action); // 'added'
```

The report uses stable IDs to identify added, removed and changed models, nodes, attributes, data types, literals and relations. An {@link model.EvolutionChange | EvolutionChange} gives the declaring `modelId`, `elementId` and, where relevant, `ownerId`, plus `before` and `after` values.

`beforeDiagnostics` and `afterDiagnostics` contain validation findings for each complete workspace. They show whether an edit left a model invalid, as explained in [Validate Models and Data](validation.md). The report describes differences without changing either state or migrating recorded data.

## Read the report

Here is a shortened view of `report`. The API supplies generated IDs and complete definitions in `before` and `after`:

```jsonc
{
  "beforeModelId": "<website-id>",
  "afterModelId": "<website-id>",
  "beforeDiagnostics": [],
  "afterDiagnostics": [],
  "changes": [
    {
      "action": "changed",
      "element": "node",
      "modelId": "<website-id>",
      "elementId": "<page-id>",
      "before": { "name": "Page" },
      "after": { "name": "Article" },
    },
    {
      "action": "added",
      "element": "attribute",
      "modelId": "<filing-id>",
      "elementId": "<title-id>",
      "ownerId": "<document-id>",
      "after": { "name": "title", "typeId": "String" },
    },
    {
      "action": "removed",
      "element": "dataType",
      "modelId": "<filing-id>",
      "elementId": "<status-id>",
      "before": { "name": "Status", "baseType": "String" },
    },
  ],
}
```
