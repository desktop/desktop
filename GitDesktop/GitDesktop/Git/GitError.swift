import Foundation

// MARK: - GitError
// Port of dugite's `GitError` enum + `GitErrorRegexes` + `parseError`
// (see `electron/app/src/lib/git/...`: `core.ts` resolves via
// `parseError(stderr) ?? parseError(stdout)` when the exit code is not in
// `successExitCodes`). Regexes below are verbatim ports of the dugite table
// gathered from the reference app.
// GitHub-server error cases (GH001–GH007, push protection) are retained for
// display of raw git stderr only; there is no GitHub API integration.

/// Classified git failure. Port of dugite `GitError`.
public enum GitErrorKind: String, Sendable, CaseIterable {
    case badConfigValue
    case sshKeyAuditUnverified
    case httpsAuthenticationFailed
    case sshAuthenticationFailed
    case sshPermissionDenied
    case remoteDisconnection
    case hostDown
    case rebaseConflicts
    case mergeConflicts
    case httpsRepositoryNotFound
    case sshRepositoryNotFound
    case pushNotFastForward
    case branchDeletionFailed
    case defaultBranchDeletionFailed
    case revertConflicts
    case emptyRebasePatch
    case noMatchingRemoteBranch
    case noExistingRemoteBranch
    case nothingToCommit
    case noSubmoduleMapping
    case submoduleRepositoryDoesNotExist
    case invalidSubmoduleSHA
    case localPermissionDenied
    case invalidMerge
    case invalidRebase
    case nonFastForwardMergeIntoEmptyHead
    case patchDoesNotApply
    case branchAlreadyExists
    case badRevision
    case notAGitRepository
    case cannotMergeUnrelatedHistories
    case lfsAttributeDoesNotMatch
    case branchRenameFailed
    case pathDoesNotExist
    case invalidObjectName
    case outsideRepository
    case lockFileAlreadyExists
    case noMergeToAbort
    case localChangesOverwritten
    case unresolvedConflicts
    case gpgFailedToSignData
    case conflictModifyDeletedInBranch
    case pushWithFileSizeExceedingLimit
    case hexBranchNameRejected
    case forcePushRejected
    case invalidRefLength
    case protectedBranchRequiresReview
    case protectedBranchForcePush
    case protectedBranchDeleteRejected
    case protectedBranchRequiredStatus
    case pushWithPrivateEmail
    case configLockFileAlreadyExists
    case remoteAlreadyExists
    case tagAlreadyExists
    case mergeWithLocalChanges
    case rebaseWithLocalChanges
    case mergeCommitNoMainlineOption
    case unsafeDirectory
    case pathExistsButNotInRef
    case pushWithSecretDetected
}

/// A classified git failure with the raw terminal output attached.
public struct GitError: Error, Sendable {
    public var kind: GitErrorKind?
    public var args: [String]
    public var stdout: String
    public var stderr: String
    public var exitCode: Int32

    public init(kind: GitErrorKind?, args: [String], stdout: String, stderr: String, exitCode: Int32) {
        self.kind = kind
        self.args = args
        self.stdout = stdout
        self.stderr = stderr
        self.exitCode = exitCode
    }

