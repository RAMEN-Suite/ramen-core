// Exact property inference is required by reference validation.
/** Regular expressions shared by model names and qualified references. */
// eslint-disable-next-line @typescript-eslint/typedef
export const REGEXP = {
  // SemVer 2.0.0 (MAJOR.MINOR.PATCH) + optional pre-release + optional build metadata
  SEMANTIC_VER:
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/,

  // URI validation (RFC 3986-style)
  VALID_URI: /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s/$.?#].[^\s]*$/,

  // GCore Identifier short unique id (min 16)
  VALID_ID: /^[A-Za-z0-9_-]{16,}$/,

  // Qualified Ref: modelId:id (both min 16)
  QUALIFIED_REF: /^[A-Za-z0-9_-]{16,}:[A-Za-z0-9_-]{16,}$/,

  // GCore Relation RELATION_WITH
  VALID_RELATION: /^[A-Z][A-Z0-9_]*$/,
};
