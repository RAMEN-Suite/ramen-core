/**
 * Generic model creation, refinement and validation.
 * Import from `@ramen-suite/core/model`.
 *
 * Start with {@link Modeller}. It keeps model dependencies and provides editing,
 * suggestions, validation and exchange in one API.
 * {@link Model}, {@link Node}, {@link Attribute} and {@link Relation} describe the stored definitions.
 *
 * | Task | Entry point |
 * | --- | --- |
 * | Create and refine models | {@link Modeller} |
 * | Choose a built-in data type | {@link DataTypes} |
 * | Request available nodes, properties and relations | {@link ModelAdvisor} |
 * | Validate existing model definitions | {@link ModelValidator} |
 * | Inspect the resolved graph and inherited properties | {@link ProjectGraph}, {@link EffectiveModel} |
 * | Validate captured data | {@link InstanceValidator} |
 * | Import and export model files | {@link ModelFiles} |
 * | Compare model versions | {@link ModelEvolution} |
 *
 * Use {@link ModelFactory} and {@link ModelEditor} only when you need lower-level,
 * stateless operations on model definitions.
 *
 * @packageDocumentation
 */
export * from './Types.js';
export { DataTypes } from './Builtins.js';
export * from './editing/Factory.js';
export * from './editing/Editor.js';
export * from './Names.js';
export * from './graph/ProjectGraph.js';
export * from './graph/BuildGraph.js';
export * from './graph/References.js';
export * from './graph/EffectiveModel.js';
export * from './exchange/Comparison.js';
export * from './validation/ModelValidator.js';
export * from './validation/Constraints.js';
export * from './data/InstanceValidator.js';
export * from './data/InstanceSchema.js';
export * from './validation/ModelSchema.js';
export * from './validation/Diagnostics.js';
export * from './validation/Codes.js';
export * from './graph/RelationScope.js';
export * from './Advisor.js';
export * from './editing/Connections.js';
export * from './Modeller.js';
export type {
  ModelInput,
  ElementRef,
  ElementInput,
  NodeInput,
  AttributeInput,
  RelationEndInput,
  RelationInput,
  LiteralInput,
  LiteralUpdate,
  ModelChange,
} from './editing/Inputs.js';
export type {
  ModelRemovalPreview,
  ModelUpdate,
  NodeRemovalPreview,
  RelationRemovalPreview,
  WorkspaceElement,
} from './editing/Workspace.js';
export type { ConstraintOwner, ConstraintOwnerInput } from './editing/ConstraintOwner.js';

export { ModelFiles } from './exchange/File.js';
export type { ModelFile, ModelHeader, Owned, ProjectMetadata } from './exchange/File.js';
