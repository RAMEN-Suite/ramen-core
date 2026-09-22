import { GClassifier, GDataType, GNode, Id } from '../../model/ModelTypes';
import { Diagnostic, DiagnosticPath, Diagnostics } from '../ValidationDiagnostic';
import { VALIDATION_ERROR } from '../ValidationErrorCode';
import { ValidationContext } from '../SemanticValidator';
import { NodeRules } from './NodeRules';
import { DataTypeRules } from './DataTypeRules';
import { AttributeRules } from './AttributeRules';
import { AbstractRules } from './AbstractRules';

export class ClassifierRules extends AbstractRules {
  private readonly nodeRules: NodeRules = new NodeRules();
  private readonly dataTypeRules: DataTypeRules = new DataTypeRules();
  private readonly attributeRules: AttributeRules = new AttributeRules();

  public validate(ctx: ValidationContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const classifiers: readonly GClassifier[] = ctx.derivedModel.classifiers ?? [];

    diagnostics.push(...this.validateUniqueIds(classifiers));
    diagnostics.push(...this.validateClassifiers(ctx, classifiers));
    return diagnostics;
  }

  private validateUniqueIds(classifiers: readonly GClassifier[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const firstIndexByIdentifier: Map<Id, number> = new Map<Id, number>();

    classifiers.forEach((classifier: GClassifier, classifierIndex: number): void => {
      const previousIndex: number | undefined = firstIndexByIdentifier.get(classifier.id);

      if (previousIndex === undefined) {
        firstIndexByIdentifier.set(classifier.id, classifierIndex);
        return;
      }

      diagnostics.push(
        Diagnostics.error({
          code: VALIDATION_ERROR.CLASSIFIER_ID_DUPLICATE,
          message: `Duplicate classifier id '${classifier.id}' (also at index ${previousIndex}).`,
          path: DiagnosticPath.root().property('classifiers').index(classifierIndex).property('id'),
          ref: classifier.id,
        }),
      );
    });
    return diagnostics;
  }

  private validateClassifiers(ctx: ValidationContext, classifiers: readonly GClassifier[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    classifiers.forEach((classifier: GClassifier, classifierIndex: number): void => {
      const classifierPath: DiagnosticPath = DiagnosticPath.root().property('classifiers').index(classifierIndex);

      if (classifier.kind === 'GNode') {
        diagnostics.push(...this.validateNode(ctx, classifier, classifierPath));
        return;
      }

      if (classifier.kind === 'GDataType') {
        diagnostics.push(...this.validateDataType(classifier, classifierPath));
        return;
      }
    });
    return diagnostics;
  }

  private validateNode(ctx: ValidationContext, node: GNode, classifierPath: DiagnosticPath): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    diagnostics.push(...this.nodeRules.validate(ctx, node, classifierPath));
    diagnostics.push(...this.attributeRules.validate(ctx, node, classifierPath));
    return diagnostics;
  }

  private validateDataType(dataType: GDataType, classifierPath: DiagnosticPath): Diagnostic[] {
    return this.dataTypeRules.validate(dataType, classifierPath);
  }
}
