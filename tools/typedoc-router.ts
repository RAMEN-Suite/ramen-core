import { KindRouter, type Application, type Reflection } from 'typedoc';

const ROUTE_PATTERN: RegExp = /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/;

/** Keeps guide URLs independent of their visible titles and navigation labels. */
class GuideRouter extends KindRouter {
  private readonly usedRoutes: Map<string, Reflection> = new Map<string, Reflection>();

  protected override getIdealBaseName(reflection: Reflection): string {
    if (!reflection.isDocument()) return super.getIdealBaseName(reflection);

    const route: unknown = reflection.frontmatter['route'];
    if (typeof route !== 'string' || !ROUTE_PATTERN.test(route)) {
      throw new Error(`Document '${reflection.name}' needs a stable lowercase route in its frontmatter.`);
    }
    const existing: Reflection | undefined = this.usedRoutes.get(route);
    if (existing && existing !== reflection) throw new Error(`Guide route '${route}' is declared more than once.`);
    this.usedRoutes.set(route, reflection);

    return `guides/${route}`;
  }
}

/** Registers the stable guide router while preserving TypeDoc's normal API URLs. */
export function load(application: Application): void {
  application.renderer.defineRouter('guides', GuideRouter);
}
