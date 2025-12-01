# Repository Guidelines

## Project Structure & Module Organization

Core extension sources live in `src/`, with feature-specific services under `src/services/` and the entry point at `src/extension.ts`. Reusable UI assets sit in `media/`, templates in `templates/`, and tests in `test/` (unit, integration, e2e, security, performance) with doubles in `__mocks__/`. Build artifacts land in `dist/`, coverage snapshots in `coverage/`, and `.env.example` documents local secrets.

## Build, Test, and Development Commands

Run `pnpm install` from the monorepo root before working here. Use `npm run compile` to type-check and bundle with esbuild, or `npm run watch` for live rebuilds during extension development. `npm run lint` (and `npm run lint:fix`) enforces Biome rules. Execute `npm run test` for the full suite, `npm run test:unit` for Vtest only, and `npm run test:integration` to launch the VS Code harness. Package distributable VSIX files with `npm run package-vsce` once the branch is clean.

## Coding Style & Naming Conventions

TypeScript sources follow the Biome configuration inherited from the workspace: tab indentation, double quotes, and trailing commas where possible. Prefer PascalCase for classes, camelCase for functions and variables, and SCREAMING_SNAKE_CASE only for exported constants. Group related exports at the end of each module and keep side-effect imports isolated. Public APIs should include succinct JSDoc when behavior is non-obvious.

## Testing Guidelines

Unit tests live beside features inside `test/unit` and mirror filenames using the `*.test.ts` suffix. Integration and UI flows use `@vscode/test-cli`; keep scenario names aligned with the `snapback.*` command being exercised. Measure coverage with `npm run test:coverage` and avoid regressions below the current baseline stored in `coverage/`. Add mocks to `__mocks__/` rather than stubbing within test files, and document any new fixtures in `test/helpers/README.md`.

## Commit & Pull Request Guidelines

Commits follow conventional syntax—`type(scope): summary`—as seen in `feat(vscode): …` and `test(vscode): …`. Keep commits focused and include relevant test updates. Pull requests should describe the user-facing outcome, link Jira or GitHub issues, and attach screenshots or screencasts for UI-facing changes. Note any configuration toggles required in `.env` and confirm `npm run lint` plus appropriate test commands have been executed before requesting review.

## Environment & Release Tips

Extension telemetry, storage, and contract clients resolve through workspace packages (`@snapback/*`), so ensure the root workspace is built before debugging. When preparing a release, update the changelog, run `npm run package-with-changeset` from the repo root, and verify the generated VSIX under `snapback-vscode-*.vsix` installs cleanly in a fresh VS Code profile.
