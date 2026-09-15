# PLAN.md — GitDesktop native reimplementation (task list)

Run agents with: `do PLAN.md Task N` (one task per session/branch).
Rules: see `AGENTS.md`. Reference app lives in `electron/` (read-only). Spec lives in `GitDesktop/Docs/`.

## Dependency graph + worktrees

```
Task 1 foundation (BLOCKS all — do first, merge before parallel work)
  ├─ Task 2 shell (toolbar/repo-list/foldouts/banners/dialogs)
  ├─ Task 3 changes + commit box
  ├─ Task 4 diff viewer
  ├─ Task 5 history + branches + merge + conflicts
  ├─ Task 6 rebase/cherry-pick/squash/reorder + commit drag-drop
  ├─ Task 7 sync (fetch/pull/push) + remotes + auth + progress/errors
  └─ Task 8 stash/tags/worktrees/submodules/LFS + reset/revert/checkout/amend/undo
Task 9 onboarding/settings/help/CLI/deeplink (needs Tasks 2–8 shells to plug into)
Task 10 polish: menus/shortcuts/context-menus/a11y/empty-states + Sparkle/crash + Apple Intelligence (gated)
```

After Task 1 lands on `native`, Tasks 2–8 can run in parallel worktrees (they code against Task 1 protocols/mocks, never redefine them). Tasks 9–10 run last.

Branch per task: `task/<n>-<slug>`. Verify every task with:
`xcodebuild -project GitDesktop/GitDesktop.xcodeproj -scheme GitDesktop -destination 'platform=macOS' build`

---

## Task 1 — Foundation: models, git process, parsers, AppState skeleton

Read: `GitDesktop/Docs/00-README.md`, `01-scope.md`, `02-architecture.md`, `09-git-layer.md`.
Implement:
- `Models/`: Repository, Branch (+IAheadBehind), Commit (+identity/trailers), Status (FileChange/WorkingDirectory/Committed/AppFileStatus/DiffSelection), Diff (types/hunks/lines), StashEntry, Remote, Worktree, Submodule, Tip, Progress, Banner (pruned), Popup (pruned), TutorialStep, UncommittedChangesStrategy. Direct ports of `electron/app/src/models/*` minus GH (see `01-scope.md` delete table).
- `Git/GitProcess.swift` (Process wrapper + env from `09-git-layer.md`), `Git/GitError.swift` (taxonomy + parseError), `Git/Parsers/` (StatusParser porcelain=2 -z, DiffParser, LogParser `--date=raw`, RefsParser; pure functions).
- `Git/GitService.swift`: protocol (status, log, stage, commit, branches, remotes) + `MockGitService` + `LiveGitService` skeleton (implement `status()` + `log(limit:)` for real, rest `fatalError("Task N")`).
- `App/AppState.swift` + `RepositoryState.swift`: `@MainActor ObservableObject AppStore` with repositories/recent/selectedState/popups/foldout/banner/widths + actions selectRepository/showPopup/closePopup/showFoldout/closeFoldout/setBanner/clearBanner only.
- `Persistence/Defaults.swift`: UserDefaults keys for widths/confirms/filters only.
Files: `GitDesktop/GitDesktop/Models/*`, `Git/GitProcess.swift`, `Git/GitError.swift`, `Git/Parsers/*`, `Git/GitService.swift`, `App/*`, `Persistence/Defaults.swift`, `Tests/ParserTests.swift` (status/log fixtures from `electron/app/test/`).
Accept: build green; parser tests pass; `ContentView` compiles against new AppStore; no GH/editor/Copilot/theme/notification code.
Depends: none.

## Task 2 — Shell: window, toolbar, repo list, foldouts, banners, dialogs

Read: `GitDesktop/Docs/03-design-system.md`, `04-shell-toolbar.md`.
Implement: `ContentView` → `NavigationSplitView` + `ToolbarView` (repo foldout, branch dropdown, push/pull button, worktree dropdown — states with mock data, no real git yet) + `RepoListView` (grouped Recent/Other, row 29, badges, filter, Add ▾ menu, context menu: Show in Finder/Change-Remove-alias/Create-worktree/Remove) + `FoldoutHost` (one-open popovers) + `BannerHost` (success/conflict/uptodate/UpdateAvailable/OSUnsupported + Undo/reopen actions) + `DialogHost` (`.sheet(item: Popup)` stack, backdrop/Esc/focus per spec) + NoRepos/Cloning/Missing views. Wire to Task 1 AppStore/MockGitService.
Files: `GitDesktop/GitDesktop/Views/Shell/*`.
Accept: app launches to toolbar + repo list with mock repos; foldouts/banners/sheets open/dismiss per spec; Finder drop-to-add stubbed (real drop in Task 9); build green.
Depends: Task 1.

## Task 3 — Changes tab + commit box

