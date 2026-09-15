import Foundation
import SwiftUI

// MARK: - GitDesktopCommands (Task 10)
// Full native menu per Docs/10-interactions.md §1 + PLAN Task 10.
// Pruned per Docs/01-scope.md §2: no GitHub items (View on GitHub, Create
// Issue, Compare on GitHub, Preview/Create Pull Request), no editor/shell
// integration (Open in editor/shell, Open With), no Copilot items.
// Kept: Show in Finder, Copy path, all git-local items.
//
// Actions route to `AppStore.showPopup` where a popup exists, otherwise they
// post a `GitDesktopMenuAction` notification that the focused view observes
// (Views subscribe without depending on AppStore internals). This keeps menus
// working even when a sheet has focus — AppKit provides context-menu synthesis.

public extension Notification.Name {
    static let gitDesktopMenuAction = Notification.Name("GitDesktopMenuAction")
}

/// In-app menu actions that have no popup (tab switches, focus moves, sync
/// triggers owned by Tasks 5–7). Posted as `object` on
/// `.gitDesktopMenuAction` with `userInfo["action"] = rawValue`.
public enum GitDesktopMenuAction: String, CaseIterable, Sendable {
    case showChanges
    case showHistory
    case chooseRepository
    case showBranches
    case showWorktrees
    case goToCommitMessage
    case toggleStashedChanges
    case toggleChangesFilter
    case increaseResizableWidth
    case decreaseResizableWidth
    case push
    case pull
    case fetch
    case findInDiff
    case selectAll
    case createBranch
    case renameBranch
    case deleteBranch
    case discardAllChanges
    case stashAllChanges
    case updateFromDefault
    case compareToBranch
    case mergeIntoCurrent
    case squashAndMerge
    case rebaseCurrent
    case createTag

    public var notification: Notification {
        Notification(
            name: .gitDesktopMenuAction,
            object: nil,
            userInfo: ["action": rawValue])
    }

    public static func post(_ action: GitDesktopMenuAction) {
        NotificationCenter.default.post(action.notification)
    }

    public static func from(_ notification: Notification) -> GitDesktopMenuAction? {
        guard notification.name == .gitDesktopMenuAction,
              let raw = notification.userInfo?["action"] as? String
        else { return nil }
        return GitDesktopMenuAction(rawValue: raw)
    }
}

// MARK: - Menu inventory (testable, no SwiftUI dependency)

/// Required menu item IDs. Mirrors the reference
/// `build-default-menu.ts` ids minus deleted GH/editor/shell items.
/// Used by `Task10Tests` as the menu/shortcut checklist.
public let requiredMenuItemIDs: [String] = [
    "new-repository", "add-local-repository", "clone-repository",
    "find", "select-all",
    "show-changes", "show-history", "choose-repository", "show-branches",
    "show-worktrees", "go-to-commit-message", "toggle-stashed-changes",
    "toggle-changes-filter",
    "push", "pull", "fetch", "remove-repository", "open-working-directory",
    "create-worktree", "show-repository-settings",
    "create-branch", "rename-branch", "delete-branch",
    "discard-all-changes", "stash-all-changes",
    "update-branch-with-contribution-target-branch",
    "compare-to-branch", "merge-branch", "squash-and-merge-branch",
    "rebase-branch", "create-tag",
    "install-cli", "show-about", "show-preferences",
    "show-release-notes", "show-acknowledgements",
    "show-keyboard-shortcuts", "show-logs", "check-for-updates",
]

/// Menu items that must NEVER appear (scope deletions). The checklist test
/// asserts none of these IDs/labels are registered.
public let forbiddenMenuItemIDs: [String] = [
    "view-repository-on-github", "create-issue-in-repository-on-github",
    "compare-on-github", "branch-on-github",
    "preview-pull-request", "create-pull-request",
    "open-in-shell", "open-external-editor", "open-with-external-editor",
]

