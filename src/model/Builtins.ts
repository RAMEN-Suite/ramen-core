import { BuiltinType, TypeRef } from './Types';

/**
 * Built-in data type references for attributes and custom data type bases.
 *
 * | Reference | Accepted value |
 * | --- | --- |
 * | `DataTypes.String` | Text |
 * | `DataTypes.Boolean` | `true` or `false` |
 * | `DataTypes.Integer` | A whole number |
 * | `DataTypes.Float` | A finite number, including fractions |
 *
 * Use these references with {@link Modeller.createAttribute} or {@link Modeller.createDataType}.
 * For attributes using declared types, pass a {@link DataType} or a {@link DataTypeSuggestion} instead.
 *
 * @example
 * ```ts
 * model.createAttribute(document, { name: 'title', typeId: DataTypes.String });
 * ```
 */
export const DataTypes: {
  /** Text values, serialised as the built-in reference `String`. */
  readonly String: 'String';
  /** Boolean values, serialised as the built-in reference `Boolean`. */
  readonly Boolean: 'Boolean';
  /** Whole numbers, serialised as the built-in reference `Integer`. */
  readonly Integer: 'Integer';
  /** Finite numbers, serialised as the built-in reference `Float`. */
  readonly Float: 'Float';
} = {
  String: 'String',
  Boolean: 'Boolean',
  Integer: 'Integer',
  Float: 'Float',
};

/** Recognizes primitive type references that require no model declaration. */
export class BuiltinDataTypes {
  /** Names accepted as primitive type references. */
  public static readonly values: readonly BuiltinType[] = Object.values(DataTypes);
  private static readonly set: ReadonlySet<string> = new Set<string>(BuiltinDataTypes.values);

  /** Reports whether a type reference names a RAMEN model format primitive. */
  public static isBuiltin(ref: TypeRef): ref is BuiltinType {
    return BuiltinDataTypes.set.has(ref);
  }
}
