/**
 * RAMEN modelling on top of the generic model API.
 * Import from `@ramen-suite/core/ramen`.
 *
 * {@link RAMEN_MODEL} defines Collection, Entity, Content, Annotation and their relations.
 * Start with {@link RamenModel} to refine these types and declare annotation rules.
 * Generic graph, inheritance and validation rules still apply.
 *
 * | Task | Entry point |
 * | --- | --- |
 * | Create and refine RAMEN models | {@link RamenModel} |
 * | Request permitted relations and annotations | {@link RamenAdvisor} |
 * | Describe annotation properties and relations | {@link RamenAnnotation} |
 * | Validate existing RAMEN models | {@link RamenValidator} |
 * | Validate captured RAMEN data | {@link RamenInstanceValidator} |
 * | Import and export RAMEN model files | {@link RamenFiles} |
 * | Compare RAMEN model versions | {@link RamenEvolution} |
 *
 * @packageDocumentation
 */
export * from './ReferenceModel.js';
export type { RamenAnnotation, AnnotationProperty, AttributeReference, AnnotationRelation } from './annotations/Definitions.js';
export * from './Document.js';
export type { AnnotationOptions, PropertyOption, RelationOption } from './annotations/Advisor.js';
export * from './RamenModel.js';
export * from './exchange/Comparison.js';
export * from './Advisor.js';
export * from './annotations/Schema.js';
export * from './validation/ProjectSchema.js';
export * from './validation/ModelValidator.js';
export * from './data/InstanceValidator.js';

export * from './exchange/File.js';
