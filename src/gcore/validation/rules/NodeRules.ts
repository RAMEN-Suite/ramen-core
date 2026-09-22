import { GNode, Id, Ref } from '../../model/ModelTypes';
import { Diagnostic, DiagnosticPath, Diagnostics } from '../ValidationDiagnostic';
import { VALIDATION_ERROR } from '../ValidationErrorCode';
import { ValidationContext } from '../SemanticValidator';
import { QualifiedParts, ModelReference } from '../../reference/ModelReference';
import { AbstractRules } from './AbstractRules';

export class NodeRules extends AbstractRules {
  public validate(ctx: ValidationContext, node: GNode, classifierPath: DiagnosticPath): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const superTypes: readonly Ref[] = node.superTypes ?? [];

    diagnostics.push(...this.validateSuperTypeCardinality(ctx, node, superTypes, classifierPath));
    if (superTypes.length !== 1) return diagnostics;

    const superType: Ref | undefined = superTypes[0];
    if (superType === undefined) return diagnostics;
    diagnostics.push(...this.validateSuperTypeQualified(ctx, node, superType, classifierPath));
    if (!ModelReference.isQualified(superType)) return diagnostics;

    const parts: QualifiedParts = ModelReference.splitQualified(superType);
    diagnostics.push(...this.validateSuperTypeModelReferencesBase(ctx, node, parts, classifierPath));
    if (parts.modelId !== ctx.baseId) return diagnostics;

    diagnostics.push(...this.validateBaseNodeExists(ctx, parts.refId, classifierPath));
    return diagnostics;
  }

  private validateSuperTypeCardinality(
    ctx: ValidationContext,
    node: GNode,
    superTypes: readonly Ref[],
    classifierPath: DiagnosticPath,
  ): Diagnostic[] {
    if (superTypes.length === 1) return [];

    return [
      Diagnostics.error({
        code: VALIDATION_ERROR.NODE_SUPERTYPE_CARDINALITY_INVALID,
        message: `Node '${node.id}' must declare exactly one base superType (${ctx.baseId}:<nodeId>).`,
        path: classifierPath.property('superTypes'),
        ref: node.id,
      }),
    ];
  }

  private validateSuperTypeQualified(
    ctx: ValidationContext,
    node: GNode,
    superType: Ref,
    classifierPath: DiagnosticPath,
  ): Diagnostic[] {
    if (ModelReference.isQualified(superType)) return [];

    return [
      Diagnostics.error({
        code: VALIDATION_ERROR.NODE_SUPERTYPE_NOT_QUALIFIED,
        message: `Node '${node.id}' superType must be qualified (${ctx.baseId}:<nodeId>). Local supertypes are not allowed.`,
        path: classifierPath.property('superTypes').index(0),
        ref: node.id,
      }),
    ];
  }

  private validateSuperTypeModelReferencesBase(
    ctx: ValidationContext,
    node: GNode,
    parts: QualifiedParts,
    classifierPath: DiagnosticPath,
  ): Diagnostic[] {
    if (parts.modelId === ctx.baseId) return [];

    return [
      Diagnostics.error({
        code: VALIDATION_ERROR.NODE_SUPERTYPE_NOT_BASE,
        message: `Node '${node.id}' superType must reference base model '${ctx.baseId}', but references '${parts.modelId}'.`,
        path: classifierPath.property('superTypes').index(0),
        ref: node.id,
      }),
    ];
  }

  private validateBaseNodeExists(ctx: ValidationContext, baseNodeId: Id, classifierPath: DiagnosticPath): Diagnostic[] {
    if (ctx.baseIndex.nodesById.has(baseNodeId)) return [];

    return [
      Diagnostics.error({
        code: VALIDATION_ERROR.BASE_NODE_NOT_FOUND,
        message: `Base node '${baseNodeId}' not found.`,
        path: classifierPath.property('superTypes').index(0),
        ref: baseNodeId,
      }),
    ];
  }
}
