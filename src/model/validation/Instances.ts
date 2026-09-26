import { ProjectGraph } from '../project/Graph';
import { VALIDATION_ERROR } from './Codes';
import { ConstraintRegistry } from './Constraints';
import { Diagnostic, DiagnosticPath, Diagnostics } from './Diagnostics';
import { InstanceRelationValidator } from './InstanceRelations';
import { InstanceSchemaValidator } from './InstanceSchema';
import { InstanceValidationOptions, ModelInstanceGraph, ResolvedInstanceNode } from './InstanceTypes';
import { InstanceValueValidator } from './InstanceValues';
import type { ValidationResult } from './ModelValidator';

export * from './InstanceTypes';

/** Validates modeled objects and connections against effective RAMEN model format features. */
export class InstanceValidator {
  /** Creates an instance validator with the standard safe constraint evaluators. */
  public constructor(private readonly constraints: ConstraintRegistry = ConstraintRegistry.createDefault()) {}

  /**
   * Validates a complete instance graph, including values, endpoints, and lower and upper cardinalities.
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

    const instance: ModelInstanceGraph = input;
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
      options.relations,
    );
    const nodesById: Map<string, ResolvedInstanceNode> = values.validate(graph, instance, diagnostics);

    relations.validate(graph, instance, nodesById, diagnostics);
    const hasErrors: boolean = diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.severity === 'error');
    return { diagnostics: diagnostics, hasErrors: hasErrors };
  }
}
