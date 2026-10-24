/** The file declares a format that this reader does not support; no conversion was attempted. */
export class UnsupportedModelFormatError extends Error {
  public constructor(
    public readonly actualSchema: string,
    public readonly expectedSchema: string,
  ) {
    super(`Unsupported model file format '${actualSchema}'. This reader supports '${expectedSchema}'.`);
    this.name = 'UnsupportedModelFormatError';
  }
}
