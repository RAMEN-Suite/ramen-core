import assert from 'node:assert/strict';
import type { Node, Relation } from '../dist/ramen-core/model/index.js';
import { RAMEN_ELEMENT, RamenModel } from '../dist/ramen-core/ramen/index.js';
import type { NodeSuggestion, RelationSuggestion } from '../dist/ramen-core/ramen/index.js';

interface NodeOption {
  readonly id: string;
  readonly label: string;
}

interface ConnectionOption {
  readonly id: string;
  readonly label: string;
  readonly explanation: string;
}

// The model ID stays inside this adapter; a form only needs labels and option IDs.
function suggestNodeOptions(model: RamenModel): readonly NodeOption[] {
  const suggestions: readonly NodeSuggestion[] = model.suggestNodes();

  return suggestions.map((suggestion: NodeSuggestion): NodeOption => ({
    id: suggestion.ref,
    label: suggestion.name,
  }));
}

// A UI can call this after the user selects two node types.
function suggestConnectionOptions(model: RamenModel, from: Node, to: Node): readonly ConnectionOption[] {
  const suggestions: readonly RelationSuggestion[] = model.suggestRelations(from, to);

  return suggestions.map((suggestion: RelationSuggestion): ConnectionOption => ({
    id: suggestion.ref,
    label: suggestion.name,
    explanation: suggestion.explanation,
  }));
}

// The UI sends back the selected option ID; the server resolves it again before editing.
function applyConnectionChoice(model: RamenModel, from: Node, to: Node, optionId: string): Relation {
  return model.connect(from, to, optionId).element;
}

const model: RamenModel = RamenModel.create({
  id: 'interfaceExample01',
  uri: 'https://example.org/models/interface-example',
  name: 'Interface Example',
  version: '1.0.0',
});

const nodeOptions: readonly NodeOption[] = suggestNodeOptions(model);
const selectedNode: NodeOption | undefined = nodeOptions.find((option: NodeOption): boolean => option.label === 'Annotation');
assert.ok(selectedNode);

const annotation: Node = model.createNode({ name: 'Annotation', refines: selectedNode.id }).element;
const person: Node = model.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;
const options: readonly ConnectionOption[] = suggestConnectionOptions(model, annotation, person);
console.log('Choices for Annotation → Person:', JSON.stringify(options, null, 2));

const selectedOption: ConnectionOption | undefined = options.find(
  (option: ConnectionOption): boolean => option.label === 'REFERS_TO',
);
assert.ok(selectedOption);

const relation: Relation = applyConnectionChoice(model, annotation, person, selectedOption.id);
assert.equal(relation.name, 'REFERS_TO');
assert.equal(model.validate().valid, true);
