/** Stable diagnostic codes; their exact values are part of the public contract. */
export enum VALIDATION_ERROR {
  /**
   * A model document does not match the RMF schema.
   * @group Structure and references
   */
  SCHEMA_INVALID = 'SCHEMA_INVALID',
  /** The requested root model is absent. */
  PROJECT_ROOT_NOT_FOUND = 'PROJECT_ROOT_NOT_FOUND',
  /** Two supplied models have the same ID. */
  DUPLICATE_MODEL_ID = 'DUPLICATE_MODEL_ID',
  /** An ID is used more than once inside one model. */
  DUPLICATE_ELEMENT_ID = 'DUPLICATE_ELEMENT_ID',
  /** An import names a model that was not supplied. */
  IMPORTED_MODEL_NOT_FOUND = 'IMPORTED_MODEL_NOT_FOUND',
  /** An import's URI differs from the target model's URI. */
  IMPORTED_MODEL_URI_MISMATCH = 'IMPORTED_MODEL_URI_MISMATCH',
  /** An import's version differs from the target model's version. */
  IMPORTED_VERSION_MISMATCH = 'IMPORTED_VERSION_MISMATCH',
  /** Model imports form a cycle. */
  IMPORT_CYCLE = 'IMPORT_CYCLE',
  /** Node or relationship refinements form a cycle. */
  INHERITANCE_CYCLE = 'INHERITANCE_CYCLE',
  /** A reference points to a model outside the owner's imports. */
  REFERENCE_MODEL_NOT_REACHABLE = 'REFERENCE_MODEL_NOT_REACHABLE',
  /** A referenced element does not exist. */
  ELEMENT_REFERENCE_NOT_FOUND = 'ELEMENT_REFERENCE_NOT_FOUND',
  /** A reference points to the wrong kind of element. */
  ELEMENT_REFERENCE_KIND_MISMATCH = 'ELEMENT_REFERENCE_KIND_MISMATCH',
  /** A model imports the same model more than once. */
  IMPORT_MODEL_ID_DUPLICATE = 'IMPORT_MODEL_ID_DUPLICATE',
  /** A model imports itself. */
  IMPORT_SELF_NOT_ALLOWED = 'IMPORT_SELF_NOT_ALLOWED',
  /**
   * A new node in a model with imports does not refine an existing node.
   * @group Nodes, properties and data types
   */
  NODE_REFINEMENT_REQUIRED = 'NODE_REFINEMENT_REQUIRED',
  /** A node lists more than one direct supertype. */
  NODE_MULTIPLE_SUPERTYPES_UNSUPPORTED = 'NODE_MULTIPLE_SUPERTYPES_UNSUPPORTED',
  /** A node declares the same property name twice. */
  ATTRIBUTE_NAME_DUPLICATE = 'ATTRIBUTE_NAME_DUPLICATE',
  /** A local property reuses an inherited name. */
  ATTRIBUTE_NAME_SHADOWS_SUPERTYPE = 'ATTRIBUTE_NAME_SHADOWS_SUPERTYPE',
  /** A property's cardinality bounds are incoherent. */
  ATTRIBUTE_BOUNDS_INVALID = 'ATTRIBUTE_BOUNDS_INVALID',
  /** A node has more than one key, including inherited keys. */
  ATTRIBUTE_MULTIPLE_KEYS = 'ATTRIBUTE_MULTIPLE_KEYS',
  /** A key property's bounds are not `1..1`. */
  ATTRIBUTE_KEY_BOUNDS_INVALID = 'ATTRIBUTE_KEY_BOUNDS_INVALID',
  /** A literal does not fit its data type's base type. */
  DATATYPE_LITERAL_TYPE_INVALID = 'DATATYPE_LITERAL_TYPE_INVALID',
  /** Two literals have the same name. */
  DATATYPE_LITERAL_NAME_DUPLICATE = 'DATATYPE_LITERAL_NAME_DUPLICATE',
  /** Two literals produce the same stored string. */
  DATATYPE_LITERAL_SERIALIZED_DUPLICATE = 'DATATYPE_LITERAL_SERIALIZED_DUPLICATE',
  /** Two literals have the same numeric value. */
  DATATYPE_LITERAL_VALUE_DUPLICATE = 'DATATYPE_LITERAL_VALUE_DUPLICATE',
  /**
   * This level selects a relationship that its preceding level does not permit.
   * @group Relationships and constraints
   */
  RELATION_SCOPE_INVALID = 'RELATION_SCOPE_INVALID',
  /** A relationship lists more than one direct supertype. */
  RELATION_MULTIPLE_SUPERTYPES_UNSUPPORTED = 'RELATION_MULTIPLE_SUPERTYPES_UNSUPPORTED',
  /** A relationship end has incoherent cardinality bounds. */
  RELATION_END_BOUNDS_INVALID = 'RELATION_END_BOUNDS_INVALID',
  /** A selected relationship widens inherited bounds. */
  RELATION_BOUNDS_WIDENED = 'RELATION_BOUNDS_WIDENED',
  /** An endpoint type does not match or refine the inherited endpoint. */
  RELATION_END_TYPE_INCOMPATIBLE = 'RELATION_END_TYPE_INCOMPATIBLE',
  /** No evaluator is registered for the constraint's language. */
  CONSTRAINT_LANGUAGE_UNSUPPORTED = 'CONSTRAINT_LANGUAGE_UNSUPPORTED',
  /** An expression, format name or input value cannot be evaluated as requested. */
  CONSTRAINT_EXPRESSION_INVALID = 'CONSTRAINT_EXPRESSION_INVALID',
  /** A value does not match a regular expression. */
  CONSTRAINT_REGEX_MISMATCH = 'CONSTRAINT_REGEX_MISMATCH',
  /** A value does not match a declared string format. */
  CONSTRAINT_FORMAT_MISMATCH = 'CONSTRAINT_FORMAT_MISMATCH',
  /** A value does not match a JSON Schema constraint. */
  CONSTRAINT_JSON_SCHEMA_MISMATCH = 'CONSTRAINT_JSON_SCHEMA_MISMATCH',
  /**
   * The recorded graph does not match the instance schema.
   * @group Recorded-data codes
   */
  INSTANCE_SCHEMA_INVALID = 'INSTANCE_SCHEMA_INVALID',
  /** Two recorded nodes have the same ID. */
  INSTANCE_NODE_ID_DUPLICATE = 'INSTANCE_NODE_ID_DUPLICATE',
  /** A recorded node's `typeId` cannot be resolved. */
  INSTANCE_NODE_TYPE_NOT_FOUND = 'INSTANCE_NODE_TYPE_NOT_FOUND',
  /** Two records use the same value for a key property. */
  INSTANCE_KEY_DUPLICATE = 'INSTANCE_KEY_DUPLICATE',
  /** A recorded property is not declared for its node type. */
  INSTANCE_PROPERTY_UNKNOWN = 'INSTANCE_PROPERTY_UNKNOWN',
  /** A required property is missing. */
  INSTANCE_PROPERTY_REQUIRED = 'INSTANCE_PROPERTY_REQUIRED',
  /** A many-valued property was supplied as one value. */
  INSTANCE_PROPERTY_ARRAY_REQUIRED = 'INSTANCE_PROPERTY_ARRAY_REQUIRED',
  /** A single-valued property was supplied as an array. */
  INSTANCE_PROPERTY_SCALAR_REQUIRED = 'INSTANCE_PROPERTY_SCALAR_REQUIRED',
  /** A property contains duplicate values although it requires unique values. */
  INSTANCE_PROPERTY_NOT_UNIQUE = 'INSTANCE_PROPERTY_NOT_UNIQUE',
  /** A value does not match its built-in or custom data type. */
  INSTANCE_PROPERTY_TYPE_INVALID = 'INSTANCE_PROPERTY_TYPE_INVALID',
  /** A value is not among the declared literals. */
  INSTANCE_PROPERTY_LITERAL_INVALID = 'INSTANCE_PROPERTY_LITERAL_INVALID',
  /** Two recorded links have the same ID. */
  INSTANCE_RELATION_ID_DUPLICATE = 'INSTANCE_RELATION_ID_DUPLICATE',
  /** A link uses a relationship excluded by the active model level. */
  INSTANCE_RELATION_TYPE_NOT_ALLOWED = 'INSTANCE_RELATION_TYPE_NOT_ALLOWED',
  /** A link's relationship type cannot be resolved. */
  INSTANCE_RELATION_TYPE_NOT_FOUND = 'INSTANCE_RELATION_TYPE_NOT_FOUND',
  /** A link's source record is missing. */
  INSTANCE_RELATION_FROM_NOT_FOUND = 'INSTANCE_RELATION_FROM_NOT_FOUND',
  /** A link's target record is missing. */
  INSTANCE_RELATION_TO_NOT_FOUND = 'INSTANCE_RELATION_TO_NOT_FOUND',
  /** A linked record has an incompatible node type. */
  INSTANCE_RELATION_END_TYPE_INVALID = 'INSTANCE_RELATION_END_TYPE_INVALID',
  /** A property's or relationship's value count falls outside its bounds. */
  INSTANCE_CARDINALITY_INVALID = 'INSTANCE_CARDINALITY_INVALID',
}

/** Union of all validation codes emitted directly by the core package. */
export type ValidationCode = `${VALIDATION_ERROR}`;
