import { ProjectGraph } from '../project/Graph';
import { ConstraintRegistry } from './Constraints';
import { Diagnostic } from './Diagnostics';
import { InstanceRelationValidator } from './InstanceRelations';
import { ModelInstanceGraph, ResolvedInstanceNode } from './InstanceTypes';
import { InstanceValueValidator } from './InstanceValues';
import type { ValidationResult } from './Validate';

export * from './InstanceTypes';

/** Validates modeled objects and connections against effective GCore features. */
export class InstanceValidator {
  private readonly values: InstanceValueValidator;
  private readonly relations: InstanceRelationValidator;

  /** Creates an instance validator with the standard safe constraint evaluators. */
  public constructor(constraints: ConstraintRegistry = ConstraintRegistry.createDefault()) {
    this.values = new InstanceValueValidator(constraints);
    this.relations = new InstanceRelationValidator(constraints);
  }

  /**
   * Validates a complete instance graph, including values, endpoints, and lower and upper cardinalities.
   * Callers must not pass a database page or partial update because absence has model-level meaning.
   */
  public validate(graph: ProjectGraph, instance: ModelInstanceGraph): ValidationResult {
    const diagnostics: Diagnostic[] = [];
    const nodesById: Map<string, ResolvedInstanceNode> = this.values.validate(graph, instance, diagnostics);
    this.relations.validate(graph, instance, nodesById, diagnostics);
    const hasErrors: boolean = diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.severity === 'error');
    return { diagnostics: diagnostics, hasErrors: hasErrors };
  }
}
