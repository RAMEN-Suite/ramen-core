import { ModelRelationScope } from '../graph/RelationScope.js';
import { ProjectGraph } from '../graph/ProjectGraph.js';
import { VALIDATION_ERROR } from '../validation/Codes.js';
import { ConstraintRegistry } from '../validation/Constraints.js';
import { Diagnostic, DiagnosticPath, Diagnostics } from '../validation/Diagnostics.js';
import { InstanceRelationValidator } from './InstanceRelations.js';
import { InstanceSchemaValidator } from './InstanceSchema.js';
import { InstanceValidationOptions, ModelInstanceGraph, ResolvedInstanceNode } from './InstanceTypes.js';
import { InstanceValueValidator } from './InstanceValues.js';
import type { ValidationResult } from '../validation/ModelValidator.js';

export * from './InstanceTypes.js';

/** Validates modelled objects and connections against effective RAMEN model format features. */
export class InstanceValidator {
  /** Creates an instance validator with the standard safe constraint evaluators. */
  public constructor(private readonly constraints: ConstraintRegistry = ConstraintRegistry.createDefault()) {}

  /**
   * Validates a complete instance graph against the graph root, including values, endpoints and cardinalities.
   * Callers must not pass a database page or partial update because absence has model-level meaning.
   */
  public validate(graph: ProjectGraph, input: unknown, options: InstanceValidationOptions = {}): ValidationResult {
    try {
      InstanceSchemaValidator.assertValid(input);
    } catch (error: unknown) {
      return {
        hasErrors: true,
        diagnostics: [
          Diagnostics.error({
            code: VALIDATION_ERROR.INSTANCE_SCHEMA_INVALID,
            message: error instanceof Error ? error.message : String(error),
            path: DiagnosticPath.root(),
          }),
        ],
      };
    }

    return this.validateData(graph, input, options);
  }

  private validateData(graph: ProjectGraph, instance: ModelInstanceGraph, options: InstanceValidationOptions): ValidationResult {
    const diagnostics: Diagnostic[] = [];
    const values: InstanceValueValidator = new InstanceValueValidator(
      this.constraints,
      { project: graph, instances: instance },
      options.attributes,
    );
    const relations: InstanceRelationValidator = new InstanceRelationValidator(
      this.constraints,
      {
        project: graph,
        instances: instance,
      },
      options.relations ?? new ModelRelationScope(graph).available(graph.getRootModel().id),
    );
    const nodesById: Map<string, ResolvedInstanceNode> = values.validate(graph, instance, diagnostics);

    relations.validate(graph, instance, nodesById, diagnostics);
    const hasErrors: boolean = diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.severity === 'error');
    return { diagnostics: diagnostics, hasErrors: hasErrors };
  }
}
