---
route: rmf/diagnostics
title: Read Diagnostics
group: RMF
---

# Read Diagnostics

{@link model.Modeller.validate | validate()} and {@link model.Modeller.validateInstances | validateInstances(data)} return a list of {@link model.Diagnostic | diagnostics}. Read `code` when your tool needs to react to a finding.

| Field      | Meaning                                      |
| ---------- | -------------------------------------------- |
| `severity` | `error`, `warn` or `info`                    |
| `code`     | Stable identifier for the failed rule        |
| `message`  | Explanation for people                       |
| `path`     | Location in the checked JSON, when available |
| `ref`      | Related model or element ID, when available  |

For example, continue [Validate Recorded Data](validate-data.md#missing-required-values), where a Document lacks its required `title`:

```ts
for (const diagnostic of checked.diagnostics) {
  console.log(diagnostic.code, diagnostic.path, diagnostic.message);
}
```

That check reports `INSTANCE_PROPERTY_REQUIRED` at `/nodes/0/properties/title`: `0` means the first entry in `data.nodes`, and `title` names its missing property. The record is `data.nodes[0]`, whose ID is `record1`. Use that ID when showing the finding in a tool. The path is positional, so it changes if records are reordered. For missing values, its final segment names where the value should be, even though that location does not yet exist.

Paths follow [JSON Pointer](https://datatracker.ietf.org/doc/html/rfc6901) notation. `ref` identifies a related declaration or record rather than a second path.

An `error` sets `hasErrors` to `true`. A model result also has `valid`, which is `false` when errors prevent a usable project graph. Warnings and information may still appear in `diagnostics` without invalidating the result. See [Validate Models and Data](validation.md) for the two checks.

## Model and graph codes

These codes come from {@link model.VALIDATION_ERROR | RMF validation}. Structural errors may stop validation before later rules run.

### Structure and references

<!-- diagnostics:structure:start -->

| Code                              | Meaning                                                      |
| --------------------------------- | ------------------------------------------------------------ |
| `SCHEMA_INVALID`                  | A model document does not match the RMF schema.              |
| `PROJECT_ROOT_NOT_FOUND`          | The requested root model is absent.                          |
| `DUPLICATE_MODEL_ID`              | Two supplied models have the same ID.                        |
| `DUPLICATE_ELEMENT_ID`            | An ID is used more than once inside one model.               |
| `IMPORTED_MODEL_NOT_FOUND`        | An import names a model that was not supplied.               |
| `IMPORTED_MODEL_URI_MISMATCH`     | An import's URI differs from the target model's URI.         |
| `IMPORTED_VERSION_MISMATCH`       | An import's version differs from the target model's version. |
| `IMPORT_CYCLE`                    | Model imports form a cycle.                                  |
| `INHERITANCE_CYCLE`               | Node or relationship refinements form a cycle.               |
| `REFERENCE_MODEL_NOT_REACHABLE`   | A reference points to a model outside the owner's imports.   |
| `ELEMENT_REFERENCE_NOT_FOUND`     | A referenced element does not exist.                         |
| `ELEMENT_REFERENCE_KIND_MISMATCH` | A reference points to the wrong kind of element.             |
| `IMPORT_MODEL_ID_DUPLICATE`       | A model imports the same model more than once.               |
| `IMPORT_SELF_NOT_ALLOWED`         | A model imports itself.                                      |

<!-- diagnostics:structure:end -->

### Nodes, properties and data types

<!-- diagnostics:nodes:start -->

| Code                                    | Meaning                                                              |
| --------------------------------------- | -------------------------------------------------------------------- |
| `NODE_REFINEMENT_REQUIRED`              | A new node in a model with imports does not refine an existing node. |
| `NODE_MULTIPLE_SUPERTYPES_UNSUPPORTED`  | A node lists more than one direct supertype.                         |
| `ATTRIBUTE_NAME_DUPLICATE`              | A node declares the same property name twice.                        |
| `ATTRIBUTE_NAME_SHADOWS_SUPERTYPE`      | A local property reuses an inherited name.                           |
| `ATTRIBUTE_BOUNDS_INVALID`              | A property's cardinality bounds are incoherent.                      |
| `ATTRIBUTE_MULTIPLE_KEYS`               | A node has more than one key, including inherited keys.              |
| `ATTRIBUTE_KEY_BOUNDS_INVALID`          | A key property's bounds are not `1..1`.                              |
| `DATATYPE_LITERAL_TYPE_INVALID`         | A literal does not fit its data type's base type.                    |
| `DATATYPE_LITERAL_NAME_DUPLICATE`       | Two literals have the same name.                                     |
| `DATATYPE_LITERAL_SERIALIZED_DUPLICATE` | Two literals produce the same stored string.                         |
| `DATATYPE_LITERAL_VALUE_DUPLICATE`      | Two literals have the same numeric value.                            |

<!-- diagnostics:nodes:end -->

### Relationships and constraints

<!-- diagnostics:relations:start -->

| Code                                       | Meaning                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| `RELATION_SCOPE_INVALID`                   | This level selects a relationship that its preceding level does not permit. |
| `RELATION_MULTIPLE_SUPERTYPES_UNSUPPORTED` | A relationship lists more than one direct supertype.                        |
| `RELATION_END_BOUNDS_INVALID`              | A relationship end has incoherent cardinality bounds.                       |
| `RELATION_BOUNDS_WIDENED`                  | A selected relationship widens inherited bounds.                            |
| `RELATION_END_TYPE_INCOMPATIBLE`           | An endpoint type does not match or refine the inherited endpoint.           |
| `CONSTRAINT_LANGUAGE_UNSUPPORTED`          | No evaluator is registered for the constraint's language.                   |
| `CONSTRAINT_EXPRESSION_INVALID`            | An expression, format name or input value cannot be evaluated as requested. |
| `CONSTRAINT_REGEX_MISMATCH`                | A value does not match a regular expression.                                |
| `CONSTRAINT_FORMAT_MISMATCH`               | A value does not match a declared string format.                            |
| `CONSTRAINT_JSON_SCHEMA_MISMATCH`          | A value does not match a JSON Schema constraint.                            |

<!-- diagnostics:relations:end -->

## Recorded-data codes

These codes come from {@link model.Modeller.validateInstances | validateInstances(data)}. A tool must first translate its records into a `ModelInstanceGraph`.

<!-- diagnostics:data:start -->

| Code                                 | Meaning                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `INSTANCE_SCHEMA_INVALID`            | The recorded graph does not match the instance schema.                   |
| `INSTANCE_NODE_ID_DUPLICATE`         | Two recorded nodes have the same ID.                                     |
| `INSTANCE_NODE_TYPE_NOT_FOUND`       | A recorded node's `typeId` cannot be resolved.                           |
| `INSTANCE_KEY_DUPLICATE`             | Two records use the same value for a key property.                       |
| `INSTANCE_PROPERTY_UNKNOWN`          | A recorded property is not declared for its node type.                   |
| `INSTANCE_PROPERTY_REQUIRED`         | A required property is missing.                                          |
| `INSTANCE_PROPERTY_ARRAY_REQUIRED`   | A many-valued property was supplied as one value.                        |
| `INSTANCE_PROPERTY_SCALAR_REQUIRED`  | A single-valued property was supplied as an array.                       |
| `INSTANCE_PROPERTY_NOT_UNIQUE`       | A property contains duplicate values although it requires unique values. |
| `INSTANCE_PROPERTY_TYPE_INVALID`     | A value does not match its built-in or custom data type.                 |
| `INSTANCE_PROPERTY_LITERAL_INVALID`  | A value is not among the declared literals.                              |
| `INSTANCE_RELATION_ID_DUPLICATE`     | Two recorded links have the same ID.                                     |
| `INSTANCE_RELATION_TYPE_NOT_ALLOWED` | A link uses a relationship excluded by the active model level.           |
| `INSTANCE_RELATION_TYPE_NOT_FOUND`   | A link's relationship type cannot be resolved.                           |
| `INSTANCE_RELATION_FROM_NOT_FOUND`   | A link's source record is missing.                                       |
| `INSTANCE_RELATION_TO_NOT_FOUND`     | A link's target record is missing.                                       |
| `INSTANCE_RELATION_END_TYPE_INVALID` | A linked record has an incompatible node type.                           |
| `INSTANCE_CARDINALITY_INVALID`       | A property's or relationship's value count falls outside its bounds.     |

<!-- diagnostics:data:end -->

A constraint may supply its own `code`, and a custom evaluator may return its own diagnostics. Those codes are defined by the project or tool.
