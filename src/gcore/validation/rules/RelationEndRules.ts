import { GNode, GRelation, Id } from '../../model/ModelTypes';
import { Diagnostic, DiagnosticPath, Diagnostics } from '../ValidationDiagnostic';
import { VALIDATION_ERROR } from '../ValidationErrorCode';
import { ValidationContext } from '../SemanticValidator';
import { ModelSemantics } from '../ModelSemantics';
import { QualifiedParts } from '../../reference/ModelReference';
import { NodeInheritanceResolver } from '../../resolution/NodeInheritanceResolver';
import { AbstractRules } from './AbstractRules';

export class RelationEndRules extends AbstractRules {
  public validate(
    ctx: ValidationContext,
    relation: GRelation,
    baseRelation: GRelation,
    relationPath: DiagnosticPath,
  ): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    diagnostics.push(...this.validateEndBoundsCoherence(relation, relationPath));
    diagnostics.push(...this.validateEndsLocal(relation, relationPath));
    if (!ModelSemantics.areRelationEndsLocal(relation)) return diagnostics;

    diagnostics.push(...this.validateEndNodesExist(ctx, relation, relationPath));
    const fromNode: GNode | undefined = ctx.derivedIndex.nodesById.get(relation.from.nodeId);
    const toNode: GNode | undefined = ctx.derivedIndex.nodesById.get(relation.to.nodeId);
    if (!fromNode || !toNode) return diagnostics;

