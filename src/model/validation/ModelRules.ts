import { Attribute, DataType, Literal, Model, Node, Relation, Id, Import, RelationEnd, Ref } from '../Types';
import { EffectiveModel, EffectiveNode } from '../graph/EffectiveModel';
import { ProjectGraph, ResolvedElement } from '../graph/ProjectGraph';
import { Diagnostic, DiagnosticPath, Diagnostics } from './Diagnostics';
import { ModelRelationScope, RelationSelections } from '../graph/RelationScope';
import { Cardinality } from './Cardinality';
import { ValidationCode } from './Codes';

/** Applies model-level well-formedness and refinement rules across a complete project graph. */
export class ModelRules {
  /** Validates every reachable model and returns all semantic findings. */
  public validate(graph: ProjectGraph, selections?: RelationSelections): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const scope: ModelRelationScope = new ModelRelationScope(graph, selections);
    for (const model of graph.getModels()) {
      this.validateModel(graph, model, diagnostics);
      this.validateRelationSelections(model, scope, selections?.get(model.id) ?? [], diagnostics);
    }
    return diagnostics;
  }

  private validateRelationSelections(
    model: Model,
    scope: ModelRelationScope,
    selections: readonly Ref[],
    diagnostics: Diagnostic[],
  ): void {
    const references: readonly Ref[] =
      model.imports.length > 0
        ? model.relations
            .filter(
              (relation: Relation): boolean => !relation.superTypes[0] || !scope.allowsBase(model.id, relation.superTypes[0]),
            )
            .map((relation: Relation): Ref => relation.id)
        : [];
    const invalid: readonly Ref[] = [
      ...references,
      ...selections.filter((ref: Ref): boolean => !scope.allowsBase(model.id, ref)),
    ];
    for (const reference of invalid) {
      diagnostics.push(
        this.error(
          'RELATION_SCOPE_INVALID',
          'Select a relation permitted by the preceding model level.',
          DiagnosticPath.root().property('models').property(model.id).property('relations'),
          reference,
        ),
      );
    }
  }

  private validateModel(graph: ProjectGraph, model: Model, diagnostics: Diagnostic[]): void {
    this.validateImports(model, diagnostics);
    model.classifiers.forEach((classifier, index: number): void => {
      const path: DiagnosticPath = this.elementPath(model.id, 'classifiers', index);
      if (classifier.kind === 'Node') this.validateNode(graph, model, classifier, path, diagnostics);
      else this.validateDataType(classifier, path, diagnostics);
    });
    model.relations.forEach((relation: Relation, index: number): void => {
      const path: DiagnosticPath = this.elementPath(model.id, 'relations', index);
      this.validateRelation(graph, model.id, relation, path, diagnostics);
    });
  }

  private validateImports(model: Model, diagnostics: Diagnostic[]): void {
    const firstIndexByModelId: Map<Id, number> = new Map<Id, number>();
    model.imports.forEach((modelImport: Import, index: number): void => {
      const path: DiagnosticPath = DiagnosticPath.root().property('models').property(model.id).property('imports').index(index);
      const previousIndex: number | undefined = firstIndexByModelId.get(modelImport.modelId);

      if (previousIndex !== undefined) {
        diagnostics.push(
          this.error(
            'IMPORT_MODEL_ID_DUPLICATE',
            `Import '${modelImport.modelId}' is duplicated; first declared at index ${previousIndex}.`,
            path.property('modelId'),
            modelImport.modelId,
          ),
        );
      } else firstIndexByModelId.set(modelImport.modelId, index);
      if (modelImport.modelId === model.id) {
        diagnostics.push(
          this.error(
            'IMPORT_SELF_NOT_ALLOWED',
            `Model '${model.id}' must not import itself.`,
            path.property('modelId'),
            model.id,
          ),
        );
      }
    });
  }

  private validateDataType(dataType: DataType, path: DiagnosticPath, diagnostics: Diagnostic[]): void {
    const literals: readonly Literal[] | undefined = dataType.literals;
    if (!literals) return;
    this.validateLiteralUniqueness(literals, path, diagnostics);

    literals.forEach((literal: Literal, index: number): void => {
      const numeric: boolean = dataType.baseType === 'Integer' || dataType.baseType === 'Float';
      const valid: boolean = dataType.baseType === 'String' || (numeric && literal.value !== undefined);
      if (valid) return;
      const literalPath: DiagnosticPath = path.property('literals').index(index);
      const message: string = `Literal '${literal.name}' has no value for base type '${dataType.baseType}'.`;
      diagnostics.push(this.error('DATATYPE_LITERAL_TYPE_INVALID', message, literalPath, literal.id));
    });
  }

  private validateLiteralUniqueness(literals: readonly Literal[], path: DiagnosticPath, diagnostics: Diagnostic[]): void {
    const names: Set<string> = new Set<string>();
    const serialized: Set<string> = new Set<string>();
    const values: Set<number> = new Set<number>();

    literals.forEach((literal: Literal, index: number): void => {
      const literalPath: DiagnosticPath = path.property('literals').index(index);
      this.registerLiteralValue(
        names,
        literal.name,
        'DATATYPE_LITERAL_NAME_DUPLICATE',
        literalPath.property('name'),
        diagnostics,
      );

      const hasExplicitLiteral: boolean = literal.literal !== undefined;
      const serializedValue: string = literal.literal ?? literal.name;

      this.registerLiteralValue(
        serialized,
        serializedValue,
        'DATATYPE_LITERAL_SERIALIZED_DUPLICATE',
        literalPath.property(hasExplicitLiteral ? 'literal' : 'name'),
        diagnostics,
      );
      if (literal.value !== undefined) {
        this.registerLiteralValue(
          values,
          literal.value,
          'DATATYPE_LITERAL_VALUE_DUPLICATE',
          literalPath.property('value'),
          diagnostics,
        );
      }
    });
  }

  private registerLiteralValue<T>(
    values: Set<T>,
    value: T,
    code: ValidationCode,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    if (values.has(value)) diagnostics.push(this.error(code, `Duplicate data type literal value '${String(value)}'.`, path));
    values.add(value);
  }

  private validateNode(graph: ProjectGraph, model: Model, node: Node, path: DiagnosticPath, diagnostics: Diagnostic[]): void {
    if (node.superTypes.length > 1) {
      diagnostics.push(
        this.error(
          'NODE_MULTIPLE_SUPERTYPES_UNSUPPORTED',
          `Node '${node.id}' has ${node.superTypes.length} supertypes; RAMEN model format refinement supports at most one.`,
          path.property('superTypes'),
          node.id,
        ),
      );

      return;
    }
    if (model.imports.length > 0 && node.superTypes.length === 0) {
      const referencePath: DiagnosticPath = path.property('superTypes');
      const message: string = `Node '${node.id}' must refine an existing node in a model with imports.`;
      diagnostics.push(this.error('NODE_REFINEMENT_REQUIRED', message, referencePath, node.id));
    }
    this.validateKeys(graph, model.id, node, path, diagnostics);
    this.validateLocalAttributes(node, path, diagnostics);
    this.validateInheritedAttributeNames(graph, model.id, node, path, diagnostics);
  }

  private validateKeys(graph: ProjectGraph, modelId: Id, node: Node, path: DiagnosticPath, diagnostics: Diagnostic[]): void {
    const lineage: readonly ResolvedElement<Node>[] = [{ modelId, element: node }, ...graph.getNodeAncestors(modelId, node.id)];
    const keys: Attribute[] = lineage.flatMap((item: ResolvedElement<Node>): Attribute[] =>
      item.element.attributes.filter((attribute: Attribute): boolean => attribute.isKey === true),
    );
    if (keys.length <= 1) return;
    const message: string = `Node '${node.name}' has multiple key attributes, including inherited keys.`;
    diagnostics.push(this.error('ATTRIBUTE_MULTIPLE_KEYS', message, path.property('attributes'), node.id));
  }

  private validateLocalAttributes(node: Node, path: DiagnosticPath, diagnostics: Diagnostic[]): void {
    const localNames: Set<string> = new Set<string>();
    node.attributes.forEach((attribute: Attribute, index: number): void => {
      const attributePath: DiagnosticPath = path.property('attributes').index(index);
      if (localNames.has(attribute.name)) {
        diagnostics.push(
          this.error(
            'ATTRIBUTE_NAME_DUPLICATE',
            `Attribute name '${attribute.name}' is duplicated on node '${node.id}'.`,
            attributePath.property('name'),
            attribute.id,
          ),
        );
      }
      localNames.add(attribute.name);
      this.validateAttribute(attribute, attributePath, diagnostics);
    });
  }

  private validateInheritedAttributeNames(
    graph: ProjectGraph,
    modelId: Id,
    node: Node,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    const inheritedNames: Set<string> = new Set<string>();
    for (const ancestor of graph.getNodeAncestors(modelId, node.id)) {
      for (const attribute of ancestor.element.attributes) inheritedNames.add(attribute.name);
    }
    for (const attribute of node.attributes) {
      if (!inheritedNames.has(attribute.name)) continue;
      diagnostics.push(
        this.error(
          'ATTRIBUTE_NAME_SHADOWS_SUPERTYPE',
          `Attribute '${attribute.name}' shadows an inherited attribute on node '${node.id}'.`,
          path.property('attributes'),
          attribute.id,
        ),
      );
    }
  }

  private validateAttribute(attribute: Attribute, path: DiagnosticPath, diagnostics: Diagnostic[]): void {
    if (!Cardinality.areBoundsCoherent(attribute.bounds)) {
      diagnostics.push(
        this.error(
          'ATTRIBUTE_BOUNDS_INVALID',
          `Attribute '${attribute.name}' has incoherent bounds.`,
          path.property('bounds'),
          attribute.id,
        ),
      );
    }
    if (attribute.isKey === true && (attribute.bounds.lowerBound !== 1 || attribute.bounds.upperBound !== 1)) {
      diagnostics.push(
        this.error(
          'ATTRIBUTE_KEY_BOUNDS_INVALID',
          `Key attribute '${attribute.name}' must have bounds 1..1.`,
          path.property('bounds'),
          attribute.id,
        ),
      );
    }
  }

  private validateRelation(
    graph: ProjectGraph,
    modelId: Id,
    relation: Relation,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    if (relation.superTypes.length > 1) {
      diagnostics.push(
        this.error(
          'RELATION_MULTIPLE_SUPERTYPES_UNSUPPORTED',
          `Relation '${relation.id}' has ${relation.superTypes.length} supertypes; RAMEN model format refinement supports at most one.`,
          path.property('superTypes'),
          relation.id,
        ),
      );

      return;
    }
    this.validateRelationEnd(relation.from, path.property('from'), diagnostics);
    this.validateRelationEnd(relation.to, path.property('to'), diagnostics);
    if (relation.from.isComposite === true && relation.to.isComposite === true) {
      diagnostics.push(
        this.error(
          'RELATION_COMPOSITE_BOTH_ENDS',
          `Relation '${relation.id}' cannot be composite at both ends.`,
          path,
          relation.id,
        ),
      );
    }
    this.validateRoleConflicts(graph, modelId, relation, path, diagnostics);

    const superType: Ref | undefined = relation.superTypes[0];
    if (!superType) return;
    const base: ResolvedElement<Relation> | undefined = graph.resolveRelation(modelId, superType);
    if (!base) return;
    this.validateRelationRefinement(graph, modelId, relation, base, path, diagnostics);
  }

  private validateRelationEnd(end: RelationEnd, path: DiagnosticPath, diagnostics: Diagnostic[]): void {
    if (!Cardinality.areBoundsCoherent(end.bounds)) {
      diagnostics.push(
        this.error('RELATION_END_BOUNDS_INVALID', `Relation role '${end.role}' has incoherent bounds.`, path, end.id),
      );
    }
  }

  private validateRoleConflicts(
    graph: ProjectGraph,
    modelId: Id,
    relation: Relation,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    const from: ResolvedElement<Node> | undefined = graph.resolveNode(modelId, relation.from.nodeId);
    const to: ResolvedElement<Node> | undefined = graph.resolveNode(modelId, relation.to.nodeId);

    if (from) this.validateRoleAgainstNode(graph, from, relation.to.role, path.property('to').property('role'), diagnostics);
    if (to) this.validateRoleAgainstNode(graph, to, relation.from.role, path.property('from').property('role'), diagnostics);
  }

  private validateRoleAgainstNode(
    graph: ProjectGraph,
    target: ResolvedElement<Node>,
    role: string,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    const effective: EffectiveNode | undefined = EffectiveModel.resolveNode(graph, target.modelId, target.element.id);
    if (effective?.attributes.some((attribute: Attribute): boolean => attribute.name === role)) {
      diagnostics.push(
        this.error(
          'RELATION_ROLE_PROPERTY_CONFLICT',
          `Relation role '${role}' conflicts with an attribute.`,
          path,
          target.element.id,
        ),
      );
    }
  }

  private validateRelationRefinement(
    graph: ProjectGraph,
    modelId: Id,
    relation: Relation,
    base: ResolvedElement<Relation>,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    this.validateRefinedEnd(graph, modelId, relation.from, base.modelId, base.element.from, path.property('from'), diagnostics);
    this.validateRefinedEnd(graph, modelId, relation.to, base.modelId, base.element.to, path.property('to'), diagnostics);
  }

  private validateRefinedEnd(
    graph: ProjectGraph,
    modelId: Id,
    end: RelationEnd,
    baseModelId: Id,
    baseEnd: RelationEnd,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    if (end.role !== baseEnd.role) {
      diagnostics.push(
        this.error('RELATION_ROLE_MISMATCH', `Role '${end.role}' must remain '${baseEnd.role}'.`, path.property('role'), end.id),
      );
    }
    if (!Cardinality.isModelBoundsCompatible(baseEnd.bounds, end.bounds)) {
      diagnostics.push(
        this.error('RELATION_BOUNDS_WIDENED', `Role '${end.role}' widens its base cardinality.`, path.property('bounds'), end.id),
      );
    }
    if ((end.isComposite === true) !== (baseEnd.isComposite === true)) {
      diagnostics.push(
        this.error('RELATION_COMPOSITE_MISMATCH', `Role '${end.role}' changes composition semantics.`, path, end.id),
      );
    }

    const actualNode: ResolvedElement<Node> | undefined = graph.resolveNode(modelId, end.nodeId);
    const requiredNode: ResolvedElement<Node> | undefined = graph.resolveNode(baseModelId, baseEnd.nodeId);

    if (actualNode && requiredNode && !graph.isNodeSameOrSubtype(actualNode, requiredNode)) {
      diagnostics.push(
        this.error(
          'RELATION_END_TYPE_INCOMPATIBLE',
          `Node '${actualNode.element.id}' does not refine required node '${requiredNode.element.id}'.`,
          path.property('nodeId'),
          end.id,
        ),
      );
    }
  }

  private elementPath(modelId: Id, collection: 'classifiers' | 'relations', index: number): DiagnosticPath {
    return DiagnosticPath.root().property('models').property(modelId).property(collection).index(index);
  }

  private error(code: ValidationCode, message: string, path: DiagnosticPath, ref?: string): Diagnostic {
    return Diagnostics.error({ code: code, message: message, path: path, ref: ref });
  }
}
