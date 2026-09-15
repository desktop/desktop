import Foundation

// MARK: - MultiCommitOperation
// Port of `electron/app/src/models/multi-commit-operation.ts`,
// `models/rebase.ts` (`RebaseInternalState`), `models/cherry-pick.ts`
// (`ICherryPickSnapshot`), `models/progress.ts`
// (`IMultiCommitOperationProgress`) and the result enums in
// `lib/git/rebase.ts` (`RebaseResult`) / `lib/git/cherry-pick.ts`
// (`CherryPickResult`).
//
// Copilot conflict steps (`ShowCopilotConflictsLoading/ShowCopilotConflicts`)
// are deleted per scope (see `01-scope.md`); conflicts reuse the Task 5
// unmerged-file rows. Task 5 deliberately owns only the `Merge*` names, so
// the general `MultiCommit*` names live here without collision.

// MARK: Operation kind

/// Type of multi-commit operation. Port of `MultiCommitOperationKind`.
/// Values are capitalized: they are shown to the user verbatim.
public enum MultiCommitOperationKind: String, Sendable, Equatable, CaseIterable {
    case rebase = "Rebase"
    case cherryPick = "Cherry-pick"
    case squash = "Squash"
    case merge = "Merge"
    case reorder = "Reorder"

    /// Gerund used in conflict banners, mirroring each flow's
    /// `conflictDialogOperationPrefix` (`rebase.tsx`, `squash.tsx`,
    /// `reorder.tsx`, `cherry-pick.tsx`).
    public var operationPrefix: String {
        switch self {
        case .rebase: return "rebasing"
        case .cherryPick: return "cherry-picking"
        case .squash: return "squashing commits on"
        case .reorder: return "reordering commits on"
        case .merge: return "merging"
        }
    }

    /// Headline used in the progress dialog title (`progress-dialog.tsx`):
    /// `"<Operation> in progress"`.
    public var progressTitle: String { "\(rawValue) in progress" }
}

// MARK: Progress

/// Per-commit progress of a multi-commit operation.
/// Port of `IMultiCommitOperationProgress`.
public struct MultiCommitProgress: Sendable, Equatable {
    /// Fraction completed, 0...1 (two significant figures, see
    /// `formatRebaseValue`).
    public var value: Double
    /// 1-based index of the commit being applied.
    public var position: Int
    public var totalCommitCount: Int
    public var currentCommitSummary: String

    public init(value: Double, position: Int, totalCommitCount: Int, currentCommitSummary: String) {
        self.value = value
        self.position = position
        self.totalCommitCount = totalCommitCount
        self.currentCommitSummary = currentCommitSummary
    }

    /// Detail line from `progress-dialog.tsx`: `"Commit n of m"`.
    public var detailLine: String { "Commit \(position) of \(totalCommitCount)" }

    /// Maps onto the shared `AppProgress` union (Task 1 `Models/Progress.swift`)
    /// so toolbar/activity consumers can display it.
    public var appProgress: AppProgress {
        .multiCommitOperation(
            currentCommitSummary: currentCommitSummary,
            position: position,
            totalCommitCount: totalCommitCount,
            payload: ProgressPayload(value: value))
    }
}

/// Format a rebase fraction to two significant figures, clamped to 0...1.
/// Port of `formatRebaseValue` in `lib/rebase.ts`.
public func formatRebaseValue(_ value: Double) -> Double {
    (round(clampProgress(value) * 100)) / 100
}

// MARK: Results

/// App-specific results from attempting to rebase. Port of `RebaseResult`.
public enum RebaseResult: String, Sendable, Equatable {
    case completedWithoutError
    case alreadyUpToDate
    case conflictsEncountered
    case outstandingFilesNotStaged
    case aborted
    case error
}

/// App-specific results from attempting to cherry-pick.
/// Port of `CherryPickResult`.
public enum CherryPickResult: String, Sendable, Equatable {
    case completedWithoutError
    case conflictsEncountered
    case outstandingFilesNotStaged
    case unableToStart
    case error
}

// MARK: Operation details

/// Rebase bookkeeping. Port of the rebase half of
/// `MultiCommitOperationDetail` + `RebaseInternalState`.
public struct RebaseDetail: Sendable, Equatable {
    /// Branch providing the new base (the `sourceBranch` picked in the dialog).
    public var baseBranchName: String
    /// Branch being rebased (the checked-out `targetBranch`).
    public var targetBranchName: String
    public var commits: [CommitOneLine]
    /// HEAD of the target branch when the operation started; used for undo.
    /// Port of `currentTip` / `originalBranchTip`.
    public var currentTip: String

    public init(baseBranchName: String, targetBranchName: String, commits: [CommitOneLine] = [], currentTip: String = "") {
        self.baseBranchName = baseBranchName
        self.targetBranchName = targetBranchName
        self.commits = commits
        self.currentTip = currentTip
    }
}

