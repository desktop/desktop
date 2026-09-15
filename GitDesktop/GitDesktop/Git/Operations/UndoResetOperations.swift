import Foundation

// MARK: - Undo / reset / revert / checkout / amend
// Port of the Task 8 slice of `electron/app/src/lib/git/`:
// `reset.ts`, `revert.ts`, `checkout.ts` (commit path), `commit.ts` (amend),
// `update-ref.ts` (undo-first-commit) + the undo guards in
// `lib/stores/git-store.ts` (`undoCommit`/`undoFirstCommit`) and
// `lib/stores/app-store.ts` (`_startAmendingRepository`).

/// Reset modes. Port of `GitResetMode` in `reset.ts`.
public enum GitResetMode: Int, Sendable, Equatable, CaseIterable {
    case hard = 0
    case soft = 1
    case mixed = 2

    public var displayName: String {
        switch self {
        case .hard: return "Hard"
        case .soft: return "Soft"
        case .mixed: return "Mixed"
        }
    }

    public var explanation: String {
        switch self {
        case .hard:
            return "Discards all changes to tracked files. Uncommitted work will be lost."
        case .soft:
            return "Keeps all changes staged for commit."
        case .mixed:
            return "Keeps working directory changes but unstages them."
        }
    }
}

public enum UndoResetOperations {
    // MARK: Reset args

    public static func resetArgs(mode: GitResetMode, ref: String) -> [String] {
        switch mode {
        case .hard: return ["reset", "--hard", ref]
        case .soft: return ["reset", "--soft", ref]
        case .mixed: return ["reset", ref]
        }
    }

    public static func resetPathsArgs(mode: GitResetMode, ref: String, paths: [String]) -> [String] {
        resetArgs(mode: mode, ref: ref) + ["--"] + paths
    }

    public static func unstageAllArgs() -> [String] {
        ["reset", "--", "."]
    }

    public static func deleteRefArgs(ref: String) -> [String] {
        ["update-ref", "-d", ref]
    }

    // MARK: Revert args

    /// Port of `revertCommit`: merge commits need `-m 1`.
    public static func revertArgs(sha: String, parentCount: Int) -> [String] {
        var args = ["revert"]
        if parentCount > 1 { args += ["-m", "1"] }
        args.append(sha)
        return args
    }

    // MARK: Checkout args

    /// Detached checkout of a commit: literally `git checkout <sha>`.
    public static func checkoutCommitArgs(sha: String, progress: Bool = false) -> [String] {
        var args = ["checkout"]
        if progress { args.append("--progress") }
        args.append(sha)
        return args
    }

    /// Branch checkout, creating a local branch from a remote when needed.
    public static func checkoutBranchArgs(branchName: String, isRemote: Bool) -> [String] {
        var args = ["checkout", branchName]
        if isRemote {
            let short = branchName.split(separator: "/").dropFirst().joined(separator: "/")
            args += ["-b", short.isEmpty ? branchName : short]
        }
        args.append("--")
        return args
    }

    public static func checkoutPathsArgs(paths: [String]) -> [String] {
        ["checkout", "HEAD", "--"] + paths
    }

    // MARK: Undo guards

    /// Undo is only offered for the most recent *local* commit: it must have
    /// no tags and (in the full app) no push record. The SHA-level guard we
    /// can check locally is "commit is the branch tip".
    public static func canUndoCommit(commitSha: String, tipSha: String?, tags: [String]) -> Bool {
        guard let tipSha, commitSha == tipSha else { return false }
        return tags.isEmpty
    }

    /// Whether undo needs the "local changes will be lost" confirm: any dirty
    /// working directory, or (for merges) always warn with merge-specific text.
    public static func needsUndoWarning(isWorkingDirectoryClean: Bool, isMergeCommit: Bool) -> Bool {
        if isMergeCommit { return true }
        return !isWorkingDirectoryClean
    }

    /// Whether reset needs the "you have changes in progress" confirm.
    public static func needsResetWarning(isWorkingDirectoryClean: Bool) -> Bool {
        !isWorkingDirectoryClean
    }

    // MARK: Amend

    /// Args for an amend commit via `git commit -F - --amend …` (message on stdin).
    public static func amendArgs(noVerify: Bool, signoff: Bool, allowEmpty: Bool) -> [String] {
        var args = ["commit", "-F", "-"]
        args.append("--amend")
        if noVerify { args.append("--no-verify") }
        if signoff { args.append("--signoff") }
        if allowEmpty { args.append("--allow-empty") }
        return args
    }
}

/// Amend session state. Port of the `commitToAmend` half of
/// `IRepositoryState` + `repository-state-cache.ts` (which keeps amending
/// only while HEAD still matches the amend target and no conflict flow runs).
public struct AmendState: Sendable, Equatable {
    public var commitToAmend: Commit?
    public var isAmending: Bool { commitToAmend != nil }

