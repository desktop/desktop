import SwiftUI

// MARK: - UnmergedFiles
// Port of `ui/lib/conflicts/unmerged-file.tsx` + `render-functions.tsx`,
// `merge-conflicts/commit-conflicts-warning.tsx` and the merge/conflict
// banners (`banners/successful-merge.tsx`, `merge-conflicts-banner.tsx`,
// `branch-already-up-to-date-banner.tsx`, `conflicts-found-banner.tsx`).
// "Open in editor" becomes "Reveal in Finder" per scope.

public struct UnmergedFilesView: View {
    var files: [UnmergedFileEntry]
    var ourBranchName: String
    var theirBranchName: String
    var onUseOurs: ((String) -> Void)?
    var onUseTheirs: ((String) -> Void)?
    var onMarkResolved: ((String) -> Void)?
    var onUndoResolution: ((String) -> Void)?
    var onRevealInFinder: ((String) -> Void)?

    public init(
        files: [UnmergedFileEntry],
        ourBranchName: String = "",
        theirBranchName: String = "",
        onUseOurs: ((String) -> Void)? = nil,
        onUseTheirs: ((String) -> Void)? = nil,
        onMarkResolved: ((String) -> Void)? = nil,
        onUndoResolution: ((String) -> Void)? = nil,
        onRevealInFinder: ((String) -> Void)? = nil
    ) {
        self.files = files
        self.ourBranchName = ourBranchName
        self.theirBranchName = theirBranchName
        self.onUseOurs = onUseOurs
        self.onUseTheirs = onUseTheirs
        self.onMarkResolved = onMarkResolved
        self.onUndoResolution = onUndoResolution
        self.onRevealInFinder = onRevealInFinder
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if files.allSatisfy(\.isResolved), !files.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                        .accessibilityHidden(true)
                    Text("All conflicts resolved")
                        .font(.callout.weight(.semibold))
                }
                .accessibilityLabel("All conflicts resolved")
            } else {
                Text(unmergedFilesSummary(count: files.filter { !$0.isResolved }.count))
                    .font(.headline)
                    .accessibilityLabel(unmergedFilesSummary(count: files.filter { !$0.isResolved }.count))
            }
            ForEach(files) { file in
                UnmergedFileRowView(
                    file: file,
                    ourBranchName: ourBranchName,
                    theirBranchName: theirBranchName,
                    onUseOurs: { onUseOurs?(file.path) },
                    onUseTheirs: { onUseTheirs?(file.path) },
                    onMarkResolved: { onMarkResolved?(file.path) },
                    onUndoResolution: { onUndoResolution?(file.path) },
                    onRevealInFinder: { onRevealInFinder?(file.path) }
                )
            }
        }
    }
}

public struct UnmergedFileRowView: View {
    var file: UnmergedFileEntry
    var ourBranchName: String
    var theirBranchName: String
    var onUseOurs: (() -> Void)?
    var onUseTheirs: (() -> Void)?
    var onMarkResolved: (() -> Void)?
    var onUndoResolution: (() -> Void)?
    var onRevealInFinder: (() -> Void)?

    public init(
        file: UnmergedFileEntry,
        ourBranchName: String = "",
        theirBranchName: String = "",
        onUseOurs: (() -> Void)? = nil,
        onUseTheirs: (() -> Void)? = nil,
        onMarkResolved: (() -> Void)? = nil,
        onUndoResolution: (() -> Void)? = nil,
        onRevealInFinder: (() -> Void)? = nil
    ) {
        self.file = file
        self.ourBranchName = ourBranchName
        self.theirBranchName = theirBranchName
        self.onUseOurs = onUseOurs
        self.onUseTheirs = onUseTheirs
        self.onMarkResolved = onMarkResolved
        self.onUndoResolution = onUndoResolution
        self.onRevealInFinder = onRevealInFinder
    }

