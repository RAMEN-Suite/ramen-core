import { ModelDescriptions } from '../Descriptions.js';
import { compileSchema, SchemaNode } from 'json-schema-library';
import type { Classifier, Id, Model, Relation } from '../Types.js';
import { ModelValidator, ProjectValidationResult, ValidProjectResult } from '../validation/ModelValidator.js';
import fileSchema from '../../resources/schemas/model-file.schema.json';

/** Original metadata of a model whose declarations live in the shared graph. */
export type ModelHeader = Omit<Model, 'classifiers' | 'relations'>;

/** Declaration with its original model identity; nested elements keep the same owner. */
export type Owned<T> = T & { readonly modelId: Id };

/** Project information independent of the names of individual model levels. */
export interface ProjectMetadata {
  readonly name: string;
  readonly description: string;
}

/** A single graph containing declarations from every reachable model, without copying inherited features. */
export interface ModelFile {
  readonly $schema: string;
  /** Identity of the exported project; also identifies its metadata in models. */
  readonly id: Id;
  readonly project?: ProjectMetadata;
  readonly models: readonly ModelHeader[];
  readonly classifiers: readonly Owned<Classifier>[];
  readonly relations: readonly Owned<Relation>[];
}

/** Generic single-file exchange. Model-level rules are preserved when declarations are merged or split. */
export class ModelFiles {
  private static readonly schema: SchemaNode = compileSchema(fileSchema);

  /** Validates and combines one project and its dependencies into a detached graph document. */
  public static write(id: Id, models: readonly Model[], project?: ProjectMetadata): ModelFile {
    const result: ProjectValidationResult = new ModelValidator().validateProject(id, models);
    FileParts.assertValid(result);
    const file: ModelFile = FileParts.merge(id, result.graph.getModels(), fileSchema.$id, project);
    FileParts.assertSchema(this.schema, file);
    return file;
  }

  /** Validates untrusted JSON and restores all original model declarations. */
  public static read(input: unknown): readonly Model[] {
    FileParts.assertSchema(this.schema, input);
    const file: ModelFile = input as ModelFile;
    const models: readonly Model[] = FileParts.split(file);

    FileParts.assertValid(new ModelValidator().validateProject(file.id, models), models.length);
    return models;
  }
}

/** @internal Shared transport operations; language-specific checks belong to their validators. */
export class FileParts {
  public static merge(id: Id, models: readonly Model[], schema: string, project?: ProjectMetadata): ModelFile {
    return ModelDescriptions.copy({
      $schema: schema,
      id,
      ...(project !== undefined ? { project } : {}),
      models: models.map((model: Model): ModelHeader => {
        const { classifiers: _classifiers, relations: _relations, ...header }: Model = model;
        return header;
      }),
      classifiers: models.flatMap((model: Model): Owned<Classifier>[] =>
        model.classifiers.map((item: Classifier): Owned<Classifier> => ({ ...item, modelId: model.id })),
      ),
      relations: models.flatMap((model: Model): Owned<Relation>[] =>
        model.relations.map((item: Relation): Owned<Relation> => ({ ...item, modelId: model.id })),
      ),
    });
  }

  public static split(file: ModelFile): readonly Model[] {
    const models: Map<Id, Model> = new Map<Id, Model>();
    for (const header of file.models) {
      if (models.has(header.id)) throw new Error(`Duplicate model identity: '${header.id}'.`);
      models.set(header.id, { ...header, classifiers: [], relations: [] });
    }

    for (const entry of file.classifiers) {
      const { modelId, ...classifier }: Owned<Classifier> = entry;
      this.owner(models, modelId).classifiers.push(classifier);
    }

    for (const entry of file.relations) {
      const { modelId, ...relation }: Owned<Relation> = entry;
      this.owner(models, modelId).relations.push(relation);
    }
    return [...models.values()].map((model: Model): Model => ModelDescriptions.copy(model));
  }

  private static owner(models: ReadonlyMap<Id, Model>, id: Id): Model {
    const model: Model | undefined = models.get(id);
    if (!model) throw new Error(`Unknown declaration owner: '${id}'.`);
    return model;
  }

  public static assertSchema(schema: SchemaNode, input: unknown): void {
    const result: ReturnType<SchemaNode['validate']> = schema.validate(input ?? null);
    if (!result.valid) throw new Error(`Invalid model file: ${result.errors.map((error): string => error.message).join('\n')}`);
  }

  public static assertValid(result: ProjectValidationResult, count?: number): asserts result is ValidProjectResult {
    if (!result.valid)
      throw new Error(`Invalid model file: ${result.diagnostics.map((item): string => item.message).join('\n')}`);

    if (count !== undefined && result.graph.getModels().length !== count) {
      throw new Error('Model file contains models outside the exported project.');
    }
  }
}
