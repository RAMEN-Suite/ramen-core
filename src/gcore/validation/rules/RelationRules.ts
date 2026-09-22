import { GRelation, Id, Ref } from '../../model/Types';
import { Diagnostic, DiagnosticPath, Diagnostics } from '../Diagnostics';
import { VALIDATION_ERROR } from '../Codes';
import { ValidationContext } from '../Semantic';
import { QualifiedParts, ModelRef } from '../../project/Refs';
import { AbstractRules } from './AbstractRules';
import { RelationEndRules } from './RelationEndRules';

interface BaseRelationResolution {
  readonly baseRelationId: Id | null;
  readonly diagnostics: Diagnostic[];
}

export class RelationRules extends AbstractRules {
  private readonly endRules: RelationEndRules = new RelationEndRules();

  public validate(ctx: ValidationContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const relations: readonly GRelation[] = ctx.derivedModel.relations ?? [];
    diagnostics.push(...this.validateUniqueIds(relations));
    diagnostics.push(...this.validateRelationRoleConflicts(ctx, relations));

    relations.forEach((relation: GRelation, relationIndex: number): void => {
      const relationPath: DiagnosticPath = DiagnosticPath.root().property('relations').index(relationIndex);

      const resolution: BaseRelationResolution = this.resolveBaseRelationId(ctx, relation, relationPath);
      diagnostics.push(...resolution.diagnostics);
      if (!resolution.baseRelationId) return;

      const baseRelation: GRelation | undefined = ctx.baseIndex.relationsById.get(resolution.baseRelationId);
      diagnostics.push(...this.validateBaseRelationExists(resolution.baseRelationId, baseRelation, relationPath));
      if (!baseRelation) return;

      diagnostics.push(...this.validateComposite(relation, baseRelation, relationPath));
      diagnostics.push(...this.endRules.validate(ctx, relation, baseRelation, relationPath));
    });

    return diagnostics;
  }

