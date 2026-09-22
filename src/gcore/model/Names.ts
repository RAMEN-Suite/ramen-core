const NODE_NAME_START: RegExp = /(?:^|[^\p{L}\p{N}_]+)(\p{L})/gu;
const NODE_NAME_INVALID_CHARS: RegExp = /[^\p{L}\p{N}_]/gu;
const NODE_NAME_VALID_START: RegExp = /^\p{L}/u;

const PROPERTY_NAME_START: RegExp = /(?:^|[^\p{L}\p{N}_]+)(\p{L})/gu;
const PROPERTY_NAME_INVALID_CHARS: RegExp = /[^\p{L}\p{N}_]/gu;
const PROPERTY_VALID_START: RegExp = /^\p{L}/u;

const RELATIONSHIP_NAME: RegExp = /[\p{L}\p{N}]+/gu;
const RELATIONSHIP_VALID_START: RegExp = /^\p{Lu}/u;

/** Converts user input into valid conventional GCore element names. */
export class ModelNames {
  /** Converts text to a PascalCase node or type name of at most 40 characters. */
  public static toPascalName(str: string): string {
    const pascalized: string = str
      .replace(NODE_NAME_START, (_: string, letter: string): string => letter.toUpperCase())
      .replace(NODE_NAME_INVALID_CHARS, '')
      .slice(0, 40);

    return NODE_NAME_VALID_START.test(pascalized) ? pascalized : `N${pascalized}`;
  }

  /** Converts text to a camelCase property name of at most 32 characters. */
  public static toCamelName(str: string): string {
    const pascalized: string = str
      .replace(PROPERTY_NAME_START, (_: string, letter: string): string => letter.toUpperCase())
      .replace(PROPERTY_NAME_INVALID_CHARS, '')
      .slice(0, 32);

    const camelized: string = pascalized.charAt(0).toLowerCase() + pascalized.slice(1);
    return PROPERTY_VALID_START.test(camelized) ? camelized : `p${camelized}`;
  }

  /** Converts text to an uppercase underscore-separated relation name. */
  public static toScreamedName(str: string): string {
    const screamingSnake: string = (str.match(RELATIONSHIP_NAME) ?? []).join('_').toUpperCase().slice(0, 32);
    return RELATIONSHIP_VALID_START.test(screamingSnake) ? screamingSnake : `R_${screamingSnake}`;
  }
}
