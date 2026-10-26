/** Maximum number of Unicode code points in a model definition's plain-text description. */
export const DESCRIPTION_MAX_LENGTH: number = 2000;

const COLLECTIONS: readonly string[] = [
  'models',
  'classifiers',
  'relations',
  'attributes',
  'properties',
  'literals',
  'constraints',
  'annotations',
];

/** @internal Normalises definition metadata without touching expressions, extensions or captured values. */
export class ModelDescriptions {
  public static copy<T>(value: T): T {
    const copy: T = structuredClone(value);
    this.normalise(copy, 'definition');
    return copy;
  }

  private static normalise(value: unknown, path: string): void {
    if (Array.isArray(value)) {
      value.forEach((item: unknown, index: number): void => this.normalise(item, `${path}/${index}`));
      return;
    }
    if (value === null || typeof value !== 'object') return;

    const definition: Record<string, unknown> = value as Record<string, unknown>;
    if ('description' in definition) this.description(definition, path);

    for (const key of COLLECTIONS) {
      if (Array.isArray(definition[key])) this.normalise(definition[key], `${path}/${key}`);
    }

    for (const key of ['from', 'to']) {
      const end: unknown = definition[key];
      if (end !== null && typeof end === 'object') this.normalise(end, `${path}/${key}`);
    }
  }

  private static description(definition: Record<string, unknown>, path: string): void {
    const value: unknown = definition['description'];
    if (value === undefined || (typeof value === 'string' && !value.trim())) {
      delete definition['description'];
      return;
    }

    if (typeof value !== 'string') throw new TypeError(`Description at ${path} must be plain text.`);
    let length: number = 0;

    for (const _character of value) {
      length += 1;
      if (length > DESCRIPTION_MAX_LENGTH)
        throw new RangeError(`Description at ${path} must not exceed ${DESCRIPTION_MAX_LENGTH} characters.`);
    }
  }
}
