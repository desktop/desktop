import Foundation

// MARK: - HistoryState
// Pure state types + helpers for the History tab.
// Ports the non-GitHub subset of `history/compare.tsx`,
// `history/commit-list.tsx`, `history/selected-commits.tsx` and
// `models/computed-action.ts` + `models/merge.ts`.

/// Which main pane the history view shows.
public enum HistoryMode: String, Sendable, Equatable {
    case history
    case compare
}

/// Behind/Ahead tab inside compare mode.
public enum ComparisonMode: Int, Sendable, Equatable {
    case behind = 0
    case ahead = 1
}

/// Mergeability preview for the compare/merge CTA.
/// Port of `ComputedAction` + `MergeTreeResult`.
public enum MergeTreeResult: Sendable, Equatable {
    case loading
    case clean
    case conflicts(conflictedFiles: Int)
    case invalid
}

/// Compare-form state. Port of `ICompareState` (minus PR fields).
public struct CompareState: Sendable, Equatable {
    public var filterText: String
    public var showBranchList: Bool
    public var comparisonMode: ComparisonMode
    public var commitSHAs: [String]
    public var formState: CompareFormState

    public init(
        filterText: String = "",
        showBranchList: Bool = false,
        comparisonMode: ComparisonMode = .behind,
        commitSHAs: [String] = [],
        formState: CompareFormState = .history
    ) {
        self.filterText = filterText
        self.showBranchList = showBranchList
        self.comparisonMode = comparisonMode
        self.commitSHAs = commitSHAs
        self.formState = formState
    }
}

public enum CompareFormState: Sendable, Equatable {
    case history
    case compare(branchName: String)
}

/// Returns true when `selected` forms one contiguous run inside `ordered`.
/// Mirrors the `isContiguous` check in `commit-list.tsx`
/// (sorted desc n, n-1, … with no gaps).
public func isContiguousSelection(selectedSHAs: [String], orderedSHAs: [String]) -> Bool {
    guard !selectedSHAs.isEmpty else { return true }
    let selected = Set(selectedSHAs)
    guard selected.count == selectedSHAs.count else { return false }
    var indices: [Int] = []
    for sha in selected {
        guard let index = orderedSHAs.firstIndex(of: sha) else { return false }
        indices.append(index)
    }
    indices.sort()
    for offset in 1..<indices.count {
        if indices[offset] != indices[offset - 1] + 1 { return false }
    }
    return true
}

/// Partitions a multi-selection into reachable (in-diff) vs unreachable SHAs.
/// `shasInDiff` comes from the ancestry computation; this helper only
/// partitions so it stays pure and testable.
public func partitionReachable(
    selectedSHAs: [String],
    shasInDiff: Set<String>
) -> (reachable: [String], unreachable: [String]) {
    var reachable: [String] = []
    var unreachable: [String] = []
    for sha in selectedSHAs {
        if shasInDiff.contains(sha) { reachable.append(sha) }
        else { unreachable.append(sha) }
    }
    return (reachable, unreachable)
}

/// Counts conflicted files reported by
/// `git merge-tree --write-tree --name-only --no-messages -z`.
/// Output is `<tree-id>\0[<filename>\0]*`.
public func mergeTreeConflictedFileCount(stdout: String) -> Int {
    let nulCount = stdout.filter { $0 == "\0" }.count
    return max(0, nulCount - 1)
}

/// Number of text conflicts implied by a conflict-marker count.
/// Mirrors `unmerged-file.tsx`: `Math.ceil(markers / 3)`.
public func textConflictCount(markerCount: Int) -> Int {
    guard markerCount > 0 else { return 0 }
    return (markerCount + 2) / 3
}

/// Initials for the avatar stack (no GH images per scope).
public func commitAuthorInitials(name: String) -> String {
    let parts = name.split(separator: " ").filter { !$0.isEmpty }
    if parts.isEmpty { return "?" }
    if parts.count == 1 { return String(parts[0].prefix(2)).uppercased() }
    return "\(parts[0].prefix(1))\(parts[1].prefix(1))".uppercased()
}

/// Relative date string for commit rows (system formatter only).
public func relativeDateString(_ date: Date, relativeTo now: Date = Date()) -> String {
    let formatter = RelativeDateTimeFormatter()
    formatter.unitsStyle = .short
    return formatter.localizedString(for: date, relativeTo: now)
}

/// Absolute date string for tooltips.
public func absoluteDateString(_ date: Date) -> String {
    date.formatted(date: .abbreviated, time: .shortened)
}
