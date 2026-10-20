import { compileSchema, SchemaNode } from 'json-schema-library';
import type { ModelFile, Owned, Id, Model, ProjectMetadata, ProjectValidationResult } from '../../model/index.js';
import { FileParts } from '../../model/exchange/File.js';

import { RamenValidator } from '../validation/ModelValidator.js';
import { RamenModelFormat, type RamenModelDocument } from '../Document.js';
import type { AnnotationShape } from '../annotations/Definitions.js';
import fileSchema from '../../resources/schemas/ramen-file.schema.json';

/** One RAMEN graph with original annotation declarations and retained inheritance. */
export interface RamenFile extends ModelFile {
  readonly annotations: readonly Owned<AnnotationShape>[];
}

/** Adds RAMEN annotation declarations to generic single-file exchange. */
export class RamenFiles {
  private static readonly schema: SchemaNode = compileSchema(fileSchema);

  /** Validates and merges the project. Every declaration appears once, under its original model identity. */
  public static write(id: Id, models: readonly Model[], project?: ProjectMetadata): RamenFile {
    const result: ProjectValidationResult = new RamenValidator().validateProject(id, models);
    FileParts.assertValid(result);
    const reachable: ReadonlySet<Id> = new Set<Id>(result.graph.getModels().map((model: Model): Id => model.id));
    const selected: readonly Model[] = models.filter((model: Model): boolean => reachable.has(model.id));
    const core: readonly Model[] = selected.map((model: Model): Model => {
      if (!RamenModelFormat.isDocument(model)) return model;
      const { annotations: _annotations, ...rest }: RamenModelDocument = model;
      return rest;
    });

    const file: RamenFile = structuredClone({
      ...FileParts.merge(id, core, fileSchema.$id, project),
      annotations: selected.flatMap((model: Model): Owned<AnnotationShape>[] =>
        RamenModelFormat.isDocument(model)
          ? model.annotations.map((item: AnnotationShape): Owned<AnnotationShape> => ({ ...item, modelId: model.id }))
          : [],
      ),
    });
    FileParts.assertSchema(this.schema, file);
    return file;
  }

  /** Checks JSON shape, declaration ownership, references and RAMEN semantics before restoring models. */
  public static read(input: unknown): readonly Model[] {
    FileParts.assertSchema(this.schema, input);
    const file: RamenFile = input as RamenFile;
    const models: readonly Model[] = FileParts.split(file).map((model: Model): Model =>
      RamenModelFormat.isDocument(model) ? ({ ...model, annotations: [] } as RamenModelDocument) : model,
    );
    const owners: ReadonlyMap<Id, Model> = new Map<Id, Model>(models.map((model: Model): [Id, Model] => [model.id, model]));
    const groups: Map<Id, AnnotationShape[]> = new Map<Id, AnnotationShape[]>();

    for (const entry of file.annotations) {
      const { modelId, ...annotation }: Owned<AnnotationShape> = entry;
      const owner: Model | undefined = owners.get(modelId);
      if (!RamenModelFormat.isDocument(owner)) throw new Error(`Invalid annotation owner: '${modelId}'.`);
      const group: AnnotationShape[] = groups.get(modelId) ?? [];
      group.push(structuredClone(annotation));
      groups.set(modelId, group);
      owner.annotations = group;
    }

    FileParts.assertValid(new RamenValidator().validateProject(file.id, models), models.length);
    return models;
  }
}
