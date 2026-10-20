---
route: ramen/diagnostics
title: Read Diagnostics
group: RAMEN
---

# Read Diagnostics

RAMEN returns the [generic RMF diagnostics](../rmf/diagnostics.md) and the additional codes below. Model codes describe invalid definitions. Data codes describe recorded annotations that do not follow a valid model. See [Validate RAMEN Data](validation.md) for an example.

## Model codes

<!-- diagnostics:model:start -->

| Code                                | Meaning                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `RAMEN_PROJECT_FORMAT_REQUIRED`     | The root model is not a RAMEN project document.                                                                                |
| `RAMEN_BASE_MODEL_REQUIRED`         | A RAMEN project does not import the RAMEN reference model.                                                                     |
| `RAMEN_ANNOTATIONS_INVALID`         | The `annotations` section does not match its schema.                                                                           |
| `RAMEN_ANNOTATION_ID_DUPLICATE`     | An annotation definition reuses an ID already declared in its model.                                                           |
| `RAMEN_ANNOTATION_TYPE_EMPTY`       | An annotation shape name is empty.                                                                                             |
| `RAMEN_ANNOTATION_TYPE_DUPLICATE`   | A type is declared twice for one Annotation node or redeclares an inherited type.                                              |
| `RAMEN_ANNOTATION_NODE_INVALID`     | A type belongs to a node that does not refine RAMEN Annotation.                                                                |
| `RAMEN_ANNOTATION_PROPERTY_INVALID` | A property has an invalid reference, name or data type, duplicates another property, or conflicts with a shared node property. |
| `RAMEN_ANNOTATION_RELATION_INVALID` | A selected relationship is missing, incompatible, repeated or overlaps another selected relationship.                          |
| `RAMEN_ANNOTATION_BOUNDS_INVALID`   | A type's property or relationship bounds are invalid or widen their modelled bounds.                                           |

<!-- diagnostics:model:end -->

## Recorded-data codes

<!-- diagnostics:data:start -->

| Code                                             | Meaning                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `RAMEN_INSTANCE_ANNOTATION_REQUIRED`             | An Annotation record has no string `type`.                                   |
| `RAMEN_INSTANCE_ANNOTATION_UNKNOWN`              | The declared `type` is unavailable for this Annotation node.                 |
| `RAMEN_INSTANCE_ANNOTATION_PROPERTY_NOT_ALLOWED` | The annotation record contains a property its type does not permit.          |
| `RAMEN_INSTANCE_SELECTOR_TYPE_REQUIRED`          | A supplied selector object has no non-empty `type`.                          |
| `RAMEN_INSTANCE_ANNOTATION_RELATION_NOT_ALLOWED` | A link on this annotation is absent from its type's permitted relationships. |
| `RAMEN_INSTANCE_ANNOTATION_RELATION_CARDINALITY` | Too few or too many links match a relationship rule of the annotation shape. |

<!-- diagnostics:data:end -->

Missing, malformed or wrongly typed property values still use the [generic data codes](../rmf/diagnostics.md#recorded-data-codes). A `person` annotation without its required Person link, for example, reports `RAMEN_INSTANCE_ANNOTATION_RELATION_CARDINALITY`.