    public init(commitToAmend: Commit? = nil) {
        self.commitToAmend = commitToAmend
    }

    public mutating func startAmending(_ commit: Commit) {
        commitToAmend = commit
    }

    public mutating func stopAmending() {
        commitToAmend = nil
    }

    /// Keep amending only when HEAD still matches the target and no merge/
    /// rebase/cherry-pick flow is active (mirrors `repository-state-cache.ts`).
    public func keptAfterRefresh(headSha: String?, hasConflicts: Bool) -> AmendState {
        guard let target = commitToAmend, !hasConflicts else { return AmendState() }
        guard let headSha, headSha == target.sha else { return AmendState() }
        return self
    }
}

public enum UndoResetLiveOperations {
    /// Port of `GitStore.undoCommit`: first commit deletes HEAD, otherwise
    /// `git reset <parent>` (mixed). Restores deleted paths first so a first-
    /// commit undo leaves working files behind as untracked.
    public static func undoCommit(repositoryPath: String, commit: Commit) async throws {
        if commit.parentSHAs.isEmpty {
            // Restore deleted files so they survive the ref deletion.
            let status = try await LiveStatusSnapshot.workingDirectory(repositoryPath: repositoryPath)
            let deleted = status.files.filter { $0.status.kind == .deleted }.map(\.path)
            if !deleted.isEmpty {
                let args = UndoResetOperations.checkoutPathsArgs(paths: deleted)
                let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
                if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
            }
            let args = UndoResetOperations.deleteRefArgs(ref: "HEAD")
            // Reason string mirrors `deleteRef(repository, 'HEAD', 'Reverting first commit')`.
            let result = try await GitProcess.run(args + ["-m", "Reverting first commit"], workingDirectory: repositoryPath)
            // `update-ref -d HEAD` takes no -m in older gits; retry bare.
            if result.exitCode != 0 {
                let bare = try await GitProcess.run(
                    UndoResetOperations.deleteRefArgs(ref: "HEAD"), workingDirectory: repositoryPath)
                if let error = classifyGitResult(bare, args: UndoResetOperations.deleteRefArgs(ref: "HEAD"), successExitCodes: [0]) { throw error }
            }
            let unstage = try await GitProcess.run(
                UndoResetOperations.unstageAllArgs(), workingDirectory: repositoryPath)
            if let error = classifyGitResult(unstage, args: UndoResetOperations.unstageAllArgs(), successExitCodes: [0]) { throw error }
        } else {
            let args = UndoResetOperations.resetArgs(mode: .mixed, ref: commit.parentSHAs[0])
            let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
            if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
        }
    }

    public static func reset(repositoryPath: String, mode: GitResetMode, ref: String) async throws {
        let args = UndoResetOperations.resetArgs(mode: mode, ref: ref)
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
    }

    public static func revert(repositoryPath: String, sha: String, parentCount: Int) async throws {
        let args = UndoResetOperations.revertArgs(sha: sha, parentCount: parentCount)
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
    }

    public static func checkoutCommit(repositoryPath: String, sha: String) async throws {
        let args = UndoResetOperations.checkoutCommitArgs(sha: sha)
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
    }

    public static func updateSubmodulesAfterCheckout(repositoryPath: String, allowFileProtocol: Bool = false) async throws {
        try await SubmoduleLFSLiveOperations.updateSubmodules(
            repositoryPath: repositoryPath, allowFileProtocol: allowFileProtocol)
    }
}

/// Minimal status snapshot for undo-first-commit (avoids a GitStore dependency).
enum LiveStatusSnapshot {
    static func workingDirectory(repositoryPath: String) async throws -> WorkingDirectoryStatus {
        let args = ["--no-optional-locks", "status", "--untracked-files=all", "--branch", "--porcelain=2", "-z"]
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if result.exitCode == 128 { return WorkingDirectoryStatus(files: []) }
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
        let items = try StatusParser.parsePorcelainStatus(result.stdout)
        var files: [WorkingDirectoryFileChange] = []
        for item in items {
            guard case .entry(let entry) = item else { continue }
            let fileEntry = StatusParser.mapStatus(
                entry.statusCode, submoduleStatusCode: entry.submoduleStatusCode,
                renameOrCopyScore: entry.renameOrCopyScore)
            let appStatus = StatusParser.convertToAppStatus(
                path: entry.path, entry: fileEntry, oldPath: entry.oldPath)
            files.append(WorkingDirectoryFileChange(
                path: entry.path, status: appStatus, selection: .fromInitialSelection(.all)))
        }
        return .fromFiles(files)
    }
}
