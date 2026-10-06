/** Produces the same key for JSON values that differ only in object member order. */
export function jsonValueKey(value: unknown): string {
  return JSON.stringify(canonical(value)) ?? 'undefined';
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item: unknown): unknown => canonical(item));
  if (value === null || typeof value !== 'object') return value;

  const record: Record<string, unknown> = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key: string): [string, unknown] => [key, canonical(record[key])]),
  );
}
