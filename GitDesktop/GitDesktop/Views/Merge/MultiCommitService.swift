import Foundation

// MARK: - MultiCommitService
// Git operations for Task 6: rebase, cherry-pick, squash and reorder.
// Ports `lib/git/rebase.ts` (rebase/continue/abort/interactive + snapshot
// readers), `lib/git/cherry-pick.ts`, `lib/git/squash.ts` (`squash`) and
// `lib/git/reorder.ts` (`reorder`) arg-for-arg.
//
// Follows the Task 5 `MergeService` pattern: one protocol + a `Process`-backed
// live implementation + an in-memory mock for Previews/UI work. Callers stage
// conflict resolutions first (Task 3/5 staging); the `continue*` methods only
// decide between `--continue` and `--skip`/`--allow-empty` from the
// post-staging working-tree state, exactly like the reference.

/// Validation failures for squash/reorder entry. The merge-commit guard comes
/// from `GitDesktop/Docs/07-branches-operations.md` §2 (interactive rebase
/// cannot squash/reorder merge commits); the rest mirror the early throws in
/// `lib/git/squash.ts` / `lib/git/reorder.ts`.
public enum MultiCommitValidationError: Error, Sendable, Equatable {
    case noCommits(operation: MultiCommitOperationKind)
    case targetIncludedInSquash
    case targetNotInLog
    case baseNotInLog
    case mergeCommitInvolved(sha: String)
    case emptyLog

    public var message: String {
        switch self {
        case .noCommits(let operation):
            return "No commits provided to \(operation.rawValue.lowercased())."
        case .targetIncludedInSquash:
            return "The commits to squash cannot contain the commit to squash onto."
        case .targetNotInLog:
            return "The commit to squash onto was not in the log."
        case .baseNotInLog:
            return "The base commit was not in the log."
        case .mergeCommitInvolved(let sha):
            return "Cannot rewrite merge commit \(shortenSHA(sha)). Select non-merge commits."
        case .emptyLog:
            return "Could not find commits in the log."
        }
    }
}

/// Guards squash entry: non-empty, target not in the set, no merge commits
/// involved (neither dragged commits nor the squash target).
public func validateSquash(toSquash: [Commit], squashOnto: Commit) throws {
    guard !toSquash.isEmpty else { throw MultiCommitValidationError.noCommits(operation: .squash) }
    let shas = Set(toSquash.map(\.sha))
    if shas.contains(squashOnto.sha) { throw MultiCommitValidationError.targetIncludedInSquash }
    for commit in toSquash where commit.isMergeCommit {
        throw MultiCommitValidationError.mergeCommitInvolved(sha: commit.sha)
    }
    if squashOnto.isMergeCommit {
        throw MultiCommitValidationError.mergeCommitInvolved(sha: squashOnto.sha)
    }
}

/// Guards reorder entry: non-empty, no merge commits involved.
public func validateReorder(toMove: [Commit], beforeCommit: Commit? = nil) throws {
    guard !toMove.isEmpty else { throw MultiCommitValidationError.noCommits(operation: .reorder) }
    for commit in toMove where commit.isMergeCommit {
        throw MultiCommitValidationError.mergeCommitInvolved(sha: commit.sha)
    }
    if let beforeCommit, beforeCommit.isMergeCommit {
        throw MultiCommitValidationError.mergeCommitInvolved(sha: beforeCommit.sha)
    }
}

// MARK: Todo-file builders (pure)

