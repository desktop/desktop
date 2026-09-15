import SwiftUI

// MARK: - EmptyStates (Task 10)
// Shared empty-state illustrations + actions per Docs/10-interactions.md §5.
// Ports: `no-changes.tsx` (suggested actions w/ menu shortcuts), multi-select
// "N files selected", no-commit-selected + noncontiguous hints
// (`empty-no-commit.svg`), no-branches, no-remote (`no-remote.tsx` → add
// remote), large-diff gate (`ufo-alert.svg`), empty-file/renamed/whitespace/
// conflict states (§06), missing-repo, no-repos (§04), tutorial welcome/done.
// SF Symbols stand in for the reference SVGs (no binary assets added).

/// Generic illustration + title + detail + actions card.
public struct EmptyStateView: View {
    public var systemIcon: String
    public var title: String
    public var detail: String?
    public var actions: [(label: String, action: () -> Void)]

    public init(
        systemIcon: String,
        title: String,
        detail: String? = nil,
        actions: [(label: String, action: () -> Void)] = []
    ) {
        self.systemIcon = systemIcon
        self.title = title
        self.detail = detail
        self.actions = actions
    }

    public var body: some View {
        VStack(spacing: 8) {
            Spacer(minLength: 0)
            Image(systemName: systemIcon)
                .font(.system(size: 32, weight: .light))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(title)
                .font(.headline)
                .multilineTextAlignment(.center)
            if let detail {
                Text(detail)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 380)
            }
            if !actions.isEmpty {
                HStack(spacing: 12) {
                    ForEach(actions.indices, id: \.self) { index in
                        Button(actions[index].label, action: actions[index].action)
                            .buttonStyle(.link)
                    }
                }
                .padding(.top, 4)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title). \(detail ?? "")")
    }
}

// MARK: - Specific states

/// No local changes (port of `no-changes.tsx`): suggested actions carry
/// their menu shortcuts so keyboard users can discover them.
public struct NoChangesEmptyState: View {
    public var onShowInFinder: () -> Void
    public var onCreateBranch: () -> Void

    public init(onShowInFinder: @escaping () -> Void, onCreateBranch: @escaping () -> Void) {
        self.onShowInFinder = onShowInFinder
        self.onCreateBranch = onCreateBranch
    }

    public var body: some View {
        EmptyStateView(
            systemIcon: "checkmark.circle",
            title: "No local changes",
            detail: "Your working directory is clean. Make some edits, then commit them here.",
            actions: [
                ("Show in Finder (⌘⇧F)", onShowInFinder),
                ("Create a branch (⌘⇧N)", onCreateBranch),
            ])
    }
}

/// Multi-file selection summary ("N files selected").
public struct MultiSelectionEmptyState: View {
    public var count: Int

    public init(count: Int) { self.count = count }

    public var body: some View {
        EmptyStateView(
            systemIcon: "doc.on.doc",
            title: "\(count) files selected",
            detail: "Select a single file to preview its diff, or commit the selection directly.")
    }
}

public struct NoBranchesEmptyState: View {
    public var onCreateBranch: () -> Void

    public init(onCreateBranch: @escaping () -> Void) { self.onCreateBranch = onCreateBranch }

    public var body: some View {
        EmptyStateView(
            systemIcon: "arrow.triangle.branch",
            title: "No branches",
            detail: "Create a branch to start working.",
            actions: [("Create a branch (⌘⇧N)", onCreateBranch)])
    }
}

public struct NoRemoteEmptyState: View {
    public var onAddRemote: () -> Void

    public init(onAddRemote: @escaping () -> Void) { self.onAddRemote = onAddRemote }

    public var body: some View {
        // Port of `no-remote.tsx` → add remote.
        EmptyStateView(
            systemIcon: "icloud.slash",
            title: "No remote configured",
            detail: "Add a remote to fetch, pull, and push.",
            actions: [("Add a remote…", onAddRemote)])
    }
}

/// Large-diff gate (port of the `ufo-alert` large-file state).
public struct LargeDiffEmptyState: View {
    public var path: String
    public var sizeDescription: String
    public var onShowAnyway: () -> Void

    public init(path: String, sizeDescription: String, onShowAnyway: @escaping () -> Void) {
        self.path = path
        self.sizeDescription = sizeDescription
        self.onShowAnyway = onShowAnyway
    }

    public var body: some View {
        EmptyStateView(
            systemIcon: "moon.stars",
            title: "Large file hidden",
            detail: "\(path) (\(sizeDescription)) is too large to preview safely.",
            actions: [("Show anyway", onShowAnyway)])
    }
}

public struct EmptyFileEmptyState: View {
    public var path: String

    public init(path: String) { self.path = path }

    public var body: some View {
        EmptyStateView(
            systemIcon: "doc",
            title: "Empty file",
            detail: "\(path) is empty.")
    }
}

public struct RenamedEmptyState: View {
    public var oldPath: String
    public var newPath: String

    public init(oldPath: String, newPath: String) {
        self.oldPath = oldPath
        self.newPath = newPath
    }

    public var body: some View {
        EmptyStateView(
            systemIcon: "arrow.right.doc.on.clipboard",
            title: "File renamed",
            detail: "\(oldPath) → \(newPath), contents unchanged.")
    }
}
