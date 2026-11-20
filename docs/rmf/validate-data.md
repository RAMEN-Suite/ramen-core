---
route: rmf/validate-data
title: Validate Data
group: RMF
---

# Validate Recorded Data

{@link model.Modeller.validateInstances | validateInstances(data)} checks recorded objects and links against a valid model. A tool first translates its stored data into a complete {@link model.ModelInstanceGraph | ModelInstanceGraph} because RMF does not read databases or tool-specific file formats.

## Missing required values

Document requires a title, but the recorded Document below has none:

```ts
import { DataTypes, Modeller } from '@ramen-suite/core/model';
import type { ModelInstanceGraph, Node, ValidationResult } from '@ramen-suite/core/model';

const model: Modeller = Modeller.create('Filing');
const document: Node = model.createNode('Document').element;
model.createAttribute(document, {
  name: 'title',
  typeId: DataTypes.String,
  bounds: { lowerBound: 1, upperBound: 1 },
});

const data: ModelInstanceGraph = {
  nodes: [{ id: 'documentRecord01', typeId: document.id, properties: {} }],
  relations: [],
};
const checked: ValidationResult = model.validateInstances(data);
console.log(checked.diagnostics);
// INSTANCE_PROPERTY_REQUIRED at /nodes/0/properties/title.
```

`documentRecord01` identifies the recorded object. Record and link IDs must contain at least 16 letters, digits, underscores or hyphens. `document.id` identifies its model type. The model already supplies the validation context, so the data graph has no model ID. [Read Diagnostics](diagnostics.md) explains the path.

## Too many links

A relationship can limit how many Folders one Document may have. Here the limit is one:

```ts
import type { Relation } from '@ramen-suite/core/model';

const folder: Node = model.createNode('Folder').element;
const filedIn: Relation = model.createRelation({
  name: 'FILED_IN',
  from: { node: document },
  to: { node: folder, bounds: { lowerBound: 0, upperBound: 1 } },
}).element;

const links: ModelInstanceGraph = {
  nodes: [
    { id: 'documentRecord01', typeId: document.id, properties: { title: 'Example' } },
    { id: 'folderRecord0001', typeId: folder.id, properties: {} },
    { id: 'folderRecord0002', typeId: folder.id, properties: {} },
  ],
  relations: [
    { id: 'relationRecord01', typeId: filedIn.id, fromId: 'documentRecord01', toId: 'folderRecord0001' },
    { id: 'relationRecord02', typeId: filedIn.id, fromId: 'documentRecord01', toId: 'folderRecord0002' },
  ],
};

const linkResult: ValidationResult = model.validateInstances(links);
console.log(linkResult.diagnostics);
// INSTANCE_CARDINALITY_INVALID
```

The input is the **complete proposed graph**, including both links. When checking an edit, add it to a copy of the complete graph before validation. Checking only the new link would leave out existing links and could give a wrong result.

Validation checks declared properties, data types, endpoints, selected relationships, cardinalities and applicable [constraints](constraints.md). It cannot establish whether a recorded statement is factually correct. Express project rules in the model or register a custom evaluator.

## Use a validation profile

Validation is strict by default. An optional {@link model.InstanceValidationProfile | InstanceValidationProfile} can retain specific historical values as warnings without changing the model. Rules match a property's stable ID, a constraint ID and the original diagnostic code. An `accepts` predicate decides which recorded values qualify. Findings keep their code, message, path and references; only their severity changes.

For example, suppose `issuedOn` uses a string data type with a `format: date` constraint named `dateConstraint`. To retain one historical date spelling:

```ts
import { VALIDATION_ERROR } from '@ramen-suite/core/model';
import type { InstanceValidationProfile } from '@ramen-suite/core/model';

const profile: InstanceValidationProfile = {
  rules: [
    {
      attributeId: issuedOn.id,
      constraintId: dateConstraint.id,
      code: VALIDATION_ERROR.CONSTRAINT_FORMAT_MISMATCH,
      accepts: (value: unknown): boolean => value === '14.07.1912',
    },
  ],
};

const result: ValidationResult = model.validateInstances(data, { profile });
```

The predicate can recognise other historical spellings as needed. It is caller-supplied application code; errors thrown by it propagate. Combine profiles through `{ rules: [...first.rules, ...second.rules] }`. Custom constraint evaluators can accompany a profile through `{ profile, constraints: registry }`.

Profiles apply to property values, including inherited properties. They do not bypass model or instance-schema validation, unknown-property checks, relationships or key uniqueness. Unmatched findings retain their original severity. Field checks with `validateAttributeValue()` can use the same `{ profile }`; a type-only `validateValue()` check has no property context and remains strict. Use strict validation when creating new data.