/// Builds the interactive-rebase todo for a squash. `log` is the branch log
/// newest-first (as `git log` returns it); only `sha`/`summary` are read.
/// IMPORTANT: `log` must be scoped to `lastRetainedCommitRef..HEAD` (the
/// `revRange` the caller passes to `rebase -i`), otherwise commits at or
/// below the ref are duplicated into the rewritten history.
/// Verbatim port of the todo loop in `lib/git/squash.ts`.
public func buildSquashTodo(
    log: [CommitOneLine],
    toSquashSHAs: Set<String>,
    squashOntoSHA: String
) throws -> String {
    guard !toSquashSHAs.isEmpty else { throw MultiCommitValidationError.noCommits(operation: .squash) }
    if toSquashSHAs.contains(squashOntoSHA) { throw MultiCommitValidationError.targetIncludedInSquash }
    guard !log.isEmpty else { throw MultiCommitValidationError.emptyLog }

    var lines: [String] = []
    var foundSquashOnto = false
    var toReplayAtSquash: [CommitOneLine] = []
    var toReplayAfterSquash: [CommitOneLine] = []

    // Oldest to newest (replay order).
    for commit in log.reversed() {
        if toSquashSHAs.contains(commit.sha) {
            if foundSquashOnto {
                lines.append("squash \(commit.sha) \(commit.summary)")
            } else {
                toReplayAtSquash.append(commit)
            }
            continue
        }
        if commit.sha == squashOntoSHA {
            foundSquashOnto = true
            toReplayAtSquash.append(commit)
            for (index, replay) in toReplayAtSquash.enumerated() {
                lines.append("\(index == 0 ? "pick" : "squash") \(replay.sha) \(replay.summary)")
            }
            continue
        }
        if foundSquashOnto {
            toReplayAfterSquash.append(commit)
            continue
        }
        lines.append("pick \(commit.sha) \(commit.summary)")
    }
    for replay in toReplayAfterSquash {
        lines.append("pick \(replay.sha) \(replay.summary)")
    }
    guard foundSquashOnto else { throw MultiCommitValidationError.targetNotInLog }
    return lines.joined(separator: "\n") + "\n"
}

/// Builds the interactive-rebase todo for a reorder. `beforeSHA` nil moves the
/// commits to the end of history. Like `buildSquashTodo`, `log` must be
/// scoped to `lastRetainedCommitRef..HEAD`.
/// Verbatim port of `lib/git/reorder.ts`.
public func buildReorderTodo(
    log: [CommitOneLine],
    toMoveSHAs: Set<String>,
    beforeSHA: String?
) throws -> String {
    guard !toMoveSHAs.isEmpty else { throw MultiCommitValidationError.noCommits(operation: .reorder) }
    guard !log.isEmpty else { throw MultiCommitValidationError.emptyLog }

    var lines: [String] = []
    var foundBase = false
    var toReplayBeforeBase: [CommitOneLine] = []
    var toReplayAfterReorder: [CommitOneLine] = []

    for commit in log.reversed() {
        if toMoveSHAs.contains(commit.sha) {
            if foundBase {
                lines.append("pick \(commit.sha) \(commit.summary)")
            } else {
                toReplayBeforeBase.append(commit)
            }
            continue
        }
        if let beforeSHA, commit.sha == beforeSHA {
            foundBase = true
            toReplayAfterReorder.append(commit)
            for replay in toReplayBeforeBase {
                lines.append("pick \(replay.sha) \(replay.summary)")
            }
            continue
        }
        if foundBase {
            toReplayAfterReorder.append(commit)
            continue
        }
        lines.append("pick \(commit.sha) \(commit.summary)")
    }
    for replay in toReplayAfterReorder {
        lines.append("pick \(replay.sha) \(replay.summary)")
    }
    if beforeSHA == nil {
        for replay in toReplayBeforeBase {
            lines.append("pick \(replay.sha) \(replay.summary)")
        }
    } else if !foundBase {
        throw MultiCommitValidationError.baseNotInLog
    }
    return lines.joined(separator: "\n") + "\n"
}

// MARK: Service protocol

