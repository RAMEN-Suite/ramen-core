---
title: Refine by Inheritance
group: RMF
---

# Refine by Inheritance

A refined node is a more specific **type of recorded object**. It inherits its ancestor's properties and rules. Refinement works within one model and across model levels. A new level also lets a project choose its permitted relationships.

|                           | In one model                                     | In a new model level                                         |
| ------------------------- | ------------------------------------------------ | ------------------------------------------------------------ |
| Example                   | `Letter` refines `Document` in Filing.           | `Page` refines Filing's `Document` in Website.               |
| Owner                     | Both types belong to Filing.                     | `Page` belongs to Website, while `Document` stays in Filing. |
| Properties and node rules | Inherited.                                       | Inherited through the imported model.                        |
| Relationships             | A relation for `Document` also accepts `Letter`. | Website must apply each Filing relation it wants to permit.  |

Both `Document` and `Page` are model definitions. `Page` is **not** a recorded Document. A tool records objects later and checks them against the model, as shown in [Validate Models and Data](validation.md).

## Refine within one model

Start with two types and a required title. The title rule checks every recorded value, including values on subtypes:

```ts
import { DataTypes, Modeller } from '@ramen-suite/core/model';
import type { Attribute, Constraint, Node, Relation } from '@ramen-suite/core/model';

const filing: Modeller = Modeller.create('Filing');
const document: Node = filing.createNode('Document').element;
const folder: Node = filing.createNode('Folder').element;

const titleRule: Constraint = {
  id: 'titleLengthRule01',
  name: 'Title length',
  language: 'json-schema',
  expression: { minLength: 3 },
};
const title: Attribute = filing.createAttribute(document, {
  name: 'title',
  typeId: DataTypes.String,
  bounds: { lowerBound: 1, upperBound: 1 },
  constraints: [titleRule],
}).element;

const letter: Node = filing.createNode({ name: 'Letter', refines: document }).element;
```

`Letter` inherits the required `title` and its length rule. Its own `attributes` list stays empty. {@link model.Modeller.getAttributes | getAttributes(letter)} lists the visible properties, while {@link model.Modeller.getConstraints | getConstraints(title)} reads the rule declared on `title`:

```ts
filing.getAttributes(letter); // Includes title, declared by Document.
filing.getConstraints(title); // Includes the title-length rule.
```

You may add a new property to Letter. To change `title` for every subtype, update the original property on Document instead of declaring it again on Letter. See [Add Properties](properties.md).

Now permit Documents to be filed in Folders:

```ts
const filedIn: Relation = filing.createRelation({
  name: 'FILED_IN',
  from: { node: document },
  to: { node: folder, bounds: { lowerBound: 0, upperBound: 2 } },
}).element;
```

The same `FILED_IN` definition accepts a recorded Letter → Folder link because Letter is a Document subtype. It also permits every other Document subtype in Filing. If only Letters should be filed, define the relation for Letter instead.

## Create another model level

Website imports Filing. It refines Document and Folder into types suited to that project:

```ts
const website: Modeller = filing.createNextLevel('Website');
const page: Node = website.createNode({ name: 'Page', refines: document }).element;
const section: Node = website.createNode({ name: 'Section', refines: folder }).element;

website.createAttribute(page, { name: 'slug', typeId: DataTypes.String });
```

Page inherits Document's required `title` and adds `slug`. The title rule remains owned by Filing. A node can also be used **without** a new refinement: Website may refer to Filing's Folder directly where it needs that type.

Importing Filing does not automatically permit its relationships in Website. Apply the relationship between Page and Section explicitly:

```ts
const pageFiledIn: Relation = website.createRelation({
  refines: filedIn,
  from: { node: page },
  to: { node: section, bounds: { lowerBound: 0, upperBound: 1 } },
}).element;
```

This applies `FILED_IN` to the new types and narrows its target count from `0..2` to `0..1`. It cannot widen that count. The relationship's own rules, including rules on `from` and `to`, also remain in force. [Add Relationships](relationships.md) explains the two bounds.

## Continue to a third level

The same pattern can continue. NewsSite refines Page but reuses Website's Section without creating another Section type:

```ts
const news: Modeller = website.createNextLevel('NewsSite');
const articlePage: Node = news.createNode({ name: 'ArticlePage', refines: page }).element;

news.createRelation({
  refines: pageFiledIn,
  from: { node: articlePage },
  to: { node: section },
});
```

ArticlePage inherits `title` from Document and `slug` from Page. NewsSite applies the permitted relationship again because leaving it out would make it unavailable in NewsSite and later levels. A later level cannot restore a relationship that its predecessor omitted by reaching back to Filing.

{@link model.Modeller.getNodeLineage | getNodeLineage(articlePage)} returns the ancestors in **base-first order**: Document, Page, ArticlePage. {@link model.Modeller.getAttributes | getAttributes(articlePage)} lists the inherited and local properties visible on ArticlePage.

## What follows a refinement?

| Definition                   | On a refined node or relation                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Node properties              | Inherited with their data types, cardinalities, flags and constraints. Add new names without redeclaring inherited ones. |
| Node constraints             | All ancestor and local rules are checked. {@link model.Modeller.getConstraints                                           | getConstraints(node)} returns only rules declared directly on that node. |
| Data types and literals      | Reused through imports. They are not refined along the node inheritance chain.                                           |
| Relationships in one model   | A relation's endpoint accepts subtypes of its declared node.                                                             |
| Relationships in a new level | Apply each permitted predecessor relation explicitly. Endpoints and bounds may stay the same or become more specific.    |
| Relation constraints         | A refined relation keeps ancestor rules and may add its own rules.                                                       |

Each node and relation currently has **at most one direct supertype**. The chain must be acyclic. In a model with imports, every new node needs a parent. Reuse an imported node when no new type is needed. Model validation reports violations of these rules before export.

## Edit and exchange the levels

Levels created with {@link model.Modeller.createNextLevel | createNextLevel()} share an editable workspace. Changing Document in Filing affects the effective definition of Page and ArticlePage. To edit a rule owned by Filing, open or use the Filing level. A descendant cannot overwrite that inherited rule locally.

You can change a level's name, URI or version with {@link model.Modeller.updateModel | updateModel()}. The workspace updates the import headers in later levels at the same time. From Filing, {@link model.Modeller.updateNextLevel | updateNextLevel()} can update its direct child Website:

```ts
filing.updateNextLevel(website.getModel().id, { name: 'Public Website', version: '2.0.0' });
news.validate(); // NewsSite still resolves Website through its updated import.
```

Capture the whole workspace before a change if you need a stable earlier state:

```ts
const before: Modeller = news.snapshot();
filing.updateConstraint(title, titleRule.id, { expression: { minLength: 5 } });
```

NewsSite now uses the stricter title rule, while `before` retains the old one. [Track Model Changes](model-changes.md) shows how to compare these states. {@link model.Modeller.export | export()} writes the selected level and its predecessors into one JSON file, keeping each definition's owning model and inheritance references. [Export and Import](exchange.md) shows how the levels are restored from that file.

Before removing Website, {@link model.Modeller.previewNextLevelRemoval | previewNextLevelRemoval()} shows which later levels depend on it. {@link model.Modeller.removeNextLevel | removeNextLevel()} rejects the removal while NewsSite imports Website. Use `cascade` only when both levels should go:

```ts
const preview = filing.previewNextLevelRemoval(website.getModel().id);
// preview.models: Website, NewsSite

filing.removeNextLevel(website.getModel().id, { cascade: true });
```

An open modeller for a removed level can no longer be used. An unrelated sibling level stays in the workspace.
