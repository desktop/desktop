# GitDesktop — SwiftUI Reimplementation Spec (Index)

Source: `github/desktop` Electron+React app at `/Users/felix/Code/github-desktop/app`.
Target: native macOS SwiftUI app in `./GitDesktop` (`GitDesktop.xcodeproj`).

## Scope decisions (per request)

KEEP everything local-git. DELETE:

1. GitHub Integration — `lib/api.ts`, `accounts/sign-in/token/api-repos/issues/pull-request/commit-status/github-user/alive` stores, `pull-request/issues/github-user` databases, PR/issue/fork/publish/enterprise UI, `View on GitHub`, remote GitHub matching. See `01-scope.md`.
2. Editor / Terminal integration — `lib/editors/*`, `lib/shells/*`, `lib/custom-integration.ts`, Preferences > Integrations, all `Open in editor/shell` menu items. Keep only `Show in Finder` (`NSWorkspace.reveal`).
3. Copilot — `lib/copilot/*`, `copilot-commit-message/conflict-*`, `copilot-store`, all Copilot prefs/dialogs. Optional Apple Intelligence replacement: see `01-scope.md`.
4. Date/time format settings — delete. Use `RelativeDateTimeFormatter` + `formatted(date:time:)`.
5. Number format settings — delete. Use `NumberFormatter` / system default.
6. Theme setting — delete. Use system appearance (SwiftUI automatic). Delete `application-theme.ts`, `app-theme.tsx`, native-theme IPC.
7. Notifications — YES, this is 100% GitHub integration. Proof: `lib/stores/notifications-store.ts` (571 lines) only handles `pr-checks-failed | pr-review-submit | pr-comment` via `API.fetch*` + `PullRequestCoordinator`, gated on `isRepositoryWithGitHubRepository`. `alive-store.ts` only subscribes to `API.getAliveWebSocketURL`. No local-git toast uses it. Safe to delete entirely. Keep generic `Dialog`/`Banner` infra (those are not notifications).

## Docs map

| File | Contents |
|------|----------|
| `01-scope.md` | In/out table, delete-file list, Apple Intelligence proposal |
| `02-architecture.md` | Process model, AppState, Dispatcher→Swift, persistence, git binary layer |
| `03-design-system.md` | Colors, type, spacing, primitives, light/dark via system |
| `04-shell-toolbar.md` | Window, toolbar, repo list, foldouts, banners, dialogs |
| `05-changes-commit.md` | Changes tab, commit box, autocomplete, stash entry |
| `06-history-diff.md` | History/compare, commit list, diff viewer (text/image/binary), find |
| `07-branches-operations.md` | Branches, merge/rebase/cherry-pick/squash/reorder, conflicts, undo, tags, worktrees, stash |
| `08-repo-settings-prefs.md` | Add/clone/create, remotes, repo settings, prefs (kept tabs), onboarding/tutorial, help/about |
| `09-git-layer.md` | Every git command + args, models, errors, progress, hooks/SSH/auth |
| `10-interactions.md` | Menus, shortcuts, context menus, drag-and-drop, empty states, a11y |
| `11-build-plan.md` | Xcode structure, modules, milestones, testing |

## How to read

Start at `01-scope.md` → `02-architecture.md` → build vertical slice: shell → changes/commit → history/diff → branches/operations (see `11-build-plan.md`).
All `app/src/...` paths are relative to the original repo.
All dimensions/colors are in `03-design-system.md` + per-screen files.

## Non-goals

- No GitHub.com / Enterprise (no OAuth, keytar GH tokens, PRs, issues, checks, forks, publish-to-GitHub, `View on GitHub`).
- No external editor/terminal pickers.
- No Copilot SDK. Optional Apple Intelligence commit-message feature is greenfield (see `01-scope.md`).
- No custom date/number/theme pickers, no OS notification center integration.
