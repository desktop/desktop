import SwiftUI

// MARK: - SelectedCommits
// Port of `history/selected-commits.tsx`, `expandable-commit-summary.tsx`,
// `file-list.tsx` and `committed-file-item.tsx`.
// The read-only diff is injected: Task 4 owns the real diff viewer, so this
// file renders `HistoryDiffPlaceholder` by default and accepts any
// `DiffContent` view for later wiring. File double-click reveals in Finder
// (replaces open-in-editor per scope). No GH items.

/// File selection inside the selected-commits pane.
public struct HistoryFileSelection: Sendable, Equatable {
    public var selectedFilePath: String?

    public init(selectedFilePath: String? = nil) {
        self.selectedFilePath = selectedFilePath
    }
}

public struct SelectedCommitsView<DiffContent: View>: View {
    var selectedCommits: [Commit]
    var shasInDiff: Set<String>
    var files: [CommittedFileChange]
    var linesAdded: Int
    var linesDeleted: Int
    var isContiguous: Bool
    var showDragOverlay: Bool
    @Binding var fileSelection: HistoryFileSelection
    var onRevealInFinder: ((String) -> Void)?
    var onCopyPaths: (([String]) -> Void)?
    var onShowUnreachableCommits: (() -> Void)?
    var onHighlightSHAs: (([String]) -> Void)?
    @ViewBuilder var diffContent: (CommittedFileChange?) -> DiffContent

    public init(
        selectedCommits: [Commit],
        shasInDiff: Set<String> = [],
        files: [CommittedFileChange] = [],
        linesAdded: Int = 0,
        linesDeleted: Int = 0,
        isContiguous: Bool = true,
        showDragOverlay: Bool = false,
        fileSelection: Binding<HistoryFileSelection>,
        onRevealInFinder: ((String) -> Void)? = nil,
        onCopyPaths: (([String]) -> Void)? = nil,
        onShowUnreachableCommits: (() -> Void)? = nil,
        onHighlightSHAs: (([String]) -> Void)? = nil,
        @ViewBuilder diffContent: @escaping (CommittedFileChange?) -> DiffContent
    ) {
        self.selectedCommits = selectedCommits
        self.shasInDiff = shasInDiff
        self.files = files
        self.linesAdded = linesAdded
        self.linesDeleted = linesDeleted
        self.isContiguous = isContiguous
        self.showDragOverlay = showDragOverlay
        self._fileSelection = fileSelection
        self.onRevealInFinder = onRevealInFinder
        self.onCopyPaths = onCopyPaths
        self.onShowUnreachableCommits = onShowUnreachableCommits
        self.onHighlightSHAs = onHighlightSHAs
        self.diffContent = diffContent
    }