Read: `GitDesktop/Docs/05-changes-commit.md`, `03-design-system.md`.
Implement: `ChangesSidebar` (virtualized list, tri-state checkboxes, `PathLabel`, status icons, Space/Enter toggle, context menu: Discard/Ignore-file-extension/Reveal-in-Finder/Copy-path), filter box + options, stash-entry row (navigates, viewer in Task 8), `FilesChangedBadge`, oversized/LFS gate warning, `CommitBoxView` (summary+description focus container, `Cmd+Enter`, 72-char warn, validation blocks, amend notice, gear menu skip-hooks/signoff/allow-empty, co-authors always-on + `@`/branch/`:emoji:` autocomplete, spellcheck toggle, unknown-author/filtered-files/conflict confirms, `CommitProgress` + `HookFailed` sheets). No Apple Intelligence button (Task 10).
Files: `GitDesktop/GitDesktop/Views/Changes/*`.
Accept: stage/unstage/partial-line via MockGitService; commit validation blocks with empty/markers; build green.
Depends: Tasks 1–2.

## Task 4 — Diff viewer

Read: `GitDesktop/Docs/06-history-diff.md` (§4), `03-design-system.md`.
Implement: `SeamlessDiffSwitcher` (Text/Large/Binary/Image/Submodule/Unrenderable + empty/renamed/whitespace/conflict/large-file `ufo-alert` gates), `TextDiffView` unified + side-by-side toggle, row 20/line-col 50, gutter hunk checkboxes, hover hunk, drag-select, hunk expand, `DiffHeader` (path+status+gear: hide-whitespace/split), `DiffSearch` (`Cmd+F`, next/prev, N-of-M live region), discard line/hunk menus, bidi/CRLF warnings, diff check-marks pref, syntax highlight (TextKit2/Splash, token colors per spec), `ImageDiffs` (2-up/swipe/onion/difference + fit, DDS if cheap), binary/submodule rows.
Files: `GitDesktop/GitDesktop/Views/Diff/*`.
Accept: renders fixtures (large, binary, image, submodule, CRLF, bidi); find + expand + hide-whitespace work; build green.
Depends: Tasks 1–3 (Plugs into Changes selection; history wiring in Task 5).

## Task 5 — History + branches + merge + conflicts

Read: `GitDesktop/Docs/06-history-diff.md` (§1–3), `07-branches-operations.md` (§1–3).
Implement: `CompareSidebar` (filter + History/Behind-Ahead + infinite scroll), `CommitList` (row 50, multi-select, `shasToHighlight`, context menus single/multi per `10-interactions.md` §3, minus GH items), `SelectedCommits` (expandable summary + resizable file list + readOnly diff via Task 4 + noncontiguous blankslate + drag overlay), `UnreachableCommits` dialog, `BranchesContainer` (filter, Recent/Default/Other groups, create row, footer merge-into), Create/Rename/Delete branch dialogs, merge wizard (choose-branch → progress → conflicts → banner+Undo), `UnmergedFile` rows (markers/manual/resolved, ours/theirs, Reveal-in-Finder), `commit-conflicts-warning`, merge/conflict banners.
Files: `GitDesktop/GitDesktop/Views/History/*`, `Views/Branches/*`, `Views/Merge/*`.
Accept: mock history browsable; merge conflict flow reaches UnmergedFile UI; build green.
Depends: Tasks 1–4.

## Task 6 — Rebase / cherry-pick / squash / reorder + commit drag-drop

Read: `GitDesktop/Docs/07-branches-operations.md` (§2), `10-interactions.md` (§4).
Implement: rebase (choose → progress `Rebasing (n/m)` → continue/skip/abort, force-with-lease confirm, `continue-rebase` CTA), cherry-pick (multi, `--empty=keep -m 1`, sequencer, undo), squash/reorder (todo-file interactive, merge-commit guard, undo), `warn-force-push` + `confirm-abort` (if resolved), result/undone banners; commit drag-drop (`DragType.Commit` + ghost, branch target → cherry-pick with hover-open, insertion point → reorder/squash with contiguity guard, keyboard-reorder mode + hint popover).
Files: extend `Views/Branches/*`, `Views/Merge/*`, `Services/DragDrop.swift`.
Accept: drag commits onto branch/insertion triggers right op on mock; rebase/cherry-pick progress parses covered by tests; build green.
Depends: Tasks 1, 5 (needs commit list + conflict rows).

## Task 7 — Sync: fetch/pull/push + remotes + auth + progress + errors

