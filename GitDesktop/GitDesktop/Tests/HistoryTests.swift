import Foundation

// MARK: - HistoryTests
// Task 5 pure-logic tests in the Task 1 harness style (no test framework so
// the file compiles inside the app target; see Tests/ParserTests.swift).

@MainActor
public enum HistoryTests {
    public struct Failure: Sendable {
        public var test: String
        public var message: String
    }

    private static func check(_ condition: Bool, _ message: String, test: String, failures: inout [Failure]) {
        if !condition {
            failures.append(Failure(test: test, message: message))
        }
    }

    @discardableResult
    public static func runAll() -> Int {
        var failures: [Failure] = []
        testContiguity(&failures)
        testPartitionReachable(&failures)
        testGroupBranches(&failures)
        testFilterBranches(&failures)
        testBranchValidation(&failures)
        testCaseOnlyRename(&failures)
        testMergeTreeCount(&failures)
        testTextConflictCount(&failures)
        testConflictedStatusMapping(&failures)
        testMergeWizardReducer(&failures)
        testManualConflictSummary(&failures)
        testConflictMarkerParsing(&failures)
        testUnmergedEntries(&failures)

        if failures.isEmpty {
            print("HistoryTests: all tests passed")
        } else {
            print("HistoryTests: \(failures.count) failure(s)")
            for failure in failures {
                print("  FAIL [\(failure.test)] \(failure.message)")
            }
        }
        return failures.count
    }

    // MARK: Selection contiguity

    static func testContiguity(_ failures: inout [Failure]) {
        let test = "contiguity"
        let ordered = ["a", "b", "c", "d", "e"]
        check(isContiguousSelection(selectedSHAs: ["b", "c"], orderedSHAs: ordered), "b,c contiguous", test: test, failures: &failures)
        check(isContiguousSelection(selectedSHAs: ["a"], orderedSHAs: ordered), "single contiguous", test: test, failures: &failures)
        check(!isContiguousSelection(selectedSHAs: ["a", "c"], orderedSHAs: ordered), "a,c not contiguous", test: test, failures: &failures)
        check(!isContiguousSelection(selectedSHAs: ["a", "x"], orderedSHAs: ordered), "unknown sha fails", test: test, failures: &failures)
        check(!isContiguousSelection(selectedSHAs: ["a", "a"], orderedSHAs: ordered), "duplicates fail", test: test, failures: &failures)
        check(isContiguousSelection(selectedSHAs: [], orderedSHAs: ordered), "empty is contiguous", test: test, failures: &failures)
        // Order-independent input still detects the run.
        check(isContiguousSelection(selectedSHAs: ["c", "b"], orderedSHAs: ordered), "c,b contiguous regardless of order", test: test, failures: &failures)
    }

    static func testPartitionReachable(_ failures: inout [Failure]) {
        let test = "partition-reachable"
        let (reachable, unreachable) = partitionReachable(
            selectedSHAs: ["a", "b", "c"], shasInDiff: ["a", "c"])
        check(reachable == ["a", "c"], "reachable keeps order", test: test, failures: &failures)
        check(unreachable == ["b"], "unreachable collects rest", test: test, failures: &failures)
    }

    // MARK: Branch grouping / filter

    private static func makeBranch(_ name: String, type: BranchType = .local) -> Branch {
        let prefix = type == .local ? "refs/heads/" : "refs/remotes/"
        return Branch(
            name: name, upstream: nil,
            tip: BranchTip(sha: "sha-\(name)"),
            type: type, ref: "\(prefix)\(name)")
    }

    static func testGroupBranches(_ failures: inout [Failure]) {
        let test = "group-branches"
        let main = makeBranch("main")
        let feature = makeBranch("feature")
        let fix = makeBranch("fix")
        let forkPlumbing = makeBranch("github-desktop-foo/bar", type: .remote)
        let grouped = groupBranches(
            defaultBranch: main, currentBranch: feature,
            allBranches: [main, feature, fix, forkPlumbing],
            recentBranches: [feature])
        check(grouped.default == [main], "default alone", test: test, failures: &failures)
        check(grouped.recent == [feature], "recent excludes default", test: test, failures: &failures)
        check(grouped.other == [fix], "other excludes default+recent+fork plumbing", test: test, failures: &failures)
    }

    static func testFilterBranches(_ failures: inout [Failure]) {
        let test = "filter-branches"
        let branches = [makeBranch("main"), makeBranch("feature/login"), makeBranch("Fix-Bug")]
        check(filterBranches(branches, filterText: "").count == 3, "empty filter returns all", test: test, failures: &failures)
        check(filterBranches(branches, filterText: "fea").map(\.name) == ["feature/login"], "substring filter", test: test, failures: &failures)
        check(filterBranches(branches, filterText: "fix").map(\.name) == ["Fix-Bug"], "case-insensitive filter", test: test, failures: &failures)
    }

