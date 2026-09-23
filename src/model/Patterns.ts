/** Regular expressions shared by model names and qualified references. */
// eslint-disable-next-line @typescript-eslint/typedef
export const REGEXP = {
  SEMANTIC_VER:
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/,
  VALID_URI: /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s/$.?#].[^\s]*$/,
  VALID_ID: /^[A-Za-z0-9_-]{16,}$/,
  QUALIFIED_REF: /^[A-Za-z0-9_-]{16,}:[A-Za-z0-9_-]{16,}$/,
  VALID_RELATION: /^[A-Z][A-Z0-9_]*$/,
};
