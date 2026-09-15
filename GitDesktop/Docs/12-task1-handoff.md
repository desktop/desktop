# 12 — Task 1 handoff notes (read before Tasks 2–8)

Branch `task/1-foundation` (based on `native` @ `7faf5a39`) defines the contracts
all later tasks code against. Extend additively — never redefine these types.

## Contracts
- `Models/`: `Repository` (no `gitHubRepository` — collapsed per scope),
  `Branch`, `Commit`/`CommitIdentity`/`GitAuthor`/`Trailer`/`CommitContext`/`CommitMessage`,
  `Status` (`FileChange`/`WorkingDirectoryFileChange`/`CommittedFileChange`/`WorkingDirectoryStatus`),
  `Diff` (`Diff` enum; note `DiffImage`, not `Image`, to avoid the SwiftUI clash;
  app progress is `AppProgress`, not `Progress`, to avoid the Foundation clash),
  `StashEntry`, `Remote`, `WorktreeEntry`, `SubmoduleEntry`, `Tip`, `Banner`, `Popup`,
  `TutorialStep`, `UncommittedChangesStrategy`, `CloningRepository`, `Author`.
- `Git/GitService.swift`: `GitService` protocol. `LiveGitService` implements
  `status()` + `commits(limit:)` for real; everything else is
  `fatalError("Task N")` — implement your task's stub, don't touch others'.
  `MockGitService.preview` has two files + one commit for Previews/UI work.
- `App/AppState.swift`: `@MainActor AppStore` with `selectRepository`,
  `showPopup`/`closePopup`/`closePopup(ofType:)`/`closeAllPopups`,
  `showFoldout`/`closeFoldout`/`toggleFoldout`, `setBanner`/`clearBanner` only.
  Add feature actions in your own task files, not by editing these signatures.
- `Git/GitError.swift`: `parseGitError(_:)` + `classifyGitResult(_:args:successExitCodes:)`.
  Use them in every new git operation.
- `Persistence/Defaults.swift`: widths/confirms/filters keys only.

## Gotchas
- `SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor` is set in the xcodeproj. Do NOT
  hand-edit `project.pbxproj` (synced group auto-includes new files under
  `GitDesktop/GitDesktop/`). If background-actor isolation is needed for
  `GitStore`, propose the setting change rather than editing the pbxproj.
- `Banner`/`Popup` carry no closures: banner actions are `UUID` tokens and
  popups are data-only. Task 2's `BannerHost`/`DialogHost` maps them to
  `AppStore` actions.
- `Popup.id` is stable per type (`error` collapses by message); `closePopup`
  removes by value equality. Task 2 may introduce numeric popup IDs.
- There is NO test target (adding one needs a pbxproj edit). Parser tests live
  in `GitDesktop/GitDesktop/Tests/ParserTests.swift` as a framework-free
  `ParserTests.runAll()` and are executed via a `swiftc` harness, e.g.:
  `swiftc GitDesktop/GitDesktop/Models/*.swift GitDesktop/GitDesktop/Git/GitProcess.swift GitDesktop/GitDesktop/Git/GitError.swift GitDesktop/GitDesktop/Git/Parsers/*.swift GitDesktop/GitDesktop/Git/GitService.swift GitDesktop/GitDesktop/Tests/ParserTests.swift <harness-main.swift> -o /tmp/parser-tests && /tmp/parser-tests`
  where the harness is a `@main` struct calling `ParserTests.runAll()`.
- `LiveGitService.status()` replicates `buildStatusMap` quirks: staged-delete +
  untracked collision (untracked wins), submodule-modified files default to
  `DiffSelection.none`. Keep these when extending.
- Scope hard rules: no GitHub/editor/terminal/Copilot/theme/OS-notification code.
  `TutorialStep.pickEditor`/`.openPullRequest` and `ForkContributionTarget` are
  retained as inert data only; Task 9 prunes their usage.
