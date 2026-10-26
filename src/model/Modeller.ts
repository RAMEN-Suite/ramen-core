import { ModelDraft } from './editing/Draft.js';
import type { ModelInput } from './editing/Inputs.js';
import { ModelAdvisor } from './Advisor.js';
import { ModelFactory } from './editing/Factory.js';
import { ModelValidator, ProjectValidationResult, ValidProjectResult, ValidationResult } from './validation/ModelValidator.js';
import { InstanceValidator } from './data/InstanceValidator.js';
import type { ConstraintRegistry } from './validation/Constraints.js';
import { ModelFiles, ModelFile, type ProjectMetadata } from './exchange/File.js';
import { ModelEvolution, EvolutionReport } from './exchange/Comparison.js';
import { ModelWorkspace } from './editing/Workspace.js';
import type { Id, Model } from './Types.js';

/** Creates and refines generic models while retaining dependencies, validation and suggestions. */
export class Modeller extends ModelDraft<ModelAdvisor> {
  private readonly validator: ModelValidator = new ModelValidator();
  private readonly instances: InstanceValidator = new InstanceValidator();

  private constructor(model: Model, dependencies: readonly Model[], workspace?: ModelWorkspace, attach: boolean = false) {
    super(model, dependencies, workspace, attach);
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

  /** Opens an existing generic model for editing, with its dependency models. */
  public static load(model: Model, dependencies: readonly Model[] = []): Modeller {
    return new Modeller(model, dependencies);
  }

  /** Loads a shared graph and restores its project context without a consumer-side model selection. */
  public static import(input: unknown): Modeller {
    const models: readonly Model[] = ModelFiles.read(input);
    const file: ModelFile = input as ModelFile;
    const id: Id = file.id;

    const model: Model | undefined = models.find((item: Model): boolean => item.id === id);
    if (!model) throw new Error('Exported model not found.');
    return new Modeller(model, [], new ModelWorkspace(models, file.project), true);
  }

  /** Creates another level in the same editable model workspace. */
  public createNextLevel(input: ModelInput | string): Modeller {
    const next: Model = ModelFactory.createModel(this.model, Modeller.options(input));
    return new Modeller(next, [], this.workspace);
  }

  /** Opens another model in this editable workspace, including an imported predecessor. */
  public openLevel(modelId: Id): Modeller {
    const model: Model | undefined = this.workspace.get(modelId);
    if (!model) throw new Error(`Model not found in workspace: '${modelId}'.`);
    return new Modeller(model, [], this.workspace, true);
  }

  /** Captures the entire editable model workspace, including sibling levels, as an independent state. */
  public snapshot(): Modeller {
    return new Modeller(this.model, [], this.workspace.snapshot(), true);
  }

  /** Exports one graph with retained inheritance, original IDs and declaration ownership. */
  public export(project: ProjectMetadata | undefined = this.getProjectMetadata()): ModelFile {
    return ModelFiles.write(this.model.id, this.validationInputs(), project);
  }

  /** Reports changes across both complete workspaces without migrating captured data. */
  public compareTo(next: Modeller): EvolutionReport {
    return ModelEvolution.compare(this.model.id, this.workspace.all(), next.model.id, next.workspace.all());
  }

  /** Validates a complete data graph against this model. */
  public validateInstances(input: unknown, constraints?: ConstraintRegistry): ValidationResult {
    const result: ProjectValidationResult = this.validate();
    if (!result.valid) return { hasErrors: true, diagnostics: result.diagnostics };
    const validator: InstanceValidator = constraints ? new InstanceValidator(constraints) : this.instances;
    return validator.validate(result.graph, input);
  }

  protected check(): ProjectValidationResult {
    return this.validator.validateProject(this.model.id, this.validationInputs());
  }

  protected buildAdvisor(result: ValidProjectResult): ModelAdvisor {
    return new ModelAdvisor(result);
  }
}
