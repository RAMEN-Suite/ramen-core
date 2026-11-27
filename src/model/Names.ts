const NAME_START: RegExp = /(?:^|[^\p{L}\p{M}\p{N}_])(\p{L})/gu;
const NAME_INVALID_CHARS: RegExp = /[^\p{L}\p{M}\p{N}_]/gu;
const NAME_VALID_START: RegExp = /^\p{L}/u;
const CLASSIFIER_EXCESSIVE_MARKS: RegExp = /\p{M}{3}/u;
const NAME_EXCESSIVE_MARKS: RegExp = /\p{M}{3,}/gu;
const CLASSIFIER_INVALID_CHARS: RegExp = /[^\p{L}\p{M}\p{N}_]/u;

const RELATIONSHIP_NAME: RegExp = /[A-Z0-9]+/g;
const RELATIONSHIP_VALID_START: RegExp = /^[A-Z]/;

/** Converts user input into valid conventional RAMEN model format element names. */
export class ModelNames {
  /** Maximum number of Unicode code points in a stored node or data type name. */
  public static readonly CLASSIFIER_MAX_LENGTH: number = 40;

  /** Canonicalises a classifier name without changing its spelling or removing invalid characters. */
  public static normaliseClassifierName(name: string): string {
    return name.normalize('NFC');
  }

  /** Checks the Unicode identifier syntax and length of a stored classifier name. */
  public static isClassifierName(name: string): boolean {
    const canonical: string = this.normaliseClassifierName(name);
    const length: number = Array.from(name).length;
    const validSyntax: boolean = NAME_VALID_START.test(canonical) && !CLASSIFIER_INVALID_CHARS.test(canonical);
    const validMarks: boolean = !CLASSIFIER_EXCESSIVE_MARKS.test(canonical);
    return length <= this.CLASSIFIER_MAX_LENGTH && validSyntax && validMarks;
  }

  /** Produces a comparison key for case and Unicode compatibility warnings, without changing stored names. */
  public static foldClassifierName(name: string): string {
    return name.normalize('NFKC').toUpperCase().toLowerCase();
  }

  /** Converts text to a PascalCase node or type name of at most 40 characters. */
  public static toPascalName(str: string): string {
    const pascalised: string = str
      .normalize('NFC')
      .replace(NAME_START, (_: string, letter: string): string => letter.toUpperCase())
      .replace(NAME_INVALID_CHARS, '');
    return this.normaliseGeneratedName(
      NAME_VALID_START.test(pascalised) ? pascalised : `N${pascalised}`,
      this.CLASSIFIER_MAX_LENGTH,
    );
  }

  /** Converts text to a camelCase property name of at most 32 characters. */
  public static toCamelName(str: string): string {
    const pascalised: string = str
      .normalize('NFC')
      .replace(NAME_START, (_: string, letter: string): string => letter.toUpperCase())
      .replace(NAME_INVALID_CHARS, '');

    const camelised: string = pascalised.replace(NAME_VALID_START, (letter: string): string => letter.toLowerCase());
    return this.normaliseGeneratedName(NAME_VALID_START.test(camelised) ? camelised : `p${camelised}`, 32);
  }

  /** Converts text to an uppercase underscore-separated relation name. */
  public static toScreamedName(str: string): string {
    const words: string = str.normalize('NFKD').replace(/\p{M}/gu, '').toUpperCase();
    const screamingSnake: string = (words.match(RELATIONSHIP_NAME) ?? []).join('_').slice(0, 32);
    return (RELATIONSHIP_VALID_START.test(screamingSnake) ? screamingSnake : `R_${screamingSnake}`).slice(0, 32);
  }

  private static normaliseGeneratedName(value: string, length: number): string {
    const limited: string = value
      .normalize('NFC')
      .replace(NAME_EXCESSIVE_MARKS, (marks: string): string => Array.from(marks).slice(0, 2).join(''));
    return Array.from(limited).slice(0, length).join('');
  }
}
