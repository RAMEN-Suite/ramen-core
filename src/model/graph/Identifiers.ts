import type { Constraint, Id, Model } from '../Types.js';
import { VALIDATION_ERROR } from '../validation/Codes.js';
import { DiagnosticPath, Diagnostics, type Diagnostic } from '../validation/Diagnostics.js';

interface IdentifiedElement {
  readonly id: Id;
  readonly constraints?: readonly Constraint[];
}

/** Checks declaration identities within one model, including language-specific additions. */
export class ModelIdentifiers {
  private readonly seen: Set<Id> = new Set<Id>();
  private readonly diagnostics: Diagnostic[] = [];

  /** Registers all generic declarations before checking any language-specific additions. */
  public constructor(private readonly model: Model) {
    const path: DiagnosticPath = DiagnosticPath.root().property('models').property(model.id);
    for (const [index, classifier] of model.classifiers.entries()) {
      const owner: DiagnosticPath = path.property('classifiers').index(index);
      this.diagnostics.push(...this.register(classifier, owner));

      const members: readonly IdentifiedElement[] =
        classifier.kind === 'Node' ? classifier.attributes : (classifier.literals ?? []);
      const field: string = classifier.kind === 'Node' ? 'attributes' : 'literals';

      for (const [memberIndex, member] of members.entries()) {
        this.diagnostics.push(...this.register(member, owner.property(field).index(memberIndex)));
      }
    }

    for (const [index, relation] of model.relations.entries()) {
      const owner: DiagnosticPath = path.property('relations').index(index);
      this.diagnostics.push(...this.register(relation, owner));
      this.diagnostics.push(...this.register(relation.from, owner.property('from')));
      this.diagnostics.push(...this.register(relation.to, owner.property('to')));
    }
  }

  /** Returns identity errors in the generic declarations supplied at construction. */
  public getDiagnostics(): readonly Diagnostic[] {
    return [...this.diagnostics];
  }

  /** Registers another declaration and its constraints without treating references as declarations. */
  public register(
    element: IdentifiedElement,
    path: DiagnosticPath,
    code: string = VALIDATION_ERROR.DUPLICATE_ELEMENT_ID,
  ): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = [...this.registerId(element.id, path.property('id'), code)];
    const constraints: readonly Constraint[] = element.constraints ?? [];
    for (const [index, constraint] of constraints.entries()) {
      diagnostics.push(...this.registerId(constraint.id, path.property('constraints').index(index).property('id')));
    }
    return diagnostics;
  }

  private registerId(id: Id, path: DiagnosticPath, code: string = VALIDATION_ERROR.DUPLICATE_ELEMENT_ID): readonly Diagnostic[] {
    const duplicate: boolean = this.seen.has(id);
    this.seen.add(id);
    return duplicate
      ? [Diagnostics.error({ code, message: `Duplicate element id '${id}' in model '${this.model.id}'.`, path, ref: id })]
      : [];
  }
}
