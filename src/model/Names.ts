const NAME_START: RegExp = /(?:^|[^\p{L}\p{N}_]+)(\p{L})/gu;
const NAME_INVALID_CHARS: RegExp = /[^\p{L}\p{N}_]/gu;
const NAME_VALID_START: RegExp = /^\p{L}/u;

const RELATIONSHIP_NAME: RegExp = /[A-Z0-9]+/g;
const RELATIONSHIP_VALID_START: RegExp = /^[A-Z]/;

/** Converts user input into valid conventional RAMEN model format element names. */
export class ModelNames {
  /** Converts text to a PascalCase node or type name of at most 40 characters. */
  public static toPascalName(str: string): string {
    const pascalized: string = str
      .replace(NAME_START, (_: string, letter: string): string => letter.toUpperCase())
      .replace(NAME_INVALID_CHARS, '');
    return this.truncate(NAME_VALID_START.test(pascalized) ? pascalized : `N${pascalized}`, 40);
  }

  /** Converts text to a camelCase property name of at most 32 characters. */
  public static toCamelName(str: string): string {
    const pascalized: string = str
      .replace(NAME_START, (_: string, letter: string): string => letter.toUpperCase())
      .replace(NAME_INVALID_CHARS, '');

    const camelized: string = pascalized.replace(NAME_VALID_START, (letter: string): string => letter.toLowerCase());
    return this.truncate(NAME_VALID_START.test(camelized) ? camelized : `p${camelized}`, 32);
  }

  /** Converts text to an uppercase underscore-separated relation name. */
  public static toScreamedName(str: string): string {
    const words: string = str.normalize('NFKD').replace(/\p{M}/gu, '').toUpperCase();
    const screamingSnake: string = (words.match(RELATIONSHIP_NAME) ?? []).join('_').slice(0, 32);
    return (RELATIONSHIP_VALID_START.test(screamingSnake) ? screamingSnake : `R_${screamingSnake}`).slice(0, 32);
  }

  private static truncate(value: string, length: number): string {
    return Array.from(value).slice(0, length).join('');
  }
}
