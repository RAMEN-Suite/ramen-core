import { BuiltinType, TypeRef } from './ModelTypes';

export class BuiltinDataTypes {
  public static readonly set: ReadonlySet<string> = new Set(['String', 'Boolean', 'Float', 'Integer']);

  public static isBuiltin(ref: TypeRef): ref is BuiltinType {
    return BuiltinDataTypes.set.has(ref);
  }
}
