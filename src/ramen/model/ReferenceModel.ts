import type { Model } from '../../model/index';
import ramenModel from '../../resources/models/ramen.model.json';

/** Canonical identifier of the versioned RAMEN base model. */
export const RAMEN_MODEL_URI: string = 'https://ramen-schema.org/ramen/1.0.0/model.json';

/** Versioned RAMEN reference model used as the base for project models. */
export const RAMEN_MODEL: Model = ramenModel as Model;

/** Stable element identifiers from the versioned RAMEN reference model. */
export const RAMEN_ELEMENT: Readonly<{
  UUID: string;
  DATE: string;
  DATE_TIME: string;
  URI: string;
  EMAIL: string;
  COLLECTION: string;
  ENTITY: string;
  CONTENT: string;
  ANNOTATION: string;
}> = {
  UUID: 'Q9mT2aL7vK0pX4sN1cDz',
  DATE: 'WdlVlvh7jqs6DEUC',
  DATE_TIME: 'mXhHHuR4mQoDq31D',
  URI: 'T3YiJGOy7M7g1lTQ',
  EMAIL: 'DJRorIpghXJGAi41',
  COLLECTION: 'aP3xK8nV1qR6tY2uZ9wB',
  ENTITY: 'n7Vb2Qx0Lm9P3sT6yK1h',
  CONTENT: 'Z4kq1M8sV0bN2xR7pT6u',
  ANNOTATION: 'm2Xv8qL0sP6tN1yK7rB3',
};
