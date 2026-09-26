import { ModelDraft, ModelInput } from './ModelDraft';
import { ModelAdvisor } from './Advisor';
import { ModelFactory } from './ModelFactory';
import { ModelValidator, ProjectValidationResult, ValidProjectResult, ValidationResult } from './validation/ModelValidator';
import { InstanceValidator } from './data/InstanceValidator';
import type { ConstraintRegistry } from './validation/Constraints';
import { createModelBundle, parseModelBundle, CreateBundleResult } from './exchange/Bundle';
import { ModelFiles, ModelFile } from './exchange/File';
import { ModelEvolution, EvolutionReport } from './exchange/Comparison';
import type { Id, Model, ModelBundle } from './Types';

/** Creates and refines generic models while retaining dependencies, validation and suggestions. */
export class Modeler extends ModelDraft<ModelAdvisor> {
  private constructor(model: Model, dependencies: readonly Model[]) {
    super(model, dependencies);
  }

  /** Creates a root modeling language. A name is enough; identity fields remain configurable. */
  public static create(input: ModelInput | string): Modeler {
    return new Modeler(ModelFactory.createRootModel(this.options(input)), []);
  }

  /** Creates a level from an existing model and the dependencies it needs. */
  public static createLevel(base: Model, input: ModelInput | string, dependencies: readonly Model[] = []): Modeler {
    const models: ReadonlyMap<Id, Model> = new Map<Id, Model>([
      ...dependencies.map((model: Model): [Id, Model] => [model.id, model]),
      [base.id, base],
    ]);
    return new Modeler(ModelFactory.createModel(base, this.options(input)), [...models.values()]);
  }

  /** Creates a new refinement level and carries its complete dependency chain forward. */
  public createNextLevel(input: ModelInput | string): Modeler {
    return Modeler.createLevel(this.model, input, [...this.dependencies.values()]);
  }

  /** Opens an existing generic model for editing, with its dependency models. */
  public static load(model: Model, dependencies: readonly Model[] = []): Modeler {
    return new Modeler(model, dependencies);
  }

  /** Exports one graph with retained inheritance, original IDs and declaration ownership. */
  public export(): ModelFile {
    return ModelFiles.write(this.model.id, this.validationInputs());
  }

  /** Loads a shared graph and restores its project context without a consumer-side model selection. */
  public static import(input: unknown): Modeler {
    const models: readonly Model[] = ModelFiles.read(input);
    const id: Id = (input as ModelFile).id;
    const model: Model | undefined = models.find((item: Model): boolean => item.id === id);
    if (!model) throw new Error('Exported model not found.');
    return Modeler.load(
      model,
      models.filter((item: Model): boolean => item.id !== id),
    );
  }

  /** Reads legacy bundles. New consumers should use import() for the shared graph format. */
  public static importBundle(input: unknown): Modeler {
    const bundle: ModelBundle = parseModelBundle(input);
    const root: Model | undefined = bundle.models.find((model: Model): boolean => model.id === bundle.rootModelId);
    if (!root) throw new Error('The bundle has no root model.');
    return new Modeler(
      root,
      bundle.models.filter((model: Model): boolean => model.id !== root.id),
    );
  }

  /** Writes legacy bundles. New consumers should use export() for one shared graph. */
  public exportBundle(): CreateBundleResult {
    return createModelBundle(this.model.id, this.validationInputs());
  }

  /** Validates captured data against this model; custom languages apply only to data. */
  public validateInstances(input: unknown, constraints?: ConstraintRegistry): ValidationResult {
    const result: ProjectValidationResult = this.validate();
    if (!result.valid) return { hasErrors: true, diagnostics: result.diagnostics };
    return new InstanceValidator(constraints).validate(result.graph, input);
  }

  /** Reports changes between two model states without migrating captured data. */
  public compareTo(next: Modeler): EvolutionReport {
    return ModelEvolution.compare(this.model.id, this.validationInputs(), next.model.id, next.validationInputs());
  }

  protected check(): ProjectValidationResult {
    return new ModelValidator().validateProject(this.model.id, this.validationInputs());
  }

  protected advise(result: ValidProjectResult): ModelAdvisor {
    return new ModelAdvisor(result);
  }
}
