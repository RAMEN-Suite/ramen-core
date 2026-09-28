/**
 * RAMEN modeling on top of the generic model API.
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
export * from './ReferenceModel';
export type { RamenAnnotation, AnnotationProperty, AttributeReference, AnnotationRelation } from './annotations/Definitions';
export * from './Document';
export type { AnnotationOptions, PropertyOption, RelationOption } from './annotations/Advisor';
export * from './RamenModel';
export * from './exchange/Comparison';
export * from './Advisor';
export * from './annotations/Schema';
export * from './validation/ProjectSchema';
export * from './validation/ModelValidator';
export * from './data/InstanceValidator';

export * from './exchange/File';
