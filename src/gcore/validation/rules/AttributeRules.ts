import { GAttribute, GModel, GNode, Id, TypeRef } from '../../model/ModelTypes';
import { Diagnostic, DiagnosticPath, Diagnostics } from '../ValidationDiagnostic';
import { VALIDATION_ERROR } from '../ValidationErrorCode';
import { ValidationContext } from '../SemanticValidator';
import { ModelSemantics } from '../ModelSemantics';
import { AbstractRules } from './AbstractRules';
import { BuiltinDataTypes } from '../../model/BuiltinDataTypes';
import { QualifiedParts, ModelRef } from '../../graph/ModelRef';
import { ImportClosure } from '../../graph/ImportClosure';
import { ModelElementIndex } from '../../graph/ModelElementIndex';
import { NodeInheritance, ResolvedNode } from '../../graph/NodeInheritance';

export class AttributeRules extends AbstractRules {
  public validate(ctx: ValidationContext, node: GNode, classifierPath: DiagnosticPath): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const attributes: readonly GAttribute[] = node.attributes ?? [];
    const inheritedNames: ReadonlySet<string> = this.resolveInheritedAttributeNames(ctx, node.id);

    diagnostics.push(...this.validateAttributeNames(attributes, node, classifierPath));
    diagnostics.push(...this.validateAttributes(ctx, node, attributes, inheritedNames, classifierPath));
    return diagnostics;
  }

  private validateAttributeNames(attributes: readonly GAttribute[], node: GNode, classifierPath: DiagnosticPath): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const firstIndexByName: Map<string, number> = new Map<string, number>();

    attributes.forEach((attribute: GAttribute, attributeIndex: number): void => {
      const previousIndex: number | undefined = firstIndexByName.get(attribute.name);
      if (previousIndex === undefined) {
        firstIndexByName.set(attribute.name, attributeIndex);
        return;
      }

      diagnostics.push(
        Diagnostics.error({
          code: VALIDATION_ERROR.ATTRIBUTE_NAME_DUPLICATE,
          message: `Duplicate attribute name '${attribute.name}' in node '${node.id}' (also at index ${previousIndex}).`,
          path: classifierPath.property('attributes').index(attributeIndex).property('name'),
          ref: node.id,
        }),
      );
    });

    return diagnostics;
  }

  private validateNoRoleNameConflict(
    ctx: ValidationContext,
    node: GNode,
    attribute: GAttribute,
    attributePath: DiagnosticPath,
  ): Diagnostic[] {
    const reserved: Set<string> = new Set<string>();

    for (const relation of ctx.derivedModel.relations ?? []) {
      if (relation.from.nodeId === node.id) reserved.add(relation.to.role);
      if (relation.to.nodeId === node.id) reserved.add(relation.from.role);
    }

    if (!reserved.has(attribute.name)) return [];

    return [
      Diagnostics.error({
        code: VALIDATION_ERROR.ATTRIBUTE_NAME_CONFLICTS_WITH_ROLE,
        message: `Attribute '${attribute.name}' in node '${node.id}' conflicts with a reserved relation role name.`,
        path: attributePath.property('name'),
        ref: attribute.name,
      }),
    ];
  }

  private validateAttributes(
    ctx: ValidationContext,
    node: GNode,
    attributes: readonly GAttribute[],
    inheritedNames: ReadonlySet<string>,
    classifierPath: DiagnosticPath,
  ): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    attributes.forEach((attribute: GAttribute, attributeIndex: number): void => {
      const attributePath: DiagnosticPath = classifierPath.property('attributes').index(attributeIndex);

      diagnostics.push(...this.validateNoInheritedShadowing(attribute, node, inheritedNames, attributePath));
      diagnostics.push(...this.validateNoRoleNameConflict(ctx, node, attribute, attributePath));
      diagnostics.push(...this.validateBounds(attribute, node, attributePath));
      diagnostics.push(...this.validateKeyFlag(attribute, node, attributePath));
      diagnostics.push(...this.validateTypeResolvable(ctx, attribute, node, attributePath));
    });

    return diagnostics;
  }

  private validateNoInheritedShadowing(
    attribute: GAttribute,
    node: GNode,
    inheritedNames: ReadonlySet<string>,
    attributePath: DiagnosticPath,
  ): Diagnostic[] {
    if (!inheritedNames.has(attribute.name)) return [];

    return [
      Diagnostics.error({
        code: VALIDATION_ERROR.ATTRIBUTE_NAME_SHADOWS_BASE,
        message: `Attribute '${attribute.name}' in node '${node.id}' conflicts with inherited base attribute.`,
        path: attributePath.property('name'),
        ref: node.id,
      }),
    ];
  }

  private validateBounds(attribute: GAttribute, node: GNode, attributePath: DiagnosticPath): Diagnostic[] {
    if (ModelSemantics.areBoundsCoherent(attribute.bounds)) return [];

    return [
      Diagnostics.error({
        code: VALIDATION_ERROR.ATTRIBUTE_BOUNDS_INVALID,
        message: `Invalid bounds for attribute '${attribute.name}' in node '${node.id}'.`,
        path: attributePath.property('bounds'),
        ref: node.id,
      }),
    ];
  }

  private validateKeyFlag(attribute: GAttribute, node: GNode, attributePath: DiagnosticPath): Diagnostic[] {
    if (attribute.isKey !== true) return [];

    const lowerBound: number = attribute.bounds.lowerBound;
    const upperBound: number = attribute.bounds.upperBound;

    const isSingleValued: boolean = upperBound === 1;
    const isRequired: boolean = lowerBound >= 1;

    if (isSingleValued && isRequired) return [];

    return [
      Diagnostics.warn({
        code: VALIDATION_ERROR.ATTRIBUTE_KEY_BOUNDS_INVALID,
        message: `Key attribute '${attribute.name}' in node '${node.id}' should have bounds 1..1.`,
        path: attributePath.property('bounds'),
        ref: node.id,
      }),
    ];
  }

  private validateTypeResolvable(
    ctx: ValidationContext,
    attribute: GAttribute,
    node: GNode,
    attributePath: DiagnosticPath,
  ): Diagnostic[] {
    const isResolvable: boolean = this.isTypeRefResolvable(ctx, attribute.typeId);
    if (isResolvable) return [];

    return [
      Diagnostics.error({
        code: VALIDATION_ERROR.ATTRIBUTE_TYPE_NOT_FOUND,
        message: `Attribute '${attribute.name}' in node '${node.id}' references unknown type '${attribute.typeId}'.`,
        path: attributePath.property('typeId'),
        ref: node.id,
      }),
    ];
  }

  private resolveInheritedAttributeNames(ctx: ValidationContext, nodeId: Id): ReadonlySet<string> {
    const names: Set<string> = new Set<string>();
    const startModelId: Id = ctx.derivedIndex.model.id;
    const chain: readonly ResolvedNode[] = NodeInheritance.resolveSuperTypeChain(startModelId, nodeId, ctx.models);

    for (const item of chain) {
      for (const attribute of item.node.attributes ?? []) {
        names.add(attribute.name);
      }
    }
    return names;
  }

  private isTypeRefResolvable(ctx: ValidationContext, typeRef: TypeRef): boolean {
    if (BuiltinDataTypes.isBuiltin(typeRef)) return true;
    if (!ModelRef.isQualified(typeRef)) return ctx.derivedIndex.dataTypesById.has(typeRef);

    const parts: QualifiedParts = ModelRef.splitQualified(typeRef);
    const closure: readonly GModel[] = ImportClosure.resolveImports(ctx.derivedIndex.model.id, ctx.models);

    const allowedModelIds: Set<Id> = new Set<Id>(closure.map((m: GModel): Id => m.id));
    if (!allowedModelIds.has(parts.modelId)) return false;

    const targetModel: GModel | undefined = ctx.models.get(parts.modelId);
    if (!targetModel) return false;

    const targetIndex: ModelElementIndex = new ModelElementIndex(targetModel);
    return targetIndex.dataTypesById.has(parts.refId);
  }
}
