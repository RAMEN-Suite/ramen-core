---
title: Read Diagnostics
group: RMF
---

# Read Diagnostics

{@link model.Modeller.validate | validate()} and {@link model.Modeller.validateInstances | validateInstances(data)} return a list of {@link model.Diagnostic | diagnostics}. Read `code` when your tool needs to react to a finding.

| Field      | Meaning                                      |
| ---------- | -------------------------------------------- |
| `severity` | `error`, `warn` or `info`                    |
| `code`     | Stable identifier for the failed rule        |
| `message`  | Explanation for people                       |
| `path`     | Location in the checked JSON, when available |
| `ref`      | Related model or element ID, when available  |

For example, continue the [Validation guide](validation.md#check-recorded-data), where a Document lacks its required `title`:

```ts
for (const diagnostic of dataResult.diagnostics) {
  console.log(diagnostic.code, diagnostic.path, diagnostic.message);
}
```

That check reports `INSTANCE_PROPERTY_REQUIRED` at `/nodes/0/properties/title`: `0` means the first entry in `data.nodes`, and `title` names its missing property. The record is `data.nodes[0]`, whose ID is `documentRecord001`. Use that ID when showing the finding in a tool. The path is positional, so it changes if records are reordered. For missing values, its final segment names where the value should be, even though that location does not yet exist.

Paths follow [JSON Pointer](https://datatracker.ietf.org/doc/html/rfc6901) notation. `ref` identifies a related declaration or record; it is not a second path.

An `error` sets `hasErrors` to `true`. A model result also has `valid`, which is `false` when errors prevent a usable project graph. Warnings and information may still appear in `diagnostics` without invalidating the result. See [Validate Models and Data](validation.md) for the two checks.
