# AGENTS.md — GitDesktop (native SwiftUI) + electron (reference)

This repo has two projects. Read this file before any code change.

## Layout

- `electron/` — ORIGINAL Electron+React app. READ-ONLY reference. Never edit, never build unless asked. Old paths in `GitDesktop/Docs/*.md` that say `app/src/...` now mean `electron/app/src/...`.
- `GitDesktop/` — NEW native macOS SwiftUI app. All work happens here.
  - `GitDesktop/GitDesktop/` — Swift sources (filesystem-synced group: just add files, no `.pbxproj` edits).
  - `GitDesktop/GitDesktop.xcodeproj` — Xcode project, scheme `GitDesktop`, target macOS 27.0, Swift 5.
  - `GitDesktop/Docs/` — reimplementation spec (`00-README.md` → `11-build-plan.md`). Source of truth for behavior.
- `PLAN.md` (repo root) — ordered task list. User runs agents with `do PLAN.md Task N`. Do exactly one task per session unless told otherwise.
- This file (`AGENTS.md`) — repo rules for all agents.

## Scope (hard exclusions — do not implement)

1. No GitHub integration (no OAuth, PRs, issues, forks, publish-to-GitHub, `View on GitHub`, GH avatars, checks). `notifications-store.ts` / `alive-store.ts` are 100% GitHub — deleted, no replacement.
2. No editor/terminal integration. Only `Show in Finder` via `NSWorkspace.reveal`.
3. No Copilot. Optional Apple Intelligence feature is Task 10 only, gated on macOS 26 `FoundationModels`.
4. No date/time format settings — use `RelativeDateTimeFormatter` + `formatted(date:time:)`.
5. No number format settings — use `NumberFormatter` / system default.
6. No theme setting — system appearance only (SwiftUI automatic).
7. No OS notifications.

If you find GH/editor/Copilot/theme code in `electron/` — that is the reference telling you what to OMIT, not to port.

## Build / verify (run every task)

```bash
xcodebuild -project GitDesktop/GitDesktop.xcodeproj -scheme GitDesktop -destination 'platform=macOS' build
```

- Keep `MyApp.swift` + `ContentView.swift` compiling at all times.
- New files go under `GitDesktop/GitDesktop/` (e.g. `Models/`, `Git/`, `Views/`, `Services/`). Never hand-edit `project.pbxproj` (synced group picks files up automatically).
- Prefer pure functions for parsers so they are unit-testable without git installed.
- After code changes, run the build above. If you added parsers/logic, add/extend `Tests/*Tests.swift` and run them. Paste build + test output in your final summary.

## Swift conventions

- SwiftUI + `@MainActor` `ObservableObject` AppStore (see `GitDesktop/Docs/02-architecture.md`). Per-repo git work in `actor GitStore`.
- `Process`-based git with identical args/env to `electron/` (`TERM=dumb`, `GIT_TERMINAL_PROMPT=0`, `GIT_CONFIG_PARAMETERS`, `GIT_USER_AGENT`). Buffer mode for status/diff/log.
- System formatters only. No third-party deps until Task 10 (GRDB/Sparkle decided there).
- No force-unwraps in shipped paths; map git failures to `GitError` taxonomy (`GitDesktop/Docs/09-git-layer.md`), surface via `Error` popup, never crash.

## Git / worktree rules

- Branch per PLAN task: `task/<n>-<slug>` (e.g. `task/1-foundation`). One task = one branch.
- Parallel worktrees allowed ONLY after Task 1 merges (Task 1 defines `Models/`, `Git/GitService.swift` protocol + mocks, `AppState`). Tasks 2+ code against those contracts, never redefine them — extend by additive PRs.
- Suggested: `git worktree add ../GitDesktop-<slug> -b task/<n>-<slug>` from repo root. Each worktree has its own DerivedData by path; no shared state.
- Commit message: `Task N: <what> (PLAN.md)`. Leave `electron/` untouched — `git status` must never show `electron/` modifications.
- Currently on branch `native`. Rebase UI tasks onto `native` after Task 1 lands.

## How to execute a PLAN.md task

1. Read `PLAN.md` header (dependency graph) + the one task section + its `Read:` docs. Do not scope-creep into other tasks.
2. Implement `Files:` list only. Stub cross-task APIs with `fatalError("Task N")` or the mock from Task 1 — do not implement another task's work.
3. Verify with the `xcodebuild` command + any task-specific checks. Fix until green.
4. Final summary: files added/changed, build output, tests, what's stubbed for later tasks.
