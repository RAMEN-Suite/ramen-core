import { compileSchema, SchemaNode } from 'json-schema-library';
import { FileParts } from '../../model/exchange/File';
import type { ModelFile, Owned } from '../../model/exchange/File';
import type { Id, Model } from '../../model/Types';
import type { ProjectValidationResult } from '../../model/validation/ModelValidator';
import { RamenValidator } from '../validation/ModelValidator';
import { RamenModelFormat } from '../Document';
import type { RamenModelDocument } from '../Document';
import type { RamenAnnotation } from '../annotations/Definitions';
import fileSchema from '../../resources/schemas/ramen-file.schema.json';

/** One RAMEN graph with original annotation declarations and retained inheritance. */
export interface RamenFile extends ModelFile {
  readonly annotations: readonly Owned<RamenAnnotation>[];
}

/** Adds RAMEN annotation declarations to generic single-file exchange. */
export class RamenFiles {
  private static readonly schema: SchemaNode = compileSchema(fileSchema);

  /** Validates and merges the project. Every declaration appears once, under its original model identity. */
  public static write(id: Id, models: readonly Model[]): RamenFile {
    const result: ProjectValidationResult = new RamenValidator().validateProject(id, models);
    FileParts.assertValid(result);
    const reachable: ReadonlySet<Id> = new Set<Id>(result.graph.getModels().map((model: Model): Id => model.id));
    const selected: readonly Model[] = models.filter((model: Model): boolean => reachable.has(model.id));
    const core: readonly Model[] = selected.map((model: Model): Model => {
      if (!RamenModelFormat.isDocument(model)) return model;
      const { annotations: _annotations, ...rest }: RamenModelDocument = model;
      return rest;
    });
    return structuredClone({
      ...FileParts.merge(id, core, fileSchema.$id),
      annotations: selected.flatMap((model: Model): Owned<RamenAnnotation>[] =>
        RamenModelFormat.isDocument(model)
          ? model.annotations.map((item: RamenAnnotation): Owned<RamenAnnotation> => ({ ...item, modelId: model.id }))
          : [],
      ),
    });
  }

  /** Checks JSON shape, declaration ownership, references and RAMEN semantics before restoring models. */
  public static read(input: unknown): readonly Model[] {
    FileParts.assertSchema(this.schema, input);
    const file: RamenFile = input as RamenFile;
    const models: readonly Model[] = FileParts.split(file).map((model: Model): Model =>
      RamenModelFormat.isDocument(model) ? ({ ...model, annotations: [] } as RamenModelDocument) : model,
    );
    const owners: ReadonlyMap<Id, Model> = new Map<Id, Model>(models.map((model: Model): [Id, Model] => [model.id, model]));
    const groups: Map<Id, RamenAnnotation[]> = new Map<Id, RamenAnnotation[]>();
    for (const entry of file.annotations) {
      const { modelId, ...annotation }: Owned<RamenAnnotation> = entry;
      const owner: Model | undefined = owners.get(modelId);
      if (!RamenModelFormat.isDocument(owner)) throw new Error(`Invalid annotation owner: '${modelId}'.`);
      const group: RamenAnnotation[] = groups.get(modelId) ?? [];
      group.push(structuredClone(annotation));
      groups.set(modelId, group);
      owner.annotations = group;
    }
    FileParts.assertValid(new RamenValidator().validateProject(file.id, models), models.length);
    return models;
  }
}
