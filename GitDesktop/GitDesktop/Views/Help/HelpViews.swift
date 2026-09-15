import SwiftUI
import AppKit

// MARK: - Help (Task 9)
// About (extended) / Acknowledgements (full) / ReleaseNotes / Shortcuts / Logs.
// Port of `ui/about/*`, `ui/acknowledgements/*`, `ui/release-notes/*` with
// GH-contributions fetch deleted (local release notes only) and Copilot
// responsible-use line deleted. Help guides are local (no shell.openExternal
// GH URLs); Report Issue uses mailto + log export.

public struct ReleaseNotesDialog: View {
    @ObservedObject var store: AppStore
    var popup: Popup

    public init(store: AppStore, popup: Popup) {
        self.store = store
        self.popup = popup
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Release Notes").font(.headline)
            ScrollView {
                Text(localReleaseNotes)
                    .font(.system(size: 12))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(height: 220)
            HStack {
                Spacer()
                Button("Close") { store.closePopup(popup) }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(20).frame(width: 480)
    }
}

public let localReleaseNotes = """
GitDesktop (native)

• Native macOS shell: toolbar, repository list, foldouts, banners, dialogs.
• Changes + commit box with validation, co-authors, and spellcheck.
• Unified + split diffs, find, image diffs, large-file gates.
• History, branches, merge with conflict UI.
• Rebase, cherry-pick, squash, reorder + commit drag-and-drop.
• Fetch/pull/push with generic + SSH auth and progress.
• Stash, tags, worktrees, submodules, LFS, .gitignore, undo/reset/revert.
• Welcome, tutorial, 5-tab Settings, repository settings, CLI, deeplinks.

Thank you — full acknowledgements ship in the Acknowledgements dialog.
"""

public struct AcknowledgementsFullDialog: View {
    @ObservedObject var store: AppStore
    var popup: Popup

    public init(store: AppStore, popup: Popup) {
        self.store = store
        self.popup = popup
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Acknowledgements").font(.headline)
            ScrollView {
                Text(acknowledgementsText)
                    .font(.system(size: 12))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(height: 220)
            HStack {
                Spacer()
                Button("Close") { store.closePopup(popup) }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(20).frame(width: 480)
    }
}

public let acknowledgementsText = """
GitDesktop stands on the shoulders of open source.

• Git — https://git-scm.com (GPLv2)
• Swift + SwiftUI — Apple
• Reference design: GitHub Desktop (MIT) — UI flows ported, GitHub integration removed.

Full license texts ship with the app bundle.
"""

public struct ShortcutsDialog: View {
    @ObservedObject var store: AppStore
    var popup: Popup

    public init(store: AppStore, popup: Popup) {
        self.store = store
        self.popup = popup
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Keyboard Shortcuts").font(.headline)
            ScrollView {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(shortcutRows, id: \.0) { keys, action in
                        HStack {
                            Text(keys).font(.system(.body, design: .monospaced)).frame(width: 160, alignment: .leading)
                            Text(action).font(.callout)
                        }
                    }
                }
            }
            .frame(height: 220)
            HStack {
                Spacer()
                Button("Close") { store.closePopup(popup) }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(20).frame(width: 480)
    }
}

public let shortcutRows: [(String, String)] = [
    ("⌘N", "New repository"),
    ("⌘O", "Add local repository"),
    ("⌘⇧O", "Clone repository"),
    ("⌘1 / ⌘2", "Changes / History"),
    ("⌃Tab", "Toggle Changes/History"),
    ("⌘G", "Go to Summary"),
    ("⌃H", "Show stashed changes"),
    ("⌘L", "Toggle changes filter"),
    ("⌘↵", "Commit"),
    ("⌘F", "Find in diff"),
    ("⌘A", "Select all"),
    ("⌘P", "Push"),
    ("⌘⇧P", "Pull"),
    ("⌘⇧T", "Fetch"),
    ("⌘⇧F", "Show in Finder"),
    ("⌘⌫", "Remove repository"),
    ("⌘⇧N", "New branch"),
    ("⌘⇧R / ⌘⇧D", "Rename / Delete branch"),
    ("⌘⇧⌫", "Discard all changes"),
    ("⌘⇧S", "Stash all changes"),
    ("⌘⇧M", "Merge into current branch"),
    ("⌘⇧E", "Rebase current branch"),
    ("⌘T / ⌘B", "Repository list / Branches list"),
    ("⌘9 / ⌘8", "Expand / Contract resizable pane"),
    ("⌘0 / ⌘= / ⌘−", "Reset / Zoom in / Zoom out"),
    ("⌘,", "Settings"),
]

public struct TermsDialog: View {
    @ObservedObject var store: AppStore
    var popup: Popup

    public init(store: AppStore, popup: Popup) {
        self.store = store
        self.popup = popup
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Terms and Conditions").font(.headline)
            Text("GitDesktop is a local Git client. It sends no data anywhere unless you fetch, pull, push, or clone. Usage tracking is opt-out in Settings → Advanced.")
                .font(.callout)
            HStack {
                Spacer()
                Button("Decline") { store.closePopup(popup) }.keyboardShortcut(.cancelAction)
                Button("Accept") { store.closePopup(popup) }
                    .keyboardShortcut(.defaultAction).buttonStyle(.borderedProminent)
            }
        }
        .padding(20).frame(width: 420)
    }
}

// MARK: Logs

public enum LogService {
    /// `~/Library/Logs/GitDesktop` (port of the reference Show Logs target).
    public static var logDirectory: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Logs/GitDesktop")
    }

    public static func revealLogs() {
        let dir = logDirectory
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        NSWorkspace.shared.activateFileViewerSelecting([dir])
    }

    /// Export the log directory as a zip path for issue reports.
    /// (Minimal: returns the directory; zipping is Task-10 polish.)
    public static func logDirectoryForExport() -> URL { logDirectory }
}

public struct MoveToApplicationsDialog: View {
    @ObservedObject var store: AppStore
    var popup: Popup
    var onMove: () -> Void
    var onSkip: () -> Void

    public init(store: AppStore, popup: Popup, onMove: @escaping () -> Void = {}, onSkip: @escaping () -> Void = {}) {
        self.store = store
        self.popup = popup
        self.onMove = onMove
        self.onSkip = onSkip
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Move to Applications Folder").font(.headline)
            Text("Move GitDesktop to the Applications folder so it stays available to all users on this Mac?")
                .font(.callout)
            HStack {
                Spacer()
                Button("Skip") {
                    onSkip()
                    store.closePopup(popup)
                }
                .keyboardShortcut(.cancelAction)
                Button("Move") {
                    onMove()
                    store.closePopup(popup)
                }
                .keyboardShortcut(.defaultAction)
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(20).frame(width: 420)
    }
}

public struct CLIInstalledDialog: View {
    @ObservedObject var store: AppStore
    var popup: Popup

    public init(store: AppStore, popup: Popup) {
        self.store = store
        self.popup = popup
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Command Line Tools Installed").font(.headline)
            Text("The `gitdesktop` command is now available in your shell. Use `gitdesktop open <path>` or `gitdesktop clone <url>`.")
                .font(.callout)
            HStack {
                Spacer()
                Button("Close") { store.closePopup(popup) }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(20).frame(width: 420)
    }
}

public struct InstallingUpdateDialog: View {
    @ObservedObject var store: AppStore
    var popup: Popup

    public init(store: AppStore, popup: Popup) {
        self.store = store
        self.popup = popup
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Installing Update").font(.headline)
            Text("GitDesktop is installing an update. Quitting is disabled until it finishes.")
                .font(.callout)
            ProgressView().progressViewStyle(.linear)
            HStack {
                Spacer()
                Button("Close") { store.closePopup(popup) }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(20).frame(width: 400)
    }
}

public struct InstallGitDialog: View {
    @ObservedObject var store: AppStore
    var popup: Popup
    var path: String

    public init(store: AppStore, popup: Popup, path: String) {
        self.store = store
        self.popup = popup
        self.path = path
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Install Command Line Tools").font(.headline)
            Text("Git was not found. Install Xcode Command Line Tools, or point GitDesktop at a git binary via the GIT_PATH environment variable. Expected location: \(path).")
                .font(.callout)
            HStack {
                Spacer()
                Button("Later") { store.closePopup(popup) }.keyboardShortcut(.cancelAction)
                Button("Open Apple Developer") {
                    if let url = URL(string: "https://developer.apple.com/xcode/resources/") {
                        NSWorkspace.shared.open(url)
                    }
                    store.closePopup(popup)
                }
                .keyboardShortcut(.defaultAction)
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(20).frame(width: 460)
    }
}
