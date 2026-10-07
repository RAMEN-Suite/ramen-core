---
title: Request Suggestions
group: RMF
---

# Request Suggestions

A suggestion is a choice available while editing the current model. Request choices when a person selects a node type, data type or relationship. Suggestions leave the model unchanged until you apply a choice with a `create*` method. An empty list means that no matching choice is available.

| Query       | Use it to                                | Example                                                                        |
| ----------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| `get*`      | Read definitions already available       | {@link model.Modeller.getAttributes getAttributes(node)}                       |
| `suggest*`  | Find choices for the current model level | {@link model.Modeller.suggestRelations suggestRelations(from, to)}             |
| `validate*` | Check a model or a proposed value        | {@link model.Modeller.validateAttributeName validateAttributeName(node, name)} |

The following steps use the [Filing and Website models](rmf.md) from the RMF guide. Filing permits Document → Folder through `FILED_IN`:

```ts
import { DataTypes, Modeller } from '@ramen-suite/core/model';
import type { Node, Relation } from '@ramen-suite/core/model';

const filing: Modeller = Modeller.create('Filing');
const document: Node = filing.createNode('Document').element;
const folder: Node = filing.createNode('Folder').element;

filing.createAttribute(document, {
  name: 'title',
  typeId: DataTypes.String,
  bounds: { lowerBound: 1, upperBound: 1 },
});
filing.createRelation({ name: 'FILED_IN', from: { node: document }, to: { node: folder } });

const website: Modeller = filing.createNextLevel('Website');
```

## Choose a node to refine

{@link model.Modeller.suggestNodes | suggestNodes()} lists both local and imported nodes that can be refined. Filing can refine its own Document, and Website can refine the imported Document. Pass a selected suggestion directly to {@link model.Modeller.createNode | createNode()}:

```ts
import type { NodeSuggestion } from '@ramen-suite/core/model';

const localNodes: readonly NodeSuggestion[] = filing.suggestNodes();
const websiteNodes: readonly NodeSuggestion[] = website.suggestNodes();
// Both lists include Document and Folder.

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

{@link model.Modeller.suggestDataTypes | suggestDataTypes()} includes the [built-in and declared types](data-types.md). The selected suggestion can be used as an attribute's `type`:

```ts
import type { DataTypeSuggestion } from '@ramen-suite/core/model';

const types: readonly DataTypeSuggestion[] = website.suggestDataTypes();
// Boolean, Float, Integer, Object and String are available.

function addSummary(selected: DataTypeSuggestion): void {
  website.createAttribute(page, { name: 'summary', type: selected });
}
```

The editor presents `types` and passes the chosen object to `addSummary`. For a known type in code, use `typeId: DataTypes.String` directly.

## Choose a relationship

{@link model.Modeller.suggestRelations | suggestRelations(from, to)} returns compatible local and permitted predecessor relationships. Here Website has no local relationship yet, so the suggestion comes from Filing:

```ts
import type { RelationSuggestion } from '@ramen-suite/core/model';

const relations: readonly RelationSuggestion[] = website.suggestRelations(page, section);
// One choice: FILED_IN, from Document → Folder.

function addFilingRelation(selected?: RelationSuggestion): Relation {
  return website.createRelation({ from: { node: page }, to: { node: section }, refines: selected }).element;
}

const pageFiledIn: Relation = addFilingRelation(relations[0]);
```

Pass the chosen suggestion to `addFilingRelation`, or omit it when exactly one relationship fits. If several fit, select one explicitly. [Refine by Inheritance](inheritance.md) explains why Website must apply the relationship.

## Explore connections from a node

After a relationship is applied, {@link model.Modeller.suggestConnections | suggestConnections(page)} lists its outgoing or incoming directions and compatible target types in the current level:

```ts
import type { NodeRelationSuggestion } from '@ramen-suite/core/model';

const connections: readonly NodeRelationSuggestion[] = website.suggestConnections(page);
// FILED_IN is outgoing from Page and accepts Section.
```

Before `pageFiledIn` was created, this list was empty in Website. `suggestRelations(page, section)` answered a different question: which predecessor relationship **could be applied** between those types.

## Check an attribute name

An editor may let users add properties to Page. Because Page refines Document, it already has Document's required `title`. Use {@link model.Modeller.getAttributes | getAttributes(page)} to show existing properties and {@link model.Modeller.validateAttributeName | validateAttributeName(page, name)} to check a new name before creating the attribute:

```ts
import type { AttributeNameResult } from '@ramen-suite/core/model';

const result: AttributeNameResult = website.validateAttributeName(page, 'title');
// { allowed: false, conflicts: ['attribute'] }
```
