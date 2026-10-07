---
route: schemas
title: JSON Schemas
group: RMF
---

# JSON Schemas

The package includes six JSON schemas. Use a **file schema** for export and import, a **model schema** for one model level, and the **instance schema** for recorded data.

## Model documents

| Schema                                                                                        | Purpose                                                                                                                                                          |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [model.schema.json](https://ramen-schema.org/model/1.0.0/schema.json)                         | One generic RMF model level, including its nodes, data types, properties, relationships and imports. Matches {@link model.Modeller.getModel                      | getModel()}. |
| [ramen-project.schema.json](https://ramen-schema.org/ramen/1.0.0/project.schema.json)         | One RAMEN project level. Adds annotation definitions to the generic model structure. Matches {@link ramen.RamenModel.getModel                                    | getModel()}. |
| [ramen-annotations.schema.json](https://ramen-schema.org/ramen/1.0.0/annotations.schema.json) | The `annotations` section and its reusable definitions. Included in the RAMEN project schema. It describes permitted annotation types, not recorded annotations. |

## Exchange files

| Schema                                                                          | Purpose                                                                                                                                                          |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [model-file.schema.json](https://ramen-schema.org/model/1.0.0/file.schema.json) | One RMF export containing the selected level and its predecessors. Shared declaration lists preserve ownership and inheritance so import can restore the levels. |
| [ramen-file.schema.json](https://ramen-schema.org/ramen/1.0.0/file.schema.json) | The RAMEN export format. Also preserves annotation definitions and their declaring levels.                                                                       |

See [RMF export and import](rmf/exchange.md) and [RAMEN export and import](ramen/export.md).

## Recorded data

| Schema                                                                                    | Purpose                                                                                                                                 |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [model-instances.schema.json](https://ramen-schema.org/model/1.0.0/instances.schema.json) | An instance graph with recorded nodes, property values and relationships. The same structure is used for RMF and RAMEN data validation. |

The instance schema checks the graph's JSON structure. Checking values, permitted relationships and annotation types against a particular model requires the library's [data validation](rmf/validation.md).

## Package paths and identifiers

Every filename above is available as `@ramen-suite/core/schemas/<filename>`. The build copies the schemas from `src/resources/schemas/` to `dist/ramen-core/schemas/`.

The links above are the versioned canonical `$id` values declared in the schemas. They identify the format even before the corresponding website paths are published. The packaged copies are available without fetching those URLs.

`https://ramen-schema.org/ramen/1.0.0/model.json` identifies the built-in {@link ramen.RAMEN_MODEL | RAMEN reference model}. It is a model document, not an additional JSON schema.