    /// User-facing description, or nil when the caller should show raw stderr.
    /// Mirrors `getDescriptionForError` in `core.ts` (abridged for Task 1).
    public var userDescription: String? {
        switch kind {
        case .httpsAuthenticationFailed, .sshAuthenticationFailed, .sshPermissionDenied:
            return "Authentication failed. Check your credentials and try again."
        case .hostDown, .remoteDisconnection:
            return "Could not reach the remote. Check your network connection."
        case .httpsRepositoryNotFound, .sshRepositoryNotFound:
            return "Repository not found. The remote URL may be wrong or you may not have access."
        case .pushNotFastForward:
            return "The remote contains work that is not in your branch. Fetch and merge, then push again."
        case .nothingToCommit:
            return "Nothing to commit. The working directory is clean."
        case .localChangesOverwritten:
            return "Your local changes would be overwritten. Commit or stash them first."
        case .unresolvedConflicts:
            return "Resolve all conflicts before continuing."
        case .branchAlreadyExists:
            return "A branch with that name already exists."
        case .tagAlreadyExists:
            return "A tag with that name already exists."
        case .unsafeDirectory:
            return "Git blocked this repository as dubiously owned. Add it to `safe.directory` to proceed."
        case .notAGitRepository:
            return "This is not a git repository."
        case .lockFileAlreadyExists, .configLockFileAlreadyExists:
            return "Another git process is holding a lock file. If no git process is running, remove the `.lock` file and try again."
        case .pushWithSecretDetected:
            return "The push was blocked because it contains a secret. Remove the secret and try again."
        case .lfsAttributeDoesNotMatch:
            return "An LFS attribute mismatch was detected. Check your `.gitattributes`."
        case .none:
            return nil
        default:
            return nil
        }
    }

    public var displayMessage: String {
        userDescription ?? GitProcess.terminalTail(stderr.isEmpty ? stdout : stderr)
    }
}

private struct GitErrorPattern {
    var kind: GitErrorKind
    var pattern: String
    var options: NSRegularExpression.Options = []
}

