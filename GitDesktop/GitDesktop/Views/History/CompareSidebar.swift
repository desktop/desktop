import SwiftUI

// MARK: - CompareSidebar
// Port of `history/compare.tsx`: filter box + History/Behind-Ahead modes +
// infinite scroll. The merge CTA is injected so this file stays free of
// merge-wizard logic (see `MergeCallToAction.swift`).

public struct CompareSidebarView<MergeCTA: View>: View {
    var commits: [Commit]
    @Binding var selectedSHAs: Set<String>
    var mode: HistoryMode
    var comparisonMode: ComparisonMode
    var behindCount: Int
    var aheadCount: Int
    @Binding var filterText: String
    var showBranchList: Bool
    var onFilterFocused: (() -> Void)?
    var onFilterCommit: (() -> Void)?
    var onFilterCleared: (() -> Void)?
    var onComparisonModeChanged: ((ComparisonMode) -> Void)?
    var onLoadMore: (() -> Void)?
    var shasToHighlight: Set<String>
    var localCommitSHAs: Set<String>
    var listActions: CommitListActions
    var onSelectionChanged: (([Commit], Bool) -> Void)?
    @ViewBuilder var mergeCTA: () -> MergeCTA

    public init(
        commits: [Commit],
        selectedSHAs: Binding<Set<String>>,
        mode: HistoryMode = .history,
        comparisonMode: ComparisonMode = .behind,
        behindCount: Int = 0,
        aheadCount: Int = 0,
        filterText: Binding<String>,
        showBranchList: Bool = false,
        onFilterFocused: (() -> Void)? = nil,
        onFilterCommit: (() -> Void)? = nil,
        onFilterCleared: (() -> Void)? = nil,
        onComparisonModeChanged: ((ComparisonMode) -> Void)? = nil,
        onLoadMore: (() -> Void)? = nil,
        shasToHighlight: Set<String> = [],
        localCommitSHAs: Set<String> = [],
        listActions: CommitListActions = CommitListActions(),
        onSelectionChanged: (([Commit], Bool) -> Void)? = nil,
        @ViewBuilder mergeCTA: @escaping () -> MergeCTA = { EmptyView() }
    ) {
        self.commits = commits
        self._selectedSHAs = selectedSHAs
        self.mode = mode
        self.comparisonMode = comparisonMode
        self.behindCount = behindCount
        self.aheadCount = aheadCount
        self._filterText = filterText
        self.showBranchList = showBranchList
        self.onFilterFocused = onFilterFocused
        self.onFilterCommit = onFilterCommit
        self.onFilterCleared = onFilterCleared
        self.onComparisonModeChanged = onComparisonModeChanged
        self.onLoadMore = onLoadMore
        self.shasToHighlight = shasToHighlight
        self.localCommitSHAs = localCommitSHAs
        self.listActions = listActions
        self.onSelectionChanged = onSelectionChanged
        self.mergeCTA = mergeCTA
    }

    public var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                Image(systemName: "arrow.triangle.branch")
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                TextField("Filter", text: $filterText)
                    .textFieldStyle(.plain)
                    .accessibilityLabel("Filter commits or branches")
                    .onTapGesture { onFilterFocused?() }
                    .onSubmit { onFilterCommit?() }
                if !filterText.isEmpty {
                    Button {
                        filterText = ""
                        onFilterCleared?()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Clear filter")
                    .keyboardShortcut(.cancelAction)
                }
            }
            .padding(.horizontal, 8)
            .frame(height: 28)
            .background(Color(nsColor: .controlBackgroundColor))
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .padding(8)

            if mode == .compare {
                Picker("Compare", selection: Binding(
                    get: { comparisonMode },
                    set: { onComparisonModeChanged?($0) }
                )) {
                    Text("Behind (\(behindCount))").tag(ComparisonMode.behind)
                    Text("Ahead (\(aheadCount))").tag(ComparisonMode.ahead)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 8)
                .padding(.bottom, 8)
            }

            CommitListView(
                commits: commits,
                selectedSHAs: $selectedSHAs,
                shasToHighlight: shasToHighlight,
                localCommitSHAs: localCommitSHAs,
                emptyMessage: emptyMessage,
                actions: listActions,
                onSelectionChanged: onSelectionChanged,
                onScrollNearBottom: onLoadMore
            )

            if mode == .compare, comparisonMode == .behind {
                Divider()
                mergeCTA()
            }
        }
    }

    private var emptyMessage: String {
        switch mode {
        case .history: return "No commits found"
        case .compare:
            switch comparisonMode {
            case .behind: return "This branch is up to date with the comparison branch"
            case .ahead: return "No commits ahead of the comparison branch"
            }
        }
    }
}
