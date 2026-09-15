import Foundation

// MARK: - MergeService
// Git operations for Task 5: merge, merge-base, mergeability preview and
// ours/theirs checkout. Mirrors `lib/git/merge.ts` + `lib/git/merge-tree.ts`
// arg-for-arg. Branch CRUD (`createBranch`, `renameBranch`, `deleteLocalBranch`)
// mirrors `lib/git/branch.ts`.

public protocol MergeService: Sendable {
    func merge(repositoryPath: String, branch: String, options: MergeOptions) async throws -> MergeResult
    func abortMerge(repositoryPath: String) async throws
    func mergeBase(repositoryPath: String, first: String, second: String) async throws -> String?
    func determineMergeability(repositoryPath: String, oursSHA: String, theirsSHA: String) async throws -> MergeTreeResult
    func checkoutSide(repositoryPath: String, paths: [String], side: ManualConflictResolution) async throws
}

public struct LiveMergeService: MergeService, Sendable {
    public init() {}

    public func merge(repositoryPath: String, branch: String, options: MergeOptions) async throws -> MergeResult {
        let invocation = ["merge"] + options.gitArgsSuffix + [branch]
        let result = try await GitProcess.run(invocation, workingDirectory: repositoryPath)
        if result.exitCode != 0 {
            if parseGitError(result.stderrString) == .mergeConflicts
                || parseGitError(result.stdoutString) == .mergeConflicts {
                return .failed
            }
            if let error = classifyGitResult(result, args: invocation, successExitCodes: [0]) {
                throw error
            }
            return .failed
        }
        if options.squash {
            let commit = try await GitProcess.run(["commit", "--no-edit"], workingDirectory: repositoryPath)
            if commit.exitCode != 0 {
                if let error = classifyGitResult(commit, args: ["commit", "--no-edit"], successExitCodes: [0]) {
                    throw error
                }
                return .failed
            }
        }
        return result.stdoutString == "Already up to date.\n" ? .alreadyUpToDate : .success
    }

    public func abortMerge(repositoryPath: String) async throws {
        let result = try await GitProcess.run(["merge", "--abort"], workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: ["merge", "--abort"], successExitCodes: [0]) {
            throw error
        }
    }

    public func mergeBase(repositoryPath: String, first: String, second: String) async throws -> String? {
        let result = try await GitProcess.run(
            ["merge-base", first, second], workingDirectory: repositoryPath)
        if result.exitCode == 1 || result.exitCode == 128 { return nil }
        if let error = classifyGitResult(result, args: ["merge-base", first, second], successExitCodes: [0]) {
            throw error
        }
        let sha = result.stdoutString.trimmingCharacters(in: .whitespacesAndNewlines)
        return sha.isEmpty ? nil : sha
    }

    public func determineMergeability(
        repositoryPath: String,
        oursSHA: String,
        theirsSHA: String
    ) async throws -> MergeTreeResult {
        let args = ["merge-tree", "--write-tree", "--name-only", "--no-messages", "-z", oursSHA, theirsSHA]
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if result.exitCode == 0 || result.exitCode == 1 {
            let conflicted = mergeTreeConflictedFileCount(stdout: result.stdoutString)
            return conflicted > 0 ? .conflicts(conflictedFiles: conflicted) : .clean
        }
        if parseGitError(result.stderrString) == .cannotMergeUnrelatedHistories
            || parseGitError(result.stdoutString) == .cannotMergeUnrelatedHistories {
            return .invalid
        }
        if let error = classifyGitResult(result, args: args, successExitCodes: [0, 1]) {
            throw error
        }
        return .invalid
    }

    public func checkoutSide(
        repositoryPath: String,
        paths: [String],
        side: ManualConflictResolution
    ) async throws {
        guard !paths.isEmpty else { return }
        let args = ["checkout", side.gitFlag, "--"] + paths
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) {
            throw error
        }
    }
}

// MARK: Branch CRUD (mirrors `lib/git/branch.ts`)

public enum BranchOperations {
    public static func createBranch(
        repositoryPath: String,
        name: String,
        startPoint: String?,
        noTrack: Bool = false
    ) async throws {
        var args = ["branch", name]
        if let startPoint { args += [startPoint] }
        if noTrack { args.append("--no-track") }
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) {
            throw error
        }
    }

    public static func renameBranch(
        repositoryPath: String,
        oldName: String,
        newName: String,
        force: Bool = false
    ) async throws {
        let args = ["branch", force ? "-M" : "-m", oldName, newName]
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) {
            throw error
        }
    }

    public static func deleteLocalBranch(repositoryPath: String, branchName: String) async throws {
        let args = ["branch", "-D", branchName]
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) {
            throw error
        }
    }
}

