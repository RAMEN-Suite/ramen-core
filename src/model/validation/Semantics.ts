import { Bounds, Relation } from '../Types';
import { ModelRef } from '../project/Refs';

/** Pure predicates shared by RAMEN model format semantic validation rules. */
export class ModelSemantics {
  public static readonly UNBOUNDED: -1 = -1;

  /** Reports whether lower and upper cardinality bounds form a valid interval. */
  public static areBoundsCoherent(bounds: Bounds): boolean {
    if (bounds.lowerBound < 0) return false;
    if (bounds.upperBound === this.UNBOUNDED) return true;

    return bounds.upperBound >= bounds.lowerBound;
  }

  /** Reports whether refined bounds are equal to or narrower than base bounds. */
  public static isModelBoundsCompatible(base: Bounds, model: Bounds): boolean {
    if (!this.areBoundsCoherent(model)) return false;
    if (model.lowerBound < base.lowerBound) return false;
    if (base.upperBound === this.UNBOUNDED) return true;
    if (model.upperBound === this.UNBOUNDED) return false;

    return model.upperBound <= base.upperBound;
  }

  /** Reports whether both relation ends use local node references. */
  public static areRelationEndsLocal(relation: Relation): boolean {
    return !ModelRef.isQualified(relation.from.nodeId) && !ModelRef.isQualified(relation.to.nodeId);
  }
}
