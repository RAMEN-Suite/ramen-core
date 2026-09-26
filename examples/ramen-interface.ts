import assert from 'node:assert/strict';
import type { Node, Relation } from '../dist/model/index.js';
import { RAMEN_ELEMENT, RamenModel } from '../dist/ramen/index.js';
import type { NodeSuggestion, RelationSuggestion } from '../dist/ramen/index.js';

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
function getNodeOptions(model: RamenModel): readonly NodeOption[] {
  const suggestions: readonly NodeSuggestion[] = model.createAdvisor().suggestNodeRefinements(model.getModel().id);

  return suggestions.map((suggestion: NodeSuggestion): NodeOption => ({
    id: suggestion.nodeId,
    label: suggestion.name,
  }));
}

// A UI can call this after the user selects two node types.
function getConnectionOptions(model: RamenModel, from: Node, to: Node): readonly ConnectionOption[] {
  const suggestions: readonly RelationSuggestion[] = model.suggestRelations(from.id, to.id);

  return suggestions.map((suggestion: RelationSuggestion): ConnectionOption => ({
    id: suggestion.ref,
    label: suggestion.name,
    explanation: suggestion.explanation,
  }));
}

// The UI sends back the selected option ID; the server resolves it again before editing.
function applyConnectionChoice(model: RamenModel, from: Node, to: Node, optionId: string): Relation {
  const suggestions: readonly RelationSuggestion[] = model.suggestRelations(from.id, to.id);
  const choice: RelationSuggestion | undefined = suggestions.find(
    (suggestion: RelationSuggestion): boolean => suggestion.ref === optionId,
  );

  if (!choice) throw new Error(`Unknown connection option: ${optionId}`);
  return model.connect(from, to, choice).element;
}

const model: RamenModel = RamenModel.create({
  id: 'interfaceExample01',
  uri: 'https://example.org/models/interface-example',
  name: 'Interface Example',
  version: '1.0.0',
});

const nodeOptions: readonly NodeOption[] = getNodeOptions(model);
const selectedNode: NodeOption | undefined = nodeOptions.find(
  (option: NodeOption): boolean => option.id === RAMEN_ELEMENT.ANNOTATION,
);
assert.ok(selectedNode);

const annotation: Node = model.createNode({ name: 'Annotation', refines: selectedNode.id }).element;
const options: readonly ConnectionOption[] = getConnectionOptions(model, annotation, annotation);

assert.ok(options.length > 1);

const selectedOption: ConnectionOption | undefined = options.find(
  (option: ConnectionOption): boolean => option.label === 'REFERS_TO',
);
assert.ok(selectedOption);

const relation: Relation = applyConnectionChoice(model, annotation, annotation, selectedOption.id);
assert.equal(relation.name, 'REFERS_TO');
assert.equal(model.validate().valid, true);

console.log(options);
