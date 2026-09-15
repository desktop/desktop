import SwiftUI

// MARK: - BranchList
// Port of `branches/branch-list.tsx` + `branch-list-item.tsx` +
// `branch-renderer.tsx` (minus PR/CI rows). Row height ~30. During a commit
// drag, rows become drop targets that cherry-pick onto the branch (the actual
// cherry-pick runs in Task 6; here we expose `onDropCommits` so the mock flow
// works end to end).

public struct BranchListView: View {
    public static let rowHeight: CGFloat = 30

    var groups: GroupedBranches
    var currentBranch: Branch?
    var filterText: String
    var canCreateNewBranch: Bool
    var isCommitsDragActive: Bool
    var onSelect: ((Branch) -> Void)?
    var onCreateNewBranch: ((String) -> Void)?
    var onRename: ((Branch) -> Void)?
    var onDelete: ((Branch) -> Void)?
    var onCheckoutInNewWorktree: ((Branch) -> Void)?
    var onDropCommits: ((Branch, [String]) -> Void)?

    public init(
        groups: GroupedBranches,
        currentBranch: Branch? = nil,
        filterText: String = "",
        canCreateNewBranch: Bool = true,
        isCommitsDragActive: Bool = false,
        onSelect: ((Branch) -> Void)? = nil,
        onCreateNewBranch: ((String) -> Void)? = nil,
        onRename: ((Branch) -> Void)? = nil,
        onDelete: ((Branch) -> Void)? = nil,
        onCheckoutInNewWorktree: ((Branch) -> Void)? = nil,
        onDropCommits: ((Branch, [String]) -> Void)? = nil
    ) {
        self.groups = groups
        self.currentBranch = currentBranch
        self.filterText = filterText
        self.canCreateNewBranch = canCreateNewBranch
        self.isCommitsDragActive = isCommitsDragActive
        self.onSelect = onSelect
        self.onCreateNewBranch = onCreateNewBranch
        self.onRename = onRename
        self.onDelete = onDelete
        self.onCheckoutInNewWorktree = onCheckoutInNewWorktree
        self.onDropCommits = onDropCommits
    }

    public var body: some View {
        List {
            if !groups.default.isEmpty {
                Section("Default") {
                    ForEach(filtered(groups.default)) { branch in
                        BranchRowView(
                            branch: branch,
                            isCurrentBranch: branch.ref == currentBranch?.ref,
                            filterText: filterText,
                            isCommitsDragActive: isCommitsDragActive,
                            onSelect: { onSelect?(branch) },
                            onRename: { onRename?(branch) },
                            onDelete: { onDelete?(branch) },
                            onCheckoutInNewWorktree: { onCheckoutInNewWorktree?(branch) },
                            onDropCommits: { shas in onDropCommits?(branch, shas) }
                        )
                    }
                }
            }
            if !groups.recent.isEmpty {
                Section("Recent") {
                    ForEach(filtered(groups.recent)) { branch in
                        BranchRowView(
                            branch: branch,
                            isCurrentBranch: branch.ref == currentBranch?.ref,
                            filterText: filterText,
                            isCommitsDragActive: isCommitsDragActive,
                            onSelect: { onSelect?(branch) },
                            onRename: { onRename?(branch) },
                            onDelete: { onDelete?(branch) },
                            onCheckoutInNewWorktree: { onCheckoutInNewWorktree?(branch) },
                            onDropCommits: { shas in onDropCommits?(branch, shas) }
                        )
                    }
                }
            }
            Section(groups.default.isEmpty && groups.recent.isEmpty ? "Branches" : "Other") {
                ForEach(filtered(groups.other)) { branch in
                    BranchRowView(
                        branch: branch,
                        isCurrentBranch: branch.ref == currentBranch?.ref,
                        filterText: filterText,
                        isCommitsDragActive: isCommitsDragActive,
                        onSelect: { onSelect?(branch) },
                        onRename: { onRename?(branch) },
                        onDelete: { onDelete?(branch) },
                        onCheckoutInNewWorktree: { onCheckoutInNewWorktree?(branch) },
                        onDropCommits: { shas in onDropCommits?(branch, shas) }
                    )
                }
            }
            if canCreateNewBranch, !filterText.trimmingCharacters(in: .whitespaces).isEmpty,
               filtered(groups.default).isEmpty,
               filtered(groups.recent).isEmpty,
               filtered(groups.other).isEmpty {
                Button("Create new branch “\(filterText)”") {
                    onCreateNewBranch?(filterText)
                }
                .buttonStyle(.link)
                .accessibilityLabel("Create new branch \(filterText)")
            }
        }
        .listStyle(.sidebar)
    }

