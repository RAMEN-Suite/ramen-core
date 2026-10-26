import { Bounds } from '../Types.js';

/** Checks cardinality intervals and refinement. */
export class Cardinality {
  public static readonly UNBOUNDED: -1 = -1;

  /** Reports whether a recorded count satisfies the modelled interval. */
  public static isCountWithinBounds(count: number, bounds: Bounds): boolean {
    const meetsMinimum: boolean = count >= bounds.lowerBound;
    const meetsMaximum: boolean = bounds.upperBound === this.UNBOUNDED || count <= bounds.upperBound;
    return meetsMinimum && meetsMaximum;
  }

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
}