    public var body: some View {
        HStack(spacing: 8) {
            statusIcon
            VStack(alignment: .leading, spacing: 2) {
                Text(file.path)
                    .font(.callout)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Text(detailText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                // Task 10: Explain-only (read-only, no auto-apply per scope).
                if !file.isResolved {
                    ExplainConflictButton(path: file.path)
                }
            }
            Spacer(minLength: 0)
            actionMenu
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(Color(nsColor: .controlBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(file.path), \(detailText)")
    }

    private var statusIcon: some View {
        Group {
            switch file.status {
            case .markers:
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
            case .manual:
                Image(systemName: "questionmark.circle.fill").foregroundStyle(.orange)
            case .resolved:
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
            }
        }
        .frame(width: 16)
        .accessibilityHidden(true)
    }

    private var detailText: String {
        switch file.status {
        case .markers(let n):
            if file.manualResolution != nil || isMarkedResolved { return "Resolved" }
            return n == 1 ? "1 conflict" : "\(n) conflicts"
        case .manual(let summary):
            if let resolution = file.manualResolution {
                return "Resolved using \(resolution == .ours ? "ours" : "theirs")"
            }
            return summary
        case .resolved:
            return "Resolved"
        }
    }

    private var isMarkedResolved: Bool {
        if case .resolved = file.status { return true }
        return false
    }

    @ViewBuilder
    private var actionMenu: some View {
        if file.isResolved {
            Button("Undo") { onUndoResolution?() }
                .buttonStyle(.link)
        } else {
            Menu("Resolve") {
                Button("Reveal in Finder") { onRevealInFinder?() }
                Divider()
                switch file.status {
                case .markers:
                    Button("Use ours (\(ourBranchName))") { onUseOurs?() }
                    Button("Use theirs (\(theirBranchName))") { onUseTheirs?() }
                    Divider()
                    Button("Mark as resolved") { onMarkResolved?() }
                case .manual:
                    Button("Use ours (\(ourBranchName))") { onUseOurs?() }
                    Button("Use theirs (\(theirBranchName))") { onUseTheirs?() }
                case .resolved:
                    EmptyView()
                }
            }
            .buttonStyle(.bordered)
        }
    }
}

// MARK: Commit conflicts warning

public struct CommitConflictsWarningView: View {
    var filePaths: [String]
    var onCancel: (() -> Void)?
    var onCommitAnyway: (() -> Void)?

    public init(
        filePaths: [String],
        onCancel: (() -> Void)? = nil,
        onCommitAnyway: (() -> Void)? = nil
    ) {
        self.filePaths = filePaths
        self.onCancel = onCancel
        self.onCommitAnyway = onCommitAnyway
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Confirm committing conflicted files")
                .font(.headline)
            Text("You are about to commit files that still contain conflict markers:")
                .font(.callout)
                .foregroundStyle(.secondary)
            ForEach(filePaths, id: \.self) { path in
                Text(path)
                    .font(.callout.monospaced())
            }
            HStack {
                Spacer()
                Button("Cancel", role: .cancel) { onCancel?() }
                    .keyboardShortcut(.cancelAction)
                Button("Commit anyway") { onCommitAnyway?() }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(16)
        .frame(minWidth: 400)
    }
}

// MARK: Merge / conflict banners

public struct SuccessfulMergeBannerView: View {
    var ourBranch: String
    var theirBranch: String?
    var onDismiss: (() -> Void)?

    public init(ourBranch: String, theirBranch: String? = nil, onDismiss: (() -> Void)? = nil) {
        self.ourBranch = ourBranch
        self.theirBranch = theirBranch
        self.onDismiss = onDismiss
    }

    public var body: some View {
        MergeBannerRow(
            kind: .success,
            message: theirBranch.map { "Successfully merged \($0) into \(ourBranch)." } ?? "Merge succeeded.",
            actions: [("Dismiss", { onDismiss?() })]
        )
    }
}

public struct MergeConflictsBannerView: View {
    var ourBranch: String
    var onViewConflicts: (() -> Void)?

    public init(ourBranch: String, onViewConflicts: (() -> Void)? = nil) {
        self.ourBranch = ourBranch
        self.onViewConflicts = onViewConflicts
    }

    public var body: some View {
        MergeBannerRow(
            kind: .warning,
            message: "Resolve conflicts and commit to merge into \(ourBranch).",
            actions: [("View conflicts", { onViewConflicts?() })]
        )
    }
}

public struct BranchUpToDateBannerView: View {
    var ourBranch: String
    var theirBranch: String?
    var onDismiss: (() -> Void)?

    public init(ourBranch: String, theirBranch: String? = nil, onDismiss: (() -> Void)? = nil) {
        self.ourBranch = ourBranch
        self.theirBranch = theirBranch
        self.onDismiss = onDismiss
    }

    public var body: some View {
        MergeBannerRow(
            kind: .success,
            message: theirBranch.map { "\(ourBranch) is already up to date with \($0)." } ?? "\(ourBranch) is already up to date.",
            actions: [("Dismiss", { onDismiss?() })]
        )
    }
}

public struct ConflictsFoundBannerView: View {
    var operationDescription: String
    var onViewConflicts: (() -> Void)?

    public init(operationDescription: String, onViewConflicts: (() -> Void)? = nil) {
        self.operationDescription = operationDescription
        self.onViewConflicts = onViewConflicts
    }

    public var body: some View {
        MergeBannerRow(
            kind: .warning,
            message: "Resolve conflicts to continue \(operationDescription).",
            actions: [("View conflicts", { onViewConflicts?() })]
        )
    }
}

private struct MergeBannerRow: View {
    enum Kind { case success, warning }
    var kind: Kind
    var message: String
    var actions: [(String, () -> Void)]

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: kind == .success ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .foregroundStyle(kind == .success ? .green : .yellow)
                .accessibilityHidden(true)
            Text(message)
                .font(.callout)
            Spacer(minLength: 0)
            ForEach(actions.indices, id: \.self) { index in
                Button(actions[index].0) { actions[index].1() }
                    .buttonStyle(.link)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(kind == .success ? Color.green.opacity(0.12) : Color.yellow.opacity(0.15))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(message)
    }
}
