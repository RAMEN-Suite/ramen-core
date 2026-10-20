import { MODEL_SCHEMA_URI, type Model } from '../model/index.js';

import type { AnnotationShape } from './annotations/Definitions.js';

/** Schema identifier for project models that refine RAMEN. */
export const RAMEN_PROJECT_SCHEMA_URI: string = 'https://ramen-schema.org/ramen/1.0.0/project.schema.json';

/** RAMEN project model with first-class annotation shapes. */
export interface RamenModelDocument extends Model {
  annotations: readonly AnnotationShape[];
}

/** Keeps the published RAMEN document distinct from the generic graph representation. */
export class RamenModelFormat {
  /** Creates an empty RAMEN project document from a generic model. */
  public static create(model: Model): RamenModelDocument {
    return { ...model, $schema: RAMEN_PROJECT_SCHEMA_URI, annotations: [] };
  }

  /** Recognizes the RAMEN schema marker only. Validate the contents before reading its fields. */
  public static isDocument(input: unknown): input is RamenModelDocument {
    return typeof input === 'object' && input !== null && '$schema' in input && input.$schema === RAMEN_PROJECT_SCHEMA_URI;
  }

  /** Converts a RAMEN document to the generic model read by the project graph. */
  public static toGeneric(model: Model): Model {
    if (model.$schema !== RAMEN_PROJECT_SCHEMA_URI) return structuredClone(model);
    const document: RamenModelDocument = model as RamenModelDocument;
    const { annotations: _annotations, ...rest } = document;

    return { ...rest, $schema: MODEL_SCHEMA_URI };
  }
}
