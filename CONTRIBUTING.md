# Contributing to RAMEN Core

## Setup

```bash
nvm use
npm ci
npm run prepare
npm run build
```

Use the toolchain pinned in `.nvmrc` and `package.json`. Installation scripts are disabled in `.npmrc`; `prepare` enables the Commitlint hook explicitly.

`src/model/` contains the generic RMF API, `src/ramen/` the RAMEN API and annotation rules, `src/resources/` the reference model and schemas, and `tools/` the repository tooling.

## Make a change

Keep changes focused and update the implementation, tests and relevant guides together. Regenerate schemas or diagnostic tables when affected. Before review, run:

```bash
npm run verify
```

This checks schemas, diagnostics, lint, formatting, types, tests, documentation and an independently installed package consumer.

| Command                    | Purpose                                      |
| -------------------------- | -------------------------------------------- |
| `npm test`                 | Build, type-check and run tests              |
| `npm run test:coverage`    | Run tests with coverage                      |
| `npm run format:fix`       | Apply formatting                             |
| `npm run schema:generate`  | Regenerate schemas                           |
| `npm run docs:diagnostics` | Regenerate diagnostic tables                 |
| `npm run docs:serve`       | Build and serve the guides and API reference |
| `npm run package:check`    | Check the packed package and browser bundle  |

For documentation rebuilds while editing, run `npm run docs:watch` in a second terminal. Build before standalone type checks from a fresh checkout. Generated output belongs in `dist/` and must not be committed.

## Coding and testing conventions

- Use strict TypeScript, explicit types and British English. Follow ESLint and Prettier; avoid `any` and suppression comments.
- Prefer clear domain names, small methods, early returns and blank lines between semantic blocks.
- Keep RMF independent of RAMEN, and application integration in consuming tools.
- Document public API behaviour, ownership and failures. Comments should explain decisions rather than repeat code.
- Keep shared reference constants immutable and editable model values detached from internal state.
- Export public declarations through the entry points. Use relative `.js` imports in source; JSON imports keep `.json`.
- Test public workflows and meaningful failures. Check diagnostic codes and paths where they form part of the contract; schema changes need accepted and rejected inputs.
- Keep UI frameworks and database adapters out of the library. Respect the dependency settings in `.npmrc`.

## Commits and review

Use scoped [Conventional Commits](https://www.conventionalcommits.org), for example:

```text
fix(model): retain inherited relationship bounds
docs(tools): explain contributor setup
```

Allowed scopes are `model`, `tools`, `deps` and `release`. Commitlint checks commit messages; use the same convention for pull request titles.

Explain the problem, resulting behaviour and validation. Call out changes to public APIs, schemas, model semantics or dependencies. Review AI-assisted contributions as described in the [Code of Conduct](CODE_OF_CONDUCT.md#responsible-use-of-ai).

## Guides and releases

Start with the [RMF guide](docs/rmf/rmf.md), [RAMEN guide](docs/ramen/ramen.md), [constraint languages](docs/constraint-languages.md) or [schema guide](docs/schemas.md).

Before publishing, choose the package version and release notes, run `npm run verify`, and check installation from npm afterwards. `npm pack` uses the root manifest and its `files` list; the build does not publish or tag releases.

Publish the six generated schemas and the reference model separately in the `ramen-schema.org` repository at their canonical `$id` URLs. Check `npm run schema:check` before copying and verify that the URLs serve the unchanged JSON. Once published, retain released identifiers and contents; version incompatible changes explicitly.

Contributions are licensed under the repository's MIT licence.
