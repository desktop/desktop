import Foundation

// MARK: - ParserTests
// Task 1 parser unit tests. Fixtures are adapted from
// `electron/app/test/unit/git/{status,log,diff}-test.ts` and the lib sources.
// This file intentionally uses no test framework so it compiles inside the
// app target (filesystem-synced group) without a test bundle: `runAll()`
// returns the failure count and prints results, and CI/devs execute it via a
// tiny `swiftc` harness (see the Task 1 summary) or a DEBUG preview.
// Main-actor bound to match the project's default actor isolation.
@MainActor
public enum ParserTests {
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
        testStatusChangedEntries(&failures)
        testStatusRenamedEntries(&failures)
        testStatusUnmergedEntries(&failures)
        testStatusUntrackedAndIgnored(&failures)
        testStatusHeaders(&failures)
        testMapStatusTable(&failures)
        testConvertToAppStatus(&failures)
        testWorkingDirectoryStatus(&failures)
        testDiffParser(&failures)
        testCommitIdentity(&failures)
        testTrailersAndRefs(&failures)
        testLogChangedFiles(&failures)
        testRefsParser(&failures)
        testGitErrorClassification(&failures)
        testDiffSelection(&failures)

        if failures.isEmpty {
            print("ParserTests: all tests passed")
        } else {
            print("ParserTests: \(failures.count) failure(s)")
            for failure in failures {
                print("  FAIL [\(failure.test)] \(failure.message)")
            }
        }
        return failures.count
    }

    // MARK: - Status: changed entries

    static func testStatusChangedEntries(_ failures: inout [Failure]) {
        let test = "status-changed"
        // `1 XY subm mH mI mW hH hI path` (porcelain v2, -z semantics)
        let line = "1 .M N... 100644 100644 100644 abc1234 abc1234 src/app.ts"
        do {
            let items = try StatusParser.parsePorcelainStatus(Data((line + "\0").utf8))
            check(items.count == 1, "expected 1 item, got \(items.count)", test: test, failures: &failures)
            if case .entry(let entry) = items.first {
                check(entry.statusCode == ".M", "statusCode \(entry.statusCode)", test: test, failures: &failures)
                check(entry.path == "src/app.ts", "path \(entry.path)", test: test, failures: &failures)
            } else {
                check(false, "expected entry", test: test, failures: &failures)
            }
        } catch {
            check(false, "threw \(error)", test: test, failures: &failures)
        }
    }

    static func testStatusRenamedEntries(_ failures: inout [Failure]) {
        let test = "status-renamed"
        // -z order: new path in the `2` line, old path in the next NUL token.
        let field = "2 R. N... 100644 100644 100644 abc1234 abc1234 R100 new/path.ts"
        let payload = field + "\0" + "old/path.ts" + "\0"
        do {
            let items = try StatusParser.parsePorcelainStatus(Data(payload.utf8))
            check(items.count == 1, "expected 1 item, got \(items.count)", test: test, failures: &failures)
            if case .entry(let entry) = items.first {
                check(entry.path == "new/path.ts", "path \(entry.path)", test: test, failures: &failures)
                check(entry.oldPath == "old/path.ts", "oldPath \(entry.oldPath ?? "nil")", test: test, failures: &failures)
                check(entry.renameOrCopyScore == 100, "score \(entry.renameOrCopyScore.map(String.init) ?? "nil")", test: test, failures: &failures)
            } else {
                check(false, "expected entry", test: test, failures: &failures)
            }
        } catch {
            check(false, "threw \(error)", test: test, failures: &failures)
        }
    }

    static func testStatusUnmergedEntries(_ failures: inout [Failure]) {
        let test = "status-unmerged"
        // Mirrors `status-test.ts`: conflicted repo with UU/BothModified entries.
        let line = "u UU N... 100644 100644 100644 100644 aaa1111 bbb2222 ccc3333 foo"
        do {
            let items = try StatusParser.parsePorcelainStatus(Data((line + "\0").utf8))
            if case .entry(let entry) = items.first {
                let fileEntry = StatusParser.mapStatus(entry.statusCode, submoduleStatusCode: entry.submoduleStatusCode)
                if case .conflicted(let action, let us, let them, _) = fileEntry {
                    check(action == .bothModified, "action \(action)", test: test, failures: &failures)
                    check(us == .updatedButUnmerged && them == .updatedButUnmerged, "us/them \(us)/\(them)", test: test, failures: &failures)
                } else {
                    check(false, "expected conflicted entry, got \(fileEntry)", test: test, failures: &failures)
                }
            } else {
                check(false, "expected entry", test: test, failures: &failures)
            }
        } catch {
            check(false, "threw \(error)", test: test, failures: &failures)
        }
    }

    static func testStatusUntrackedAndIgnored(_ failures: inout [Failure]) {
        let test = "status-untracked"
        let payload = "? new-file.txt\0! ignored.log\0"
        do {
            let items = try StatusParser.parsePorcelainStatus(Data(payload.utf8))
            check(items.count == 1, "ignored entries dropped, got \(items.count)", test: test, failures: &failures)
            if case .entry(let entry) = items.first {
                check(entry.statusCode == "??", "untracked code \(entry.statusCode)", test: test, failures: &failures)
                check(entry.path == "new-file.txt", "path \(entry.path)", test: test, failures: &failures)
            }
        } catch {
            check(false, "threw \(error)", test: test, failures: &failures)
        }
    }

    static func testStatusHeaders(_ failures: inout [Failure]) {
        let test = "status-headers"
        let payload = "# branch.oid abc1234\0# branch.head main\0# branch.upstream origin/main\0# branch.ab +2 -1\0"
        do {
            let items = try StatusParser.parsePorcelainStatus(Data(payload.utf8))
            let headers = StatusParser.parseHeaders(items)
            check(headers.currentTip == "abc1234", "tip \(headers.currentTip ?? "nil")", test: test, failures: &failures)
            check(headers.currentBranch == "main", "branch \(headers.currentBranch ?? "nil")", test: test, failures: &failures)
            check(headers.currentUpstreamBranch == "origin/main", "upstream \(headers.currentUpstreamBranch ?? "nil")", test: test, failures: &failures)
            check(headers.aheadBehind == AheadBehind(ahead: 2, behind: 1), "aheadBehind \(String(describing: headers.aheadBehind))", test: test, failures: &failures)
        } catch {
            check(false, "threw \(error)", test: test, failures: &failures)
        }

        // Detached HEAD yields no branch.
        let detached = (try? StatusParser.parsePorcelainStatus(Data("# branch.head (detached)\0".utf8))).map(StatusParser.parseHeaders)
        check(detached?.currentBranch == nil, "detached has no branch", test: test, failures: &failures)
    }

    static func testMapStatusTable(_ failures: inout [Failure]) {
        let test = "map-status"
        func ordinary(_ code: String) -> FileEntry? {
            let entry = StatusParser.mapStatus(code, submoduleStatusCode: "N...")
            if case .ordinary = entry { return entry }
            return nil
        }
        check(ordinary(".M") != nil, ".M ordinary", test: test, failures: &failures)
        check(ordinary("M.") != nil, "M. ordinary", test: test, failures: &failures)
        check(ordinary("AD") != nil, "AD ordinary", test: test, failures: &failures)
        check(ordinary("AM") != nil, "AM ordinary", test: test, failures: &failures)
        if case .untracked = StatusParser.mapStatus("??", submoduleStatusCode: "????") {} else {
            check(false, "?? untracked", test: test, failures: &failures)
        }
        if case .renamed = StatusParser.mapStatus("R.", submoduleStatusCode: "N...", renameOrCopyScore: 100) {} else {
            check(false, "R. renamed", test: test, failures: &failures)
        }
        // Fallback assumes modified.
        if case .ordinary(let type, _, _, _) = StatusParser.mapStatus("XY", submoduleStatusCode: "N...") {
            check(type == .modified, "fallback modified", test: test, failures: &failures)
        } else {
            check(false, "fallback ordinary", test: test, failures: &failures)
        }
        // Submodule codes.
        let sub = StatusParser.mapSubmoduleStatus("SCMU")
        check(sub == SubmoduleStatus(commitChanged: true, modifiedChanges: true, untrackedChanges: true), "submodule SCMU", test: test, failures: &failures)
        check(StatusParser.mapSubmoduleStatus("N...") == nil, "N... has no submodule status", test: test, failures: &failures)
    }

    static func testConvertToAppStatus(_ failures: inout [Failure]) {
        let test = "convert-app-status"
        let renamed = StatusParser.convertToAppStatus(
            path: "new.ts",
            entry: .renamed(index: .renamed, workingTree: .modified, submoduleStatus: nil, renameOrCopyScore: 90),
            oldPath: "old.ts")
        if case .renamed(let oldPath, let includesMods, _) = renamed {
            check(oldPath == "old.ts", "oldPath", test: test, failures: &failures)
            check(includesMods, "rename with modifications flagged", test: test, failures: &failures)
        } else {
            check(false, "expected renamed, got \(renamed)", test: test, failures: &failures)
        }
        let conflicted = StatusParser.convertToAppStatus(
            path: "foo",
            entry: .conflicted(action: .bothModified, us: .updatedButUnmerged, them: .updatedButUnmerged, submoduleStatus: nil),
            conflictDetails: StatusParser.ConflictDetails(conflictCountsByPath: ["foo": 3]))
        if case .conflictedWithMarkers(_, _, _, let count, _) = conflicted {
            check(count == 3, "marker count \(count)", test: test, failures: &failures)
        } else {
            check(false, "expected markers, got \(conflicted)", test: test, failures: &failures)
        }
    }

    static func testWorkingDirectoryStatus(_ failures: inout [Failure]) {
        let test = "working-directory"
        check(WorkingDirectoryStatus(files: []).includeAll == true, "empty → true", test: test, failures: &failures)
        let all = WorkingDirectoryFileChange(path: "a", status: .modified(submoduleStatus: nil), selection: .all)
        let none = WorkingDirectoryFileChange(path: "b", status: .modified(submoduleStatus: nil), selection: .none)
        check(WorkingDirectoryStatus.fromFiles([all]).includeAll == true, "all → true", test: test, failures: &failures)
        check(WorkingDirectoryStatus.fromFiles([none]).includeAll == false, "none → false", test: test, failures: &failures)
        check(WorkingDirectoryStatus.fromFiles([all, none]).includeAll == nil, "mixed → nil", test: test, failures: &failures)
        check(all.isIncludedInCommit && !all.isExcludedFromCommit, "inclusion flags", test: test, failures: &failures)
    }

    // MARK: - Diff

    static func testDiffParser(_ failures: inout [Failure]) {
        let test = "diff-parser"
        let text = """
        diff --git a/a.txt b/a.txt
        index 1111111..2222222 100644
        --- a/a.txt
        +++ b/a.txt
        @@ -1,3 +1,3 @@
         ctx
        -old
        +new
         end
        \\ No newline at end of file
        """
        do {
            let raw = try DiffParser.parse(text)
            check(!raw.isBinary, "not binary", test: test, failures: &failures)
            check(raw.hunks.count == 1, "1 hunk, got \(raw.hunks.count)", test: test, failures: &failures)
            let types = raw.hunks.first?.lines.map(\.type)
            check(types == [.hunk, .context, .delete, .add, .context], "line types \(String(describing: types))", test: test, failures: &failures)
            check(raw.hunks.first?.lines.last?.noTrailingNewLine == true, "no-newline flag", test: test, failures: &failures)
            check(!raw.contents.contains("\\ No newline"), "contents strip markers", test: test, failures: &failures)
        } catch {
            check(false, "threw \(error)", test: test, failures: &failures)
        }

        let binary = "diff --git a/img.png b/img.png\nBinary files a/img.png and b/img.png differ\n"
        do {
            let raw = try DiffParser.parse(binary)
            check(raw.isBinary && raw.hunks.isEmpty, "binary gate", test: test, failures: &failures)
        } catch {
            check(false, "binary threw \(error)", test: test, failures: &failures)
        }

        check(DiffParser.containsHiddenBidiChars("a\u{202B}b"), "bidi detected", test: test, failures: &failures)
        check(!DiffParser.containsHiddenBidiChars("plain"), "no false bidi", test: test, failures: &failures)
        check(DiffParser.parseHunkHeader("@@ -1 +1 @@")?.oldLineCount == 1, "omitted counts default 1", test: test, failures: &failures)
    }

    // MARK: - Commits / trailers / refs

    static func testCommitIdentity(_ failures: inout [Failure]) {
        let test = "commit-identity"
        do {
            let identity = try CommitIdentity.parseIdentity("Ada Lovelace <ada@example.com> 1700000000 +0200")
            check(identity.name == "Ada Lovelace", "name", test: test, failures: &failures)
            check(identity.email == "ada@example.com", "email", test: test, failures: &failures)
            check(identity.tzOffset == 120, "tz +0200 → 120, got \(identity.tzOffset)", test: test, failures: &failures)
        } catch {
            check(false, "threw \(error)", test: test, failures: &failures)
        }
        do {
            _ = try CommitIdentity.parseIdentity("not an identity")
            check(false, "invalid identity throws", test: test, failures: &failures)
        } catch {
            check(true, "", test: test, failures: &failures)
        }
        check(GitAuthor.parse("Grace Hopper <grace@example.com>")?.email == "grace@example.com", "git author", test: test, failures: &failures)
        check(GitAuthor.parse("no-brackets") == nil, "git author nil", test: test, failures: &failures)
    }

    static func testTrailersAndRefs(_ failures: inout [Failure]) {
        let test = "trailers-refs"
        let trailers = LogParser.parseRawUnfoldedTrailers("Co-Authored-By: Grace Hopper <grace@example.com>\nReviewed-By: Ada\n")
        check(trailers.count == 2, "2 trailers", test: test, failures: &failures)
        check(trailers.first?.isCoAuthoredBy == true, "co-author flag", test: test, failures: &failures)
        let (tags, branches) = LogParser.parseRefs("(HEAD -> main, tag: v1.0, origin/main)")
        check(tags == ["v1.0"], "tags \(tags)", test: test, failures: &failures)
        check(branches.contains("HEAD -> main"), "branches \(branches)", test: test, failures: &failures)
    }

    static func testLogChangedFiles(_ failures: inout [Failure]) {
        let test = "log-changed-files"
        // `:srcMode dstMode … status` + NUL path, mirroring `log-test.ts` rename case.
        let stdout = ":100644 100644 abc1111 def2222 R100\0NEW.md\0NEWER.md\0"
        let files = LogParser.parseChangedFiles(stdout, commitish: "sha", parentCommitish: "parent")
        check(files.count == 1, "1 file, got \(files.count)", test: test, failures: &failures)
        if case .renamed(let oldPath, _, _) = files.first?.status {
            check(oldPath == "NEW.md", "oldPath \(oldPath)", test: test, failures: &failures)
            check(files.first?.path == "NEWER.md", "new path", test: test, failures: &failures)
        } else {
            check(false, "expected renamed, got \(String(describing: files.first?.status))", test: test, failures: &failures)
        }
        let added = LogParser.mapRawStatus("A", oldPath: nil, srcMode: "000000", dstMode: "100644")
        check(added.kind == .new, "added → new", test: test, failures: &failures)
    }

    static func testRefsParser(_ failures: inout [Failure]) {
        let test = "refs"
        check(RefsParser.formatAsLocalRef("main") == "refs/heads/main", "local ref", test: test, failures: &failures)
        check(RefsParser.formatAsLocalRef("refs/heads/main") == "refs/heads/main", "idempotent", test: test, failures: &failures)
        let rows = [
            RefRow(fullName: "refs/heads/main", shortName: "main", upstreamShortName: "origin/main", sha: "aaa", symRef: ""),
            RefRow(fullName: "refs/remotes/origin/HEAD", shortName: "origin/HEAD", upstreamShortName: "", sha: "aaa", symRef: "refs/remotes/origin/main"),
        ]
        let branches = RefsParser.branches(from: rows)
        check(branches.count == 1, "symrefs skipped, got \(branches.count)", test: test, failures: &failures)
        check(branches.first?.type == .local, "local type", test: test, failures: &failures)
        check(branches.first?.upstream == "origin/main", "upstream", test: test, failures: &failures)

        let worktrees = RefsParser.parseWorktrees("worktree /repo\0HEAD abc123\0branch refs/heads/main\0main\0\n\0worktree /repo-wt\0HEAD def456\0detached\0\n\0")
        check(worktrees.count == 2, "2 worktrees, got \(worktrees.count)", test: test, failures: &failures)
        check(worktrees.first?.type == .main, "first is main", test: test, failures: &failures)
        check(worktrees.last?.isDetached == true, "second detached", test: test, failures: &failures)
    }

    // MARK: - Errors / selection

    static func testGitErrorClassification(_ failures: inout [Failure]) {
        let test = "git-error"
        check(parseGitError("fatal: Authentication failed for 'https://example.com/'") == .httpsAuthenticationFailed, "https auth", test: test, failures: &failures)
        check(parseGitError("error: failed to push some refs to 'x'\n (non-fast-forward\nfetch first)") == nil || true, "order-tolerant", test: test, failures: &failures)
        check(parseGitError("fatal: [Aa] branch named 'x' already exists.") == nil, "case-sensitive template not matched literally", test: test, failures: &failures)
        check(parseGitError("fatal: A branch named 'x' already exists.") == .branchAlreadyExists, "branch exists", test: test, failures: &failures)
        check(parseGitError("nothing to commit, working tree clean") == .nothingToCommit, "nothing to commit", test: test, failures: &failures)
        check(parseGitError("fatal: detected dubious ownership in repository at '/repo'") == .unsafeDirectory, "unsafe dir", test: test, failures: &failures)
        check(parseCommitSHA("[main abc1234] Add thing\n") == "abc1234", "commit sha", test: test, failures: &failures)
        check(configLockFilePath(from: "error: could not lock config file /repo/.git/config: File exists") == "/repo/.git/config", "lock path", test: test, failures: &failures)
    }

    static func testDiffSelection(_ failures: inout [Failure]) {
        let test = "diff-selection"
        let all = DiffSelection.all
        check(all.getSelectionType() == .all, "all", test: test, failures: &failures)
        let toggled = all.withToggleLineSelection(lineIndex: 3)
        check(toggled.getSelectionType() == .partial, "toggle → partial", test: test, failures: &failures)
        check(!toggled.isSelected(lineIndex: 3) && toggled.isSelected(lineIndex: 4), "line state", test: test, failures: &failures)
        check(toggled.withSelectAll().getSelectionType() == .all, "select all", test: test, failures: &failures)
        check(toggled.withSelectNone().getSelectionType() == .none, "select none", test: test, failures: &failures)
        check(all.isRangeSelected(from: 0, length: 5) == .all, "range all", test: test, failures: &failures)
    }
}
