import Foundation

// MARK: - StashOperations
// Port of `electron/app/src/lib/git/stash.ts` (see Docs/09-git-layer.md).
// Pure helpers are unit-testable without git installed; live functions use
// `GitProcess` with identical args/env to the reference app.

/// Magic marker Desktop appends to stash messages: `!!GitHub_Desktop<branch>`.
/// (The `GitHub_` prefix is historical; it only marks Desktop-created stashes.)
public let desktopStashEntryMarker = "!!GitHub_Desktop"

/// Build the Desktop stash message for a branch. Port of `createDesktopStashMessage`.
public func createDesktopStashMessage(branchName: String) -> String {
    "\(desktopStashEntryMarker)<\(branchName)>"
}

/// Extract the branch name from a stash message, or nil when the message was
/// not created by Desktop. Port of `extractBranchFromMessage`.
public func extractBranchFromMessage(_ message: String) -> String? {
    // Matches `!!GitHub_Desktop<branch>` at the end of the message.
    guard let open = message.range(of: "\(desktopStashEntryMarker)<", options: .backwards),
          message.hasSuffix(">") else { return nil }
    let start = open.upperBound
    let end = message.index(before: message.endIndex)
    guard start < end else { return nil }
    let branch = String(message[start..<end])
    return branch.isEmpty ? nil : branch
}

/// One parsed `git log -g refs/stash` record.
public struct StashLogRecord: Sendable, Equatable {
    public var name: String
    public var stashSha: String
    public var message: String
    public var tree: String
    public var parents: [String]

    public init(name: String, stashSha: String, message: String, tree: String, parents: [String]) {
        self.name = name
        self.stashSha = stashSha
        self.message = message
        self.tree = tree
        self.parents = parents
    }
}

public enum StashOperations {
    /// Field order for `git log -g --format=... refs/stash --`.
    /// Mirrors `createLogParser({name: %gD, stashSha: %H, message: %gs, tree: %T, parents: %P})`.
    public static let logFieldOrder = ["name", "stashSha", "message", "tree", "parents"]

    public static var logFormatArgs: [String] {
        ["-z", "--format=%gD%x00%H%x00%gs%x00%T%x00%P"]
    }

    public static func listArgs() -> [String] {
        ["log", "-g"] + logFormatArgs + ["refs/stash", "--"]
    }

    public static func pushArgs(message: String) -> [String] {
        ["stash", "push", "-m", message]
    }

    public static func popArgs(name: String) -> [String] {
        ["stash", "pop", "--quiet", name]
    }

    public static func dropArgs(name: String) -> [String] {
        ["stash", "drop", name]
    }

    public static func commitTreeArgs(parents: [String], message: String, tree: String) -> [String] {
        var args = ["commit-tree"]
        for parent in parents {
            args += ["-p", parent]
        }
        args += ["-m", message, "--no-gpg-sign", tree]
        return args
    }

    public static func storeArgs(message: String, commitID: String) -> [String] {
        ["stash", "store", "-m", message, commitID]
    }

    public static func showFilesArgs(stashSha: String) -> [String] {
        ["stash", "show", stashSha, "--raw", "--numstat", "-z",
         "--format=format:", "--no-show-signature", "--"]
    }

    /// Parse NUL-delimited stash log output into records.
    public static func parseLogRecords(_ output: Data) -> [StashLogRecord] {
        let records = LogParser.parseDelimitedRecords(output, fieldCount: logFieldOrder.count)
        return records.compactMap { fields in
            guard fields.count == logFieldOrder.count else { return nil }
            let parents = fields[4].isEmpty ? [] : fields[4].components(separatedBy: " ")
            return StashLogRecord(
                name: fields[0], stashSha: fields[1], message: fields[2],
                tree: fields[3], parents: parents)
        }
    }

    /// Filter parsed records down to Desktop-created entries.
    public static func desktopEntries(from records: [StashLogRecord]) -> [StashEntry] {
        let files = StashedFileChanges.notLoaded
        var out: [StashEntry] = []
        for record in records {
            guard let branchName = extractBranchFromMessage(record.message) else { continue }
            out.append(StashEntry(
                name: record.name, branchName: branchName,
                stashSha: record.stashSha, files: files,
                tree: record.tree, parents: record.parents))
        }
        return out
    }

    /// Total stash count mirrors the reference: `entries.length - 1`
    /// (the trailing incomplete chunk from `-z` parsing).
    public static func totalCount(recordCount: Int) -> Int {
        max(0, recordCount - 1)
    }

    /// `git stash push` reports success with exit 1 and no `error:` lines in
    /// some cases (see the "Here be dragons" comment in `stash.ts`).
    /// Returns true when the result should be treated as success.
    public static func pushSucceeded(exitCode: Int32, stderr: String) -> Bool {
        if exitCode == 0 { return true }
        if exitCode == 1 {
            return !stderr.components(separatedBy: "\n").contains(where: { $0.hasPrefix("error: ") })
        }
        return false
    }

    /// `git stash push` prints exactly this when there was nothing to save.
    public static func pushHadNoChanges(stdout: String) -> Bool {
        stdout == "No local changes to save\n"
    }
}