/// Required accelerators (display form). Kept in one place so Help >
/// Keyboard Shortcuts and the test checklist agree.
public let requiredMenuAccelerators: [(id: String, keys: String)] = [
    ("new-repository", "⌘N"),
    ("add-local-repository", "⌘O"),
    ("clone-repository", "⌘⇧O"),
    ("show-changes", "⌘1"),
    ("show-history", "⌘2"),
    ("choose-repository", "⌘T"),
    ("show-branches", "⌘B"),
    ("go-to-commit-message", "⌘G"),
    ("toggle-stashed-changes", "⌃H"),
    ("toggle-changes-filter", "⌘L"),
    ("push", "⌘P"),
    ("pull", "⌘⇧P"),
    ("fetch", "⌘⇧T"),
    ("remove-repository", "⌘⌫"),
    ("open-working-directory", "⌘⇧F"),
    ("create-branch", "⌘⇧N"),
    ("rename-branch", "⌘⇧R"),
    ("delete-branch", "⌘⇧D"),
    ("discard-all-changes", "⌘⇧⌫"),
    ("stash-all-changes", "⌘⇧S"),
    ("find", "⌘F"),
    ("select-all", "⌘A"),
]

/// Pure pane-resize step (⌘+/- and Cmd+9/8 Expand/Contract). Clamps into
/// the constrained width. Testable without SwiftUI.
public func adjustedPaneWidth(_ width: ConstrainedWidth, by delta: Double) -> ConstrainedWidth {
    var next = width
    next.value = min(max(width.value + delta, width.min), width.max)
    return next
}

public let paneResizeStep: Double = 5

// MARK: - Commands scene

/// Full menu bar. Owned by Task 10; `MyApp` installs it via `.commands`.
public struct GitDesktopCommands: Commands {
    @ObservedObject var store: AppStore
    @ObservedObject var updater: UpdateService

    public init(store: AppStore, updater: UpdateService) {
        self.store = store
        self.updater = updater
    }

    private var selectedRepositoryID: Int? { store.selectedRepository?.id }

