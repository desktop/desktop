import Foundation

// MARK: - Task8Tests
// Pure-function tests for Task 8 operations (stash/tags/worktrees/submodules/
// LFS/gitignore/undo-reset). Same harness style as `ParserTests`: no test
// bundle needed, `runAll()` returns the failure count.

@MainActor
public enum Task8Tests {
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
        testStashMessages(&failures)
        testStashLogParsing(&failures)
        testStashPushSemantics(&failures)
        testTags(&failures)
        testWorktrees(&failures)
        testSubmodulesLFS(&failures)
        testGitIgnore(&failures)
        testUndoReset(&failures)
        testAmendState(&failures)

        if failures.isEmpty {
            print("Task8Tests: all tests passed")
        } else {
            print("Task8Tests: \(failures.count) failure(s)")
            for failure in failures {
                print("  FAIL [\(failure.test)] \(failure.message)")
            }
        }
        return failures.count
    }

    // MARK: Stash messages

    static func testStashMessages(_ failures: inout [Failure]) {
        let test = "stash-message"
        let message = createDesktopStashMessage(branchName: "main")
        check(message == "!!GitHub_Desktop<main>", "marker \(message)", test: test, failures: &failures)
        check(extractBranchFromMessage("On main: \(message)") == "main", "roundtrip", test: test, failures: &failures)
        check(extractBranchFromMessage("WIP on main: something") == nil, "non-desktop nil", test: test, failures: &failures)
        check(extractBranchFromMessage("!!GitHub_Desktop<>") == nil, "empty branch nil", test: test, failures: &failures)
        check(extractBranchFromMessage("") == nil, "empty nil", test: test, failures: &failures)
    }

    static func testStashLogParsing(_ failures: inout [Failure]) {
        let test = "stash-log"
        let message = "On main: \(createDesktopStashMessage(branchName: "main"))"
        let payload = "refs/stash@{0}\0abc123\0\(message)\0tree1\0p1 p2\0"
            + "refs/stash@{1}\0def456\0WIP on main: custom\0tree2\0p3\0"
            + "\0"
        let records = StashOperations.parseLogRecords(Data(payload.utf8))
        check(records.count == 2, "2 records, got \(records.count)", test: test, failures: &failures)
        let entries = StashOperations.desktopEntries(from: records)
        check(entries.count == 1, "1 desktop entry, got \(entries.count)", test: test, failures: &failures)
        check(entries.first?.branchName == "main", "branch", test: test, failures: &failures)
        check(entries.first?.parents == ["p1", "p2"], "parents \(String(describing: entries.first?.parents))", test: test, failures: &failures)
        check(StashOperations.totalCount(recordCount: 2) == 1, "total count", test: test, failures: &failures)
        check(StashOperations.totalCount(recordCount: 0) == 0, "total clamp", test: test, failures: &failures)
        // Args parity with the reference app.
        check(StashOperations.listArgs().contains("refs/stash"), "list refs/stash", test: test, failures: &failures)
        check(StashOperations.pushArgs(message: "m") == ["stash", "push", "-m", "m"], "push args", test: test, failures: &failures)
        check(StashOperations.popArgs(name: "refs/stash@{0}") == ["stash", "pop", "--quiet", "refs/stash@{0}"], "pop args", test: test, failures: &failures)
        check(StashOperations.dropArgs(name: "refs/stash@{0}") == ["stash", "drop", "refs/stash@{0}"], "drop args", test: test, failures: &failures)
    }

    static func testStashPushSemantics(_ failures: inout [Failure]) {
        let test = "stash-push"
        check(StashOperations.pushSucceeded(exitCode: 0, stderr: "") == true, "exit 0", test: test, failures: &failures)
        check(StashOperations.pushSucceeded(exitCode: 1, stderr: "") == true, "exit 1 no error:", test: test, failures: &failures)
        check(StashOperations.pushSucceeded(exitCode: 1, stderr: "error: something\n") == false, "exit 1 error:", test: test, failures: &failures)
        check(StashOperations.pushSucceeded(exitCode: 2, stderr: "") == false, "exit 2", test: test, failures: &failures)
        check(StashOperations.pushHadNoChanges(stdout: "No local changes to save\n") == true, "no changes", test: test, failures: &failures)
        check(StashOperations.pushHadNoChanges(stdout: "Saved working directory\n") == false, "saved", test: test, failures: &failures)
    }

    // MARK: Tags

    static func testTags(_ failures: inout [Failure]) {
        let test = "tags"
        check(TagOperations.normalizeTagName("refs/tags/v1.0") == "v1.0", "strip prefix", test: test, failures: &failures)
        check(TagOperations.normalizeTagName("refs/tags/a^{}") == "a", "strip peel", test: test, failures: &failures)
        // Annotated tags print twice; the peeled commit line must win.
        let showRef = "aaa111 refs/tags/v1\nbbb222 refs/tags/v1^{}\nccc333 refs/tags/v2\n"
        let tags = TagOperations.parseShowRefTags(showRef)
        check(tags["v1"] == "bbb222", "peeled wins \(tags)", test: test, failures: &failures)
        check(tags["v2"] == "ccc333", "lightweight", test: test, failures: &failures)
        check(TagOperations.createArgs(name: "v1", targetCommitSha: "abc") == ["tag", "-a", "-m", "", "v1", "abc"], "create args", test: test, failures: &failures)
        check(TagOperations.deleteArgs(name: "v1") == ["tag", "-d", "v1"], "delete args", test: test, failures: &failures)
        let porcelain = "To https://example.com/repo.git\n*\trefs/tags/v1.0:refs/tags/v1.0\t[new tag]\n \trefs/heads/main:refs/heads/main\t[up to date]\nDone\n"
        check(TagOperations.parseTagsToPush(porcelain) == ["v1.0"], "tags to push", test: test, failures: &failures)
        check(TagOperations.validateTagName("", existingTags: []) != nil, "empty invalid", test: test, failures: &failures)
        check(TagOperations.validateTagName("v 1", existingTags: []) != nil, "space invalid", test: test, failures: &failures)
        check(TagOperations.validateTagName("v1", existingTags: ["v1"]) != nil, "duplicate invalid", test: test, failures: &failures)
        check(TagOperations.validateTagName("v1.0.0", existingTags: ["v0.9"]) == nil, "valid", test: test, failures: &failures)
    }

    // MARK: Worktrees

    static func testWorktrees(_ failures: inout [Failure]) {
        let test = "worktrees"
        check(WorktreeOperations.addArgs(path: "/wt", createBranch: "feat", commitish: "main") == ["worktree", "add", "-b", "feat", "/wt", "main"], "add args", test: test, failures: &failures)
        check(WorktreeOperations.addArgs(path: "/wt", createBranch: nil, commitish: nil) == ["worktree", "add", "/wt"], "add bare", test: test, failures: &failures)
        check(WorktreeOperations.removeArgs(worktreePath: "/wt", force: true) == ["worktree", "remove", "--force", "/wt"], "remove force", test: test, failures: &failures)
        check(WorktreeOperations.moveArgs(oldPath: "/a", newPath: "/b") == ["worktree", "move", "/a", "/b"], "move args", test: test, failures: &failures)
        check(WorktreeOperations.validateAdd(path: "", createBranch: nil, pathExists: false) != nil, "empty path invalid", test: test, failures: &failures)
        check(WorktreeOperations.validateAdd(path: "/wt", createBranch: nil, pathExists: true) != nil, "existing path invalid", test: test, failures: &failures)
        check(WorktreeOperations.validateAdd(path: "/wt", createBranch: nil, pathExists: false) == nil, "valid add", test: test, failures: &failures)
        let main = WorktreeEntry(path: "/repo", head: "aaa", branch: "refs/heads/main", type: .main, isLocked: false, isPrunable: false)
        let linked = WorktreeEntry(path: "/repo-wt", head: "bbb", branch: nil, type: .linked, isLocked: false, isPrunable: false)
        let sorted = WorktreeOperations.sortedForDisplay([linked, main])
        check(sorted.first?.type == .main, "main first", test: test, failures: &failures)
        check(WorktreeOperations.filter([main, linked], query: "wt").count == 1, "filter", test: test, failures: &failures)
        check(WorktreeOperations.filter([main, linked], query: "").count == 2, "empty filter", test: test, failures: &failures)
    }

    // MARK: Submodules / LFS

    static func testSubmodulesLFS(_ failures: inout [Failure]) {
        let test = "submodule-lfs"
        let stdout = " 1eaabe34fc6f486367a176207420378f587d3b48 vendor/lib (v2.16.0-rc0)\n+2bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb other (heads/main)\n"
        let subs = SubmoduleOperations.parseStatus(stdout)
        check(subs.count == 2, "2 submodules, got \(subs.count)", test: test, failures: &failures)
        check(subs.first?.path == "vendor/lib", "path \(subs.first?.path ?? "nil")", test: test, failures: &failures)
        check(subs.first?.sha == "1eaabe34fc6f486367a176207420378f587d3b48", "sha", test: test, failures: &failures)
        check(LFSOperations.isTrackedOutput("README.md: filter: lfs\n") == true, "lfs tracked", test: test, failures: &failures)
        check(LFSOperations.isTrackedOutput("README.md: filter: unspecified\n") == false, "lfs untracked", test: test, failures: &failures)
        check(LFSOperations.isUsingLFS(json: #"{"patterns":[{"tracked":true}]}"#) == true, "using lfs", test: test, failures: &failures)
        check(LFSOperations.isUsingLFS(json: #"{"patterns":[]}"#) == false, "not using lfs", test: test, failures: &failures)
        check(LFSOperations.isUsingLFS(json: "not json") == false, "bad json", test: test, failures: &failures)
    }

    // MARK: GitIgnore

    static func testGitIgnore(_ failures: inout [Failure]) {
        let test = "gitignore"
        check(GitIgnoreOperations.escapeGitSpecialCharacters("file[1]*.txt") == "file\\[1\\]\\*.txt", "escape", test: test, failures: &failures)
        check(GitIgnoreOperations.escapeGitSpecialCharacters("plain.txt") == "plain.txt", "no escape", test: test, failures: &failures)
        check(GitIgnoreOperations.formatContents("a\nb", autocrlf: nil, safecrlf: nil) == "a\nb\n", "trailing newline", test: test, failures: &failures)
        check(GitIgnoreOperations.formatContents("a\n", autocrlf: nil, safecrlf: nil) == "a\n", "keeps newline", test: test, failures: &failures)
        check(GitIgnoreOperations.formatContents("", autocrlf: nil, safecrlf: nil) == "", "empty stays", test: test, failures: &failures)
        check(GitIgnoreOperations.formatContents("a\nb", autocrlf: "true", safecrlf: "true") == "a\r\nb\r\n", "crlf", test: test, failures: &failures)
        let merged = GitIgnoreOperations.appendedContents(existing: "a\n", patterns: ["b"], autocrlf: nil, safecrlf: nil)
        check(merged == "a\nb\n", "append \(merged.debugDescription)", test: test, failures: &failures)
    }

    // MARK: Undo / reset / revert / checkout

    static func testUndoReset(_ failures: inout [Failure]) {
        let test = "undo-reset"
        check(UndoResetOperations.resetArgs(mode: .hard, ref: "abc") == ["reset", "--hard", "abc"], "hard", test: test, failures: &failures)
        check(UndoResetOperations.resetArgs(mode: .soft, ref: "abc") == ["reset", "--soft", "abc"], "soft", test: test, failures: &failures)
        check(UndoResetOperations.resetArgs(mode: .mixed, ref: "abc") == ["reset", "abc"], "mixed", test: test, failures: &failures)
        check(UndoResetOperations.revertArgs(sha: "abc", parentCount: 1) == ["revert", "abc"], "revert simple", test: test, failures: &failures)
        check(UndoResetOperations.revertArgs(sha: "abc", parentCount: 2) == ["revert", "-m", "1", "abc"], "revert merge", test: test, failures: &failures)
        check(UndoResetOperations.checkoutCommitArgs(sha: "abc") == ["checkout", "abc"], "checkout commit", test: test, failures: &failures)
        check(UndoResetOperations.canUndoCommit(commitSha: "a", tipSha: "a", tags: []) == true, "can undo", test: test, failures: &failures)
        check(UndoResetOperations.canUndoCommit(commitSha: "a", tipSha: "b", tags: []) == false, "not tip", test: test, failures: &failures)
        check(UndoResetOperations.canUndoCommit(commitSha: "a", tipSha: "a", tags: ["v1"]) == false, "tagged", test: test, failures: &failures)
        check(UndoResetOperations.canUndoCommit(commitSha: "a", tipSha: nil, tags: []) == false, "no tip", test: test, failures: &failures)
        check(UndoResetOperations.needsUndoWarning(isWorkingDirectoryClean: false, isMergeCommit: false) == true, "dirty warns", test: test, failures: &failures)
        check(UndoResetOperations.needsUndoWarning(isWorkingDirectoryClean: true, isMergeCommit: false) == false, "clean quiet", test: test, failures: &failures)
        check(UndoResetOperations.needsUndoWarning(isWorkingDirectoryClean: true, isMergeCommit: true) == true, "merge always warns", test: test, failures: &failures)
        check(UndoResetOperations.needsResetWarning(isWorkingDirectoryClean: false) == true, "reset dirty", test: test, failures: &failures)
        check(UndoResetOperations.amendArgs(noVerify: true, signoff: false, allowEmpty: false).contains("--amend"), "amend flag", test: test, failures: &failures)
    }

    static func testAmendState(_ failures: inout [Failure]) {
        let test = "amend"
        let identity = CommitIdentity(name: "A", email: "a@x.com", date: Date(timeIntervalSince1970: 0), tzOffset: 0)
        let commit = Commit(
            sha: "abc123", shortSha: "abc123", summary: "S", body: "B",
            author: identity, committer: identity, parentSHAs: [], trailers: [])
        var state = AmendState()
        check(!state.isAmending, "starts idle", test: test, failures: &failures)
        state.startAmending(commit)
        check(state.isAmending, "amending", test: test, failures: &failures)
        check(state.keptAfterRefresh(headSha: "abc123", hasConflicts: false).isAmending, "kept", test: test, failures: &failures)
        check(!state.keptAfterRefresh(headSha: "other", hasConflicts: false).isAmending, "head moved", test: test, failures: &failures)
        check(!state.keptAfterRefresh(headSha: "abc123", hasConflicts: true).isAmending, "conflicts clear", test: test, failures: &failures)
        state.stopAmending()
        check(!state.isAmending, "stopped", test: test, failures: &failures)
    }
}