    // MARK: Branch name validation

    static func testBranchValidation(_ failures: inout [Failure]) {
        let test = "branch-validation"
        check(validateBranchName("  ", existingNames: []) == .empty, "blank is empty", test: test, failures: &failures)
        check(validateBranchName("feature", existingNames: []) == .ok, "plain name ok", test: test, failures: &failures)
        check(validateBranchName("feature/x", existingNames: []) == .ok, "slash ok", test: test, failures: &failures)
        check(validateBranchName("main", existingNames: ["main"]) == .duplicate, "duplicate detected", test: test, failures: &failures)
        check(validateBranchName("Main", existingNames: ["main"]) == .duplicate, "duplicate is case-insensitive", test: test, failures: &failures)
        if case .invalid = validateBranchName("a..b", existingNames: []) {} else {
            failures.append(Failure(test: test, message: "'..' must be invalid"))
        }
        if case .invalid = validateBranchName("bad name", existingNames: []) {} else {
            failures.append(Failure(test: test, message: "space must be invalid"))
        }
        if case .invalid = validateBranchName("-dash", existingNames: []) {} else {
            failures.append(Failure(test: test, message: "leading dash must be invalid"))
        }
        if case .invalid = validateBranchName("x.lock", existingNames: []) {} else {
            failures.append(Failure(test: test, message: "'.lock' suffix must be invalid"))
        }
    }

    static func testCaseOnlyRename(_ failures: inout [Failure]) {
        let test = "case-only-rename"
        check(isCaseOnlyRename(from: "Feature", to: "feature"), "case-only detected", test: test, failures: &failures)
        check(!isCaseOnlyRename(from: "main", to: "main"), "identical is not case-only", test: test, failures: &failures)
        check(!isCaseOnlyRename(from: "main", to: "dev"), "different name is not case-only", test: test, failures: &failures)
    }

    // MARK: Merge-tree / conflicts

    static func testMergeTreeCount(_ failures: inout [Failure]) {
        let test = "merge-tree-count"
        check(mergeTreeConflictedFileCount(stdout: "tree-id\0") == 0, "clean tree has no conflicts", test: test, failures: &failures)
        check(mergeTreeConflictedFileCount(stdout: "tree-id\0a.swift\0b.swift\0") == 2, "two conflicted files", test: test, failures: &failures)
        check(mergeTreeConflictedFileCount(stdout: "") == 0, "empty output is clean", test: test, failures: &failures)
    }

    static func testTextConflictCount(_ failures: inout [Failure]) {
        let test = "text-conflict-count"
        check(textConflictCount(markerCount: 0) == 0, "0 markers", test: test, failures: &failures)
        check(textConflictCount(markerCount: 3) == 1, "3 markers = 1 conflict", test: test, failures: &failures)
        check(textConflictCount(markerCount: 4) == 2, "ceil(4/3) = 2", test: test, failures: &failures)
        check(textConflictCount(markerCount: 6) == 2, "6 markers = 2 conflicts", test: test, failures: &failures)
    }

    static func testConflictedStatusMapping(_ failures: inout [Failure]) {        let test = "conflicted-status"
        let markers = ConflictedFileStatus.from(
            appStatus: .conflictedWithMarkers(
                action: .bothModified, us: .updatedButUnmerged,
                them: .updatedButUnmerged, conflictMarkerCount: 6,
                submoduleStatus: nil))
        check(markers == .markers(conflictCount: 2), "markers map with ceil count", test: test, failures: &failures)
        let manual = ConflictedFileStatus.from(
            appStatus: .manualConflict(
                action: .deletedByThem, us: .modified,
                them: .deleted, submoduleStatus: nil))
        if case .manual = manual {} else {
            failures.append(Failure(test: test, message: "manual conflict maps to .manual"))
        }
        let resolved = ConflictedFileStatus.from(appStatus: .modified(submoduleStatus: nil))
        check(resolved == .resolved, "non-conflict maps to resolved", test: test, failures: &failures)
        var entry = UnmergedFileEntry(path: "a.swift", status: .manual(summary: "Deleted by them"))
        check(!entry.isResolved, "manual without resolution is unresolved", test: test, failures: &failures)
        entry.manualResolution = .ours
        check(entry.isResolved, "manual with resolution is resolved", test: test, failures: &failures)
    }

    static func testManualConflictSummary(_ failures: inout [Failure]) {
        let test = "manual-summary"
        check(manualConflictSummary(.deletedByThem) == "Deleted by them", "deleted-by-them", test: test, failures: &failures)
        check(manualConflictSummary(.bothAdded) == "Added by both", "both-added", test: test, failures: &failures)
    }

