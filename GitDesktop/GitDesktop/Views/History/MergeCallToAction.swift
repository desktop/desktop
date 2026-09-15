import SwiftUI

// MARK: - MergeCallToAction
// Port of `history/merge-call-to-action.tsx` (plain merge CTA) and
// `merge-call-to-action-with-conflicts.tsx` (operation picker + mergeability
// status). The rebase entry routes to `onStartRebase` — Task 6 owns the rebase
// flow, so this file only exposes the seam.

public enum CompareOperation: String, CaseIterable, Sendable {
    case merge = "Merge"
    case squash = "Squash"
    case rebase = "Rebase"
}

public struct MergeCallToActionView: View {
    var behindCount: Int
    var currentBranchName: String
    var comparisonBranchName: String
    var onMerge: (() -> Void)?

    public init(
        behindCount: Int,
        currentBranchName: String,
        comparisonBranchName: String,
        onMerge: (() -> Void)? = nil
    ) {
        self.behindCount = behindCount
        self.currentBranchName = currentBranchName
        self.comparisonBranchName = comparisonBranchName
        self.onMerge = onMerge
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("This will merge \(behindCount) commit(s) from \(comparisonBranchName) into \(currentBranchName).")
                .font(.callout)
                .foregroundStyle(.secondary)
            Button("Merge into \(currentBranchName)") { onMerge?() }
                .buttonStyle(.borderedProminent)
                .disabled(behindCount == 0)
        }
        .padding(12)
    }
}

public struct MergeCallToActionWithConflictsView: View {
    var mergeStatus: MergeTreeResult
    var commitCount: Int
    var currentBranchName: String
    var comparisonBranchName: String
    @State private var selectedOperation: CompareOperation = .merge
    var onInvoke: ((CompareOperation) -> Void)?

    public init(
        mergeStatus: MergeTreeResult,
        commitCount: Int,
        currentBranchName: String,
        comparisonBranchName: String,
        onInvoke: ((CompareOperation) -> Void)? = nil
    ) {
        self.mergeStatus = mergeStatus
        self.commitCount = commitCount
        self.currentBranchName = currentBranchName
        self.comparisonBranchName = comparisonBranchName
        self.onInvoke = onInvoke
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                statusIcon
                Text(statusMessage)
                    .font(.callout)
            }
            HStack(spacing: 8) {
                Picker("Operation", selection: $selectedOperation) {
                    ForEach(CompareOperation.allCases, id: \.self) { op in
                        Text(op.rawValue).tag(op)
                    }
                }
                .pickerStyle(.menu)
                .labelsHidden()
                Button(invokeLabel) { onInvoke?(selectedOperation) }
                    .buttonStyle(.borderedProminent)
                    .disabled(!canInvoke)
            }
        }
        .padding(12)
    }

    private var canInvoke: Bool {
        guard commitCount > 0 else { return false }
        switch mergeStatus {
        case .loading: return false
        case .invalid: return false
        case .clean: return true
        case .conflicts: return true
        }
    }

    private var invokeLabel: String {
        switch selectedOperation {
        case .merge: return "Merge into \(currentBranchName)"
        case .squash: return "Squash into \(currentBranchName)"
        case .rebase: return "Rebase \(currentBranchName)"
        }
    }

    private var statusMessage: String {
        switch mergeStatus {
        case .loading:
            return "Checking for conflicts…"
        case .clean:
            if selectedOperation == .rebase {
                return "This will rebase \(currentBranchName) on top of \(comparisonBranchName)."
            }
            return "This will merge \(commitCount) commit(s) from \(comparisonBranchName) into \(currentBranchName)."
        case .conflicts(let n):
            return "\(n) conflicted file(s) when merging \(comparisonBranchName) into \(currentBranchName)."
        case .invalid:
            return "These branches have unrelated histories and cannot be merged."
        }
    }

    private var statusIcon: some View {
        Group {
            switch mergeStatus {
            case .loading:
                ProgressView().controlSize(.small)
            case .clean:
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
            case .conflicts:
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
            case .invalid:
                Image(systemName: "xmark.circle.fill").foregroundStyle(.red)
            }
        }
        .accessibilityHidden(true)
    }
}
