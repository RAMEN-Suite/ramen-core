import { ModelDraft, ModelInput } from './editing/Draft';
import { ModelAdvisor } from './Advisor';
import { ModelFactory } from './editing/Factory';
import { ModelValidator, ProjectValidationResult, ValidProjectResult, ValidationResult } from './validation/ModelValidator';
import { InstanceValidator } from './data/InstanceValidator';
import type { ConstraintRegistry } from './validation/Constraints';
import { ModelFiles, ModelFile } from './exchange/File';
import { ModelEvolution, EvolutionReport } from './exchange/Comparison';
import type { Id, Model } from './Types';

/** Creates and refines generic models while retaining dependencies, validation and suggestions. */
export class Modeller extends ModelDraft<ModelAdvisor> {
  private constructor(model: Model, dependencies: readonly Model[]) {
    super(model, dependencies);
  }

  /** Creates a root modelling language. A name is enough; identity fields remain configurable. */
  public static create(input: ModelInput | string): Modeller {
    return new Modeller(ModelFactory.createRootModel(this.options(input)), []);
  }

  /** Creates a level from an existing model and the dependencies it needs. */
  public static createLevel(base: Model, input: ModelInput | string, dependencies: readonly Model[] = []): Modeller {
    const models: ReadonlyMap<Id, Model> = new Map<Id, Model>([
      ...dependencies.map((model: Model): [Id, Model] => [model.id, model]),
      [base.id, base],
    ]);
    return new Modeller(ModelFactory.createModel(base, this.options(input)), [...models.values()]);
  }

  /** Creates a new refinement level and carries its complete dependency chain forward. */
  public createNextLevel(input: ModelInput | string): Modeller {
    return Modeller.createLevel(this.model, input, [...this.dependencies.values()]);
  }

  /** Opens an existing generic model for editing, with its dependency models. */
  public static load(model: Model, dependencies: readonly Model[] = []): Modeller {
    return new Modeller(model, dependencies);
  }

  /** Exports one graph with retained inheritance, original IDs and declaration ownership. */
  public export(): ModelFile {
    return ModelFiles.write(this.model.id, this.validationInputs());
  }

  /** Loads a shared graph and restores its project context without a consumer-side model selection. */
  public static import(input: unknown): Modeller {
    const models: readonly Model[] = ModelFiles.read(input);
    const id: Id = (input as ModelFile).id;
    const model: Model | undefined = models.find((item: Model): boolean => item.id === id);
    if (!model) throw new Error('Exported model not found.');
    return Modeller.load(
      model,
      models.filter((item: Model): boolean => item.id !== id),
    );
  }

  /** Validates a complete data graph against this model. */
  public validateInstances(input: unknown, constraints?: ConstraintRegistry): ValidationResult {
    const result: ProjectValidationResult = this.validate();
    if (!result.valid) return { hasErrors: true, diagnostics: result.diagnostics };
    return new InstanceValidator(constraints).validate(result.graph, input);
  }

  /** Reports changes between two model states without migrating captured data. */
  public compareTo(next: Modeller): EvolutionReport {
    return ModelEvolution.compare(this.model.id, this.validationInputs(), next.model.id, next.validationInputs());
  }

  protected check(): ProjectValidationResult {
    return new ModelValidator().validateProject(this.model.id, this.validationInputs());
  }

  protected buildAdvisor(result: ValidProjectResult): ModelAdvisor {
    return new ModelAdvisor(result);
  }
}