    diagnostics.push(...this.validateEndCompatibility(ctx, relation, baseRelation, fromNode, toNode, relationPath));
    diagnostics.push(...this.validateRolesMatch(relation, baseRelation, relationPath));
    diagnostics.push(...this.validateBoundsMatch(relation, baseRelation, relationPath));
    return diagnostics;
  }

  private validateEndBoundsCoherence(relation: GRelation, relationPath: DiagnosticPath): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    if (!ModelSemantics.areBoundsCoherent(relation.from.bounds)) {
      diagnostics.push(
        Diagnostics.error({
          code: VALIDATION_ERROR.RELATION_FROM_BOUNDS_COHERENCE_INVALID,
          message: `Invalid bounds for relation '${relation.id}' (from.bounds).`,
          path: relationPath.property('from').property('bounds'),
          ref: relation.id,
        }),
      );
    }

    if (!ModelSemantics.areBoundsCoherent(relation.to.bounds)) {
      diagnostics.push(
        Diagnostics.error({
          code: VALIDATION_ERROR.RELATION_TO_BOUNDS_COHERENCE_INVALID,
          message: `Invalid bounds for relation '${relation.id}' (to.bounds).`,
          path: relationPath.property('to').property('bounds'),
          ref: relation.id,
        }),
      );
    }

    return diagnostics;
  }

  private validateEndsLocal(relation: GRelation, relationPath: DiagnosticPath): Diagnostic[] {
    if (ModelSemantics.areRelationEndsLocal(relation)) return [];

    return [
      Diagnostics.error({
        code: VALIDATION_ERROR.RELATION_ENDS_NOT_LOCAL,
        message: `Relation ends must reference local nodes.`,
        path: relationPath.property('from').property('nodeId'),
        ref: relation.id,
      }),
    ];
  }

  private validateEndNodesExist(ctx: ValidationContext, relation: GRelation, relationPath: DiagnosticPath): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const fromNodeId: Id = relation.from.nodeId;
    const toNodeId: Id = relation.to.nodeId;

    if (!ctx.derivedIndex.nodesById.has(fromNodeId)) {
      diagnostics.push(
        Diagnostics.error({
          code: VALIDATION_ERROR.RELATION_FROM_NODE_NOT_FOUND,
          message: `From-node '${fromNodeId}' not found in derived model.`,
          path: relationPath.property('from').property('nodeId'),
          ref: relation.id,
        }),
      );
    }

    if (!ctx.derivedIndex.nodesById.has(toNodeId)) {
      diagnostics.push(
        Diagnostics.error({
          code: VALIDATION_ERROR.RELATION_TO_NODE_NOT_FOUND,
          message: `To-node '${toNodeId}' not found in derived model.`,
          path: relationPath.property('to').property('nodeId'),
          ref: relation.id,
        }),
      );
    }

    return diagnostics;
  }

  private validateEndCompatibility(
    ctx: ValidationContext,
    derivedRelation: GRelation,
    baseRelation: GRelation,
    fromNode: GNode,
    toNode: GNode,
    relationPath: DiagnosticPath,
  ): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    const fromParts: QualifiedParts | null = NodeInheritanceResolver.resolveLocalSuperType(fromNode.superTypes, ctx.baseId);
    diagnostics.push(
      ...this.validateNodeHasBaseSuperType(
        fromParts,
        VALIDATION_ERROR.RELATION_FROM_NODE_SUPERTYPE_INVALID,
        fromNode.id,
        derivedRelation.id,
        relationPath.property('from').property('nodeId'),
      ),
    );
    if (!fromParts) return diagnostics;

    const toParts: QualifiedParts | null = NodeInheritanceResolver.resolveLocalSuperType(toNode.superTypes, ctx.baseId);
    diagnostics.push(
      ...this.validateNodeHasBaseSuperType(
        toParts,
        VALIDATION_ERROR.RELATION_TO_NODE_SUPERTYPE_INVALID,
        toNode.id,
        derivedRelation.id,
        relationPath.property('to').property('nodeId'),
      ),
    );
    if (!toParts) return diagnostics;

    diagnostics.push(
      ...this.validateResolvedEndCompatibility(fromParts, toParts, derivedRelation, baseRelation, fromNode, toNode, relationPath),
    );
    return diagnostics;
  }

  private validateResolvedEndCompatibility(
    fromParts: QualifiedParts,
    toParts: QualifiedParts,
    derivedRelation: GRelation,
    baseRelation: GRelation,
    fromNode: GNode,
    toNode: GNode,
    relationPath: DiagnosticPath,
  ): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    if (fromParts.refId !== baseRelation.from.nodeId) {
      diagnostics.push(
        Diagnostics.error({
          code: VALIDATION_ERROR.RELATION_FROM_INCOMPATIBLE,
          message: `From-node '${fromNode.id}' must specialize base '${baseRelation.from.nodeId}'.`,
          path: relationPath.property('from').property('nodeId'),
          ref: derivedRelation.id,
        }),
      );
    }

    if (toParts.refId !== baseRelation.to.nodeId) {
      diagnostics.push(
        Diagnostics.error({
          code: VALIDATION_ERROR.RELATION_TO_INCOMPATIBLE,
          message: `To-node '${toNode.id}' must specialize base '${baseRelation.to.nodeId}'.`,
          path: relationPath.property('to').property('nodeId'),
          ref: derivedRelation.id,
        }),
      );
    }

    return diagnostics;
  }

  private validateNodeHasBaseSuperType(
    parts: QualifiedParts | null,
    code: string,
    nodeId: Id,
    relationId: Id,
    path: DiagnosticPath,
  ): Diagnostic[] {
    if (parts) return [];

    return [
      Diagnostics.error({
        code,
        message: `Node '${nodeId}' must have exactly one base superType.`,
        path,
        ref: relationId,
      }),
    ];
  }

  private validateRolesMatch(derivedRelation: GRelation, baseRelation: GRelation, relationPath: DiagnosticPath): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    if (derivedRelation.from.role !== baseRelation.from.role) {
      diagnostics.push(
        Diagnostics.error({
          code: VALIDATION_ERROR.RELATION_ROLE_MISMATCH,
          message: `from.role must be '${baseRelation.from.role}'.`,
          path: relationPath.property('from').property('role'),
          ref: derivedRelation.id,
        }),
      );
    }

    if (derivedRelation.to.role !== baseRelation.to.role) {
      diagnostics.push(
        Diagnostics.error({
          code: VALIDATION_ERROR.RELATION_ROLE_MISMATCH,
          message: `to.role must be '${baseRelation.to.role}'.`,
          path: relationPath.property('to').property('role'),
          ref: derivedRelation.id,
        }),
      );
    }

    return diagnostics;
  }

  private validateBoundsMatch(derivedRelation: GRelation, baseRelation: GRelation, relationPath: DiagnosticPath): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    if (!ModelSemantics.isModelBoundsCompatible(baseRelation.from.bounds, derivedRelation.from.bounds)) {
      diagnostics.push(
        Diagnostics.error({
          code: VALIDATION_ERROR.RELATION_FROM_BOUNDS_INVALID,
          message: `from.bounds must specialize base bounds.`,
          path: relationPath.property('from').property('bounds'),
          ref: derivedRelation.id,
        }),
      );
    }

    if (!ModelSemantics.isModelBoundsCompatible(baseRelation.to.bounds, derivedRelation.to.bounds)) {
      diagnostics.push(
        Diagnostics.error({
          code: VALIDATION_ERROR.RELATION_TO_BOUNDS_INVALID,
          message: `to.bounds must specialize base bounds.`,
          path: relationPath.property('to').property('bounds'),
          ref: derivedRelation.id,
        }),
      );
    }

    return diagnostics;
  }
}
