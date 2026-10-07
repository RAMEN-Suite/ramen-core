# Contributing to RAMEN Core

## Start the repository

```bash
nvm use
npm ci
npm run prepare
npm run build
```

The repository pins its Node.js version in `.nvmrc` and its npm version in `package.json`. Installation scripts are disabled in `.npmrc`, so run `prepare` explicitly to enable the commit hook.

`src/model/` contains the generic RMF modeller. `src/ramen/` contains the RAMEN API and annotation rules. The RAMEN reference model and JSON schemas live in `src/resources/`. `tools/` contains repository-only generators and build checks.

## Choose the relevant guide

| Task                             | Guide                                                             |
| -------------------------------- | ----------------------------------------------------------------- |
| Create or change generic models  | [RAMEN Model Format](docs/rmf/rmf.md)                             |
| Work with the RAMEN model        | [Model with RAMEN](docs/ramen/ramen.md)                           |
| Change constraints or evaluators | [Constraint languages](docs/constraint-languages.md)              |
| Change validation                | [Validate Models and Data](docs/rmf/validation.md)                |
| Change a schema                  | [JSON schemas](docs/schemas.md)                                   |
| Use AI assistance                | [Responsible use of AI](CODE_OF_CONDUCT.md#responsible-use-of-ai) |

## Change workflow

1. Define the consumer-visible behaviour.
2. Change implementation, public API documentation, examples and tests together.
3. Run the narrowest relevant checks while editing.
4. Regenerate schemas or diagnostic tables when affected, then inspect the relevant documentation pages.
5. Run the repository gate before review.

```bash
npm run verify
```

Useful focused commands:

| Command                    | Use                                                               |
| -------------------------- | ----------------------------------------------------------------- |
| `npm test`                 | Build, type-check and run the tests                               |
| `npm run test:coverage`    | Run tests with a coverage report                                  |
| `npm run lint`             | Check source, tests and tools                                     |
| `npm run format:fix`       | Apply repository formatting                                       |
| `npm run schema:generate`  | Regenerate project and exchange schemas                           |
| `npm run docs:diagnostics` | Regenerate diagnostic tables from the code                        |
| `npm run docs:serve`       | Browse guides and API reference at `http://127.0.0.1:5173`        |
| `npm run package:check`    | Build, inspect and install the package in an independent consumer |

`test`, `test:coverage` and `package:check` build the library first. Run `build` before standalone type checks from a fresh checkout. Generated library files go to `dist/ramen-core`; the documentation website goes to `dist/api-doc`.

`npm run docs:serve` builds and serves the documentation. For automatic rebuilds while editing, run `npm run docs:watch` in a second terminal and refresh the browser after changes.

### Coding conventions

- Use strict TypeScript and BE for repository-owned names and text.
- Use short domain names, early returns and shallow control flow. Separate semantic blocks with blank lines.
- Give variables, parameters and return values explicit types in tests. Avoid `any` and suppression comments.
- Keep RMF independent of RAMEN. Annotation semantics belong in `src/ramen`; tool integration belongs in consuming tools.
- Document public interfaces. Explain unusual private decisions without repeating the implementation.
- Export public declarations deliberately through module entry points. Internal imports stay relative.
- Use explicit `.js` paths for relative source imports so emitted declarations also work with NodeNext. JSON imports keep `.json`.
- Follow Prettier for formatting and ESLint for code quality.

### Testing conventions

Test public workflows and meaningful failures. Use modelling scenarios for connected operations such as creating, editing, refining, validating and exchanging a model. Keep individual tests small and name the behaviour they protect.

Check diagnostic codes, severity and paths when those are part of the contract. Schema changes need accepted and rejected inputs. A packed consumer checks the shipped artefact independently of source imports.

## Branches and commits

Branch from the latest `main` and write [Conventional Commits](https://www.conventionalcommits.org):

```text
fix(model): retain inherited relationship bounds
docs(tools): explain contributor setup
```

Every commit requires a scope: `model`, `tools`, `deps` or `release`. The commit hook checks messages with Commitlint. Use the same convention for pull request titles.

Branch protection, CI checks and merge policy are maintained separately by the repository maintainers.

## Dependencies

The repository installs with install scripts disabled and a three-day release cooldown, both set in `.npmrc`. Respect those settings when updating dependencies. The package installation check resolves runtime dependencies from the configured npm registry.

Keep UI frameworks, editor integration and database adapters in consuming tools or separate packages.

## Releases

The release workflow is maintained separately. `package.json` at the repository root is the single package manifest. `npm run build` writes library files to `dist/ramen-core`; `npm pack` packages them from the repository root according to the manifest's `files` list.

Before release, maintainers choose the version and release notes, run `npm run verify`, and verify installation from npm after publishing. Documentation and canonical schema URLs are published separately. The build itself does not publish, tag commits or deploy documentation.

## Review checklist

- Explain the consumer problem and the resulting behaviour.
- Call out public API, model semantics, schema, dependency and package changes.
- Include accepted and rejected examples when validation rules change.
- Inspect the affected guides and include screenshots when documentation appearance changes.
- Keep unrelated refactors out of the change.
- Do not commit generated reports, coverage, build output or local configuration.
- Review and take responsibility for AI-assisted contributions as described in the [Code of Conduct](CODE_OF_CONDUCT.md#responsible-use-of-ai).

Contributions are licensed under the repository's MIT licence.