  private validateUniqueIds(relations: readonly GRelation[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const firstIndexById: Map<Id, number> = new Map<Id, number>();

    relations.forEach((relation: GRelation, relationIndex: number): void => {
      const previousIndex: number | undefined = firstIndexById.get(relation.id);
      if (previousIndex === undefined) {
        firstIndexById.set(relation.id, relationIndex);
        return;
      }

      diagnostics.push(
        Diagnostics.error({
          code: VALIDATION_ERROR.RELATION_ID_DUPLICATE,
          message: `Duplicate relation id '${relation.id}' (also at index ${previousIndex}).`,
          path: DiagnosticPath.root().property('relations').index(relationIndex).property('id'),
          ref: relation.id,
        }),
      );
    });

    return diagnostics;
  }

  private resolveBaseRelationId(
    ctx: ValidationContext,
    relation: GRelation,
    relationPath: DiagnosticPath,
  ): BaseRelationResolution {
    const diagnostics: Diagnostic[] = [];
    const superTypes: readonly Ref[] = relation.superTypes ?? [];

    diagnostics.push(...this.validateRelationSuperTypeCardinality(ctx, relation, superTypes, relationPath));
    if (superTypes.length !== 1) return { baseRelationId: null, diagnostics };

    const superType: Ref | undefined = superTypes[0];
    if (superType === undefined) return { baseRelationId: null, diagnostics };
    diagnostics.push(...this.validateRelationSuperTypeQualified(ctx, relation, superType, relationPath));
    if (!ModelRef.isQualified(superType)) return { baseRelationId: null, diagnostics };

    const parts: QualifiedParts = ModelRef.splitQualified(superType);
    diagnostics.push(...this.validateRelationSuperTypeModelRefsBase(ctx, relation, parts, relationPath));
    if (parts.modelId !== ctx.baseId) return { baseRelationId: null, diagnostics };

    return { baseRelationId: parts.refId, diagnostics };
  }

  private validateRelationSuperTypeCardinality(
    ctx: ValidationContext,
    relation: GRelation,
    superTypes: readonly Ref[],
    relationPath: DiagnosticPath,
  ): Diagnostic[] {
    if (superTypes.length === 1) return [];

    return [
      Diagnostics.error({
        code: VALIDATION_ERROR.RELATION_SUPERTYPE_CARDINALITY_INVALID,
        message: `Relation '${relation.id}' must declare exactly one base superType (${ctx.baseId}:<relationId>).`,
        path: relationPath.property('superTypes'),
        ref: relation.id,
      }),
    ];
  }

  private validateRelationSuperTypeQualified(
    ctx: ValidationContext,
    relation: GRelation,
    superType: Ref,
    relationPath: DiagnosticPath,
  ): Diagnostic[] {
    if (ModelRef.isQualified(superType)) return [];

    return [
      Diagnostics.error({
        code: VALIDATION_ERROR.RELATION_SUPERTYPE_NOT_QUALIFIED,
        message: `Relation '${relation.id}' superType must be qualified (${ctx.baseId}:<relationId>). Local supertypes are not allowed.`,
        path: relationPath.property('superTypes').index(0),
        ref: relation.id,
      }),
    ];
  }

  private validateRelationSuperTypeModelRefsBase(
    ctx: ValidationContext,
    relation: GRelation,
    parts: QualifiedParts,
    relationPath: DiagnosticPath,
  ): Diagnostic[] {
    if (parts.modelId === ctx.baseId) return [];

    return [
      Diagnostics.error({
        code: VALIDATION_ERROR.RELATION_SUPERTYPE_NOT_BASE,
        message: `Relation '${relation.id}' superType must reference base model '${ctx.baseId}', but references '${parts.modelId}'.`,
        path: relationPath.property('superTypes').index(0),
        ref: relation.id,
      }),
    ];
  }

  private validateBaseRelationExists(
    baseRelationId: Id,
    baseRelation: GRelation | undefined,
    relationPath: DiagnosticPath,
  ): Diagnostic[] {
    if (baseRelation) return [];

    return [
      Diagnostics.error({
        code: VALIDATION_ERROR.BASE_RELATION_NOT_FOUND,
        message: `Base relation '${baseRelationId}' not found.`,
        path: relationPath.property('superTypes').index(0),
        ref: baseRelationId,
      }),
    ];
  }

  private validateRelationRoleConflicts(ctx: ValidationContext, relations: readonly GRelation[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const ownerByKey: Map<string, Id> = new Map<string, Id>();
    const ownerRelationByKey: Map<string, Id> = new Map<string, Id>();

    relations.forEach((relation: GRelation, relationIndex: number): void => {
      const relationPath: DiagnosticPath = DiagnosticPath.root().property('relations').index(relationIndex);

      const resolution: BaseRelationResolution = this.resolveBaseRelationId(ctx, relation, relationPath);
      diagnostics.push(...resolution.diagnostics);
      if (!resolution.baseRelationId) return;

      const baseRelationId: Id = resolution.baseRelationId;

      this.validateRelationRole(
        relation.from.nodeId,
        relation.to.role,
        baseRelationId,
        relation.id,
        relationPath.property('to').property('role'),
        ownerByKey,
        ownerRelationByKey,
        diagnostics,
      );

      this.validateRelationRole(
        relation.to.nodeId,
        relation.from.role,
        baseRelationId,
        relation.id,
        relationPath.property('from').property('role'),
        ownerByKey,
        ownerRelationByKey,
        diagnostics,
      );
    });

    return diagnostics;
  }

  private validateRelationRole(
    nodeId: Id,
    roleName: string,
    baseRelationId: Id,
    derivedRelationId: Id,
    path: DiagnosticPath,
    ownerByKey: Map<string, Id>,
    ownerRelationByKey: Map<string, Id>,
    diagnostics: Diagnostic[],
  ): void {
    const key: string = `${nodeId}::${roleName}`;
    const existingBase: Id | undefined = ownerByKey.get(key);

    if (existingBase === undefined) {
      ownerByKey.set(key, baseRelationId);
      ownerRelationByKey.set(key, derivedRelationId);
      return;
    }

    if (existingBase === baseRelationId) return;
    const firstOwnerRelationId: Id | undefined = ownerRelationByKey.get(key);

    diagnostics.push(
      Diagnostics.error({
        code: VALIDATION_ERROR.RELATION_ROLE_PROPERTY_CONFLICT,
        message: `Role '${roleName}' on node '${nodeId}' conflicts across base relations ('${existingBase}' vs '${baseRelationId}').`,
        path,
        ref: firstOwnerRelationId ?? derivedRelationId,
      }),
    );
  }

  private validateCompositeBothEnds(
    relation: GRelation,
    fromComposite: boolean,
    toComposite: boolean,
    relationPath: DiagnosticPath,
  ): Diagnostic[] {
    if (!fromComposite || !toComposite) return [];
    return [
      Diagnostics.error({
        code: VALIDATION_ERROR.RELATION_COMPOSITE_BOTH_ENDS,
        message: `Relation '${relation.id}' must not be composite on both ends.`,
        path: relationPath,
        ref: relation.id,
      }),
    ];
  }

  private validateComposite(derivedRelation: GRelation, baseRelation: GRelation, relationPath: DiagnosticPath): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    const derivedFrom: boolean = derivedRelation.from.isComposite === true;
    const derivedTo: boolean = derivedRelation.to.isComposite === true;

    diagnostics.push(...this.validateCompositeBothEnds(derivedRelation, derivedFrom, derivedTo, relationPath));

    const baseFrom: boolean = baseRelation.from.isComposite === true;
    const baseTo: boolean = baseRelation.to.isComposite === true;

    if (derivedFrom !== baseFrom) {
      diagnostics.push(
        Diagnostics.error({
          code: VALIDATION_ERROR.RELATION_COMPOSITE_MISMATCH,
          message: `from.isComposite must be '${baseFrom}'.`,
          path: relationPath.property('from').property('isComposite'),
          ref: derivedRelation.id,
        }),
      );
    }

    if (derivedTo !== baseTo) {
      diagnostics.push(
        Diagnostics.error({
          code: VALIDATION_ERROR.RELATION_COMPOSITE_MISMATCH,
          message: `to.isComposite must be '${baseTo}'.`,
          path: relationPath.property('to').property('isComposite'),
          ref: derivedRelation.id,
        }),
      );
    }

    return diagnostics;
  }
}
