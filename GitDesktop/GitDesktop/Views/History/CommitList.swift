import SwiftUI
import UniformTypeIdentifiers

// MARK: - CommitList
// Port of `history/commit-list.tsx` + `commit-list-item.tsx` (minus GH items).
// Row height 50. Multi-select via `List(selection:)` (Shift/Cmd, Home/End/PgUp/Dn
// come from the native list). Drag source uses `CommitDragPayload`
// (`DragType.Commit`); the insertion-point drop + keyboard-reorder mode land in
// Task 6 — the seams (`onDropInsertion`, `keyboardReorderHint`) are stubbed here.

/// Transferable drag payload for commits. Port of `CommitDragData`.
public struct CommitDragPayload: Transferable, Codable, Sendable {
    public var shas: [String]

    public init(shas: [String]) {
        self.shas = shas
    }

    public static var transferRepresentation: some TransferRepresentation {
        CodableRepresentation(contentType: .text)
    }
}

/// Actions available from the commit list context menus.
/// All GH items (`View on GitHub`) are deleted per scope.
public struct CommitListActions: Sendable {
    public var onUndoCommit: ((Commit) -> Void)?
    public var onAmendCommit: ((Commit) -> Void)?
    public var onResetToCommit: ((Commit) -> Void)?
    public var onCheckoutCommit: ((Commit) -> Void)?
    public var onRevertCommit: ((Commit) -> Void)?
    public var onCreateBranch: ((Commit) -> Void)?
    public var onCreateTag: ((String) -> Void)?
    public var onDeleteTag: ((String) -> Void)?
    public var onCherryPick: (([Commit]) -> Void)?
    public var onSquash: (([Commit]) -> Void)?
    public var onReorder: (([Commit]) -> Void)?
    public var onCopySHA: ((String) -> Void)?

    public init(
        onUndoCommit: ((Commit) -> Void)? = nil,
        onAmendCommit: ((Commit) -> Void)? = nil,
        onResetToCommit: ((Commit) -> Void)? = nil,
        onCheckoutCommit: ((Commit) -> Void)? = nil,
        onRevertCommit: ((Commit) -> Void)? = nil,
        onCreateBranch: ((Commit) -> Void)? = nil,
        onCreateTag: ((String) -> Void)? = nil,
        onDeleteTag: ((String) -> Void)? = nil,
        onCherryPick: (([Commit]) -> Void)? = nil,
        onSquash: (([Commit]) -> Void)? = nil,
        onReorder: (([Commit]) -> Void)? = nil,
        onCopySHA: ((String) -> Void)? = nil
    ) {
        self.onUndoCommit = onUndoCommit
        self.onAmendCommit = onAmendCommit
        self.onResetToCommit = onResetToCommit
        self.onCheckoutCommit = onCheckoutCommit
        self.onRevertCommit = onRevertCommit
        self.onCreateBranch = onCreateBranch
        self.onCreateTag = onCreateTag
        self.onDeleteTag = onDeleteTag
        self.onCherryPick = onCherryPick
        self.onSquash = onSquash
        self.onReorder = onReorder
        self.onCopySHA = onCopySHA
    }
}

public struct CommitListView: View {
    public static let rowHeight: CGFloat = 50

    var commits: [Commit]
    @Binding var selectedSHAs: Set<String>
    var shasToHighlight: Set<String>
    var localCommitSHAs: Set<String>
    var canUndoCommits: Bool
    var canAmendCommits: Bool
    var canResetToCommits: Bool
    var emptyMessage: String?
    var actions: CommitListActions
    var onSelectionChanged: (([Commit], Bool) -> Void)?
    var onScrollNearBottom: (() -> Void)?

    public init(
        commits: [Commit],
        selectedSHAs: Binding<Set<String>>,
        shasToHighlight: Set<String> = [],
        localCommitSHAs: Set<String> = [],
        canUndoCommits: Bool = false,
        canAmendCommits: Bool = false,
        canResetToCommits: Bool = false,
        emptyMessage: String? = nil,
        actions: CommitListActions = CommitListActions(),
        onSelectionChanged: (([Commit], Bool) -> Void)? = nil,
        onScrollNearBottom: (() -> Void)? = nil
    ) {
        self.commits = commits
        self._selectedSHAs = selectedSHAs
        self.shasToHighlight = shasToHighlight
        self.localCommitSHAs = localCommitSHAs
        self.canUndoCommits = canUndoCommits
        self.canAmendCommits = canAmendCommits
        self.canResetToCommits = canResetToCommits
        self.emptyMessage = emptyMessage
        self.actions = actions
        self.onSelectionChanged = onSelectionChanged
        self.onScrollNearBottom = onScrollNearBottom
    }

    private var orderedSHAs: [String] { commits.map(\.sha) }

    private var orderedSelection: [Commit] {
        commits.filter { selectedSHAs.contains($0.sha) }
    }

