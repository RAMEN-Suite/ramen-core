# Contributing to RAMEN Core

## Set up the repository

```bash
nvm use
npm ci
npm run prepare
npm run build
```

`.nvmrc` and `package.json` specify the development versions of Node.js and npm. Installation scripts are disabled in `.npmrc`, so run `prepare` explicitly to enable the commit hook. The release cooldown also follows Sushi Kit's installation policy.

## Find the code

| Location          | Responsibility                                                       |
| ----------------- | -------------------------------------------------------------------- |
| `src/model`       | Generic RMF editing, graph resolution, validation and exchange       |
| `src/ramen`       | RAMEN reference model integration and annotation rules               |
| `src/resources`   | Versioned reference model and JSON schemas                           |
| `test`            | Public API tests, failures, modelling scenarios and package consumer |
| `docs`            | Markdown guides and documentation styling                            |
| `tools`           | TypeScript generators and repository checks                          |
| `dist/ramen-core` | Generated library files                                              |
| `dist/api-doc`    | Generated TypeDoc website                                            |

## Make a change

1. Describe the consumer behaviour you want to change.
2. Update the implementation, public API comments and relevant guide together.
3. Add a focused test for the behaviour or failure boundary.
4. Run focused checks while editing, then run `npm run verify` before review.

### Coding conventions

- Use strict TypeScript and British English for repository-owned names and text.
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

## Useful checks

| Command                   | Use                                                                      |
| ------------------------- | ------------------------------------------------------------------------ |
| `npm test`                | Build, type-check and run tests                                          |
| `npm run build`           | Refresh code, declarations and schemas                                   |
| `npm run lint`            | Check source, tests and tooling                                          |
| `npm run format:fix`      | Apply repository formatting                                              |
| `npm run schema:generate` | Regenerate the RAMEN project schema                                      |
| `npm run docs:serve`      | Browse TypeDoc at `http://127.0.0.1:5173`                                |
| `npm run package:check`   | Build and install the tarball, then check runtime and TypeScript imports |
| `npm run verify`          | Run the complete repository gate                                         |

`test`, `test:coverage` and `package:check` build the library first. Run `build` before standalone type checks from a fresh checkout. The package consumer resolves runtime dependencies from the configured npm registry.

## Commits and review

Use Conventional Commits with a required scope: `model`, `tools`, `deps` or `release`. The commit hook checks the configured rules with Commitlint.

```text
fix(model): retain inherited relationship bounds
docs(tools): explain contributor setup
```

Keep commits focused. Explain the consumer impact and tests, and call out public API, model semantics or schema changes. Do not commit build output, coverage, editor configuration or local notes.

## Release handover

`package.json` at the repository root is the single package manifest. `npm run build` writes library files to `dist/ramen-core`. `npm pack` uses the manifest's `files` list to include those files alongside the root README and licence. Source code, tools, Git hooks and the documentation website are excluded.

Before the first release, the release maintainer should:

1. Confirm the GitHub repository and npm publishing permissions.
2. Choose the version and release notes, then run `npm run verify` from a fresh checkout.
3. Publish from the **repository root**, using the organisation's release process.
4. Verify installation from npm and publish documentation and schema URLs separately.

The build does not publish, tag commits or deploy documentation. The package ships its schemas even before the canonical URLs are hosted. Contributor development versions are separate from the runtime compatibility policy that the release maintainer confirms.

Contributions are licensed under the repository's MIT licence.
