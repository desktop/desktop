import SwiftUI

// MARK: - WorktreeList
// Port of `electron/app/src/ui/worktrees/worktree-list.tsx` +
// `worktree-list-item.tsx` (see Docs/07-branches-operations.md §5).
// Groups: Main | Linked. Row height 30, filter box, New button, context menu
// (Rename / Delete / Reveal in Finder). Click switches worktrees (state
// transfer is handled by the caller via `onSwitch`).

public struct WorktreeList: View {
    public var worktrees: [WorktreeEntry]
    public var currentPath: String?
    public var filterText: String
    public var canCreateNewWorktree: Bool
    public var onFilterChanged: (String) -> Void
    public var onSwitch: (WorktreeEntry) -> Void
    public var onCreateNew: () -> Void
    public var onRename: (WorktreeEntry) -> Void
    public var onDelete: (WorktreeEntry) -> Void
    public var onRevealInFinder: (WorktreeEntry) -> Void

    public init(
        worktrees: [WorktreeEntry] = [],
        currentPath: String? = nil,
        filterText: String = "",
        canCreateNewWorktree: Bool = true,
        onFilterChanged: @escaping (String) -> Void = { _ in },
        onSwitch: @escaping (WorktreeEntry) -> Void = { _ in },
        onCreateNew: @escaping () -> Void = {},
        onRename: @escaping (WorktreeEntry) -> Void = { _ in },
        onDelete: @escaping (WorktreeEntry) -> Void = { _ in },
        onRevealInFinder: @escaping (WorktreeEntry) -> Void = { _ in }
    ) {
        self.worktrees = worktrees
        self.currentPath = currentPath
        self.filterText = filterText
        self.canCreateNewWorktree = canCreateNewWorktree
        self.onFilterChanged = onFilterChanged
        self.onSwitch = onSwitch
        self.onCreateNew = onCreateNew
        self.onRename = onRename
        self.onDelete = onDelete
        self.onRevealInFinder = onRevealInFinder
    }

    private var filtered: [WorktreeEntry] {
        WorktreeOperations.filter(WorktreeOperations.sortedForDisplay(worktrees), query: filterText)
    }

    private var mainWorktree: WorktreeEntry? {
        filtered.first { $0.type == .main }
    }

    private var linkedWorktrees: [WorktreeEntry] {
        filtered.filter { $0.type == .linked }
    }

    public var body: some View {
        VStack(spacing: 0) {
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                TextField("Filter worktrees", text: Binding(
                    get: { filterText },
                    set: { onFilterChanged($0) }))
                    .textFieldStyle(.plain)
            }
            .padding(8)
            Divider()
            List {
                if let main = mainWorktree {
                    Section("Main Worktree") {
                        WorktreeRow(
                            worktree: main,
                            isCurrent: main.path == currentPath,
                            onSwitch: { onSwitch(main) },
                            onRename: { onRename(main) },
                            onDelete: { onDelete(main) },
                            onRevealInFinder: { onRevealInFinder(main) })
                    }
                }
                if !linkedWorktrees.isEmpty {
                    Section("Linked Worktrees") {
                        ForEach(linkedWorktrees) { worktree in
                            WorktreeRow(
                                worktree: worktree,
                                isCurrent: worktree.path == currentPath,
                                onSwitch: { onSwitch(worktree) },
                                onRename: { onRename(worktree) },
                                onDelete: { onDelete(worktree) },
                                onRevealInFinder: { onRevealInFinder(worktree) })
                        }
                    }
                }
                if filtered.isEmpty {
                    Text("No worktrees found")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }
            .listStyle(.sidebar)
            if canCreateNewWorktree {
                Divider()
                Button("New Worktree", action: onCreateNew)
                    .buttonStyle(.link)
                    .padding(8)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Worktree list")
    }
}

public struct WorktreeRow: View {
    public var worktree: WorktreeEntry
    public var isCurrent: Bool
    public var onSwitch: () -> Void
    public var onRename: () -> Void
    public var onDelete: () -> Void
    public var onRevealInFinder: () -> Void

    public init(
        worktree: WorktreeEntry,
        isCurrent: Bool = false,
        onSwitch: @escaping () -> Void = {},
        onRename: @escaping () -> Void = {},
        onDelete: @escaping () -> Void = {},
        onRevealInFinder: @escaping () -> Void = {}
    ) {
        self.worktree = worktree
        self.isCurrent = isCurrent
        self.onSwitch = onSwitch
        self.onRename = onRename
        self.onDelete = onDelete
        self.onRevealInFinder = onRevealInFinder
    }

    public var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(worktreeDisplayName(worktree))
                        .font(.system(size: 12, weight: isCurrent ? .semibold : .regular))
                        .lineLimit(1)
                    if isCurrent {
                        Text("Current")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 1)
                            .background(Color.accentColor, in: Capsule())
                            .accessibilityLabel("Current worktree")
                    }
                    if worktree.isLocked {
                        Image(systemName: "lock.fill")
                            .foregroundStyle(.secondary)
                            .help("Locked")
                            .accessibilityLabel("Locked worktree")
                    }
                    if worktree.isPrunable {
                        Image(systemName: "trash")
                            .foregroundStyle(.secondary)
                            .help("Prunable")
                            .accessibilityLabel("Prunable worktree")
                    }
                }
                Text(worktreeDescription(worktree))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
        }
        .frame(height: 30)
        .contentShape(Rectangle())
        .onTapGesture(perform: onSwitch)
        .contextMenu {
            Button("Switch to Worktree") { onSwitch() }
            Button("Rename…") { onRename() }
            Button("Reveal in Finder") { onRevealInFinder() }
            Divider()
            Button("Delete…", role: .destructive) { onDelete() }
        }
        .accessibilityLabel("\(worktreeDisplayName(worktree)), \(worktreeDescription(worktree))")
    }
}

#Preview {
    WorktreeList(
        worktrees: [
            WorktreeEntry(path: "/repo", head: "abc1234567890", branch: "refs/heads/main", type: .main, isLocked: false, isPrunable: false),
            WorktreeEntry(path: "/repo-feature", head: "def4567890123", branch: "refs/heads/feature", type: .linked, isLocked: false, isPrunable: false),
            WorktreeEntry(path: "/repo-detached", head: "1234567890abc", branch: nil, type: .linked, isLocked: true, isPrunable: false),
        ],
        currentPath: "/repo")
    .frame(width: 320, height: 400)
}
