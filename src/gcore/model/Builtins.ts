import { BuiltinType, TypeRef } from './Types';

/** Recognizes primitive type references that require no model declaration. */
export class BuiltinDataTypes {
  /** Names accepted as primitive type references. */
  public static readonly values: readonly BuiltinType[] = ['String', 'Boolean', 'Float', 'Integer'];
  private static readonly set: ReadonlySet<string> = new Set<string>(BuiltinDataTypes.values);

  /** Reports whether a type reference names a GCore primitive. */
  public static isBuiltin(ref: TypeRef): ref is BuiltinType {
    return BuiltinDataTypes.set.has(ref);
  }
}