    // MARK: Wizard reducer
    static func testMergeWizardReducer(_ failures: inout [Failure]) {
        let test = "merge-wizard"
        var state = MergeWizardState(ourBranchName: "main")
        state = mergeWizardReduce(state, .chooseBranch(name: "feature", squash: false))
        check(state.theirBranchName == "feature", "choose stores branch", test: test, failures: &failures)
        state = mergeWizardReduce(state, .mergeStarted)
        check(state.step == .showProgress, "started → progress", test: test, failures: &failures)
        let files = [
            UnmergedFileEntry(path: "a.swift", status: .markers(conflictCount: 1)),
            UnmergedFileEntry(path: "b.swift", status: .manual(summary: "Deleted by them")),
        ]
        state = mergeWizardReduce(state, .mergeConflicted(files: files))
        check(state.step == .showConflicts, "conflicted → showConflicts", test: test, failures: &failures)
        check(state.remainingConflicts == 2, "two remaining", test: test, failures: &failures)
        state = mergeWizardReduce(state, .resolveFile(path: "b.swift", resolution: .theirs))
        check(state.remainingConflicts == 1, "one remaining after resolve", test: test, failures: &failures)
        state = mergeWizardReduce(state, .markMarkersResolved(path: "a.swift"))
        check(state.allResolved, "all resolved", test: test, failures: &failures)
        state = mergeWizardReduce(state, .undoFileResolution(path: "b.swift"))
        check(!state.allResolved, "undo reopens conflict", test: test, failures: &failures)
        state = mergeWizardReduce(state, .hideConflicts)
        check(state.step == .hideConflicts, "hide works from show", test: test, failures: &failures)
        state = mergeWizardReduce(state, .reopenConflicts)
        check(state.step == .showConflicts, "reopen works", test: test, failures: &failures)
        state = mergeWizardReduce(state, .requestAbort)
        if case .confirmAbort = state.step {} else {
            failures.append(Failure(test: test, message: "requestAbort → confirmAbort"))
        }
        state = mergeWizardReduce(state, .aborted)
        check(state.step == .chooseBranch && state.unmergedFiles.isEmpty, "aborted resets", test: test, failures: &failures)
    }

    // MARK: Conflict-marker parsing + entry building

    static func testConflictMarkerParsing(_ failures: inout [Failure]) {
        let test = "conflict-markers"
        let output = "a.swift:1: leftover conflict marker\nb.swift:3: leftover conflict marker\nb.swift:9: leftover conflict marker\n"
        let counts = ConflictMarkers.parseCounts(stdout: output)
        check(counts == ["a.swift": 1, "b.swift": 2], "counts per path, got \(counts)", test: test, failures: &failures)
        check(ConflictMarkers.parseCounts(stdout: "").isEmpty, "empty output", test: test, failures: &failures)
        check(ConflictMarkers.parseCounts(stdout: "a.swift:1: trailing whitespace\n").isEmpty, "non-marker lines ignored", test: test, failures: &failures)
    }

    static func testUnmergedEntries(_ failures: inout [Failure]) {
        let test = "unmerged-entries"
        let files = [
            WorkingDirectoryFileChange(
                path: "a.swift",
                status: .conflictedWithMarkers(
                    action: .bothModified, us: .updatedButUnmerged,
                    them: .updatedButUnmerged, conflictMarkerCount: 0,
                    submoduleStatus: nil),
                selection: .fromInitialSelection(.all)),
            WorkingDirectoryFileChange(
                path: "b.swift",
                status: .manualConflict(
                    action: .deletedByThem, us: .modified,
                    them: .deleted, submoduleStatus: nil),
                selection: .fromInitialSelection(.all)),
            WorkingDirectoryFileChange(
                path: "c.swift",
                status: .modified(submoduleStatus: nil),
                selection: .fromInitialSelection(.all)),
        ]
        let entries = ConflictMarkers.unmergedEntries(files: files, markerCounts: ["a.swift": 9])
        check(entries.count == 2, "only conflicted files become entries", test: test, failures: &failures)
        check(entries.first(where: { $0.path == "a.swift" })?.status == .markers(conflictCount: 3),
              "diff --check count fills the Task-1 zero", test: test, failures: &failures)
        // Parser-provided counts win over diff --check; zero falls back to it.
        let direct = ConflictMarkers.unmergedEntries(files: [files[0]], markerCounts: ["a.swift": 99])
        check(direct.first?.status == .markers(conflictCount: 33),
              "zero parser count falls back to diff --check (99 markers = 33 conflicts)",
              test: test, failures: &failures)
    }
}
