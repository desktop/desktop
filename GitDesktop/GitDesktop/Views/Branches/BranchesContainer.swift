import SwiftUI

// MARK: - BranchesContainer
// Port of `branches/branches-container.tsx` (Branches tab only; PR tab and
// PR quick-view deleted per scope). Filter + list + footer merge CTA.
// `hideFilterRow` is honored during a commit drag (Task 6 sets it).

public struct BranchesContainerView: View {
    var allBranches: [Branch]
    var defaultBranch: Branch?
    var currentBranch: Branch?
    var recentBranches: [Branch]
    @Binding var filterText: String
    var canCreateNewBranch: Bool
    var hideFilterRow: Bool
    var isCommitsDragActive: Bool
    var onSelect: ((Branch) -> Void)?
    var onCreateNewBranch: ((String) -> Void)?
    var onRename: ((Branch) -> Void)?
    var onDelete: ((Branch) -> Void)?
    var onCheckoutInNewWorktree: ((Branch) -> Void)?
    var onDropCommits: ((Branch, [String]) -> Void)?
    var onMergeIntoCurrent: (() -> Void)?

    public init(
        allBranches: [Branch],
        defaultBranch: Branch? = nil,
        currentBranch: Branch? = nil,
        recentBranches: [Branch] = [],
        filterText: Binding<String>,
        canCreateNewBranch: Bool = true,
        hideFilterRow: Bool = false,
        isCommitsDragActive: Bool = false,
        onSelect: ((Branch) -> Void)? = nil,
        onCreateNewBranch: ((String) -> Void)? = nil,
        onRename: ((Branch) -> Void)? = nil,
        onDelete: ((Branch) -> Void)? = nil,
        onCheckoutInNewWorktree: ((Branch) -> Void)? = nil,
        onDropCommits: ((Branch, [String]) -> Void)? = nil,
        onMergeIntoCurrent: (() -> Void)? = nil
    ) {
        self.allBranches = allBranches
        self.defaultBranch = defaultBranch
        self.currentBranch = currentBranch
        self.recentBranches = recentBranches
        self._filterText = filterText
        self.canCreateNewBranch = canCreateNewBranch
        self.hideFilterRow = hideFilterRow
        self.isCommitsDragActive = isCommitsDragActive
        self.onSelect = onSelect
        self.onCreateNewBranch = onCreateNewBranch
        self.onRename = onRename
        self.onDelete = onDelete
        self.onCheckoutInNewWorktree = onCheckoutInNewWorktree
        self.onDropCommits = onDropCommits
        self.onMergeIntoCurrent = onMergeIntoCurrent
    }

    private var groups: GroupedBranches {
        let grouped = groupBranches(
            defaultBranch: defaultBranch,
            currentBranch: currentBranch,
            allBranches: allBranches,
            recentBranches: recentBranches)
        if filterText.trimmingCharacters(in: .whitespaces).isEmpty { return grouped }
        return GroupedBranches(
            default: filterBranches(grouped.default, filterText: filterText),
            recent: filterBranches(grouped.recent, filterText: filterText),
            other: filterBranches(grouped.other, filterText: filterText))
    }

    public var body: some View {
        VStack(spacing: 0) {
            if !hideFilterRow {
                HStack(spacing: 6) {
                    Image(systemName: "line.3.horizontal.decrease.circle")
                        .foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                    TextField("Filter branches", text: $filterText)
                        .textFieldStyle(.plain)
                        .accessibilityLabel("Filter branches")
                    if !filterText.isEmpty {
                        Button {
                            filterText = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Clear branch filter")
                    }
                }
                .padding(.horizontal, 8)
                .frame(height: 28)
                .background(Color(nsColor: .controlBackgroundColor))
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .padding(8)
            }

            if groups.isEmpty {
                NoBranchesView(
                    filterText: filterText,
                    canCreateNewBranch: canCreateNewBranch,
                    onCreateNewBranch: onCreateNewBranch
                )
            } else {
                BranchListView(
                    groups: groups,
                    currentBranch: currentBranch,
                    filterText: filterText,
                    canCreateNewBranch: canCreateNewBranch,
                    isCommitsDragActive: isCommitsDragActive,
                    onSelect: onSelect,
                    onCreateNewBranch: onCreateNewBranch,
                    onRename: onRename,
                    onDelete: onDelete,
                    onCheckoutInNewWorktree: onCheckoutInNewWorktree,
                    onDropCommits: onDropCommits
                )
            }

            if let currentBranch, !isCommitsDragActive {
                Divider()
                Button("Merge into \(currentBranch.name)…") {
                    onMergeIntoCurrent?()
                }
                .buttonStyle(.link)
                .padding(8)
                .accessibilityLabel("Merge into \(currentBranch.name)")
            }
        }
    }
}

public struct NoBranchesView: View {
    var filterText: String
    var canCreateNewBranch: Bool
    var onCreateNewBranch: ((String) -> Void)?

    public init(
        filterText: String = "",
        canCreateNewBranch: Bool = true,
        onCreateNewBranch: ((String) -> Void)? = nil
    ) {
        self.filterText = filterText
        self.canCreateNewBranch = canCreateNewBranch
        self.onCreateNewBranch = onCreateNewBranch
    }

    public var body: some View {
        VStack(spacing: 8) {
            Text("Sorry, I can't find that branch")
                .font(.callout)
                .foregroundStyle(.secondary)
            if canCreateNewBranch, !filterText.isEmpty {
                Button("Create new branch") { onCreateNewBranch?(filterText) }
                    .buttonStyle(.borderedProminent)
                Text("ProTip: press ⌘⇧N to create a branch from anywhere.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}
