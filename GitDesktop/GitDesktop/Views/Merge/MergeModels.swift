import Foundation

// MARK: - MergeModels
// Pure merge/conflict types + wizard reducer.
// Ports `lib/git/merge.ts` (`MergeResult`), `models/merge.ts`
// (`MergeTreeResult` lives in HistoryState), `models/manual-conflict-resolution.ts`,
// `ui/lib/conflicts/*` summary rules and the merge half of
// `models/multi-commit-operation.ts` (Copilot steps deleted per scope).

/// Outcome of `git merge`. Port of `MergeResult` in `lib/git/merge.ts`.
public enum MergeResult: Sendable, Equatable {
    case success
    case alreadyUpToDate
    case failed
}

/// Options for a merge invocation. Port of `MergeOptions`.
public struct MergeOptions: Sendable, Equatable {
    public var squash: Bool
    public var noVerify: Bool

    public init(squash: Bool = false, noVerify: Bool = false) {
        self.squash = squash
        self.noVerify = noVerify
    }

    var gitArgsSuffix: [String] {
        var args: [String] = []
        if squash { args.append("--squash") }
        if noVerify { args.append("--no-verify") }
        return args
    }
}

// NOTE: `ManualConflictResolution` (ours/theirs) already lives in
// `Models/Author.swift` (Task 1 port of `manual-conflict-resolution.ts`)
// and is reused here; its raw values feed `git checkout --ours/--theirs`.

/// Display status of one unmerged file. Derived from `AppFileStatus`:
/// `.conflictedWithMarkers` → markers row, `.manualConflict` → manual row.
public enum ConflictedFileStatus: Sendable, Equatable {
    case markers(conflictCount: Int)
    case manual(summary: String)
    case resolved

    public static func from(appStatus: AppFileStatus) -> ConflictedFileStatus? {
        switch appStatus {
        case .conflictedWithMarkers(_, _, _, let markerCount, _):
            return .markers(conflictCount: textConflictCount(markerCount: markerCount))
        case .manualConflict(let action, _, _, _):
            return .manual(summary: manualConflictSummary(action))
        case .new, .modified, .deleted, .copied, .renamed, .untracked:
            return .resolved
        }
    }
}

public func manualConflictSummary(_ action: UnmergedEntrySummary) -> String {
    switch action {
    case .addedByUs: return "Added by us"
    case .deletedByUs: return "Deleted by us"
    case .addedByThem: return "Added by them"
    case .deletedByThem: return "Deleted by them"
    case .bothDeleted: return "Deleted by both"
    case .bothAdded: return "Added by both"
    case .bothModified: return "Modified by both"
    }
}

/// One row in the conflicts dialog / unmerged-files list.
public struct UnmergedFileEntry: Sendable, Equatable, Identifiable {
    public var path: String
    public var status: ConflictedFileStatus
    public var manualResolution: ManualConflictResolution?

    public init(path: String, status: ConflictedFileStatus, manualResolution: ManualConflictResolution? = nil) {
        self.path = path
        self.status = status
        self.manualResolution = manualResolution
    }

    public var id: String { path }
    public var isResolved: Bool {
        if case .resolved = status { return true }
        return manualResolution != nil
    }
}

public func unmergedFilesSummary(count: Int) -> String {
    count == 1 ? "1 conflicted file" : "\(count) conflicted files"
}

// MARK: Merge wizard state machine

/// Simplified merge wizard steps (choose → progress → conflicts → done).
/// Rebase/cherry-pick/squash steps live in Task 6; the step names mirror
/// `MultiCommitOperationStepKind` so later tasks can unify them.
public enum MergeWizardStep: Sendable, Equatable {
    case chooseBranch
    case showProgress
    case showConflicts
    case hideConflicts
    case confirmAbort(hasResolvedConflicts: Bool)
    case done(result: MergeResult)
}

public struct MergeWizardState: Sendable, Equatable {
    public var step: MergeWizardStep
    public var ourBranchName: String
    public var theirBranchName: String?
    public var isSquash: Bool
    public var unmergedFiles: [UnmergedFileEntry]
    public var progress: ProgressPayload?

    public init(
        step: MergeWizardStep = .chooseBranch,
        ourBranchName: String = "",
        theirBranchName: String? = nil,
        isSquash: Bool = false,
        unmergedFiles: [UnmergedFileEntry] = [],
        progress: ProgressPayload? = nil
    ) {
        self.step = step
        self.ourBranchName = ourBranchName
        self.theirBranchName = theirBranchName
        self.isSquash = isSquash
        self.unmergedFiles = unmergedFiles
        self.progress = progress
    }

    public var remainingConflicts: Int {
        unmergedFiles.filter { !$0.isResolved }.count
    }

    public var allResolved: Bool {
        !unmergedFiles.isEmpty && remainingConflicts == 0
    }
}

public enum MergeWizardAction: Sendable, Equatable {
    case chooseBranch(name: String, squash: Bool)
    case mergeStarted
    case mergeProgress(ProgressPayload)
    case mergeSucceeded(MergeResult)
    case mergeConflicted(files: [UnmergedFileEntry])
    case resolveFile(path: String, resolution: ManualConflictResolution)
    case markMarkersResolved(path: String)
    case undoFileResolution(path: String)
    case hideConflicts
    case reopenConflicts
    case requestAbort
    case cancelAbort
    case confirmAbort
    case aborted
    case reset
}

public func mergeWizardReduce(_ state: MergeWizardState, _ action: MergeWizardAction) -> MergeWizardState {
    var next = state
    switch action {
    case .chooseBranch(let name, let squash):
        next.theirBranchName = name
        next.isSquash = squash
    case .mergeStarted:
        next.step = .showProgress
        next.progress = ProgressPayload(value: 0, title: "Merging…")
    case .mergeProgress(let payload):
        next.progress = payload
    case .mergeSucceeded(let result):
        next.step = .done(result: result)
        next.progress = nil
    case .mergeConflicted(let files):
        next.unmergedFiles = files
        next.step = .showConflicts
        next.progress = nil
    case .resolveFile(let path, let resolution):
        if let index = next.unmergedFiles.firstIndex(where: { $0.path == path }) {
            next.unmergedFiles[index].manualResolution = resolution
        }
    case .markMarkersResolved(let path):
        if let index = next.unmergedFiles.firstIndex(where: { $0.path == path }) {
            next.unmergedFiles[index].status = .resolved
            next.unmergedFiles[index].manualResolution = nil
        }
    case .undoFileResolution(let path):
        if let index = next.unmergedFiles.firstIndex(where: { $0.path == path }) {
            next.unmergedFiles[index].manualResolution = nil
        }
    case .hideConflicts:
        if case .showConflicts = next.step { next.step = .hideConflicts }
    case .reopenConflicts:
        next.step = .showConflicts
    case .requestAbort:
        next.step = .confirmAbort(hasResolvedConflicts: next.allResolved || next.unmergedFiles.contains(where: { $0.isResolved }))
    case .cancelAbort:
        next.step = next.unmergedFiles.isEmpty ? .showProgress : .showConflicts
    case .confirmAbort, .aborted:
        next = MergeWizardState(ourBranchName: state.ourBranchName)
    case .reset:
        next = MergeWizardState(ourBranchName: state.ourBranchName)
    }
    return next
}
