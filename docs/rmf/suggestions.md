---
title: Request Suggestions
group: RMF
---

# Request Suggestions

A suggestion is a choice that the current model level permits. Request choices when a person selects a node type, data type or relationship in an editor. Suggestions do not change the model; the choice is applied with a `create*` method. An empty list means that no choice is available.

| Query       | Use it to                                | Example                                                                        |
| ----------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| `get*`      | Read definitions already available       | {@link model.Modeller.getAttributes getAttributes(node)}                       |
| `suggest*`  | Find choices for the current model level | {@link model.Modeller.suggestRelations suggestRelations(from, to)}             |
| `validate*` | Check a model or a proposed value        | {@link model.Modeller.validateAttributeName validateAttributeName(node, name)} |

The following steps use the [Filing and Website models](rmf.md) from the RMF guide. Filing permits Document → Folder through `FILED_IN`:

```ts
import { DataTypes, Modeller } from '@ramen-suite/core/model';
import type { Node } from '@ramen-suite/core/model';

const filing: Modeller = Modeller.create('Filing');
const document: Node = filing.createNode('Document').element;
const folder: Node = filing.createNode('Folder').element;

filing.createAttribute(document, {
  name: 'title',
  typeId: DataTypes.String,
  bounds: { lowerBound: 1, upperBound: 1 },
});
filing.createRelation({ name: 'FILED_IN', fromNode: document, toNode: folder });

const website: Modeller = filing.createNextLevel('Website');
```

## Choose a node to refine

{@link model.Modeller.suggestNodes | suggestNodes()} lists imported nodes that Website can refine. Pass the selected suggestion directly to `createNode()`:

```ts
import type { NodeSuggestion } from '@ramen-suite/core/model';

const nodes: readonly NodeSuggestion[] = website.suggestNodes();
// Document and Folder are available.

function addNode(name: string, selected: NodeSuggestion): Node {
  return website.createNode({ name, refines: selected }).element;
}
```

For the next steps, create Page and Section from the known definitions:

```ts
const page: Node = website.createNode({ name: 'Page', refines: document }).element;
const section: Node = website.createNode({ name: 'Section', refines: folder }).element;
```

## Choose a data type

{@link model.Modeller.suggestDataTypes | suggestDataTypes()} includes built-in and declared types. The selected suggestion can be used as an attribute's `type`:

```ts
import type { DataTypeSuggestion } from '@ramen-suite/core/model';

const types: readonly DataTypeSuggestion[] = website.suggestDataTypes();
// Boolean, Float, Integer, Object and String are available.

function addSummary(selected: DataTypeSuggestion): void {
  website.createAttribute(page, { name: 'summary', type: selected });
}
```

The editor presents `types`; the caller passes the chosen object to `addSummary`. For a known type in code, use `typeId: DataTypes.String` directly.

## Choose a relationship

{@link model.Modeller.suggestRelations | suggestRelations(from, to)} returns the preceding level's relationships that accept both node types:

```ts
import type { RelationSuggestion } from '@ramen-suite/core/model';

const relations: readonly RelationSuggestion[] = website.suggestRelations(page, section);
// One choice: FILED_IN, from Document → Folder.

function addFilingRelation(selected?: RelationSuggestion): void {
  website.createRelation({ fromNode: page, toNode: section, refines: selected });
}
```

Pass the chosen suggestion to `addFilingRelation`; omit it when exactly one relationship fits.

## Check an attribute name

An editor may let users add properties to Page. Because Page refines Document, it already has Document's required `title`. Use {@link model.Modeller.getAttributes | getAttributes(page)} to show existing properties and {@link model.Modeller.validateAttributeName | validateAttributeName(page, name)} to check a new name before creating the attribute:

```ts
import type { AttributeNameResult } from '@ramen-suite/core/model';

const result: AttributeNameResult = website.validateAttributeName(page, 'title');
// { allowed: false, conflicts: ['attribute'] }
```

RAMEN-specific choices, including annotation types for a node, are covered in [Annotation Suggestions](../ramen/ramen-suggestions.md).
