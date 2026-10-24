/** Stable diagnostic codes emitted while validating RAMEN project models. */
export enum RAMEN_VALIDATION_ERROR {
  /** The root model is not a RAMEN project document. */
  PROJECT_FORMAT_REQUIRED = 'RAMEN_PROJECT_FORMAT_REQUIRED',
  /** A RAMEN project does not import the RAMEN reference model. */
  BASE_MODEL_REQUIRED = 'RAMEN_BASE_MODEL_REQUIRED',
  /** The imported RAMEN reference version is not supported by this library. */
  BASE_MODEL_VERSION_UNSUPPORTED = 'RAMEN_BASE_MODEL_VERSION_UNSUPPORTED',
  /** The imported reference does not match the current RAMEN vocabulary. */
  BASE_MODEL_INVALID = 'RAMEN_BASE_MODEL_INVALID',
  /** The `annotations` section does not match its schema. */
  ANNOTATIONS_INVALID = 'RAMEN_ANNOTATIONS_INVALID',
  /** An annotation definition reuses an ID already declared in its model. */
  ANNOTATION_ID_DUPLICATE = 'RAMEN_ANNOTATION_ID_DUPLICATE',
  /** An annotation shape name is empty. */
  ANNOTATION_TYPE_EMPTY = 'RAMEN_ANNOTATION_TYPE_EMPTY',
  /** A type is declared twice for one Annotation node or redeclares an inherited type. */
  ANNOTATION_TYPE_DUPLICATE = 'RAMEN_ANNOTATION_TYPE_DUPLICATE',
  /** A type belongs to a node that does not refine RAMEN Annotation. */
  ANNOTATION_NODE_INVALID = 'RAMEN_ANNOTATION_NODE_INVALID',
  /** A property has an invalid reference, name or data type, duplicates another property, or conflicts with a shared node property. */
  ANNOTATION_PROPERTY_INVALID = 'RAMEN_ANNOTATION_PROPERTY_INVALID',
  /** A selected relationship is missing, incompatible, repeated or overlaps another selected relationship. */
  ANNOTATION_RELATION_INVALID = 'RAMEN_ANNOTATION_RELATION_INVALID',
  /** A type's property or relationship bounds are invalid or widen their modelled bounds. */
  ANNOTATION_BOUNDS_INVALID = 'RAMEN_ANNOTATION_BOUNDS_INVALID',
}