public protocol MultiCommitService: Sendable {
    // MARK: Rebase
    func rebase(repositoryPath: String, baseBranch: String, targetBranch: String) async throws -> RebaseResult
    func continueRebase(repositoryPath: String, workingTreeClean: Bool, noVerify: Bool) async throws -> RebaseResult
    func abortRebase(repositoryPath: String) async throws
    func rebaseInteractive(repositoryPath: String, todo: String, lastRetainedCommitRef: String?, noVerify: Bool, action: MultiCommitOperationKind) async throws -> RebaseResult
    // MARK: Cherry-pick
    func cherryPick(repositoryPath: String, shas: [String]) async throws -> CherryPickResult
    func continueCherryPick(repositoryPath: String, workingTreeClean: Bool) async throws -> CherryPickResult
    func abortCherryPick(repositoryPath: String) async throws
    // MARK: Undo (`git reset <sha> --hard` after checking out the branch)
    func resetHard(repositoryPath: String, sha: String) async throws
    // MARK: State probes
    func isRebaseInProgress(gitDir: String) -> Bool
    func isCherryPickInProgress(gitDir: String) -> Bool
}

// MARK: Live implementation

/// `Process`-backed implementation. Args/env mirror the reference exactly:
/// `rebase.backend=merge` pin (`gitRebaseArguments`), `GIT_EDITOR=:` for
/// non-interactive continues, `sequence.editor=cat "<todo>" >` for interactive
/// rebases, cherry-pick `--empty=keep -m 1`.
public struct LiveMultiCommitService: MultiCommitService, Sendable {
    public init() {}

    // MARK: Rebase

    public func rebase(repositoryPath: String, baseBranch: String, targetBranch: String) async throws -> RebaseResult {
        let args = ["-c", "rebase.backend=merge", "rebase", "--", baseBranch, targetBranch]
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        let error = classifyGitResult(result, args: args, successExitCodes: [0])
        if result.exitCode == 0 {
            return isRebaseUpToDateMessage(result.stdoutString) ? .alreadyUpToDate : .completedWithoutError
        }
        if let classified = parseRebaseResult(exitCode: result.exitCode, stdout: result.stdoutString, error: error?.kind) {
            return classified
        }
        throw error ?? GitError(kind: nil, args: args, stdout: result.stdoutString, stderr: result.stderrString, exitCode: result.exitCode)
    }

