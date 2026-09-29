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
export * from './Types';
export { DataTypes } from './Builtins';
export * from './editing/Factory';
export * from './editing/Editor';
export * from './Names';
export * from './graph/ProjectGraph';
export * from './graph/BuildGraph';
export * from './graph/References';
export * from './graph/EffectiveModel';
export * from './exchange/Comparison';
export * from './validation/ModelValidator';
export * from './validation/Constraints';
export * from './data/InstanceValidator';
export * from './data/InstanceSchema';
export * from './validation/ModelSchema';
export * from './validation/Diagnostics';
export * from './validation/Codes';
export * from './graph/RelationScope';
export * from './Advisor';
export * from './editing/Connections';
export * from './Modeller';
export type {
  ModelInput,
  ElementRef,
  ElementInput,
  NodeInput,
  AttributeInput,
  RelationInput,
  LiteralInput,
  LiteralUpdate,
  ModelChange,
} from './editing/Draft';

export { ModelFiles } from './exchange/File';
export type { ModelFile, ModelHeader, Owned } from './exchange/File';
