# 04 — Shell: Window, Toolbar, Repo List, Foldouts, Banners, Dialogs

## 1. App shell (`ui/app.tsx`, `repository.tsx`, `tab-bar.tsx`, `resizable/*`)

Root: `TitleBar + Toolbar + (RepositoriesFoldout | RepositoryView | NoRepositories | Welcome) + Banner + Dialog stack`. Dialogs stack via `DialogStackContext{isTopMost}`; backdrop click = mousedown+mouseup both on backdrop; `Esc/Cmd+W` dismiss; 250ms dismiss grace; focus priority: preferred → lowest tabIndex → input → submit → button → close; stacked restore. Banners: top stack, auto-dismiss timeout, focus first link/button, X dismiss.
`RepositoryView`: `HSplitView`: left `Resizable#repository-sidebar` (min 200 / max 350) with `TabBar Changes+FilesChangedBadge / History`, right detail (`Changes|MultipleSelection|NoChanges|TutorialPane` or `SelectedCommits`) + optional tutorial right rail. Preserve `changesListScrollTop/compareListScrollTop`. `Ctrl+Tab` toggles tabs. `TabBar{type: tabs|switch|vertical}`: arrow-key nav, drag-hover switches after 500ms. `Resizable`: right-edge drag (global mousemove/up), dbl-click reset, keyboard ±5px, live-region announces %.
SwiftUI: `NavigationSplitView + Toolbar + ZStack(sheet stack) + .banner modifier`; `HSplitView` with UserDefaults widths; `.sheet(item: Popup)`; focus via `@FocusState`.

## 2. Toolbar (`toolbar/*`)

Layout: `[Repo foldout][Branch dropdown (resizable, foldout min 365)][Push/Pull (resizable)][Fetch…]` + optional Worktree dropdown (flag `enableWorktreeSupport` — ship enabled). All buttons: title + description + icon + progress bg + overflow tooltip.
- Branch button: `gitBranch | gitCommit(detached) | spin(checkout progress)`; title=branch, description=`Current Branch|Detached HEAD|Rebasing|Checkout 42%`. Foldout `BranchesContainer`. Context menu: Rename/Delete. Drop target for commits (cherry-pick hover auto-opens on mouse-enter). Disabled during rebase conflict/checkout. Delete PR-badge/CI popover (GH).
- Push/Pull state machine: `Publish repo|Publish branch|Fetch(remote+Last fetched …)|Pull(remote,↑N↓M)|Push|Force push|Progress(spin)|Detached(disabled)`. `renderAheadBehind(↑N ↓M compact)` + `numTagsToPush`. Split caret → Fetch / Force push. Live-region progress.
- Worktree dropdown: current worktree picker, same resizable/popover pattern.
- `RevertProgress`: revert+LFS progress button.
SwiftUI: `ToolbarItem`s with `Popover`s, `ProgressView`, `help()` tooltips.

## 3. Repository list (`repositories-list/*`)

Grouped `SectionFilterList`: `Recent | Other` (delete dotcom/enterprise owners groups). Row height 29. Row: repo icon, name+alias, ahead/behind `↑↓` badges, dirty dot, tooltip = name(+alias)+path+ahead/behind. Footer `Add ▾` → Clone/Create/Add (`Ctrl+O / Ctrl+Shift+O` hints). `renderNoItems` blankslate `empty-no-repo.svg`. Interactions: click select, right-click menu (Show in Finder, Change/Remove alias, Create worktree…, Remove), type-to-filter, Shift+F10 menu, drag-drop folders to add (see §10).
Context menu (pruned): Show in Finder | Change alias… | Remove alias | Create worktree… | Remove… . DELETE: Open in shell/editor, View on GitHub.

## 4. No-repos / cloning / missing

`NoRepositoriesView`: header "Let's get started!", buttons Tutorial/Clone/Create/Add + drag-drop ProTip + illustrations. Delete `CloneableRepositoryFilterList/AccountPicker` (GH). `CloningRepositoryView`: progress + cancel. `MissingRepositoryView`: deleted-on-disk + Locate…/Remove. `MoveToApplicationsFolder`: macOS-only prompt (keep).

## 5. Foldouts (`FoldoutType`: Repository|Branch|AddMenu|PushPull|AppMenu|Worktree)

One open at a time, overlay dismiss, focus trap, clientRect-anchored. Repository=repo list; Branch=`BranchesContainer`; PushPull=fetch/force-push options; AppMenu=Windows in-app menu (macOS uses native `commands`); Worktree=`WorktreeList`; AddMenu=Clone/Create/Add. `DropdownStyle: Foldout(full-height)|MultiOption(small)`; disclosure triangle; MultiOption splits main action + caret.

## 6. Banners (`banners/*`, `models/banner.ts`)

Keep: SuccessfulMerge/Rebase/CherryPick/Squash/Reorder (+Undone with Undo action), ConflictsFound/Merge/Rebase/CherryPick (reopen dialog), BranchAlreadyUpToDate, OSUnsupported, UpdateAvailable. Delete: ThankYou (GH contributions), ThankYouCard. Each: icon + text + action link + dismiss. Success banners show branch names + Undo where applicable.

## 7. Dialogs kept (PopupType pruned → Swift sheets)

RenameBranch | DeleteBranch/Remote | ConfirmDiscardChanges/Selection | Preferences | RepositorySettings | Add/Create/CloneRepository (generic URL only) | CreateBranch | About | InstallGit | Acknowledgements | UntrustedCertificate | RemoveRepository | Terms | PushBranchCommits | CLIInstalled | GenericGitAuthentication | InitializeLFS/LFSAttributeMismatch | ReleaseNotes | OversizedFiles | CommitConflictsWarning | PushNeedsPull | ConfirmForcePush | StashAndSwitchBranch/ConfirmOverwriteStash/ConfirmDiscardStash | ConfirmCheckoutCommit | CreateTutorialRepository/ConfirmExitTutorial | CreateTag/DeleteTag | LocalChangesOverwritten | MoveToApplicationsFolder | ChangeRepositoryAlias | CommitMessage (squash) | MultiCommitOperation | WarnLocalChangesBeforeUndo | WarningBeforeReset | AddSSHHost/SSHKeyPassphrase/SSHUserPassword | DiscardChangesRetry | UnreachableCommits | Error | InstallingUpdate | UnknownAuthors | ConfirmCommitFilteredChanges | PushProtectionError (local display only; delete Bypass API) | HookFailed | CommitProgress | Add/Rename/DeleteWorktree(/Failed).
Delete GH/Copilot/Editor ones per `01-scope.md`.