// Verbatim port of the dugite `GitErrorRegexes` table.
private let gitErrorPatterns: [GitErrorPattern] = [
    .init(kind: .badConfigValue, pattern: #"fatal: bad (?:numeric|boolean) config value '(.+)' for '(.+)'"#),
    .init(kind: .sshKeyAuditUnverified, pattern: #"ERROR: ([\s\S]+?)\n+\[EPOLICYKEYAGE\]\n+fatal: Could not read from remote repository\."#),
    .init(kind: .httpsAuthenticationFailed, pattern: #"fatal: Authentication failed for 'https?://"#),
    .init(kind: .sshAuthenticationFailed, pattern: #"fatal: Authentication failed"#),
    .init(kind: .sshPermissionDenied, pattern: #"fatal: Could not read from remote repository\."#),
    .init(kind: .httpsAuthenticationFailed, pattern: #"The requested URL returned error: 403"#),
    .init(kind: .remoteDisconnection, pattern: #"fatal: [Tt]he remote end hung up unexpectedly"#),
    .init(kind: .hostDown, pattern: #"fatal: unable to access '(.+)': Failed to connect to (.+): Host is down"#),
    .init(kind: .hostDown, pattern: #"Cloning into '(.+)'\.\.\.\nfatal: unable to access '(.+)': Could not resolve host: (.+)"#),
    .init(kind: .rebaseConflicts, pattern: #"Resolve all conflicts manually, mark them as resolved with"#),
    .init(kind: .mergeConflicts, pattern: #"(Merge conflict|Automatic merge failed; fix conflicts and then commit the result)"#),
    .init(kind: .httpsRepositoryNotFound, pattern: #"fatal: repository '(.+)' not found"#),
    .init(kind: .sshRepositoryNotFound, pattern: #"ERROR: Repository not found"#),
    .init(kind: .pushNotFastForward, pattern: #"\((non-fast-forward|fetch first)\)\nerror: failed to push some refs to '.*'"#),
    .init(kind: .branchDeletionFailed, pattern: #"error: unable to delete '(.+)': remote ref does not exist"#),
    .init(kind: .defaultBranchDeletionFailed, pattern: #"\[remote rejected\] (.+) \(deletion of the current branch prohibited\)"#),
    .init(kind: .revertConflicts, pattern: #"error: could not revert .*\nhint: after resolving the conflicts, mark the corrected paths"#),
    .init(kind: .emptyRebasePatch, pattern: #"No changes - did you forget to use 'git add'\?"#),
    .init(kind: .noMatchingRemoteBranch, pattern: #"There are no candidates for (rebasing|merging) among the refs that you just fetched\."#),
    .init(kind: .noExistingRemoteBranch, pattern: #"Your configuration specifies to merge with the ref '(.+)'\nfrom the remote, but no such ref was fetched\."#),
    .init(kind: .nothingToCommit, pattern: #"nothing to commit"#),
    .init(kind: .noSubmoduleMapping, pattern: #"[Nn]o submodule mapping found in \.gitmodules for path '(.+)'"#),
    .init(kind: .submoduleRepositoryDoesNotExist, pattern: #"fatal: repository '(.+)' does not exist\nfatal: clone of '.+' into submodule path '(.+)' failed"#),
    .init(kind: .invalidSubmoduleSHA, pattern: #"Fetched in submodule path '(.+)', but it did not contain (.+)\. Direct fetching of that commit failed\."#),
    .init(kind: .localPermissionDenied, pattern: #"fatal: could not create work tree dir '(.+)'.*: Permission denied"#),
    .init(kind: .invalidMerge, pattern: #"merge: (.+) - not something we can merge"#),
    .init(kind: .invalidRebase, pattern: #"invalid upstream (.+)"#),
    .init(kind: .nonFastForwardMergeIntoEmptyHead, pattern: #"fatal: Non-fast-forward commit does not make sense into an empty head"#),
    .init(kind: .patchDoesNotApply, pattern: #"error: (.+): (patch does not apply|already exists in working directory)"#),
    .init(kind: .branchAlreadyExists, pattern: #"fatal: [Aa] branch named '(.+)' already exists\.?"#),
    .init(kind: .badRevision, pattern: #"fatal: bad revision '(.*)'"#),
    .init(kind: .notAGitRepository, pattern: #"fatal: [Nn]ot a git repository \(or any of the parent directories\): (.*)"#),
    .init(kind: .cannotMergeUnrelatedHistories, pattern: #"fatal: refusing to merge unrelated histories"#),
    .init(kind: .lfsAttributeDoesNotMatch, pattern: #"The .+ attribute should be .+ but is .+"#),
    .init(kind: .branchRenameFailed, pattern: #"fatal: Branch rename failed"#),
    .init(kind: .pathDoesNotExist, pattern: #"fatal: path '(.+)' does not exist .+"#),
    .init(kind: .invalidObjectName, pattern: #"fatal: invalid object name '(.+)'\."#),
    .init(kind: .outsideRepository, pattern: #"fatal: .+: '(.+)' is outside repository"#),
    .init(kind: .lockFileAlreadyExists, pattern: #"Another git process seems to be running in this repository, e\.g\."#),
    .init(kind: .noMergeToAbort, pattern: #"fatal: There is no merge to abort"#),
    .init(kind: .localChangesOverwritten, pattern: #"error: (?:Your local changes to the following|The following untracked working tree) files would be overwritten by checkout:"#),
    .init(kind: .unresolvedConflicts, pattern: #"You must edit all merge conflicts and then"#),
    .init(kind: .unresolvedConflicts, pattern: #"fatal: Exiting because of an unresolved conflict"#),
    .init(kind: .gpgFailedToSignData, pattern: #"error: gpg failed to sign the data"#),
    .init(kind: .conflictModifyDeletedInBranch, pattern: #"CONFLICT \(modify/delete\): (.+) deleted in (.+) and modified in (.+)"#),
    .init(kind: .pushWithFileSizeExceedingLimit, pattern: #"error: GH001: "#),
    .init(kind: .hexBranchNameRejected, pattern: #"error: GH002: "#),
    .init(kind: .forcePushRejected, pattern: #"error: GH003: Sorry, force-pushing to (.+) is not allowed\."#),
    .init(kind: .invalidRefLength, pattern: #"error: GH005: Sorry, refs longer than (.+) bytes are not allowed"#),
    .init(kind: .protectedBranchRequiresReview, pattern: #"error: GH006: Protected branch update failed"#),
    .init(kind: .protectedBranchForcePush, pattern: #"error: GH006: Protected branch update failed for (.+)\nremote: error: Cannot force-push to a protected branch"#),
    .init(kind: .protectedBranchDeleteRejected, pattern: #"error: GH006: Protected branch update failed for (.+)\nremote: error: Cannot delete a protected branch"#),
    .init(kind: .protectedBranchRequiredStatus, pattern: #"error: GH006: Protected branch update failed for (.+)\.\nremote: error: Required status check"#),
    .init(kind: .pushWithPrivateEmail, pattern: #"error: GH007: Your push would publish a private email address\."#),
    .init(kind: .configLockFileAlreadyExists, pattern: #"error: could not lock config file (.+): File exists"#),
    .init(kind: .remoteAlreadyExists, pattern: #"error: remote (.+) already exists\."#),
    .init(kind: .tagAlreadyExists, pattern: #"fatal: tag '(.+)' already exists"#),
    .init(kind: .mergeWithLocalChanges, pattern: #"error: Your local changes to the following files would be overwritten by merge:\n"#),
    .init(kind: .rebaseWithLocalChanges, pattern: #"error: cannot (pull with rebase|rebase): You have unstaged changes\."#),
    .init(kind: .mergeCommitNoMainlineOption, pattern: #"error: commit (.+) is a merge but no -m option was given"#),
    .init(kind: .unsafeDirectory, pattern: #"fatal: detected dubious ownership in repository at (.+)"#),
    .init(kind: .pathExistsButNotInRef, pattern: #"fatal: path '(.+)' exists on disk, but not in '(.+)'"#),
    .init(kind: .pushWithSecretDetected, pattern: #"GITHUB PUSH PROTECTION[\.\s\S]+Push cannot contain secrets"#, options: [.dotMatchesLineSeparators]),
]

/// Matches terminal output against the taxonomy. Mirrors dugite `parseError`.
public func parseGitError(_ text: String) -> GitErrorKind? {
    for entry in gitErrorPatterns {
        guard let regex = try? NSRegularExpression(pattern: entry.pattern, options: entry.options) else { continue }
        let range = NSRange(text.startIndex..., in: text)
        if regex.firstMatch(in: text, range: range) != nil {
            return entry.kind
        }
    }
    return nil
}

/// Classify a completed git invocation (stderr first, then stdout),
/// returning nil when the exit code counts as success.
public func classifyGitResult(_ result: GitResult, args: [String], successExitCodes: Set<Int32> = [0]) -> GitError? {
    guard !successExitCodes.contains(result.exitCode) else { return nil }
    let kind = parseGitError(result.stderrString) ?? parseGitError(result.stdoutString)
    return GitError(
        kind: kind,
        args: args,
        stdout: result.stdoutString,
        stderr: result.stderrString,
        exitCode: result.exitCode)
}

/// Extract the `path` from a `could not lock config file <path>: File exists` error.
public func configLockFilePath(from stderr: String) -> String? {
    let pattern = #"^error: could not lock config file (.+?): File exists$"#
    guard let regex = try? NSRegularExpression(pattern: pattern, options: [.anchorsMatchLines]),
          let match = regex.firstMatch(in: stderr, range: NSRange(stderr.startIndex..., in: stderr)),
          match.numberOfRanges == 2,
          let range = Range(match.range(at: 1), in: stderr)
    else { return nil }
    return String(stderr[range])
}

/// Parse the new commit SHA from `git commit` output (`[branch sha] subject`).
/// Port of `parseCommitSHA` in `core.ts`. Root commits print
/// `[branch (root-commit) sha]`, so the SHA is the first hex token rather
/// than unconditionally the second whitespace-separated part.
public func parseCommitSHA(_ stdout: String) -> String? {
    let bracket = stdout.split(separator: "]", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? stdout
    let parts = bracket.split(separator: " ")
    guard parts.count >= 2 else { return nil }
    if let sha = parts.first(where: { $0.count >= 7 && $0.allSatisfy(\.isHexDigit) }) {
        return String(sha)
    }
    return String(parts[1])
}