/// Cherry-pick bookkeeping. Port of the cherry-pick half of
/// `MultiCommitOperationDetail` + `ICherryPickSnapshot`.
public struct CherryPickDetail: Sendable, Equatable {
    public var commits: [CommitOneLine]
    /// SHA of the target branch tip before the operation; used for undo
    /// (`git checkout <branch>` + `git reset <sha> --hard`).
    /// Port of `targetBranchUndoSha`.
    public var targetBranchUndoSHA: String
    public var cherryPickedCount: Int
    public var branchCreated: Bool
    public var targetBranchName: String

    public init(
        commits: [CommitOneLine] = [],
        targetBranchUndoSHA: String = "",
        cherryPickedCount: Int = 0,
        branchCreated: Bool = false,
        targetBranchName: String = ""
    ) {
        self.commits = commits
        self.targetBranchUndoSHA = targetBranchUndoSHA
        self.cherryPickedCount = cherryPickedCount
        self.branchCreated = branchCreated
        self.targetBranchName = targetBranchName
    }
}

/// Squash bookkeeping. Port of the squash half of
/// `MultiCommitOperationDetail`.
public struct SquashDetail: Sendable, Equatable {
    /// Commits to fold (never contains `targetCommit`).
    public var commits: [Commit]
    public var targetCommit: Commit?
    /// SHA + `^` of the commit before the squashed range, or nil when the
    /// range includes the root commit (`--root`).
    public var lastRetainedCommitRef: String?
    public var commitMessage: String

    public init(commits: [Commit] = [], targetCommit: Commit? = nil, lastRetainedCommitRef: String? = nil, commitMessage: String = "") {
        self.commits = commits
        self.targetCommit = targetCommit
        self.lastRetainedCommitRef = lastRetainedCommitRef
        self.commitMessage = commitMessage
    }
}

/// Reorder bookkeeping. Port of the reorder half of
/// `MultiCommitOperationDetail`.
public struct ReorderDetail: Sendable, Equatable {
    public var commits: [Commit]
    /// The commits move right before this commit; nil moves them to the end.
    public var beforeCommit: Commit?
    public var lastRetainedCommitRef: String?

    public init(commits: [Commit] = [], beforeCommit: Commit? = nil, lastRetainedCommitRef: String? = nil) {
        self.commits = commits
        self.beforeCommit = beforeCommit
        self.lastRetainedCommitRef = lastRetainedCommitRef
    }
}

/// Union of in-flight operation details. Port of `MultiCommitOperationDetail`
/// (merge case stays with Task 5's `MergeWizardState`).
public enum MultiCommitOperationDetail: Sendable, Equatable {
    case rebase(RebaseDetail)
    case cherryPick(CherryPickDetail)
    case squash(SquashDetail)
    case reorder(ReorderDetail)

    public var kind: MultiCommitOperationKind {
        switch self {
        case .rebase: return .rebase
        case .cherryPick: return .cherryPick
        case .squash: return .squash
        case .reorder: return .reorder
        }
    }

    /// Undo SHA for operations that support undo (cherry-pick/squash/reorder
    /// record the pre-operation tip; rebase undo goes through the reflog and
    /// is not offered here, matching Desktop).
    public var undoSHA: String? {
        switch self {
        case .rebase: return nil
        case .cherryPick(let detail):
            return detail.targetBranchUndoSHA.isEmpty ? nil : detail.targetBranchUndoSHA
        case .squash(let detail): return detail.lastRetainedCommitRef
        case .reorder(let detail): return detail.lastRetainedCommitRef
        }
    }
}

// MARK: Wizard steps

/// Steps of a rebase/cherry-pick/squash/reorder flow.
/// Port of `MultiCommitOperationStepKind` (Copilot steps deleted per scope).
public enum MultiCommitOperationStep: Sendable, Equatable {
    case chooseBranch(kind: MultiCommitOperationKind)
    case warnForcePush(kind: MultiCommitOperationKind)
    case showProgress(kind: MultiCommitOperationKind, progress: MultiCommitProgress?)
    case showConflicts(kind: MultiCommitOperationKind, files: [MultiCommitConflictFile])
    case hideConflicts(kind: MultiCommitOperationKind, files: [MultiCommitConflictFile])
    case confirmAbort(kind: MultiCommitOperationKind, hasResolvedConflicts: Bool)
    case done(kind: MultiCommitOperationKind)

    public var kind: MultiCommitOperationKind {
        switch self {
        case .chooseBranch(let kind): return kind
        case .warnForcePush(let kind): return kind
        case .showProgress(let kind, _): return kind
        case .showConflicts(let kind, _): return kind
        case .hideConflicts(let kind, _): return kind
        case .confirmAbort(let kind, _): return kind
        case .done(let kind): return kind
        }
    }
}