    public var body: some View {
        Group {
            if commits.isEmpty {
                VStack(spacing: 8) {
                    Text(emptyMessage ?? "No commits")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityLabel("No commits")
            } else {
                List(selection: $selectedSHAs) {
                    ForEach(commits) { commit in
                        CommitRowView(
                            commit: commit,
                            isUnpushed: localCommitSHAs.contains(commit.sha),
                            isHighlighted: shasToHighlight.contains(commit.sha)
                        )
                        .tag(commit.sha)
                        .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                        .frame(height: Self.rowHeight)
                        .draggable(CommitDragPayload(shas: selectedSHAs.contains(commit.sha)
                            ? orderedSelection.map(\.sha) : [commit.sha]))
                        .contextMenu {
                            commitContextMenu(for: commit)
                        }
                        .help(commitTooltip(for: commit))
                        .onAppear {
                            // Infinite scroll: near-bottom rows trigger the next batch.
                            if commit.sha == commits.suffix(10).first?.sha {
                                onScrollNearBottom?()
                            }
                        }
                    }
                }
                .listStyle(.plain)
                .onChange(of: selectedSHAs) { _, newValue in
                    let ordered = commits.filter { newValue.contains($0.sha) }
                    let contiguous = isContiguousSelection(
                        selectedSHAs: ordered.map(\.sha),
                        orderedSHAs: orderedSHAs)
                    onSelectionChanged?(ordered, contiguous)
                }
            }
        }
    }

    @ViewBuilder
    private func commitContextMenu(for commit: Commit) -> some View {
        let selection = orderedSelection
        let isSingle = selection.count <= 1
        let target: [Commit] = isSingle ? [commit] : selection

        if isSingle {
            if canAmendCommits, commit.sha == commits.first?.sha {
                Button("Amend this commit") { actions.onAmendCommit?(commit) }
            }
            if canUndoCommits, commit.sha == commits.first?.sha,
               localCommitSHAs.contains(commit.sha) {
                Button("Undo commit") { actions.onUndoCommit?(commit) }
            }
            if canResetToCommits, commit.sha != commits.first?.sha {
                Button("Reset to commit…") { actions.onResetToCommit?(commit) }
            }
            if commit.sha != commits.first?.sha {
                Button("Checkout commit…") { actions.onCheckoutCommit?(commit) }
            }
            Button("Revert this commit") { actions.onRevertCommit?(commit) }
            Divider()
            Button("Create branch from commit…") { actions.onCreateBranch?(commit) }
            Button("Create tag…") { actions.onCreateTag?(commit.sha) }
            if !commit.tags.isEmpty {
                Menu("Delete tag…") {
                    ForEach(commit.tags, id: \.self) { tag in
                        Button(tag) { actions.onDeleteTag?(tag) }
                    }
                }
            }
            Divider()
            Button("Cherry-pick this commit…") { actions.onCherryPick?([commit]) }
            Divider()
            Button("Copy SHA") { actions.onCopySHA?(commit.sha) }
        } else {
            Button("Cherry-pick \(target.count) commits…") { actions.onCherryPick?(target) }
            Button("Squash \(target.count) commits…") { actions.onSquash?(target) }
            Button("Reorder \(target.count) commits…") { actions.onReorder?(target) }
        }
    }

    private func commitTooltip(for commit: Commit) -> String {
        var parts = [
            "\(commit.author.name) <\(commit.author.email)>",
            absoluteDateString(commit.author.date),
        ]
        if localCommitSHAs.contains(commit.sha) {
            parts.append("Unpushed: this commit has not been pushed to the remote yet.")
        }
        return parts.joined(separator: "\n")
    }
}

public struct CommitRowView: View {
    var commit: Commit
    var isUnpushed: Bool
    var isHighlighted: Bool

    public init(commit: Commit, isUnpushed: Bool = false, isHighlighted: Bool = false) {
        self.commit = commit
        self.isUnpushed = isUnpushed
        self.isHighlighted = isHighlighted
    }

    public var body: some View {
        HStack(spacing: 8) {
            Text(commitAuthorInitials(name: commit.author.name))
                .font(.caption2.weight(.semibold))
                .frame(width: 28, height: 28)
                .background(Color(nsColor: .quaternaryLabelColor))
                .clipShape(Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(commit.summary.isEmpty ? "Empty commit message" : commit.summary)
                        .font(.callout)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    if isUnpushed {
                        Text("↑")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.secondary)
                            .accessibilityLabel("Unpushed commit")
                    }
                }
                HStack(spacing: 4) {
                    Text(commit.author.name)
                        .foregroundStyle(.secondary)
                    Text("·")
                        .foregroundStyle(.secondary)
                    Text(relativeDateString(commit.author.date))
                        .foregroundStyle(.secondary)
                    if !commit.tags.isEmpty {
                        ForEach(commit.tags, id: \.self) { tag in
                            Text(tag)
                                .font(.caption2)
                                .padding(.horizontal, 4)
                                .background(Color(nsColor: .quinaryLabelColor))
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                        }
                    }
                }
                .font(.caption)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(isHighlighted ? Color.accentColor.opacity(0.18) : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(commit.summary), by \(commit.author.name), \(relativeDateString(commit.author.date))")
    }
}