Read: `GitDesktop/Docs/09-git-layer.md` (remotes/sync/auth/hooks), `04-shell-toolbar.md` (push/pull state machine).
Implement: `LiveGitService` fetch (`--prune --recurse-submodules`), pull (`--ff` + rebase.backend pin), push (upstream/force-with-lease/follow-tags-dry-run), `remote set-head -a`, add/remove/set-url remotes; push/pull button state machine (Publish/Fetch/Pull/Push/Force-push/Progress/Detached + `↑N↓M` + tags + split Fetch/Force-push); progress parsers (clone/fetch/pull/push/checkout/revert + LFS + rebase/cherry-pick regexes) wired to toolbar buttons + `RevertProgress`; auth sheets (generic user/pass, untrusted-cert, SSH host/passphrase/password), proxy/`safe.directory` env, `performFailableOperation` → `Error` popup chain (push-needs-pull, LFS, permissions, local-changes-overwritten, discard-retry, secret-scan display only — no bypass API).
Files: `Git/Operations/Sync.swift`, `Git/Progress/*`, `Git/Auth.swift`, `Views/Shell/PushPullButton.swift`, `Views/Dialogs/Auth*`.
Accept: push-needs-pull + auth-failure fixtures show right dialogs; progress bars move on scripted output; build green.
Depends: Tasks 1–2 (toolbar), Task 5 (branch refs).

## Task 8 — Stash / tags / worktrees / submodules / LFS + undo-reset-revert-checkout-amend

Read: `GitDesktop/Docs/07-branches-operations.md` (§4–5), `09-git-layer.md`.
Implement: `StashViewer` (header message/date + Restore/Discard + resizable file list + readOnly diff) + stash-and-switch/overwrite/discard-stash confirms; Create/Delete tag (annotated, unpushed indicator, pushed-delete guard); `WorktreeList` (Main/Linked, filter, switch + state transfer, Add/Rename/Delete + failed dialog); submodule rows + `initialize-lfs`/`attribute-mismatch`; `.gitignore` editor; undo-commit (local-only guard + confirm), reset (soft/mixed/hard + confirm), revert (`-m 1` + LFS button), checkout commit (detached + confirm), amend start/stop + notice.
Files: `GitDesktop/GitDesktop/Views/StashTagsWorktrees/*`, `Git/Operations/*`, `Views/Dialogs/*`.
Accept: stash/tag/worktree CRUD works against LiveGitService on a fixture repo; destructive actions gated by confirms; build green.
Depends: Tasks 1, 5–6.

## Task 9 — Repos + onboarding + settings + help + CLI/deeplink/drop

Read: `GitDesktop/Docs/08-repo-settings-prefs.md`, `10-interactions.md` (§4).
Implement: Add/Create/Clone-generic dialogs (name/path, gitignore/license/README templates, `ext::`/sensitive-path blocks, progress+cancel), missing/locate, alias, Repository Settings (Remote URL, Ignored Files editor, per-repo vs global Git config; DELETE Fork tab), Welcome (Clone/Create/Add + ConfigureGit, no sign-in) + tutorial rail (CreateBranch/EditFile/MakeCommit-nudge/PushBranch-done; no PickEditor/PR steps) + `CreateTutorialRepository`, Settings 5 tabs only (Git incl. hook env, Appearance=Tab Size only, Prompts all, Advanced minus Win-SSH, Accessibility) + Save/Cancel semantics + lock-file recovery, About/Acknowledgements/ReleaseNotes/Shortcuts/Logs, CLI shim (`open path`, `clone url`), `x-gitdesktop-client://openrepo/<url>?branch&filepath` deeplink, Finder/dock/drop-to-add, `MoveToApplicationsFolder`/`CLIInstalled`/`InstallingUpdate` (blocks quit).
Files: `Views/Onboarding/*`, `Views/Settings/*`, `Views/Help/*`, `Services/` (CLI, DeepLink, Update stub).
Accept: cold start → welcome → create/clone/add → changes; settings persist; deeplink opens repo fixture; `electron/` untouched; build green.
Depends: Tasks 1–8.

## Task 10 — Polish: menus, shortcuts, a11y + Sparkle/crash + Apple Intelligence

Read: `GitDesktop/Docs/10-interactions.md`, `01-scope.md` (§3), `11-build-plan.md` (§3–4).
Implement: native `commands` menus (File/Edit/View/Repository/Branch/Window/Help per spec; no GH/editor/PR items), in-app shortcuts (`Ctrl+Tab`, `Cmd+Enter`, `Cmd+F/A`, list nav, `⌘+/-` pane resize), all remaining context menus, empty states (illustrations + actions), VoiceOver labels/live-regions/focus traps, `underlineLinks`/`showDiffCheckMarks`/spellcheck prefs honored; Sparkle updater (states + banner/showcase + InstallingUpdate), crash reporter (boundary + `AppError` view + opt-in POST); Apple Intelligence (NEW, `FoundationModels`, macOS 26 gate): commit-message generate/cancel/regenerate + overwrite-warning + first-run disclaimer + Settings toggle + availability status; conflicts Explain-only per file (no auto-apply). Decide GRDB vs SwiftData here if persisting beyond UserDefaults.
Files: `App/Commands.swift`, `Services/UpdateService.swift`, `Services/CrashReporter.swift`, `Services/AppleIntelligenceService.swift`, a11y/empty-state passes across `Views/`.
Accept: menu/shortcut checklist + a11y audit pass; AI hidden on <26 and on-device note shown; `xcodebuild` release build green.
Depends: Tasks 1–9.
