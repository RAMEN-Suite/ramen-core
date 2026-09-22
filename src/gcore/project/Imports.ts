import { GModel, Id, Import } from '../model/Types';

export class ImportClosure {
  public static resolveImports(startModelId: Id, modelsById: ReadonlyMap<Id, GModel>): readonly GModel[] {
    const result: GModel[] = [];
    const visited: Set<Id> = new Set<Id>();
    const queue: Id[] = [startModelId];

    while (queue.length > 0) {
      const currentId: Id | undefined = queue.shift();
      if (currentId === undefined) break;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const model: GModel | undefined = modelsById.get(currentId);
      if (!model) continue;

      result.push(model);

      const imports: Import[] = model.imports ?? [];
      for (const imp of imports) {
        if (!visited.has(imp.modelId)) queue.push(imp.modelId);
      }
    }

    return result;
  }
}