    public func continueRebase(repositoryPath: String, workingTreeClean: Bool, noVerify: Bool = false) async throws -> RebaseResult {
        // Mirrors `continueRebase`: nothing staged → the current commit is
        // empty after conflict resolution, so skip it; else continue.
        // (`GIT_EDITOR=:` keeps git from opening an editor.)
        var args = ["rebase", workingTreeClean ? "--skip" : "--continue"]
        if noVerify { args.append("--no-verify") }
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath, environment: ["GIT_EDITOR": ":"])
        let error = classifyGitResult(result, args: args, successExitCodes: [0])
        if let classified = parseRebaseResult(exitCode: result.exitCode, stdout: result.stdoutString, error: error?.kind) {
            return classified
        }
        throw error ?? GitError(kind: nil, args: args, stdout: result.stdoutString, stderr: result.stderrString, exitCode: result.exitCode)
    }

    public func abortRebase(repositoryPath: String) async throws {
        let args = ["rebase", "--abort"]
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
    }

    public func rebaseInteractive(
        repositoryPath: String,
        todo: String,
        lastRetainedCommitRef: String?,
        noVerify: Bool = false,
        action: MultiCommitOperationKind = .squash
    ) async throws -> RebaseResult {
        let todoURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("GitDesktop-\(action.rawValue.lowercased())-todo-\(UUID().uuidString)")
        try todo.write(to: todoURL, atomically: true, encoding: .utf8)
        defer { try? FileManager.default.removeItem(at: todoURL) }
        // Replaces the interactive todo with our generated file, verbatim from
        // `rebaseInteractive` (`sequence.editor=cat "<todo>" >`).
        let ref = lastRetainedCommitRef ?? "--root"
        var args = ["-c", "sequence.editor=cat \"\(todoURL.path)\" >", "rebase"]
        if noVerify { args.append("--no-verify") }
        args += ["-i", ref]
        let result = try await GitProcess.run(
            args, workingDirectory: repositoryPath, environment: ["GIT_EDITOR": ":"])
        let error = classifyGitResult(result, args: args, successExitCodes: [0])
        if result.exitCode == 0 {
            return isRebaseUpToDateMessage(result.stdoutString) ? .alreadyUpToDate : .completedWithoutError
        }
        if let classified = parseRebaseResult(exitCode: result.exitCode, stdout: result.stdoutString, error: error?.kind) {
            return classified
        }
        throw error ?? GitError(kind: nil, args: args, stdout: result.stdoutString, stderr: result.stderrString, exitCode: result.exitCode)
    }

    // MARK: Cherry-pick

    public func cherryPick(repositoryPath: String, shas: [String]) async throws -> CherryPickResult {
        // `--empty=keep` keeps empty picks in history; `-m 1` follows the
        // first parent of merge commits.
        let args = ["cherry-pick"] + shas + ["--empty=keep", "-m", "1"]
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        let error = classifyGitResult(result, args: args, successExitCodes: [0])
        if result.exitCode == 0 { return .completedWithoutError }
        if let classified = parseCherryPickResult(exitCode: result.exitCode, error: error?.kind) {
            return classified
        }
        throw error ?? GitError(kind: nil, args: args, stdout: result.stdoutString, stderr: result.stderrString, exitCode: result.exitCode)
    }

    public func continueCherryPick(repositoryPath: String, workingTreeClean: Bool) async throws -> CherryPickResult {
        // Empty resolution commits the empty pick so it stays in history
        // (`commit --allow-empty`); else `--continue`.
        let args = workingTreeClean ? ["commit", "--allow-empty"] : ["cherry-pick", "--continue"]
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath, environment: ["GIT_EDITOR": ":"])
        let error = classifyGitResult(result, args: args, successExitCodes: [0])
        if result.exitCode == 0 { return .completedWithoutError }
        if let classified = parseCherryPickResult(exitCode: result.exitCode, error: error?.kind) {
            return classified
        }
        throw error ?? GitError(kind: nil, args: args, stdout: result.stdoutString, stderr: result.stderrString, exitCode: result.exitCode)
    }

    public func abortCherryPick(repositoryPath: String) async throws {
        let args = ["cherry-pick", "--abort"]
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
    }

    // MARK: Undo

    public func resetHard(repositoryPath: String, sha: String) async throws {
        // Undo shape from the dispatcher (`git reset <beforeSha> --hard`;
        // the caller checks out the target branch first).
        let args = ["reset", sha, "--hard"]
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
    }

    // MARK: State probes

    /// `REBASE_HEAD` exists while a rebase is underway (`isRebaseHeadSet`).
    public func isRebaseInProgress(gitDir: String) -> Bool {
        FileManager.default.fileExists(atPath: (gitDir as NSString).appendingPathComponent("REBASE_HEAD"))
    }

    /// `CHERRY_PICK_HEAD` exists while a cherry-pick is underway
    /// (`isCherryPickHeadFound`).
    public func isCherryPickInProgress(gitDir: String) -> Bool {
        FileManager.default.fileExists(atPath: (gitDir as NSString).appendingPathComponent("CHERRY_PICK_HEAD"))
    }

    /// Reads the current rebase position from `.git/rebase-merge/*`
    /// (`getRebaseSnapshot`). Returns nil when no rebase is active or the
    /// files cannot be parsed (finished/aborted mid-read).
    public func rebaseSnapshot(gitDir: String, commits: [CommitOneLine]) -> MultiCommitProgress? {
        func read(_ name: String) -> String? {
            try? String(contentsOfFile: (gitDir as NSString).appendingPathComponent(name), encoding: .utf8)
        }
        guard isRebaseInProgress(gitDir: gitDir),
              let position = rebaseSnapshotProgress(
                msgnumText: read("rebase-merge/msgnum"),
                endText: read("rebase-merge/end"),
                origHead: read("rebase-merge/orig-head"),
                onto: read("rebase-merge/onto"))
        else { return nil }
        let summary = commits.indices.contains(position.position - 1)
            ? commits[position.position - 1].summary : ""
        return MultiCommitProgress(
            value: position.value, position: position.position,
            totalCommitCount: position.total, currentCommitSummary: summary)
    }

    /// Reads the current cherry-pick position from `.git/sequencer/*`
    /// (`getCherryPickSnapshot`). Returns nil when no cherry-pick is active.
    public func cherryPickSnapshot(gitDir: String, alreadyPicked: [CommitOneLine]) -> (progress: MultiCommitProgress, remaining: [CommitOneLine])? {
        guard isCherryPickInProgress(gitDir: gitDir),
              let todo = try? String(
                contentsOfFile: (gitDir as NSString).appendingPathComponent("sequencer/todo"),
                encoding: .utf8),
              let remaining = parseSequencerTodo(todo),
              let progress = cherryPickSnapshotProgress(
                cherryPickedCount: alreadyPicked.count, remainingCommits: remaining)
        else { return nil }
        return (progress, remaining)
    }
}

