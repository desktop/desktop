import Foundation

// MARK: - MultiCommitTests
// Task 6 unit tests: rebase/cherry-pick progress parsers, result
// classifiers, sequencer readers, squash/reorder todo builders, drop routing
// and wizard rules. Fixtures mirror `electron/app/test/` multi-commit cases
// and the `lib/git/{rebase,cherry-pick,squash,reorder}.ts` sources.
// Same harness style as `Tests/ParserTests.swift` (no test bundle):
// `runAll()` returns the failure count.
@MainActor
public enum MultiCommitTests {
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
        testFormatRebaseValue(&failures)
        testRebaseProgressLine(&failures)
        testCherryPickProgressParser(&failures)
        testResultClassification(&failures)
        testRebaseSnapshot(&failures)
        testSequencerTodo(&failures)
        testSquashTodo(&failures)
        testReorderTodo(&failures)
        testValidationGuards(&failures)
        testLastRetainedCommitRef(&failures)
        testCanStartOperation(&failures)
        testDropRouting(&failures)
        testKeyboardReorder(&failures)
        testBannerMapping(&failures)

        if failures.isEmpty {
            print("MultiCommitTests: all tests passed")
        } else {
            print("MultiCommitTests: \(failures.count) failure(s)")
            for failure in failures {
                print("  FAIL [\(failure.test)] \(failure.message)")
            }
        }
        return failures.count
    }

    // MARK: - Helpers

    static func oneLine(_ sha: String, _ summary: String = "") -> CommitOneLine {
        CommitOneLine(sha: sha, summary: summary.isEmpty ? "commit \(sha)" : summary)
    }

    static func testIdentity() -> CommitIdentity {
        CommitIdentity(
            name: "Ada Lovelace", email: "ada@example.com",
            date: Date(timeIntervalSince1970: 1_700_000_000), tzOffset: 0)
    }

    static func testCommit(sha: String, parents: [String] = ["parent"]) -> Commit {
        let identity = testIdentity()
        return Commit(
            sha: sha, shortSha: String(sha.prefix(7)), summary: "commit \(sha)",
            body: "", author: identity, committer: identity,
            parentSHAs: parents, trailers: [])
    }

    static func testBranch(_ name: String) -> Branch {
        Branch(name: name, upstream: nil, tip: BranchTip(sha: "abc1234"), type: .local, ref: "refs/heads/\(name)")
    }

    // MARK: - formatRebaseValue

    static func testFormatRebaseValue(_ failures: inout [Failure]) {
        let test = "format-rebase-value"
        check(formatRebaseValue(0.5) == 0.5, "0.5 unchanged", test: test, failures: &failures)
        check(formatRebaseValue(1.0 / 3.0) == 0.33, "1/3 → 0.33, got \(formatRebaseValue(1.0 / 3.0))", test: test, failures: &failures)
        check(formatRebaseValue(2.0 / 3.0) == 0.67, "2/3 → 0.67", test: test, failures: &failures)
        check(formatRebaseValue(1.5) == 1.0, "clamped to 1", test: test, failures: &failures)
        check(formatRebaseValue(-0.2) == 0.0, "clamped to 0", test: test, failures: &failures)
    }

    // MARK: - Rebase progress lines

    static func testRebaseProgressLine(_ failures: inout [Failure]) {
        let test = "rebase-progress"
        let commits = [oneLine("a", "First"), oneLine("b", "Second"), oneLine("c", "Third")]
        if let progress = parseRebaseProgressLine("Rebasing (2/3)", commits: commits) {
            check(progress.position == 2, "position 2", test: test, failures: &failures)
            check(progress.totalCommitCount == 3, "total 3", test: test, failures: &failures)
            check(progress.value == 0.67, "value 0.67, got \(progress.value)", test: test, failures: &failures)
            check(progress.currentCommitSummary == "Second", "summary Second", test: test, failures: &failures)
            check(progress.detailLine == "Commit 2 of 3", "detail line", test: test, failures: &failures)
        } else {
            check(false, "Rebasing (2/3) parses", test: test, failures: &failures)
        }
        // Unrelated git output is skipped.
        check(parseRebaseProgressLine("Auto-merging foo.ts", commits: commits) == nil, "conflict line skipped", test: test, failures: &failures)
        check(parseRebaseProgressLine("Rebasing (x/y)", commits: commits) == nil, "malformed skipped", test: test, failures: &failures)
        check(parseRebaseProgressLine(" Rebasing (1/3)", commits: commits) == nil, "leading space rejected", test: test, failures: &failures)
        // Out-of-range position yields an empty summary (mirrors `?.summary ?? ''`).
        if let progress = parseRebaseProgressLine("Rebasing (9/9)", commits: commits) {
            check(progress.currentCommitSummary.isEmpty, "empty summary fallback", test: test, failures: &failures)
        } else {
            check(false, "out-of-range still parses", test: test, failures: &failures)
        }
    }

    // MARK: - Cherry-pick progress parser

    static func testCherryPickProgressParser(_ failures: inout [Failure]) {
        let test = "cherry-pick-progress"
        let commits = [oneLine("a", "First"), oneLine("b", "Second"), oneLine("c", "Third")]
        var parser = CherryPickProgressParser(commits: commits)
        check(parser.parse(line: "  Date: today") == nil, "timestamp skipped", test: test, failures: &failures)
        if let first = parser.parse(line: "[main abc1234] First") {
            check(first.position == 1 && first.totalCommitCount == 3, "1 of 3", test: test, failures: &failures)
            check(first.value == 0.33, "value 0.33, got \(first.value)", test: test, failures: &failures)
            check(first.currentCommitSummary == "First", "summary First", test: test, failures: &failures)
        } else {
            check(false, "first pick parses", test: test, failures: &failures)
        }
        _ = parser.parse(line: "[main def5678] Second")
        if let third = parser.parse(line: "[main ghi9012] Third") {
            check(third.position == 3 && third.value == 1.0, "3 of 3 completes", test: test, failures: &failures)
        } else {
            check(false, "third pick parses", test: test, failures: &failures)
        }
        // Resuming after conflicts starts from the already-picked count.
        var resumed = CherryPickProgressParser(commits: commits, count: 2)
        if let progress = resumed.parse(line: "[main ghi9012] Third") {
            check(progress.position == 3, "resumed position 3", test: test, failures: &failures)
        } else {
            check(false, "resumed pick parses", test: test, failures: &failures)
        }
    }

    // MARK: - Result classification

    static func testResultClassification(_ failures: inout [Failure]) {
        let test = "result-classify"
        check(parseRebaseResult(exitCode: 0, stdout: "Successfully rebased", error: nil) == .completedWithoutError, "rebase success", test: test, failures: &failures)
        check(parseRebaseResult(exitCode: 0, stdout: "Current branch feature is up to date.\n", error: nil) == .alreadyUpToDate, "rebase up-to-date", test: test, failures: &failures)
        check(parseRebaseResult(exitCode: 1, stdout: "", error: .rebaseConflicts) == .conflictsEncountered, "rebase conflicts", test: test, failures: &failures)
        check(parseRebaseResult(exitCode: 1, stdout: "", error: .unresolvedConflicts) == .outstandingFilesNotStaged, "rebase outstanding", test: test, failures: &failures)
        check(parseRebaseResult(exitCode: 128, stdout: "", error: .badRevision) == nil, "rebase unknown → nil", test: test, failures: &failures)

        check(parseCherryPickResult(exitCode: 0, error: nil) == .completedWithoutError, "pick success", test: test, failures: &failures)
        check(parseCherryPickResult(exitCode: 1, error: .mergeConflicts) == .conflictsEncountered, "pick conflicts", test: test, failures: &failures)
        check(parseCherryPickResult(exitCode: 1, error: .conflictModifyDeletedInBranch) == .conflictsEncountered, "pick modify/delete", test: test, failures: &failures)
        check(parseCherryPickResult(exitCode: 1, error: .unresolvedConflicts) == .outstandingFilesNotStaged, "pick outstanding", test: test, failures: &failures)
        check(parseCherryPickResult(exitCode: 128, error: .badRevision) == nil, "pick unknown → nil", test: test, failures: &failures)
    }

    // MARK: - Rebase snapshot

    static func testRebaseSnapshot(_ failures: inout [Failure]) {
        let test = "rebase-snapshot"
        if let snapshot = rebaseSnapshotProgress(msgnumText: "2\n", endText: "5\n", origHead: "aaa\n", onto: "bbb\n") {
            check(snapshot.position == 2 && snapshot.total == 5, "2/5", test: test, failures: &failures)
            check(snapshot.value == 0.4, "value 0.4, got \(snapshot.value)", test: test, failures: &failures)
        } else {
            check(false, "valid snapshot parses", test: test, failures: &failures)
        }
        check(rebaseSnapshotProgress(msgnumText: "x", endText: "5", origHead: "aaa", onto: "bbb") == nil, "bad msgnum → nil", test: test, failures: &failures)
        check(rebaseSnapshotProgress(msgnumText: nil, endText: "5", origHead: "aaa", onto: "bbb") == nil, "missing → nil", test: test, failures: &failures)
        check(rebaseSnapshotProgress(msgnumText: "0", endText: "5", origHead: "aaa", onto: "bbb") == nil, "zero → nil", test: test, failures: &failures)
    }

    // MARK: - Sequencer todo

    static func testSequencerTodo(_ failures: inout [Failure]) {
        let test = "sequencer-todo"
        if let line = parseSequencerTodoLine("pick abc1234 Add thing") {
            check(line == CommitOneLine(sha: "abc1234", summary: "Add thing"), "todo line \(line)", test: test, failures: &failures)
        } else {
            check(false, "todo line parses", test: test, failures: &failures)
        }
        check(parseSequencerTodoLine("pick nospace") == nil, "sha-only rejected", test: test, failures: &failures)
        let todo = "pick aaa First\npick bbb Second\n"
        if let commits = parseSequencerTodo(todo) {
            check(commits.count == 2 && commits[0].sha == "aaa", "todo file", test: test, failures: &failures)
        } else {
            check(false, "todo file parses", test: test, failures: &failures)
        }
        check(parseSequencerTodo("") == nil, "empty todo → nil", test: test, failures: &failures)

        let remaining = [oneLine("c", "Third")]
        if let progress = cherryPickSnapshotProgress(cherryPickedCount: 2, remainingCommits: remaining) {
            check(progress.position == 3 && progress.totalCommitCount == 3, "3 of 3", test: test, failures: &failures)
            check(progress.currentCommitSummary == "Third", "summary", test: test, failures: &failures)
        } else {
            check(false, "snapshot progress", test: test, failures: &failures)
        }
        check(cherryPickSnapshotProgress(cherryPickedCount: 3, remainingCommits: []) == nil, "no remaining → nil", test: test, failures: &failures)
    }

    // MARK: - Squash todo

    static func testSquashTodo(_ failures: inout [Failure]) {
        let test = "squash-todo"
        // History oldest→newest A B C D E; squash A+E onto C → B, A-C-E, D.
        // `log` is newest-first, as `git log` returns it.
        let log = ["E", "D", "C", "B", "A"].map { oneLine($0.lowercased(), "commit \($0)") }
        do {
            let todo = try buildSquashTodo(log: log, toSquashSHAs: ["a", "e"], squashOntoSHA: "c")
            let expected = "pick b commit B\npick a commit A\nsquash c commit C\nsquash e commit E\npick d commit D\n"
            check(todo == expected, "squash order:\n\(todo)", test: test, failures: &failures)
        } catch {
            check(false, "threw \(error)", test: test, failures: &failures)
        }
        do {
            _ = try buildSquashTodo(log: log, toSquashSHAs: [], squashOntoSHA: "c")
            check(false, "empty throws", test: test, failures: &failures)
        } catch let error as MultiCommitValidationError {
            check(error == .noCommits(operation: .squash), "noCommits, got \(error)", test: test, failures: &failures)
        } catch {
            check(false, "wrong error \(error)", test: test, failures: &failures)
        }
        do {
            _ = try buildSquashTodo(log: log, toSquashSHAs: ["c"], squashOntoSHA: "c")
            check(false, "target-in-set throws", test: test, failures: &failures)
        } catch let error as MultiCommitValidationError {
            check(error == .targetIncludedInSquash, "target guard, got \(error)", test: test, failures: &failures)
        } catch {
            check(false, "wrong error \(error)", test: test, failures: &failures)
        }
        do {
            _ = try buildSquashTodo(log: log, toSquashSHAs: ["a"], squashOntoSHA: "zzz")
            check(false, "missing onto throws", test: test, failures: &failures)
        } catch let error as MultiCommitValidationError {
            check(error == .targetNotInLog, "target log guard, got \(error)", test: test, failures: &failures)
        } catch {
            check(false, "wrong error \(error)", test: test, failures: &failures)
        }
    }

    // MARK: - Reorder todo

    static func testReorderTodo(_ failures: inout [Failure]) {
        let test = "reorder-todo"
        // Move A+E before C → B, A, E, C, D.
        let log = ["E", "D", "C", "B", "A"].map { oneLine($0.lowercased(), "commit \($0)") }
        do {
            let todo = try buildReorderTodo(log: log, toMoveSHAs: ["a", "e"], beforeSHA: "c")
            let expected = "pick b commit B\npick a commit A\npick e commit E\npick c commit C\npick d commit D\n"
            check(todo == expected, "reorder order:\n\(todo)", test: test, failures: &failures)
        } catch {
            check(false, "threw \(error)", test: test, failures: &failures)
        }
        // Nil base moves to the end: move B → A, C, D, B.
        let log2 = ["D", "C", "B", "A"].map { oneLine($0.lowercased(), "commit \($0)") }
        do {
            let todo = try buildReorderTodo(log: log2, toMoveSHAs: ["b"], beforeSHA: nil)
            let expected = "pick a commit A\npick c commit C\npick d commit D\npick b commit B\n"
            check(todo == expected, "move to end:\n\(todo)", test: test, failures: &failures)
        } catch {
            check(false, "threw \(error)", test: test, failures: &failures)
        }
        do {
            _ = try buildReorderTodo(log: log, toMoveSHAs: ["a"], beforeSHA: "zzz")
            check(false, "missing base throws", test: test, failures: &failures)
        } catch let error as MultiCommitValidationError {
            check(error == .baseNotInLog, "base log guard, got \(error)", test: test, failures: &failures)
        } catch {
            check(false, "wrong error \(error)", test: test, failures: &failures)
        }
    }

    // MARK: - Validation guards

    static func testValidationGuards(_ failures: inout [Failure]) {
        let test = "validation-guards"
        let merge = testCommit(sha: "merge1", parents: ["a", "b"])
        check(merge.isMergeCommit, "merge fixture", test: test, failures: &failures)
        do {
            try validateSquash(toSquash: [testCommit(sha: "a")], squashOnto: testCommit(sha: "b"))
        } catch {
            check(false, "valid squash throws \(error)", test: test, failures: &failures)
        }
        do {
            try validateSquash(toSquash: [merge], squashOnto: testCommit(sha: "b"))
            check(false, "merge toSquash throws", test: test, failures: &failures)
        } catch let error as MultiCommitValidationError {
            check(error == .mergeCommitInvolved(sha: "merge1"), "merge guard, got \(error)", test: test, failures: &failures)
        } catch {
            check(false, "wrong error \(error)", test: test, failures: &failures)
        }
        do {
            try validateSquash(toSquash: [testCommit(sha: "a")], squashOnto: merge)
            check(false, "merge onto throws", test: test, failures: &failures)
        } catch let error as MultiCommitValidationError {
            check(error == .mergeCommitInvolved(sha: "merge1"), "onto merge guard, got \(error)", test: test, failures: &failures)
        } catch {
            check(false, "wrong error \(error)", test: test, failures: &failures)
        }
        do {
            try validateReorder(toMove: [merge])
            check(false, "merge reorder throws", test: test, failures: &failures)
        } catch let error as MultiCommitValidationError {
            check(error == .mergeCommitInvolved(sha: "merge1"), "reorder merge guard", test: test, failures: &failures)
        } catch {
            check(false, "wrong error \(error)", test: test, failures: &failures)
        }
    }

    // MARK: - lastRetainedCommitRef

    static func testLastRetainedCommitRef(_ failures: inout [Failure]) {
        let test = "last-retained-ref"
        check(lastRetainedCommitRef(commitSHAs: ["a", "b", "c"], containing: ["a", "b"]) == "b^", "mid-range ref", test: test, failures: &failures)
        check(lastRetainedCommitRef(commitSHAs: ["a", "b", "c"], containing: ["c"]) == nil, "root → nil", test: test, failures: &failures)
        check(lastRetainedCommitRef(commitSHAs: ["a", "b", "c"], containing: ["a", "c"]) == nil, "range incl root → nil", test: test, failures: &failures)
        check(lastRetainedCommitRef(commitSHAs: ["a", "b", "c"], containing: []) == nil, "empty → nil", test: test, failures: &failures)
        check(lastRetainedCommitRef(commitSHAs: ["a", "b", "c"], containing: ["zzz"]) == nil, "unknown → nil", test: test, failures: &failures)
    }

    // MARK: - canStartOperation

    static func testCanStartOperation(_ failures: inout [Failure]) {
        let test = "can-start"
        let current = testBranch("feature")
        check(canStartOperation(selectedBranch: nil, currentBranch: current, commitCount: 3, hasConflictsPreview: false, isInvalidPreview: false) == false, "no selection", test: test, failures: &failures)
        check(canStartOperation(selectedBranch: testBranch("feature"), currentBranch: current, commitCount: 3, hasConflictsPreview: false, isInvalidPreview: false) == false, "same branch", test: test, failures: &failures)
        check(canStartOperation(selectedBranch: testBranch("main"), currentBranch: current, commitCount: 0, hasConflictsPreview: false, isInvalidPreview: false) == false, "no commits", test: test, failures: &failures)
        check(canStartOperation(selectedBranch: testBranch("main"), currentBranch: current, commitCount: 0, hasConflictsPreview: true, isInvalidPreview: false) == true, "conflicts always start", test: test, failures: &failures)
        check(canStartOperation(selectedBranch: testBranch("main"), currentBranch: current, commitCount: 3, hasConflictsPreview: false, isInvalidPreview: true) == false, "invalid preview", test: test, failures: &failures)
        check(canStartOperation(selectedBranch: testBranch("main"), currentBranch: current, commitCount: 3, hasConflictsPreview: false, isInvalidPreview: false) == true, "clean start", test: test, failures: &failures)
    }

    // MARK: - Drop routing

    static func testDropRouting(_ failures: inout [Failure]) {
        let test = "drop-routing"
        let ordered = ["a", "b", "c", "d"]

        let branch = routeCommitDrop(draggedSHAs: ["a", "b"], target: .branch(name: "main"))
        check(branch == .cherryPick(branchName: "main", shas: ["a", "b"]), "branch → cherry-pick, got \(branch)", test: test, failures: &failures)

        let squash = routeCommitDrop(draggedSHAs: ["a", "b"], target: .commit(sha: "c"))
        check(squash == .squash(ontoSHA: "c", shas: ["a", "b"]), "commit → squash, got \(squash)", test: test, failures: &failures)

        let itself = routeCommitDrop(draggedSHAs: ["c"], target: .commit(sha: "c"))
        check(itself == .invalid(reason: .droppedOntoItself), "self-drop rejected, got \(itself)", test: test, failures: &failures)

        let mergeDrop = routeCommitDrop(draggedSHAs: ["a", "m"], target: .insertionPoint(beforeSHA: "c"), orderedSHAs: ordered, mergeCommitSHAs: ["m"])
        check(mergeDrop == .invalid(reason: .mergeCommitInvolved(sha: "m")), "merge guard, got \(mergeDrop)", test: test, failures: &failures)

        let reorder = routeCommitDrop(draggedSHAs: ["a", "b"], target: .insertionPoint(beforeSHA: "d"), orderedSHAs: ordered)
        check(reorder == .reorder(beforeSHA: "d", shas: ["a", "b"]), "insertion → reorder, got \(reorder)", test: test, failures: &failures)

        let scattered = routeCommitDrop(draggedSHAs: ["a", "c"], target: .insertionPoint(beforeSHA: "d"), orderedSHAs: ordered)
        check(scattered == .invalid(reason: .notContiguous), "non-contiguous rejected, got \(scattered)", test: test, failures: &failures)

        let empty = routeCommitDrop(draggedSHAs: [], target: .branch(name: "main"))
        check(empty == .invalid(reason: .noCommits), "empty rejected", test: test, failures: &failures)

        check(areCommitsContiguous(draggedSHAs: ["b", "c"], orderedSHAs: ordered), "contiguous", test: test, failures: &failures)
        check(!areCommitsContiguous(draggedSHAs: ["a", "a"], orderedSHAs: ordered), "duplicates rejected", test: test, failures: &failures)
        check(!areCommitsContiguous(draggedSHAs: ["zzz"], orderedSHAs: ordered), "unknown rejected", test: test, failures: &failures)
    }

    // MARK: - Keyboard reorder

    static func testKeyboardReorder(_ failures: inout [Failure]) {
        let test = "keyboard-reorder"
        let session = KeyboardReorderSession(shas: ["a", "b"], orderedSHAs: ["a", "b", "c", "d"])
        check(session.hintText.contains("2 commits"), "hint count", test: test, failures: &failures)
        let confirmed = session.confirm(insertionIndex: 3)
        check(confirmed == .reorder(beforeSHA: "d", shas: ["a", "b"]), "insertion resolves, got \(confirmed)", test: test, failures: &failures)
        let toEnd = session.confirm(insertionIndex: 4)
        check(toEnd == .reorder(beforeSHA: nil, shas: ["a", "b"]), "end resolves, got \(toEnd)", test: test, failures: &failures)
        let single = KeyboardReorderSession(shas: ["a"], orderedSHAs: ["a", "b"])
        check(single.hintText.contains("1 commit."), "singular hint", test: test, failures: &failures)
    }

    // MARK: - Banner mapping

    static func testBannerMapping(_ failures: inout [Failure]) {
        let test = "banner-mapping"
        let token = UUID()
        check(
            rebaseResultBanner(.completedWithoutError, targetBranch: "feature", baseBranch: "main", actionToken: token)
                == .successfulRebase(targetBranch: "feature", baseBranch: "main"),
            "rebase success banner", test: test, failures: &failures)
        check(
            rebaseResultBanner(.alreadyUpToDate, targetBranch: "feature", baseBranch: "main")
                == .branchAlreadyUpToDate(ourBranch: "feature", theirBranch: "main"),
            "rebase up-to-date banner", test: test, failures: &failures)
        check(
            rebaseResultBanner(.conflictsEncountered, targetBranch: "feature", baseBranch: nil, actionToken: token)
                == .rebaseConflictsFound(targetBranch: "feature", actionToken: token),
            "rebase conflicts banner", test: test, failures: &failures)
        check(
            rebaseResultBanner(.aborted, targetBranch: "feature", baseBranch: nil) == nil,
            "rebase abort silent", test: test, failures: &failures)
        check(
            cherryPickResultBanner(.completedWithoutError, targetBranchName: "main", count: 2, actionToken: token)
                == .successfulCherryPick(targetBranchName: "main", count: 2, actionToken: token),
            "pick success banner", test: test, failures: &failures)
        check(
            cherryPickResultBanner(.conflictsEncountered, targetBranchName: "main", count: 2, actionToken: token)
                == .cherryPickConflictsFound(targetBranchName: "main", actionToken: token),
            "pick conflicts banner", test: test, failures: &failures)
        check(
            cherryPickUndoneBanner(targetBranchName: "main", count: 2)
                == .cherryPickUndone(targetBranchName: "main", countCherryPicked: 2),
            "pick undone banner", test: test, failures: &failures)
        check(
            squashResultBanner(count: 3, actionToken: token) == .successfulSquash(count: 3, actionToken: token),
            "squash banner", test: test, failures: &failures)
        check(squashUndoneBanner(count: 3) == .squashUndone(commitsCount: 3), "squash undone", test: test, failures: &failures)
        check(
            reorderResultBanner(count: 2, actionToken: token) == .successfulReorder(count: 2, actionToken: token),
            "reorder banner", test: test, failures: &failures)
        check(reorderUndoneBanner(count: 2) == .reorderUndone(commitsCount: 2), "reorder undone", test: test, failures: &failures)
        check(shouldConfirmAbort(hasResolvedConflicts: true), "confirm when resolved", test: test, failures: &failures)
        check(!shouldConfirmAbort(hasResolvedConflicts: false), "no confirm when clean", test: test, failures: &failures)
    }
}