// MARK: Conflict markers (mirrors `lib/git/diff-check.ts`)

/// Counts leftover conflict markers per path via `git diff --check`.
/// Fills the gap left by Task 1's `status()` (which passes empty
/// `ConflictDetails`, leaving `conflictMarkerCount` at 0): the merge wizard
/// consults these counts when building `UnmergedFileEntry` rows.
public enum ConflictMarkers {
    /// Pure parse of `git diff --check` output.
    /// Counts `path:line: leftover conflict marker` lines per path.
    public static func parseCounts(stdout: String) -> [String: Int] {
        var counts: [String: Int] = [:]
        let pattern = #"^(.+?):\d+: leftover conflict marker"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.anchorsMatchLines]) else {
            return counts
        }
        let range = NSRange(stdout.startIndex..., in: stdout)
        for match in regex.matches(in: stdout, range: range) {
            guard match.numberOfRanges == 2,
                  let pathRange = Range(match.range(at: 1), in: stdout)
            else { continue }
            let path = String(stdout[pathRange])
            counts[path, default: 0] += 1
        }
        return counts
    }

    public static func countsByPath(repositoryPath: String) async throws -> [String: Int] {
        let args = ["diff", "--check"]
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if result.exitCode != 0 && result.exitCode != 2 {
            if let error = classifyGitResult(result, args: args, successExitCodes: [0, 2]) {
                throw error
            }
        }
        return parseCounts(stdout: result.stdoutString)
    }

    /// Builds unmerged-file rows from working-directory changes, preferring
    /// the parser's marker count and falling back to `diff --check` counts.
    public static func unmergedEntries(
        files: [WorkingDirectoryFileChange],
        markerCounts: [String: Int] = [:]
    ) -> [UnmergedFileEntry] {
        files.compactMap { file in
            guard file.status.isConflicted else { return nil }
            switch file.status {
            case .conflictedWithMarkers(let action, let us, let them, let count, let submodule):
                let effective = count > 0 ? count : (markerCounts[file.path] ?? 0)
                let status = ConflictedFileStatus.from(appStatus: .conflictedWithMarkers(
                    action: action, us: us, them: them,
                    conflictMarkerCount: effective, submoduleStatus: submodule))
                guard let status else { return nil }
                return UnmergedFileEntry(path: file.path, status: status)
            default:
                guard let status = ConflictedFileStatus.from(appStatus: file.status) else { return nil }
                return UnmergedFileEntry(path: file.path, status: status)
            }
        }
    }
}

// MARK: Mock

public actor MockMergeService: MergeService {
    public var mergeResults: [MergeResult]
    public var mergeability: MergeTreeResult
    public var mergeBaseSHA: String?
    public private(set) var mergedBranches: [(branch: String, options: MergeOptions)] = []
    public private(set) var abortedCount = 0
    public private(set) var checkedOutSides: [(paths: [String], side: ManualConflictResolution)] = []

    public init(
        mergeResults: [MergeResult] = [.success],
        mergeability: MergeTreeResult = .clean,
        mergeBaseSHA: String? = "base-sha"
    ) {
        self.mergeResults = mergeResults
        self.mergeability = mergeability
        self.mergeBaseSHA = mergeBaseSHA
    }

    public func merge(repositoryPath: String, branch: String, options: MergeOptions) async throws -> MergeResult {
        mergedBranches.append((branch, options))
        guard !mergeResults.isEmpty else { return .success }
        return mergeResults.removeFirst()
    }

    public func abortMerge(repositoryPath: String) async throws {
        abortedCount += 1
    }

    public func mergeBase(repositoryPath: String, first: String, second: String) async throws -> String? {
        mergeBaseSHA
    }

    public func determineMergeability(
        repositoryPath: String,
        oursSHA: String,
        theirsSHA: String
    ) async throws -> MergeTreeResult {
        mergeability
    }

    public func checkoutSide(
        repositoryPath: String,
        paths: [String],
        side: ManualConflictResolution
    ) async throws {
        checkedOutSides.append((paths, side))
    }
}
