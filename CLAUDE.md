# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

GitHub Desktop: an Electron + React 16 + TypeScript (strict) app. Yarn v1, Node per `.nvmrc`. The detailed coding conventions live in `.github/copilot-instructions.md` and `docs/contributing/styleguide.md`; the essentials are repeated below.

## Commands

```bash
yarn                      # install (root build deps + app/ deps via postinstall); also init submodules (gemoji, gitignore, choosealicense.com)
yarn build:dev            # webpack compile + build; required after changes in app/src/main-process
yarn start                # run dev app; renderer changes hot-compile, reload with Ctrl/Cmd+Alt+R
yarn build:prod && yarn package  # macOS zip / Windows installers / Linux .deb (script/package.ts, templates in script/linux/)

yarn test                                   # all unit + UI tests (app/test/unit)
yarn test app/test/unit/git/clone-test.ts   # single file
yarn test app/test/unit/ui                  # a directory (recursive, matches *-test.{ts,tsx,...})
yarn test <file> --test-name-pattern="foo"  # extra --flags pass through to node --test
yarn test:script / yarn test:eslint         # tests for script/ and eslint-rules/
yarn test:e2e:unpackaged                    # Playwright E2E (app/test/e2e)

yarn lint                 # prettier --check + eslint (with custom rules in eslint-rules/)
yarn lint:fix             # rewrites files repo-wide; run after code changes
yarn markdownlint
yarn validate-changelog
```

Tests use the **Node.js built-in test runner** (`node:test`), not Jest/Mocha, run through `tsx` via `script/test.mjs`, which loads `.test.env` and `app/test/globals.mts`. UI component tests use React Testing Library in JSDOM under `app/test/unit/ui/`. Test files mirror the source tree (`app/src/lib/git/clone.ts` → `app/test/unit/git/clone-test.ts`). See `.github/skills/testing/SKILL.md` and `docs/technical/adding-tests.md` / `crafting-git-tests.md`. For bug fixes, write a failing test first.

## Architecture

There are two package.json files: the root one holds build/test tooling; `app/package.json` holds runtime dependencies and the app version.

Webpack (`app/webpack.common.ts`) builds several separate bundles from `app/src/`:
- `main-process/` — Electron main process (windows, menus, auto-update, protocol handling).
- `ui/` — renderer process; the React app (`ui/index.tsx`, `ui/app.tsx`).
- `crash/` — crash window renderer.
- `cli/` — the `github` command-line helper.
- `highlighter/` — syntax-highlighting web worker.

Main ↔ renderer communication is strongly typed: never import `ipcRenderer`/`ipcMain` from `electron`; use `app/src/lib/ipc-renderer.ts` / `app/src/main-process/ipc-main.ts` (channel types in `ipc-shared.ts`).

**State flow (renderer):** UI components call methods on `Dispatcher` (`app/src/ui/dispatcher/dispatcher.ts`), which delegates to `AppStore` (`app/src/lib/stores/app-store.ts`). AppStore methods meant to be called from the Dispatcher are prefixed `_` and documented `/** This shouldn't be called directly. See 'Dispatcher'. */`. AppStore composes per-domain stores in `lib/stores/` (`GitStore` per repository, `AccountsStore`, `PullRequestStore`, `IssuesStore`, etc.), aggregates them into `IAppState` (`lib/app-state.ts`), and emits updates that re-render the React tree. Persistent data lives in IndexedDB (Dexie) under `lib/databases/`.

**Git:** all git invocations go through `app/src/lib/git/` (one module per command, `core.ts` is the shared `git()` wrapper) using the bundled Git from `dugite`. Credentials/askpass are handled via the "trampoline" (`lib/trampoline/`), a local server that the spawned git process calls back into. Follow the git-argument conventions in `docs/contributing/styleguide.md#git-command-arguments` (`--end-of-options`, `--` placement, canonical `refs/remotes/...`, prefer `-z`/`--null` output).

**Models** (`app/src/models/`) are mostly plain interfaces/types shared across processes. Feature flags live in `app/src/lib/feature-flag.ts` (gate on `enableDevelopmentFeatures()` / `enableBetaFeatures()`; see `docs/technical/feature-flagging.md`). Styles are SCSS in `app/styles/`.

## Code conventions (enforced by review/ESLint)

- Interfaces prefixed with `I`; named exports only; prefer string-literal unions over enums; prefer functions over new classes.
- Avoid `as` assertions, `!`, and `any`; use `assertNever` (`lib/fatal-error.ts`) for exhaustiveness.
- Explicit accessibility modifiers on class members; React props/state types are `readonly`; explicit JSX booleans (`visible={true}`); no binding in JSX.
- Always use curly braces; JSDoc with `/**`; avoid synchronous Node APIs in app code.
- Usage-data changes: run `yarn generate-example-usage-data` and `yarn test app/test/unit/usage-data-test.ts`, commit the regenerated `docs/process/usage-data.json` (never hand-edit it).