    private func filtered(_ branches: [Branch]) -> [Branch] {
        filterBranches(branches, filterText: filterText)
    }
}

public struct BranchRowView: View {
    var branch: Branch
    var isCurrentBranch: Bool
    var filterText: String
    var isCommitsDragActive: Bool
    var onSelect: (() -> Void)?
    var onRename: (() -> Void)?
    var onDelete: (() -> Void)?
    var onCheckoutInNewWorktree: (() -> Void)?
    var onDropCommits: (([String]) -> Void)?
    @State private var isDropTargeted = false

    public init(
        branch: Branch,
        isCurrentBranch: Bool = false,
        filterText: String = "",
        isCommitsDragActive: Bool = false,
        onSelect: (() -> Void)? = nil,
        onRename: (() -> Void)? = nil,
        onDelete: (() -> Void)? = nil,
        onCheckoutInNewWorktree: (() -> Void)? = nil,
        onDropCommits: (([String]) -> Void)? = nil
    ) {
        self.branch = branch
        self.isCurrentBranch = isCurrentBranch
        self.filterText = filterText
        self.isCommitsDragActive = isCommitsDragActive
        self.onSelect = onSelect
        self.onRename = onRename
        self.onDelete = onDelete
        self.onCheckoutInNewWorktree = onCheckoutInNewWorktree
        self.onDropCommits = onDropCommits
    }

    public var body: some View {
        HStack(spacing: 8) {
            Image(systemName: isCurrentBranch ? "checkmark.circle.fill" : "arrow.triangle.branch")
                .foregroundStyle(isCurrentBranch ? .green : .secondary)
                .frame(width: 16)
                .accessibilityHidden(true)
            highlightedName
            Spacer(minLength: 0)
        }
        .frame(height: BranchListView.rowHeight)
        .contentShape(Rectangle())
        .onTapGesture { onSelect?() }
        .background(isDropTargeted ? Color.accentColor.opacity(0.2) : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .contextMenu {
            Button("Rename…") { onRename?() }
            Button("Delete…") { onDelete?() }
            Divider()
            Button("Checkout in new worktree…") { onCheckoutInNewWorktree?() }
        }
        .help(branch.name)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(branch.name)\(isCurrentBranch ? ", current branch" : "")")
        .dropDestination(for: CommitDragPayload.self) { payloads, _ in
            let shas = payloads.flatMap(\.shas)
            guard !shas.isEmpty else { return false }
            onDropCommits?(shas)
            return true
        } isTargeted: { targeted in
            isDropTargeted = targeted
        }
    }

    private var highlightedName: some View {
        let query = filterText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty,
              let range = branch.name.range(of: query, options: [.caseInsensitive, .diacriticInsensitive])
        else {
            return Text(branch.name).font(.callout).eraseToAnyView()
        }
        let before = String(branch.name[..<range.lowerBound])
        let match = String(branch.name[range])
        let after = String(branch.name[range.upperBound...])
        return HStack(spacing: 0) {
            Text(before)
            Text(match).bold().underline()
            Text(after)
        }
        .font(.callout)
        .eraseToAnyView()
    }
}

private extension View {
    func eraseToAnyView() -> AnyView { AnyView(self) }
}
