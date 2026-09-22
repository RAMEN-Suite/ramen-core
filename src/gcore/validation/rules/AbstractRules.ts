import { Diagnostic } from '../Diagnostics';

export abstract class AbstractRules {
  public abstract validate(...args: unknown[]): Diagnostic[];
}