// MARK: - Live execution (free functions over a repo path)

public enum StashLiveOperations {
    /// Port of `getStashes`. Returns Desktop entries + total entry count.
    /// Exit 128 (no `refs/stash` or not a repo) yields empty.
    public static func getStashes(repositoryPath: String) async throws -> (desktopEntries: [StashEntry], totalCount: Int) {
        let result = try await GitProcess.run(StashOperations.listArgs(), workingDirectory: repositoryPath)
        if result.exitCode == 128 { return ([], 0) }
        if let error = classifyGitResult(result, args: StashOperations.listArgs(), successExitCodes: [0]) {
            throw error
        }
        let records = StashOperations.parseLogRecords(result.stdout)
        let entries = StashOperations.desktopEntries(from: records)
        return (entries, StashOperations.totalCount(recordCount: records.count))
    }

    /// Port of `createDesktopStashEntry`. Returns false when there was
    /// nothing to save (`No local changes to save`).
    public static func createStash(repositoryPath: String, branchName: String) async throws -> Bool {
        let message = createDesktopStashMessage(branchName: branchName)
        let args = StashOperations.pushArgs(message: message)
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        guard StashOperations.pushSucceeded(exitCode: result.exitCode, stderr: result.stderrString) else {
            if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
            throw GitError(kind: parseGitError(result.stderrString), args: args,
                           stdout: result.stdoutString, stderr: result.stderrString, exitCode: result.exitCode)
        }
        if StashOperations.pushHadNoChanges(stdout: result.stdoutString) { return false }
        return true
    }

    /// Find a Desktop entry by stash SHA (mirrors `getStashEntryMatchingSha`).
    public static func entry(matchingSha sha: String, in entries: [StashEntry]) -> StashEntry? {
        entries.first { $0.stashSha == sha }
    }

    /// Port of `dropDesktopStashEntry` (no-op when the SHA is unknown).
    @discardableResult
    public static func dropStash(repositoryPath: String, entries: [StashEntry], stashSha: String) async throws -> Bool {
        guard let entry = entry(matchingSha: stashSha, in: entries) else { return false }
        let args = StashOperations.dropArgs(name: entry.name)
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
        return true
    }

    /// Port of `popStashEntry`. A conflicted pop exits 1 with empty stderr
    /// and keeps the entry; the reference drops it manually in that case.
    /// Returns `.poppedCleanly` or `.poppedWithConflicts`.
    public enum PopResult: Sendable, Equatable {
        case poppedCleanly(dropped: Bool)
        case poppedWithConflicts
    }

    public static func popStash(repositoryPath: String, entries: [StashEntry], stashSha: String) async throws -> PopResult {
        guard let entry = entry(matchingSha: stashSha, in: entries) else {
            throw GitError(kind: .badRevision, args: ["stash", "pop"], stdout: "", stderr: "Unknown stash SHA", exitCode: 1)
        }
        let args = StashOperations.popArgs(name: entry.name)
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if result.exitCode == 0 { return .poppedCleanly(dropped: true) }
        if result.exitCode == 1 && result.stderrString.isEmpty {
            // Applied with conflicts; the entry survives — drop it manually
            // to match Desktop behavior, then report the conflict.
            _ = try? await dropStash(repositoryPath: repositoryPath, entries: entries, stashSha: stashSha)
            return .poppedWithConflicts
        }
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
        throw GitError(kind: parseGitError(result.stderrString), args: args,
                       stdout: result.stdoutString, stderr: result.stderrString, exitCode: result.exitCode)
    }

    /// Port of `moveStashEntry`: re-create the stash commit on a new branch
    /// message, store it, and drop the old entry.
    public static func moveStashEntry(repositoryPath: String, entry: StashEntry, toBranch branchName: String) async throws {
        let message = "On \(branchName): \(createDesktopStashMessage(branchName: branchName))"
        let commitArgs = StashOperations.commitTreeArgs(parents: entry.parents, message: message, tree: entry.tree)
        let commitResult = try await GitProcess.run(commitArgs, workingDirectory: repositoryPath)
        if let error = classifyGitResult(commitResult, args: commitArgs, successExitCodes: [0]) { throw error }
        let commitID = commitResult.stdoutString.trimmingCharacters(in: .whitespacesAndNewlines)
        let storeArgs = StashOperations.storeArgs(message: message, commitID: commitID)
        let storeResult = try await GitProcess.run(storeArgs, workingDirectory: repositoryPath)
        if let error = classifyGitResult(storeResult, args: storeArgs, successExitCodes: [0]) { throw error }
        let (entries, _) = try await getStashes(repositoryPath: repositoryPath)
        _ = try await dropStash(repositoryPath: repositoryPath, entries: entries, stashSha: entry.stashSha)
    }

    /// Port of `getStashedFiles`.
    public static func stashedFiles(repositoryPath: String, stashSha: String) async throws -> [CommittedFileChange] {
        let args = StashOperations.showFilesArgs(stashSha: stashSha)
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
        return LogParser.parseChangedFiles(result.stdoutString, commitish: stashSha, parentCommitish: "\(stashSha)^")
    }
}
