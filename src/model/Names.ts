const NAME_START: RegExp = /(?:^|[^\p{L}\p{N}_]+)(\p{L})/gu;
const NAME_INVALID_CHARS: RegExp = /[^\p{L}\p{N}_]/gu;
const NAME_VALID_START: RegExp = /^\p{L}/u;

const RELATIONSHIP_NAME: RegExp = /[\p{L}\p{N}]+/gu;
const RELATIONSHIP_VALID_START: RegExp = /^\p{Lu}/u;

/** Converts user input into valid conventional RAMEN model format element names. */
export class ModelNames {
  /** Converts text to a PascalCase node or type name of at most 40 characters. */
  public static toPascalName(str: string): string {
    const pascalized: string = str
      .replace(NAME_START, (_: string, letter: string): string => letter.toUpperCase())
      .replace(NAME_INVALID_CHARS, '')
      .slice(0, 40);
    return (NAME_VALID_START.test(pascalized) ? pascalized : `N${pascalized}`).slice(0, 40);
  }

  /** Converts text to a camelCase property name of at most 32 characters. */
  public static toCamelName(str: string): string {
    const pascalized: string = str
      .replace(NAME_START, (_: string, letter: string): string => letter.toUpperCase())
      .replace(NAME_INVALID_CHARS, '')
      .slice(0, 32);

    const camelized: string = pascalized.charAt(0).toLowerCase() + pascalized.slice(1);
    return (NAME_VALID_START.test(camelized) ? camelized : `p${camelized}`).slice(0, 32);
  }

  /** Converts text to an uppercase underscore-separated relation name. */
  public static toScreamedName(str: string): string {
    const screamingSnake: string = (str.match(RELATIONSHIP_NAME) ?? []).join('_').toUpperCase().slice(0, 32);
    return (RELATIONSHIP_VALID_START.test(screamingSnake) ? screamingSnake : `R_${screamingSnake}`).slice(0, 32);
  }
}
