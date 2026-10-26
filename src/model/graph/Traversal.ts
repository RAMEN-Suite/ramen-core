interface Frame {
  readonly key: string;
  readonly children: readonly string[];
  index: number;
}

/** @internal Walks directed edges in depth-first order without using the call stack. */
export function walkGraph(
  roots: readonly string[],
  children: (key: string) => readonly string[],
  cycle: (path: readonly string[]) => void,
  complete?: (key: string) => void,
): void {
  const completed: Set<string> = new Set<string>();
  for (const root of roots) {
    if (completed.has(root)) continue;
    const stack: Frame[] = [{ key: root, children: children(root), index: 0 }];
    const active: Map<string, number> = new Map<string, number>([[root, 0]]);

    while (stack.length > 0) {
      const frame: Frame | undefined = stack.at(-1);
      if (!frame) break;
      const next: string | undefined = frame.children[frame.index++];
      if (next === undefined) {
        complete?.(frame.key);
        completed.add(frame.key);
        active.delete(frame.key);
        stack.pop();
        continue;
      }

      if (completed.has(next)) continue;
      const start: number | undefined = active.get(next);
      if (start !== undefined) {
        const path: string[] = stack.slice(start).map((item: Frame): string => item.key);
        cycle([...path, next]);
        continue;
      }

      active.set(next, stack.length);
      stack.push({ key: next, children: children(next), index: 0 });
    }
  }
}
