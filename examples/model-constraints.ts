import { ConstraintRegistry, Diagnostics, RAMEN_ELEMENT, RamenModel } from '../dist/index.js';
import type { Attribute, Constraint, ConstraintContext, Diagnostic, Node } from '../dist/index.js';

// A model rule inspects its declaration. It can also query the project graph.
const languages: ConstraintRegistry = ConstraintRegistry.createDefault();
languages.register({
  language: 'required-attribute',
  evaluate(rule: Constraint, context: ConstraintContext): readonly Diagnostic[] {
    if (context.scope !== 'model') return [];
    if (!('attributes' in context.value) || typeof rule.expression !== 'string') {
      return [Diagnostics.error({ code: 'RULE_INVALID', message: 'Expected a node and an attribute name.', path: context.path })];
    }
    const present: boolean = context.value.attributes.some((attribute: Attribute): boolean => attribute.name === rule.expression);
    if (present) return [];
    return [
      Diagnostics.error({
        code: 'ATTRIBUTE_REQUIRED',
        message: `Declare attribute '${rule.expression}'.`,
        path: context.path,
        ref: context.ownerId,
      }),
    ];
  },
});

const project: RamenModel = RamenModel.create(
  { id: 'exampleRules00001', uri: 'https://example.org/rules', name: 'Correspondence', version: '1.0.0' },
  languages,
);
const letter: Node = project.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
project.updateNode(letter.id, {
  constraints: [
    {
      id: 'exampleRule000001',
      name: 'Letter needs a title attribute',
      language: 'required-attribute',
      scope: 'model',
      expression: 'title',
    },
  ],
});
console.log(project.validate().valid); // false: the model has no title attribute yet.

project.createAttribute(letter.id, { name: 'title', typeId: 'String', bounds: { lowerBound: 1, upperBound: 1 } });
console.log(project.validate().valid); // true: captured letters must now provide a title.