    public var body: some View {
        ZStack {
            if selectedCommits.isEmpty {
                noCommitSelected
            } else if !isContiguous {
                nonContiguousBlankslate
            } else {
                VStack(spacing: 0) {
                    ExpandableCommitSummaryView(
                        selectedCommits: selectedCommits,
                        shasInDiff: shasInDiff,
                        linesAdded: linesAdded,
                        linesDeleted: linesDeleted,
                        onShowUnreachableCommits: onShowUnreachableCommits,
                        onHighlightSHAs: onHighlightSHAs
                    )
                    Divider()
                    HSplitView {
                        CommittedFileListView(
                            files: files,
                            selection: $fileSelection,
                            onRevealInFinder: onRevealInFinder,
                            onCopyPaths: onCopyPaths
                        )
                        .frame(minWidth: 140, idealWidth: 220)
                        diffContent(selectedFile)
                            .frame(minWidth: 200, maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
            }
            if showDragOverlay {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color.accentColor, lineWidth: 2)
                    .background(Color.accentColor.opacity(0.08))
                    .padding(8)
                    .accessibilityLabel("Drop commits to cherry-pick, squash, or reorder")
            }
        }
    }

    private var selectedFile: CommittedFileChange? {
        guard let path = fileSelection.selectedFilePath else { return files.first }
        return files.first(where: { $0.path == path }) ?? files.first
    }

    private var noCommitSelected: some View {
        VStack(spacing: 8) {
            Text("No commit selected")
                .font(.headline)
            Text("Select a commit from the list to view its changes.")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityLabel("No commit selected")
    }

    private var nonContiguousBlankslate: some View {
        VStack(spacing: 8) {
            Text("No commit selected")
                .font(.headline)
            Text("Select a range of commits to see their combined changes, or a single commit.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Text("Tip: drag commits to cherry-pick, squash, or reorder them. Right-click for more actions.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityLabel("Non-contiguous selection: no diff shown")
    }
}

/// Default read-only diff placeholder. Task 4 replaces this seam with the
/// real `SeamlessDiffSwitcher` in read-only mode.
public struct HistoryDiffPlaceholder: View {
    var file: CommittedFileChange?

    public init(file: CommittedFileChange? = nil) {
        self.file = file
    }

    public var body: some View {
        Group {
            if let file {
                VStack(spacing: 6) {
                    Text(file.path)
                        .font(.callout.weight(.semibold))
                    Text("Diff viewer (Task 4) renders here in read-only mode.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                Text("No files in this commit")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }
}

public struct ExpandableCommitSummaryView: View {
    var selectedCommits: [Commit]
    var shasInDiff: Set<String>
    var linesAdded: Int
    var linesDeleted: Int
    var onShowUnreachableCommits: (() -> Void)?
    var onHighlightSHAs: (([String]) -> Void)?
    @State private var isExpanded = false
    @State private var isOverflowed = false

    public init(
        selectedCommits: [Commit],
        shasInDiff: Set<String> = [],
        linesAdded: Int = 0,
        linesDeleted: Int = 0,
        onShowUnreachableCommits: (() -> Void)? = nil,
        onHighlightSHAs: (([String]) -> Void)? = nil
    ) {
        self.selectedCommits = selectedCommits
        self.shasInDiff = shasInDiff
        self.linesAdded = linesAdded
        self.linesDeleted = linesDeleted
        self.onShowUnreachableCommits = onShowUnreachableCommits
        self.onHighlightSHAs = onHighlightSHAs
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if selectedCommits.count == 1, let commit = selectedCommits.first {
                singleSummary(commit)
            } else {
                multiSummary
            }
        }
        .padding(10)
        .onChange(of: selectedCommits.map(\.sha)) { _, _ in isExpanded = false }
    }

    private func singleSummary(_ commit: Commit) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 8) {
                AvatarStackView(names: [commit.author.name, commit.committer.name])
                VStack(alignment: .leading, spacing: 2) {
                    Text(commit.summary.isEmpty ? "Empty commit message" : commit.summary)
                        .font(.headline)
                        .lineLimit(isExpanded ? nil : 3)
                        .background(GeometryReader { proxy in
                            Color.clear.onAppear {
                                isOverflowed = proxy.size.height >= 50
                            }
                        })
                    if isExpanded, !commit.bodyNoCoAuthors.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text(commit.bodyNoCoAuthors)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 0)
                if isOverflowed || isExpanded {
                    Button(isExpanded ? "Collapse" : "Expand") { isExpanded.toggle() }
                        .buttonStyle(.link)
                        .accessibilityLabel(isExpanded ? "Collapse commit message" : "Expand commit message")
                }
            }
            HStack(spacing: 8) {
                Text(isExpanded ? commit.sha : commit.shortSha)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                Button {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(commit.sha, forType: .string)
                } label: {
                    Image(systemName: "doc.on.doc")
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Copy SHA")
                .help("Copy SHA")
                if !commit.tags.isEmpty {
                    Text(commit.tags.joined(separator: ", "))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if linesAdded > 0 || linesDeleted > 0 {
                    Text("+\(linesAdded) −\(linesDeleted)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            if !commit.coAuthors.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(commit.coAuthors, id: \.email) { author in
                        Text("Co-authored by \(author.name) <\(author.email)>")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            Text("by \(commit.author.name) <\(commit.author.email)>")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var multiSummary: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Showing changes from \(selectedCommits.count) commits")
                .font(.headline)
            let unreachable = selectedCommits.filter { !shasInDiff.contains($0.sha) }
            if !unreachable.isEmpty {
                Button("\(unreachable.count) unreachable commit(s) — why?") {
                    onShowUnreachableCommits?()
                }
                .buttonStyle(.link)
                .onHover { hovering in
                    if hovering { onHighlightSHAs?(unreachable.map(\.sha)) }
                    else { onHighlightSHAs?([]) }
                }
            }
        }
    }
}

public struct AvatarStackView: View {
    var names: [String]

    public init(names: [String]) {
        self.names = Array(Set(names)).sorted().prefix(3).map { $0 }
    }

    public var body: some View {
        HStack(spacing: -6) {
            ForEach(names, id: \.self) { name in
                Text(commitAuthorInitials(name: name))
                    .font(.caption2.weight(.semibold))
                    .frame(width: 24, height: 24)
                    .background(Color(nsColor: .quaternaryLabelColor))
                    .clipShape(Circle())
                    .overlay(Circle().stroke(Color(nsColor: .windowBackgroundColor), lineWidth: 1.5))
            }
        }
        .accessibilityHidden(true)
    }
}

public struct CommittedFileListView: View {
    var files: [CommittedFileChange]
    @Binding var selection: HistoryFileSelection
    var onRevealInFinder: ((String) -> Void)?
    var onCopyPaths: (([String]) -> Void)?

    public init(
        files: [CommittedFileChange],
        selection: Binding<HistoryFileSelection>,
        onRevealInFinder: ((String) -> Void)? = nil,
        onCopyPaths: (([String]) -> Void)? = nil
    ) {
        self.files = files
        self._selection = selection
        self.onRevealInFinder = onRevealInFinder
        self.onCopyPaths = onCopyPaths
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(files.count) changed file(s)")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
            List(files, id: \.id, selection: Binding(
                get: { selection.selectedFilePath },
                set: { selection.selectedFilePath = $0 }
            )) { file in
                CommittedFileRowView(file: file)
                    .tag(file.path as String?)
                    .contextMenu {
                        Button("Reveal in Finder") { onRevealInFinder?(file.path) }
                        Button("Copy path") { onCopyPaths?([file.path]) }
                    }
                    .onTapGesture(count: 2) { onRevealInFinder?(file.path) }
            }
            .listStyle(.plain)
        }
    }
}

public struct CommittedFileRowView: View {
    var file: CommittedFileChange

    public init(file: CommittedFileChange) {
        self.file = file
    }

    public var body: some View {
        HStack(spacing: 8) {
            Image(systemName: statusIcon)
                .foregroundStyle(statusColor)
                .frame(width: 16)
                .accessibilityHidden(true)
            Text(file.path)
                .font(.callout)
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(file.path), \(file.status.kind.rawValue)")
    }

    private var statusIcon: String {
        switch file.status.kind {
        case .new: return "plus.circle"
        case .modified: return "pencil.circle"
        case .deleted: return "minus.circle"
        case .renamed: return "arrow.right.circle"
        case .copied: return "doc.on.doc"
        case .conflicted: return "exclamationmark.triangle"
        case .untracked: return "questionmark.circle"
        }
    }

    private var statusColor: Color {
        switch file.status.kind {
        case .new: return .green
        case .deleted: return .red
        case .modified: return .yellow
        case .renamed: return .blue
        case .copied: return .blue
        case .conflicted: return .orange
        case .untracked: return .secondary
        }
    }
}