// MARK: Mock

/// Recorded invocations for UI tests and Previews. Each drag-drop target maps
/// to exactly one op: branch → `cherryPicked`, commit → `squashed` (via
/// `rebaseInteractive`), insertion → `reordered` (via `rebaseInteractive`).
public final class MockMultiCommitService: MultiCommitService, Sendable {
    public enum RecordedOp: Sendable, Equatable {
        case rebased(base: String, target: String)
        case continuedRebase
        case abortedRebase
        case interactiveRebase(action: MultiCommitOperationKind)
        case cherryPicked(shas: [String])
        case continuedCherryPick
        case abortedCherryPick
        case resetHard(sha: String)
    }

    public private(set) var recordedOps: [RecordedOp] = []
    public var stubRebaseResult: RebaseResult = .completedWithoutError
    public var stubCherryPickResult: CherryPickResult = .completedWithoutError
    public var stubRebaseActive = false
    public var stubCherryPickActive = false

    private let lock = NSLock()

    public init() {}

    private func record(_ op: RecordedOp) {
        lock.lock()
        defer { lock.unlock() }
        recordedOps.append(op)
    }

    public func rebase(repositoryPath: String, baseBranch: String, targetBranch: String) async throws -> RebaseResult {
        record(.rebased(base: baseBranch, target: targetBranch))
        return stubRebaseResult
    }

    public func continueRebase(repositoryPath: String, workingTreeClean: Bool, noVerify: Bool) async throws -> RebaseResult {
        record(.continuedRebase)
        return stubRebaseResult
    }

    public func abortRebase(repositoryPath: String) async throws {
        record(.abortedRebase)
    }

    public func rebaseInteractive(repositoryPath: String, todo: String, lastRetainedCommitRef: String?, noVerify: Bool, action: MultiCommitOperationKind) async throws -> RebaseResult {
        record(.interactiveRebase(action: action))
        return stubRebaseResult
    }

    public func cherryPick(repositoryPath: String, shas: [String]) async throws -> CherryPickResult {
        record(.cherryPicked(shas: shas))
        return stubCherryPickResult
    }

    public func continueCherryPick(repositoryPath: String, workingTreeClean: Bool) async throws -> CherryPickResult {
        record(.continuedCherryPick)
        return stubCherryPickResult
    }

    public func abortCherryPick(repositoryPath: String) async throws {
        record(.abortedCherryPick)
    }

    public func resetHard(repositoryPath: String, sha: String) async throws {
        record(.resetHard(sha: sha))
    }

    public func isRebaseInProgress(gitDir: String) -> Bool { stubRebaseActive }
    public func isCherryPickInProgress(gitDir: String) -> Bool { stubCherryPickActive }
}
