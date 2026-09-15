# 11 — Build Plan (Xcode)

## 1. Proposed structure (in `GitDesktop/GitDesktop/`)

```
GitDesktop/
  App/GitDesktopApp.swift (@main, WindowGroup, commands, AppDelegate openURLs/openFile)
  App/AppStore.swift (@MainActor ObservableObject, state, actions=Dispatcher)
  App/RepositoryStateCache.swift GitStoreCache.swift PopupManager.swift
  Models/ (Repository, Branch, Commit, Status, Diff, Stash, Remote, Worktree, Banner, Popup(pruned), TutorialStep, … — direct ports of `app/src/models/*` minus GH)
  Git/ (GitProcess.swift(core/spawn+env), GitError.swift(taxonomy), StatusParser/DiffParser/PatchFormatter.swift, operations: Clone Init Add Apply Commit Reset Checkout Diff Log Refs Branch Merge Rebase CherryPick Revert Stash Tag Remote Fetch Pull Push Submodule LFS Worktree Config Ignore Var Trailers Reflog Show MergeTree FormatPatch.swift, Progress/Parsers.swift, HooksProxy.swift, SSHStore.swift, GenericAuth.swift)
  Stores/ (GitStore.swift actor per repo, RepositoriesStore.swift GRDB, UpdateStore.swift Sparkle, StatsStore.swift local-only)
  Persistence/ (Database.swift GRDB schema, Defaults.swift keys, Keychain.swift)
  Views/Shell/ (ContentView, TitleBar, ToolbarView, BranchDropdown, PushPullButton, WorktreeDropdown, RepoListView, FoldoutHost, BannerHost, DialogHost)
  Views/Changes/ (ChangesSidebar, ChangedFileRow, CommitBoxView, AuthorInput, Autocomplete, UndoCommit, OversizedWarning, CommitProgressView, HookFailedView)
  Views/History/ (CompareSidebar, CommitList, CommitRow, SelectedCommits, ExpandableSummary, FileListView)
  Views/Diff/ (SeamlessDiffSwitcher, TextDiffView unified+split, DiffHeader/Options/Search, ImageDiffs 2-up/swipe/onion/difference, Binary/Submodule/Large gates)
  Views/Branches/ (BranchesContainer, BranchList, Create/Rename/DeleteBranch, Merge/Rebase/ChooseBranch/Progress/Conflicts/UnmergedFile, CherryPick/Squash/Reorder sheets, ConfirmForcePush)
  Views/StashTagsWorktrees/ (StashViewer, Create/DeleteTag, WorktreeList + Add/Rename/Delete)
  Views/Onboarding/ (Welcome, ConfigureGit, NoRepos, TutorialPanel, CreateTutorialRepo)
  Views/Settings/ (SettingsView Git/Appearance(TabSize)/Prompts/Advanced/Accessibility/AppleIntelligence + RepositorySettings Remote/Ignore/GitConfig)
  Views/Help/ (About, Acknowledgements, ReleaseNotes, Shortcuts, Logs)
  Services/ (UpdateService, CrashReporter, CLIShim, DeepLink, AppleIntelligenceService, EmojiProvider)
  Resources/ (Assets, empty-no-repo/ufo-alert/empty-no-commit SVG→PDF, Localizable.strings)
```

Deps: GRDB (DB) + Sparkle (updates); diff highlight: Splash/TextKit2; markdown: swift-markdown. No GH/Copilot SDKs.

## 2. Milestones (vertical slices)

1. Shell + repo add/select + status + file list (fake GitStore) — Toolbar/foldouts/banners/dialog infra done.
2. Real git: status/stage/unstage/commit/discard/ignore + commit box validation + history log + blob diff (unified).
3. Split diff + find + image/binary/submodule + whitespace + large-file gate + syntax highlight.
4. Branches CRUD + compare + merge + conflicts UI + banners/undo.
5. Rebase/cherry-pick/squash/reorder + drag-drop + keyboard reorder + force-push confirm.
6. Fetch/pull/push + remotes + generic/SSH auth + progress + hook output + error taxonomy.
7. Stash/tags/worktrees/submodules/LFS/.gitignore/repo-settings.
8. Clone/create/add + missing/locate + reset/revert/checkout/amend/undo + unreachable commits.
9. Welcome/tutorial + 5-tab Settings + About/help/logs + CLI/deep-link/Finder-drop.
10. Apple Intelligence commit message (behind availability gate) + polish (shortcuts/menus/a11y/empty states) + Sparkle/crash.

## 3. Testing

- Git layer: golden tests per command (args assert via mock Process) + fixture repos (unborn, merge conflict, rebase, submodule, LFS, worktree, large file, CRLF, bidi).
- Parsers: status/diff/log/reflog/for-each-ref unit tests from real outputs in `app/test/` fixtures.
- ViewModels: AppStore reducer tests (selection, staging, amend, multi-op undo Canadian).
- UI: snapshot tests (toolbar states, commit box, diff rows, conflict rows) in both system appearances; keyboard/drag-drop UI tests (commit drag → cherry-pick, insertion reorder); a11y audit (VoiceOver labels, focus trap in sheets).
- Manual parity checklist: every dialog in `04-shell-toolbar.md §7` + every context menu in `10-interactions.md §3` + every empty state in `10 §5`.

## 4. Open questions (decisions needed before code)

1. Min macOS: 14 (broad) vs 26 (Apple Intelligence)? Recommend: deploy 14, AI feature gated 26.
2. Git backend: bundled `git` via `Process` (max parity, recommended) vs libgit2 (faster but rebase/sequencer risk)?
3. DB: GRDB vs SwiftData? Recommend GRDB (Dexie schema ports 1:1).
4. Help guides: bundle local HTML or ship without guides?
5. `safe.directory` + `credential.helper=desktop` trampoline: reimplement askpass helper binary or use `GIT_ASKPASS` script?