    public var body: some Commands {
        // MARK: File
        CommandGroup(replacing: .newItem) {
            Button("New Repository…") {
                store.showPopup(.createRepository(path: nil))
            }
            .keyboardShortcut("n", modifiers: .command)
            Divider()
            Button("Add Local Repository…") {
                store.showPopup(.addRepository(path: nil))
            }
            .keyboardShortcut("o", modifiers: .command)
            Button("Clone Repository…") {
                store.showPopup(.cloneRepository(initialURL: nil))
            }
            .keyboardShortcut("O", modifiers: [.command, .shift])
        }

        // MARK: Edit (standard + Find/Select All routed in-app)
        CommandGroup(replacing: .pasteboard) {
            Button("Undo") { NSApp.sendAction(#selector(UndoManager.undo), to: nil, from: nil) }
                .keyboardShortcut("z", modifiers: .command)
            Button("Redo") { NSApp.sendAction(#selector(UndoManager.redo), to: nil, from: nil) }
                .keyboardShortcut("Z", modifiers: [.command, .shift])
            Divider()
            Button("Cut") { NSApp.sendAction(#selector(NSText.cut(_:)), to: nil, from: nil) }
                .keyboardShortcut("x", modifiers: .command)
            Button("Copy") { NSApp.sendAction(#selector(NSText.copy(_:)), to: nil, from: nil) }
                .keyboardShortcut("c", modifiers: .command)
            Button("Paste") { NSApp.sendAction(#selector(NSText.paste(_:)), to: nil, from: nil) }
                .keyboardShortcut("v", modifiers: .command)
            Button("Select All") { GitDesktopMenuAction.post(.selectAll) }
                .keyboardShortcut("a", modifiers: .command)
            Divider()
            Button("Find…") { GitDesktopMenuAction.post(.findInDiff) }
                .keyboardShortcut("f", modifiers: .command)
        }

        // MARK: View
        CommandMenu("View") {
            Button("Show Changes") { GitDesktopMenuAction.post(.showChanges) }
                .keyboardShortcut("1", modifiers: .command)
            Button("Show History") { GitDesktopMenuAction.post(.showHistory) }
                .keyboardShortcut("2", modifiers: .command)
            Button("Show Repository List") { GitDesktopMenuAction.post(.chooseRepository) }
                .keyboardShortcut("t", modifiers: .command)
            Button("Show Branches List") { GitDesktopMenuAction.post(.showBranches) }
                .keyboardShortcut("b", modifiers: .command)
            Button("Show Worktrees List") { GitDesktopMenuAction.post(.showWorktrees) }
                .keyboardShortcut("w", modifiers: [.command, .option])
            Divider()
            Button("Go to Summary") { GitDesktopMenuAction.post(.goToCommitMessage) }
                .keyboardShortcut("g", modifiers: .command)
            Button("Show Stashed Changes") { GitDesktopMenuAction.post(.toggleStashedChanges) }
                .keyboardShortcut("h", modifiers: .control)
            Button("Toggle Changes Filter") { GitDesktopMenuAction.post(.toggleChangesFilter) }
                .keyboardShortcut("l", modifiers: .command)
            Button("Toggle Full Screen") { NSApp.keyWindow?.toggleFullScreen(nil) }
            Divider()
            Button("Reset Zoom") { resetZoom() }
                .keyboardShortcut("0", modifiers: .command)
            Button("Zoom In") { zoom(by: 1) }
                .keyboardShortcut("=", modifiers: .command)
            Button("Zoom Out") { zoom(by: -1) }
                .keyboardShortcut("-", modifiers: .command)
            Divider()
            Button("Expand Active Resizable") { resizeActivePane(by: paneResizeStep) }
                .keyboardShortcut("9", modifiers: .command)
            Button("Contract Active Resizable") { resizeActivePane(by: -paneResizeStep) }
                .keyboardShortcut("8", modifiers: .command)
        }

        // MARK: Repository (no GH/editor/shell items)
        CommandMenu("Repository") {
            Button("Push") { GitDesktopMenuAction.post(.push) }
                .keyboardShortcut("p", modifiers: .command)
                .disabled(selectedRepositoryID == nil)
            Button("Pull") { GitDesktopMenuAction.post(.pull) }
                .keyboardShortcut("P", modifiers: [.command, .shift])
                .disabled(selectedRepositoryID == nil)
            Button("Fetch") { GitDesktopMenuAction.post(.fetch) }
                .keyboardShortcut("T", modifiers: [.command, .shift])
                .disabled(selectedRepositoryID == nil)
            Button("Remove…") { removeRepository() }
                .keyboardShortcut(.delete, modifiers: .command)
                .disabled(selectedRepositoryID == nil)
            Divider()
            Button("Show in Finder") { revealInFinder() }
                .keyboardShortcut("F", modifiers: [.command, .shift])
                .disabled(selectedRepositoryID == nil)
            Divider()
            Button("New Worktree…") { newWorktree() }
                .keyboardShortcut("W", modifiers: [.command, .shift])
                .disabled(selectedRepositoryID == nil)
            Divider()
            Button("Repository Settings…") { repositorySettings() }
                .disabled(selectedRepositoryID == nil)
        }

        // MARK: Branch (no PR/compare-on-GitHub items)
        CommandMenu("Branch") {
            Button("New Branch…") { newBranch() }
                .keyboardShortcut("N", modifiers: [.command, .shift])
                .disabled(selectedRepositoryID == nil)
            Button("Rename…") { GitDesktopMenuAction.post(.renameBranch) }
                .keyboardShortcut("R", modifiers: [.command, .shift])
                .disabled(selectedRepositoryID == nil)
            Button("Delete…") { GitDesktopMenuAction.post(.deleteBranch) }
                .keyboardShortcut("D", modifiers: [.command, .shift])
                .disabled(selectedRepositoryID == nil)
            Divider()
            Button("Discard All Changes…") { discardAll() }
                .keyboardShortcut(.delete, modifiers: [.command, .shift])
                .disabled(selectedRepositoryID == nil)
            Button("Stash All Changes…") { GitDesktopMenuAction.post(.stashAllChanges) }
                .keyboardShortcut("S", modifiers: [.command, .shift])
                .disabled(selectedRepositoryID == nil)
            Divider()
            Button("Update from Default Branch") { GitDesktopMenuAction.post(.updateFromDefault) }
                .keyboardShortcut("U", modifiers: [.command, .shift])
                .disabled(selectedRepositoryID == nil)
            Button("Compare to Branch") { GitDesktopMenuAction.post(.compareToBranch) }
                .keyboardShortcut("B", modifiers: [.command, .shift])
                .disabled(selectedRepositoryID == nil)
            Button("Merge into Current Branch…") { GitDesktopMenuAction.post(.mergeIntoCurrent) }
                .keyboardShortcut("M", modifiers: [.command, .shift])
                .disabled(selectedRepositoryID == nil)
            Button("Squash and Merge into Current Branch…") { GitDesktopMenuAction.post(.squashAndMerge) }
                .keyboardShortcut("H", modifiers: [.command, .shift])
                .disabled(selectedRepositoryID == nil)
            Button("Rebase Current Branch…") { GitDesktopMenuAction.post(.rebaseCurrent) }
                .keyboardShortcut("E", modifiers: [.command, .shift])
                .disabled(selectedRepositoryID == nil)
            Divider()
            Button("Create Tag…") { GitDesktopMenuAction.post(.createTag) }
                .disabled(selectedRepositoryID == nil)
        }

        // MARK: Window / Help
        CommandGroup(after: .appSettings) {
            Button("Install Command Line Tool…") {
                do {
                    try CLIService.installShim()
                    store.showPopup(.cliInstalled)
                } catch {
                    store.showPopup(.error(message: "Could not install the command line tool: \(error.localizedDescription)"))
                }
            }
            Button("Check for Updates…") {
                updater.checkForUpdates(userInitiated: true)
            }
        }
        CommandGroup(replacing: .help) {
            Button("GitDesktop Help") { store.showPopup(.about) }
            Button("Keyboard Shortcuts") { store.showPopup(.shortcuts) }
            Button("Show Logs in Finder") { LogService.revealLogs() }
            Divider()
            Button("Release Notes") { store.showPopup(.releaseNotes) }
            Button("Acknowledgements") { store.showPopup(.acknowledgements) }
        }
    }

    // MARK: - Handlers

    private func removeRepository() {
        guard let repo = store.selectedRepository else { return }
        if Defaults.bool(Defaults.confirmRepoRemoval, default: true) {
            store.showPopup(.removeRepository(repositoryID: repo.id))
        } else {
            store.removeRepository(repo)
            store.persistRepositories()
        }
    }

    private func revealInFinder() {
        guard let repo = store.selectedRepository else { return }
        NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: repo.path)])
    }

    private func newWorktree() {
        guard let id = selectedRepositoryID else { return }
        store.showPopup(.addWorktree(repositoryID: id, initialBranchName: nil, initialWorktreeName: nil))
    }

    private func repositorySettings() {
        guard let id = selectedRepositoryID else { return }
        store.showPopup(.repositorySettings(repositoryID: id, initialTab: nil))
    }

    private func newBranch() {
        guard let id = selectedRepositoryID else { return }
        store.showPopup(.createBranch(repositoryID: id, initialName: nil, targetCommitSHA: nil))
    }

    private func discardAll() {
        guard let repo = store.selectedRepository,
              let state = store.repositoryStates[repo.hash]
        else { return }
        store.showPopup(.confirmDiscardChanges(
            repositoryID: repo.id,
            fileIDs: state.workingDirectory.files.map(\.id),
            showDiscardChangesSetting: true,
            discardingAllChanges: true))
    }

    private func resizeActivePane(by delta: Double) {
        // Active resizable today = sidebar (the only persistently-sized,
        // observable pane; NavigationSplitView sidebar width is not
        // observable per Task 2 handoff). Adjust ±5px and persist.
        var widths = store.widths
        widths.sidebar = adjustedPaneWidth(widths.sidebar, by: delta)
        store.widths = widths
        let key = Defaults.sidebarWidth
        UserDefaults.standard.set(widths.sidebar.value, forKey: key)
        let pct = Int((widths.sidebar.value / widths.sidebar.max * 100).rounded())
        AccessibilityAnnouncementModifier.announce("Sidebar width \(pct) percent")
    }

    private func resetZoom() {
        NSApp.keyWindow?.contentView?.enclosingScrollView?.magnification = 1
    }

    private func zoom(by direction: Double) {
        // Dynamic Type + window zoom replace the reference windowZoomFactor
        // steps; menu items nudge the key window magnification.
        guard let view = NSApp.keyWindow?.contentView else { return }
        let scroll = view.enclosingScrollView
        let current = Double(scroll?.magnification ?? 1)
        let next = min(2.0, max(0.67, current + direction * 0.1))
        scroll?.magnification = CGFloat(next)
    }
}