/// One conflicted file in a multi-commit conflicts step. Task 5 owns the rich
/// `UnmergedFileEntry` rows; this lightweight value lets Task 6 compile and
/// drive the same dialog, and converts 1:1 (path + resolved flag).
public struct MultiCommitConflictFile: Sendable, Equatable, Identifiable {
    public var path: String
    public var isResolved: Bool

    public init(path: String, isResolved: Bool = false) {
        self.path = path
        self.isResolved = isResolved
    }

    public var id: String { path }
}

// MARK: Shared rules

/// Whether the operation may start with the current dialog selection.
/// Port of `canStartOperation` in `base-choose-branch-dialog.tsx`.
public func canStartOperation(
    selectedBranch: Branch?,
    currentBranch: Branch,
    commitCount: Int?,
    hasConflictsPreview: Bool,
    isInvalidPreview: Bool
) -> Bool {
    guard let selectedBranch else { return false }
    if selectedBranch.name == currentBranch.name { return false }
    // With conflicts we can always start; they are resolved post-operation.
    if hasConflictsPreview { return true }
    guard let commitCount, commitCount > 0 else { return false }
    return !isInvalidPreview
}

/// Reference for `rebase -i <ref>`: the commit before the earliest commit the
/// operation touches, or nil when the range includes the root commit (caller
/// must then pass `--root`). Port of `getLastRetainedCommitRef` in
/// `commit-list.tsx` (`commitSHAs` is newest-first, as displayed).
public func lastRetainedCommitRef(
    commitSHAs: [String],
    containing shas: [String]
) -> String? {
    let indexes = shas.compactMap { commitSHAs.firstIndex(of: $0) }
    guard !indexes.isEmpty, let maxIndex = indexes.max() else { return nil }
    let lastIndex = commitSHAs.count - 1
    if maxIndex == lastIndex { return nil }
    return "\(commitSHAs[maxIndex])^"
}

/// Abort only asks for confirmation when the user already resolved conflicts
/// (`confirm-abort-dialog.tsx`); otherwise abort is immediate.
public func shouldConfirmAbort(hasResolvedConflicts: Bool) -> Bool {
    hasResolvedConflicts
}

// MARK: Result → Banner mapping

/// Banner for a finished rebase. Mirrors the dispatcher flow:
/// success → `SuccessfulRebase`, up-to-date → `BranchAlreadyUpToDate`,
/// conflicts → `RebaseConflictsFound` (with a token reopening the dialog).
public func rebaseResultBanner(
    _ result: RebaseResult,
    targetBranch: String,
    baseBranch: String?,
    actionToken: UUID = UUID()
) -> Banner? {
    switch result {
    case .completedWithoutError:
        return .successfulRebase(targetBranch: targetBranch, baseBranch: baseBranch)
    case .alreadyUpToDate:
        return .branchAlreadyUpToDate(ourBranch: targetBranch, theirBranch: baseBranch)
    case .conflictsEncountered, .outstandingFilesNotStaged:
        return .rebaseConflictsFound(targetBranch: targetBranch, actionToken: actionToken)
    case .aborted, .error:
        return nil
    }
}

/// Banner for a finished cherry-pick (`successful-cherry-pick.tsx`,
/// `cherry-pick-conflicts-banner.tsx`, `cherry-pick-undone.tsx`).
public func cherryPickResultBanner(
    _ result: CherryPickResult,
    targetBranchName: String,
    count: Int,
    actionToken: UUID = UUID()
) -> Banner? {
    switch result {
    case .completedWithoutError:
        return .successfulCherryPick(targetBranchName: targetBranchName, count: count, actionToken: actionToken)
    case .conflictsEncountered, .outstandingFilesNotStaged:
        return .cherryPickConflictsFound(targetBranchName: targetBranchName, actionToken: actionToken)
    case .unableToStart, .error:
        return nil
    }
}

public func cherryPickUndoneBanner(targetBranchName: String, count: Int) -> Banner {
    .cherryPickUndone(targetBranchName: targetBranchName, countCherryPicked: count)
}

/// Banner for a finished squash (`successful-squash.tsx` + undone variant).
public func squashResultBanner(count: Int, actionToken: UUID = UUID()) -> Banner {
    .successfulSquash(count: count, actionToken: actionToken)
}

public func squashUndoneBanner(count: Int) -> Banner {
    .squashUndone(commitsCount: count)
}

/// Banner for a finished reorder (same success/undone shape as squash).
public func reorderResultBanner(count: Int, actionToken: UUID = UUID()) -> Banner {
    .successfulReorder(count: count, actionToken: actionToken)
}

public func reorderUndoneBanner(count: Int) -> Banner {
    .reorderUndone(commitsCount: count)
}
