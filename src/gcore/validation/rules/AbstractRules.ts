import { Diagnostic } from '../ValidationDiagnostic';

export abstract class AbstractRules {
  public abstract validate(...args: unknown[]): Diagnostic[];
}
