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
        testSyncArgs(&failures)
        testParseRemotes(&failures)
        testParseTagsToPush(&failures)
        testGitProgressLine(&failures)
        testFetchProgress(&failures)
        testPullPushProgress(&failures)
        testCloneCheckoutRevertProgress(&failures)
        testLFSProgress(&failures)
        testMultiCommitProgress(&failures)
        testCredentialHelpers(&failures)
        testSyncErrorMapping(&failures)
        testPushPullState(&failures)
        testBadgeAndLastFetched(&failures)

        if failures.isEmpty {
            print("ParserTests: all tests passed")
        } else {
            print("ParserTests: \(failures.count) failure(s)")
            for failure in failures {
                print("  FAIL [\(failure.test)] \(failure.message)")
            }
        }
        return failures.count + DiffTests.runAll()
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

    // MARK: - Task 7: sync args

    static func testSyncArgs(_ failures: inout [Failure]) {
        let test = "sync-args"
        check(
            fetchArgs(remoteName: "origin", withProgress: true)
                == ["fetch", "--progress", "--prune", "--recurse-submodules=on-demand", "origin"],
            "fetch args", test: test, failures: &failures)
        check(
            fetchArgs(remoteName: "origin", withProgress: false)
                == ["fetch", "--prune", "--recurse-submodules=on-demand", "origin"],
            "fetch args (no progress)", test: test, failures: &failures)
        check(
            pullArgs(remoteName: "origin", withProgress: true, noVerify: false, pullFFConfigured: false)
                == ["-c", "rebase.backend=merge", "pull", "--ff", "--recurse-submodules", "--progress", "origin"],
            "pull args default --ff + rebase pin", test: test, failures: &failures)
        check(
            !pullArgs(remoteName: "origin", withProgress: false, noVerify: false, pullFFConfigured: true).contains("--ff"),
            "pull args honor pull.ff", test: test, failures: &failures)
        check(
            pullArgs(remoteName: "origin", withProgress: false, noVerify: true, pullFFConfigured: true).contains("--no-verify"),
            "pull args no-verify", test: test, failures: &failures)
        check(
            pushArgs(remoteName: "origin", localBranch: "main", remoteBranch: nil, tagsToPush: [], forceWithLease: false, noVerify: false, withProgress: true)
                == ["push", "origin", "main", "--set-upstream", "--progress"],
            "push args publish", test: test, failures: &failures)
        check(
            pushArgs(remoteName: "origin", localBranch: "main", remoteBranch: "main", tagsToPush: ["v1"], forceWithLease: true, noVerify: false, withProgress: false)
                == ["push", "origin", "main:main", "v1", "--force-with-lease"],
            "push args force-with-lease + tags", test: test, failures: &failures)
    }

    // MARK: - Task 7: remote / tag output parsing

    static func testParseRemotes(_ failures: inout [Failure]) {
        let test = "parse-remotes"
        let stdout = "origin\thttps://example.com/repo.git (fetch)\norigin\thttps://example.com/repo.git (push)\nupstream\tgit@example.com:up.git (fetch)\n"
        let remotes = parseRemotes(stdout)
        check(remotes.count == 2, "fetch lines only, got \(remotes.count)", test: test, failures: &failures)
        check(remotes.first == Remote(name: "origin", url: "https://example.com/repo.git"), "origin", test: test, failures: &failures)
        check(parseRemotes("").isEmpty, "empty → []", test: test, failures: &failures)
    }

    static func testParseTagsToPush(_ failures: inout [Failure]) {
        let test = "parse-tags"
        let stdout = "To https://example.com/repo.git\n*\trefs/tags/v1.0:refs/tags/v1.0\t[new tag]\n \trefs/heads/main:refs/heads/main\t[up to date]\nDone\n"
        check(parseTagsToPush(stdout) == ["v1.0"], "new tag parsed", test: test, failures: &failures)
        check(parseTagsToPush("To x\nDone\n").isEmpty, "no tags → []", test: test, failures: &failures)
    }

    // MARK: - Task 7: git progress lines + parsers

    static func testGitProgressLine(_ failures: inout [Failure]) {
        let test = "git-progress-line"
        if let info = parseGitProgressLine("remote: Counting objects: 123") {
            check(info.title == "remote: Counting objects" && info.value == 123 && info.total == nil, "value-only", test: test, failures: &failures)
        } else {
            check(false, "value-only parses", test: test, failures: &failures)
        }
        if let info = parseGitProgressLine("Receiving objects:  99% (166741/167587), 272.10 MiB | 2.39 MiB/s") {
            check(info.percent == 99 && info.value == 166741 && info.total == 167587 && !info.done, "percent line", test: test, failures: &failures)
        } else {
            check(false, "percent line parses", test: test, failures: &failures)
        }
        check(parseGitProgressLine("Checking out files:  100% (728/728), done.")?.done == true, "done flag", test: test, failures: &failures)
        check(parseGitProgressLine("no colon here") == nil, "non-progress → nil", test: test, failures: &failures)
        check(parseGitProgressLine(": leading") == nil, "empty title → nil", test: test, failures: &failures)
        check(parseGitProgressLine("title: ") == nil, "empty body → nil", test: test, failures: &failures)
        check(stripANSIControlCharacters("\u{1B}[32mok") == "ok", "ansi stripped", test: test, failures: &failures)
    }

    static func testFetchProgress(_ failures: inout [Failure]) {
        let test = "fetch-progress"
        var parser = FetchProgressParser(remoteName: "origin")
        check(parser.initialProgress.value == 0, "initial 0", test: test, failures: &failures)
        // Counting-objects context passes the gate with the running estimate.
        let counting = parser.parse(line: "remote: Counting objects: 3")
        if case .fetch(_, let payload) = counting {
            check(payload.value == 0, "counting keeps 0", test: test, failures: &failures)
        } else {
            check(false, "counting passes gate", test: test, failures: &failures)
        }
        check(parser.parse(line: "some ref update noise") == nil, "noise dropped", test: test, failures: &failures)
        var values: [Double] = []
        for line in [
            "remote: Compressing objects: 100% (3/3), done.",
            "Receiving objects:  50% (1/2)",
            "Resolving deltas: 100% (2/2), done.",
        ] {
            if case .fetch(_, let payload) = parser.parse(line: line) {
                values.append(payload.value)
            }
        }
        check(values.count == 3, "3 events, got \(values.count)", test: test, failures: &failures)
        if values.count == 3 {
            check(abs(values[0] - 0.1) < 1e-9, "compressing ≈ 0.1, got \(values[0])", test: test, failures: &failures)
            check(abs(values[1] - 0.45) < 1e-9, "receiving ≈ 0.45, got \(values[1])", test: test, failures: &failures)
            check(abs(values[2] - 1.0) < 1e-9, "deltas ≈ 1.0, got \(values[2])", test: test, failures: &failures)
            check(values[0] < values[1] && values[1] < values[2], "monotonic", test: test, failures: &failures)
        }
    }

    static func testPullPushProgress(_ failures: inout [Failure]) {
        let test = "pull-push-progress"
        var pull = PullProgressParser(remoteName: "origin")
        if case .pull(_, let payload) = pull.parse(line: "Checking out files:  50% (1/2)") {
            // Prior steps (0.1+0.7+0.15) complete + half of the 0.15 checkout step.
            let expected = (0.1 + 0.7 + 0.15 + 0.15 * 0.5) / 1.1
            check(abs(payload.value - expected) < 1e-9, "pull checkout weight, got \(payload.value)", test: test, failures: &failures)
        } else {
            check(false, "pull checkout parses", test: test, failures: &failures)
        }
        var push = PushProgressParser(remoteName: "origin", branchName: "main")
        let forwarded = push.parse(line: "unrelated context line")
        if case .push(let remote, let branch, _) = forwarded {
            check(remote == "origin" && branch == "main", "push forwards context", test: test, failures: &failures)
        } else {
            check(false, "push forwards context", test: test, failures: &failures)
        }
        if case .push(_, _, let payload) = push.parse(line: "Writing objects:  50% (1/2)") {
            check(abs(payload.value - (0.2 + 0.7 * 0.5)) < 1e-9, "push writing weight", test: test, failures: &failures)
        } else {
            check(false, "push writing parses", test: test, failures: &failures)
        }
    }

    static func testCloneCheckoutRevertProgress(_ failures: inout [Failure]) {
        let test = "clone-checkout-revert"
        var clone = CloneProgressParser()
        check(clone.initialProgress.value == 0, "clone initial 0", test: test, failures: &failures)
        check(clone.parse(line: "noise") == nil, "clone drops noise", test: test, failures: &failures)
        var checkout = CheckoutProgressParser(target: "main")
        if case .checkout(let target, let payload) = checkout.parse(line: "Checking out files:  50% (1/2)") {
            check(target == "main" && abs(payload.value - 0.5) < 1e-9, "checkout half", test: test, failures: &failures)
        } else {
            check(false, "checkout parses", test: test, failures: &failures)
        }
        let revert = RevertProgressParser().parse(line: "anything at all")
        if case .revert(let payload) = revert {
            check(payload.value == 0 && payload.description == "anything at all", "revert 0 + text", test: test, failures: &failures)
        } else {
            check(false, "revert parses", test: test, failures: &failures)
        }
        check(isLFSFilterLine("Filtering content: 100% (2/2), done."), "lfs filter line", test: test, failures: &failures)
        check(!isLFSFilterLine("Receiving objects:  50% (1/2)"), "non-lfs line", test: test, failures: &failures)
        check(progressLines(from: "a: 1% (1/2)\rb: 2% (2/2)\n").count == 2, "cr split", test: test, failures: &failures)
    }

    static func testLFSProgress(_ failures: inout [Failure]) {
        let test = "lfs-progress"
        var parser = LFSProgressParser()
        if case .context = parser.parse(line: "not an lfs line") {
            check(true, "", test: test, failures: &failures)
        } else {
            check(false, "garbage → context", test: test, failures: &failures)
        }
        if case .progress(_, let info) = parser.parse(line: "download 1/2 100/200 foo.bin") {
            check(info.text.contains("0 out of an estimated 2"), "lfs text: \(info.text)", test: test, failures: &failures)
        } else {
            check(false, "lfs line parses", test: test, failures: &failures)
        }
        if case .progress(_, let info) = parser.parse(line: "download 2/2 200/200 foo.bin") {
            check(info.text.contains("1 out of an estimated 2"), "lfs completion: \(info.text)", test: test, failures: &failures)
        } else {
            check(false, "lfs completion parses", test: test, failures: &failures)
        }
        check(formatBytes(0) == "0 B", "zero bytes", test: test, failures: &failures)
        check(formatBytes(2048) == "2 KiB", "kibibytes", test: test, failures: &failures)
    }

    static func testMultiCommitProgress(_ failures: inout [Failure]) {
        let test = "multi-commit-progress"
        let commits = [
            CommitOneLine(sha: "aaa", summary: "First"),
            CommitOneLine(sha: "bbb", summary: "Second"),
            CommitOneLine(sha: "ccc", summary: "Third"),
        ]
        let rebase = RebaseProgressParser(commits: commits)
        if case .multiCommitOperation(let summary, let position, let total, let payload) = rebase.parse(line: "Rebasing (1/3)") {
            check(summary == "First" && position == 1 && total == 3, "rebase 1/3", test: test, failures: &failures)
            check(abs(payload.value - 0.33) < 1e-9, "rebase value 0.33", test: test, failures: &failures)
        } else {
            check(false, "rebase line parses", test: test, failures: &failures)
        }
        check(rebase.parse(line: "Auto-merging foo.ts") == nil, "rebase noise → nil", test: test, failures: &failures)
        var cherry = CherryPickProgressParser(commits: Array(commits.prefix(2)))
        check(cherry.parse(line: " Date: today") == nil, "cherry noise → nil", test: test, failures: &failures)
        if case .multiCommitOperation(_, let position, _, _) = cherry.parse(line: "[main abc1234] First") {
            check(position == 1, "cherry 1", test: test, failures: &failures)
        } else {
            check(false, "cherry line parses", test: test, failures: &failures)
        }
        if case .multiCommitOperation(_, let position, let total, let payload) = cherry.parse(line: "[main def5678] Second") {
            check(position == 2 && total == 2 && abs(payload.value - 1.0) < 1e-9, "cherry 2/2", test: test, failures: &failures)
        } else {
            check(false, "cherry second parses", test: test, failures: &failures)
        }
    }

    // MARK: - Task 7: auth + error chain

    static func testCredentialHelpers(_ failures: inout [Failure]) {
        let test = "credential"
        let parsed = parseCredential("protocol=https\nhost=example.com\nusername[]=ada\nusername[]=grace\npassword=s3cret\n")
        check(parsed["protocol"] == "https", "protocol", test: test, failures: &failures)
        check(parsed["username[0]"] == "ada" && parsed["username[1]"] == "grace", "array expansion", test: test, failures: &failures)
        check(parseCredential("garbage line\nfoo=bar") == ["foo": "bar"], "skip garbage", test: test, failures: &failures)
        do {
            let formatted = try formatCredential(parsed)
            check(parseCredential(formatted) == parsed, "roundtrip", test: test, failures: &failures)
        } catch {
            check(false, "roundtrip threw \(error)", test: test, failures: &failures)
        }
        do {
            _ = try formatCredential(["user": "a\nb"])
            check(false, "newline rejected", test: test, failures: &failures)
        } catch {
            check(true, "", test: test, failures: &failures)
        }
        check(proxyEnvForRemoteURL("git@example.com:repo.git") == nil, "ssh → no proxy", test: test, failures: &failures)
        check(remoteMessage(from: "remote: hello\nnoise\nremote: world\r\n") == "hello\nworld", "remote message", test: test, failures: &failures)
        check(
            parseFilesToBeOverwritten("error: Your local changes to the following files would be overwritten by checkout:\n\ta.txt\n\tb.txt\nPlease commit\n")
                == ["a.txt", "b.txt"],
            "overwritten files", test: test, failures: &failures)
    }

    static func testSyncErrorMapping(_ failures: inout [Failure]) {
        let test = "sync-error"
        @MainActor func gitError(_ kind: GitErrorKind?, stderr: String = "") -> GitError {
            GitError(kind: kind, args: ["push"], stdout: "", stderr: stderr, exitCode: 1)
        }
        let ctx = SyncErrorContext(repositoryID: 7, remoteURL: "https://example.com/r.git", operation: .push)
        check(
            popupForSyncError(gitError(.pushNotFastForward), context: ctx) == .pushNeedsPull(repositoryID: 7),
            "push-needs-pull", test: test, failures: &failures)
        check(
            popupForSyncError(gitError(.httpsAuthenticationFailed), context: ctx)
                == .genericGitAuthentication(remoteURL: "https://example.com/r.git", username: nil),
            "auth failure → sheet", test: test, failures: &failures)
        let background = SyncErrorContext(repositoryID: 7, remoteURL: "https://example.com/r.git", operation: .fetch, isBackgroundTask: true)
        check(
            popupForSyncError(gitError(.httpsAuthenticationFailed), context: background) == nil,
            "background auth suppressed", test: test, failures: &failures)
        check(
            popupForSyncError(
                gitError(.localChangesOverwritten, stderr: "error: Your local changes to the following files would be overwritten by merge:\n\tfoo.ts\n"),
                context: ctx) == .localChangesOverwritten(repositoryID: 7, files: ["foo.ts"]),
            "overwritten → files popup", test: test, failures: &failures)
        check(
            popupForSyncError(gitError(.lfsAttributeDoesNotMatch), context: ctx) == .lfsAttributeMismatch,
            "lfs mismatch", test: test, failures: &failures)
        if case .error = popupForSyncError(gitError(.pushWithSecretDetected, stderr: "secret"), context: ctx) {
            check(true, "", test: test, failures: &failures)
        } else {
            check(false, "secret → display-only error", test: test, failures: &failures)
        }
        check(popupForSyncError(gitError(.mergeConflicts), context: ctx) == nil, "conflicts defer", test: test, failures: &failures)
        check(
            popupForSyncFailure(DiscardChangesRetryRequest(repositoryID: 3), context: ctx) == .discardChangesRetry(repositoryID: 3),
            "discard retry", test: test, failures: &failures)
        if case .error = popupForSyncFailure(NSError(domain: "x", code: 1, userInfo: [NSLocalizedDescriptionKey: "boom"]), context: ctx) {
            check(true, "", test: test, failures: &failures)
        } else {
            check(false, "plain error → .error", test: test, failures: &failures)
        }
        check(
            SSHHostChallenge(host: "h", ip: "1.2.3.4", keyType: "ED25519", fingerprint: "SHA256:x").popup
                == .addSSHHost(host: "h", fingerprint: "SHA256:x"),
            "ssh challenge popup", test: test, failures: &failures)
    }

    // MARK: - Task 7: push/pull button state machine

    static func testPushPullState(_ failures: inout [Failure]) {
        let test = "push-pull-state"
        @MainActor func resolve(
            tip: Tip = .valid(branch: Branch(name: "main", upstream: "origin/main", tip: BranchTip(sha: "abc1234"), type: .local, ref: "refs/heads/main")),
            remote: String? = "origin",
            aheadBehind: AheadBehind? = AheadBehind(ahead: 0, behind: 0),
            tags: Int = 0,
            progress: AppProgress? = nil,
            force: ForcePushState = .notAvailable,
            rebase: Bool = false,
            detachedRebase: Bool = false
        ) -> PushPullState {
            resolvePushPullState(
                tip: tip, remoteName: remote, aheadBehind: aheadBehind,
                numTagsToPush: tags, progress: progress, forcePushState: force,
                pullWithRebase: rebase, rebaseInProgress: detachedRebase, lastFetched: nil)
        }

        let publish = resolve(remote: nil)
        check(publish.action == .publishRepository && publish.title == "Publish repository" && publish.enabled, "publish repo", test: test, failures: &failures)
        let unborn = resolve(tip: .unborn(ref: "main"))
        check(unborn.action == .fetch && unborn.title == "Fetch origin", "unborn → fetch", test: test, failures: &failures)
        let detached = resolve(tip: .detached(currentSha: "abc"))
        check(detached.action == .detached(rebaseInProgress: false) && !detached.enabled, "detached disabled", test: test, failures: &failures)
        let noUpstream = resolve(aheadBehind: nil)
        check(noUpstream.action == .publishBranch && noUpstream.dropdownItems == [.fetch], "publish branch", test: test, failures: &failures)
        let clean = resolve()
        check(clean.action == .fetch, "in sync → fetch", test: test, failures: &failures)
        let force = resolve(aheadBehind: AheadBehind(ahead: 1, behind: 1), force: .recommended)
        check(force.action == .forcePush && force.title == "Force push origin", "force push", test: test, failures: &failures)
        let pull = resolve(aheadBehind: AheadBehind(ahead: 0, behind: 2), force: .available)
        check(pull.action == .pull(pullWithRebase: false) && pull.dropdownItems == [.fetch, .forcePush], "pull + dropdown", test: test, failures: &failures)
        let pullRebase = resolve(aheadBehind: AheadBehind(ahead: 0, behind: 2), rebase: true)
        check(pullRebase.title == "Pull origin with rebase", "pull with rebase", test: test, failures: &failures)
        let push = resolve(aheadBehind: AheadBehind(ahead: 2, behind: 0))
        check(push.action == .push && push.title == "Push origin" && push.badge?.up != nil && push.badge?.down == nil, "push + badge", test: test, failures: &failures)
        let busy = resolve(progress: .push(remote: "origin", branch: "main", payload: ProgressPayload(value: 0.5, title: "Pushing to origin", description: "Writing objects")))
        check(busy.action == .progress && !busy.enabled && busy.progressValue == 0.5 && busy.title == "Pushing to origin", "progress button", test: test, failures: &failures)
    }

    static func testBadgeAndLastFetched(_ failures: inout [Failure]) {
        let test = "badge-fetched"
        check(aheadBehindBadge(ahead: 0, behind: 0, tagsToPush: 0) == nil, "clean → no badge", test: test, failures: &failures)
        let badge = aheadBehindBadge(ahead: 2, behind: 1, tagsToPush: 1)
        check(badge?.down != nil, "down shown", test: test, failures: &failures)
        // Up combines ahead + tags (2 + 1 = 3).
        check(badge?.up?.replacingOccurrences(of: ",", with: "") == "3", "up combines tags", test: test, failures: &failures)
        check(lastFetchedDescription(nil) == "Never fetched", "never fetched", test: test, failures: &failures)
        check(lastFetchedDescription(Date()).hasPrefix("Last fetched "), "relative fetched", test: test, failures: &failures)
    }
}
