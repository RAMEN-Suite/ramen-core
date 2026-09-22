import { Bounds, GModel, Id, Ref } from '../gcore/model/Types';

/** Attribute selected for one closed RAMEN annotation definition. */
export interface RamenAnnotationProperty {
  readonly attributeId: Ref;
  readonly bounds?: Bounds;
}

/** Relation selected for one closed RAMEN annotation definition. */
export interface RamenAnnotationRelation {
  readonly relationId: Ref;
  readonly direction: 'outgoing' | 'incoming';
  readonly bounds: Bounds;
}

/** Closed annotation variant attached to an Annotation node. */
export interface RamenAnnotation {
  readonly id: Id;
  readonly annotationId: Ref;
  readonly type: string;
  readonly refines?: Ref;
  readonly properties: readonly RamenAnnotationProperty[];
  readonly relations: readonly RamenAnnotationRelation[];
}

interface RamenModelExtension {
  readonly annotations?: readonly RamenAnnotation[];
}

/** Reads and updates the formal `ext.ramen.annotations` section of a GCore model. */
export class RamenAnnotations {
  /** Returns a detached list of annotations declared by the model. */
  public static get(model: GModel): readonly RamenAnnotation[] {
    const ramen: unknown = model.ext?.ramen;
    if (!this.isRecord(ramen) || ramen.annotations === undefined) return [];
    if (!this.isAnnotationList(ramen.annotations)) return [];
    return structuredClone(ramen.annotations);
  }

  /** Reports whether a present `ramen.annotations` value has the complete serialized shape. */
  public static hasValidSection(model: GModel): boolean {
    const ramen: unknown = model.ext?.ramen;
    if (ramen === undefined) return true;
    if (!this.isRecord(ramen)) return false;
    if (ramen.annotations === undefined) return true;
    return this.isAnnotationList(ramen.annotations);
  }

  /** Returns a model with the annotation appended to its RAMEN section. */
  public static add(model: GModel, annotation: RamenAnnotation): GModel {
    return this.write(model, [...this.get(model), structuredClone(annotation)]);
  }

  /** Returns a model with one declared annotation replaced. */
  public static update(model: GModel, annotationId: Id, annotation: RamenAnnotation): GModel {
    const current: readonly RamenAnnotation[] = this.get(model);
    if (!current.some((candidate: RamenAnnotation): boolean => candidate.id === annotationId))
      throw new Error(`Annotation not found: '${annotationId}'.`);
    return this.write(
      model,
      current.map((candidate: RamenAnnotation): RamenAnnotation =>
        candidate.id === annotationId ? structuredClone(annotation) : candidate,
      ),
    );
  }

  /** Returns a model without one declared annotation. */
  public static remove(model: GModel, annotationId: Id): GModel {
    const current: readonly RamenAnnotation[] = this.get(model);
    const remaining: readonly RamenAnnotation[] = current.filter(
      (candidate: RamenAnnotation): boolean => candidate.id !== annotationId,
    );
    if (remaining.length === current.length) throw new Error(`Annotation not found: '${annotationId}'.`);
    return this.write(model, remaining);
  }

  private static getExtension(model: GModel): RamenModelExtension {
    const ramen: unknown = model.ext?.ramen;
    return this.isRecord(ramen) ? ramen : {};
  }

  private static write(model: GModel, annotations: readonly RamenAnnotation[]): GModel {
    const ramen: RamenModelExtension = this.getExtension(model);
    return {
      ...model,
      ext: { ...(model.ext ?? {}), ramen: { ...ramen, annotations: structuredClone(annotations) } },
    };
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private static isAnnotationList(value: unknown): value is readonly RamenAnnotation[] {
    return Array.isArray(value) && value.every((item: unknown): boolean => this.isAnnotation(item));
  }

  private static isAnnotation(value: unknown): value is RamenAnnotation {
    if (!this.isRecord(value)) return false;
    if (!this.hasOnlyKeys(value, ['id', 'annotationId', 'type', 'refines', 'properties', 'relations'])) return false;
    if (typeof value.id !== 'string' || typeof value.annotationId !== 'string' || typeof value.type !== 'string') return false;
    if (value.refines !== undefined && typeof value.refines !== 'string') return false;
    if (!Array.isArray(value.properties) || !value.properties.every((item: unknown): boolean => this.isProperty(item)))
      return false;
    return Array.isArray(value.relations) && value.relations.every((item: unknown): boolean => this.isRelation(item));
  }

  private static isProperty(value: unknown): value is RamenAnnotationProperty {
    if (!this.isRecord(value) || typeof value.attributeId !== 'string') return false;
    if (!this.hasOnlyKeys(value, ['attributeId', 'bounds'])) return false;
    return value.bounds === undefined || this.isBounds(value.bounds);
  }

  private static isRelation(value: unknown): value is RamenAnnotationRelation {
    if (!this.isRecord(value) || typeof value.relationId !== 'string') return false;
    if (!this.hasOnlyKeys(value, ['relationId', 'direction', 'bounds'])) return false;
    if (value.direction !== 'outgoing' && value.direction !== 'incoming') return false;
    return this.isBounds(value.bounds);
  }

  private static isBounds(value: unknown): value is Bounds {
    return (
      this.isRecord(value) &&
      typeof value.lowerBound === 'number' &&
      typeof value.upperBound === 'number' &&
      Number.isInteger(value.lowerBound) &&
      Number.isInteger(value.upperBound)
    );
  }

  private static hasOnlyKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
    const allowed: ReadonlySet<string> = new Set<string>(keys);
    return Object.keys(value).every((key: string): boolean => allowed.has(key));
  }
}
