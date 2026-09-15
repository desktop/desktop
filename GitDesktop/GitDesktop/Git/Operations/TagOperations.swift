import Foundation

// MARK: - TagOperations
// Port of `electron/app/src/lib/git/tag.ts` (see Docs/09-git-layer.md).

public enum TagOperations {
    public static func createArgs(name: String, targetCommitSha: String) -> [String] {
        ["tag", "-a", "-m", "", name, targetCommitSha]
    }

    public static func deleteArgs(name: String) -> [String] {
        ["tag", "-d", name]
    }

    public static func listArgs() -> [String] {
        ["show-ref", "--tags", "-d"]
    }

    public static func tagsToPushArgs(remoteName: String, branchName: String) -> [String] {
        ["push", remoteName, branchName, "--follow-tags", "--dry-run", "--no-verify", "--porcelain"]
    }

    /// Normalize a `show-ref` tag ref: strip `refs/tags/` and a trailing `^{}`.
    /// Annotated tags print twice (blob object + peeled commit); the peeled
    /// line sorts last so the commit SHA wins in the resulting map.
    public static func normalizeTagName(_ rawTagName: String) -> String {
        var name = rawTagName
        if name.hasPrefix("refs/tags/") {
            name = String(name.dropFirst("refs/tags/".count))
        }
        if name.hasSuffix("^{}") {
            name = String(name.dropLast("^{}".count))
        }
        return name
    }

    /// Parse `git show-ref --tags -d` output into `tag -> commit SHA`.
    public static func parseShowRefTags(_ stdout: String) -> [String: String] {
        var tags: [String: String] = [:]
        for line in stdout.components(separatedBy: "\n") {
            guard !line.isEmpty else { continue }
            let parts = line.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true)
            guard parts.count == 2 else { continue }
            let sha = String(parts[0])
            let tag = normalizeTagName(String(parts[1]))
            tags[tag] = sha
        }
        return tags
    }

    /// Parse `git push --follow-tags --dry-run --porcelain` output into
    /// unpushed tag names (`[new tag]` lines only).
    public static func parseTagsToPush(_ stdout: String) -> [String] {
        let lines = stdout.components(separatedBy: "\n")
        guard lines.count > 1 else { return [] }
        var out: [String] = []
        // The last line is always `Done`.
        for line in lines.dropFirst().prefix(while: { _ in true }) {
            if line == "Done" { break }
            let parts = line.components(separatedBy: "\t")
            guard parts.count >= 3, parts[0] == "*", parts[2] == "[new tag]" else { continue }
            let ref = parts[1].split(separator: ":").first.map(String.init) ?? parts[1]
            out.append(ref.replacingOccurrences(of: "refs/tags/", with: ""))
        }
        return out
    }

    /// Validate a new tag name the same way the Create Tag dialog does:
    /// non-empty, no spaces, no `~^:?*[\` control chars, not already taken.
    public static func validateTagName(_ name: String, existingTags: Set<String>) -> String? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "Tag name cannot be empty." }
        if trimmed.contains(" ") { return "Tag name cannot contain spaces." }
        if trimmed.contains("..") { return "Tag name cannot contain '..'." }
        let illegal = CharacterSet(charactersIn: "~^:?*[]\\")
        if trimmed.rangeOfCharacter(from: illegal) != nil {
            return "Tag name contains an illegal character (~ ^ : ? * [ \\)."
        }
        if trimmed.hasSuffix("/") || trimmed.hasSuffix(".") || trimmed.hasSuffix(".lock") {
            return "Tag name cannot end with '/', '.' or '.lock'."
        }
        if existingTags.contains(trimmed) { return "A tag with that name already exists." }
        return nil
    }
}

public enum TagLiveOperations {
    public static func createTag(repositoryPath: String, name: String, targetCommitSha: String) async throws {
        let args = TagOperations.createArgs(name: name, targetCommitSha: targetCommitSha)
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
    }

    public static func deleteTag(repositoryPath: String, name: String) async throws {
        let args = TagOperations.deleteArgs(name: name)
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
    }

    /// Exit 1 means "no tags" — return an empty map.
    public static func allTags(repositoryPath: String) async throws -> [String: String] {
        let args = TagOperations.listArgs()
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if result.exitCode == 1 { return [:] }
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
        return TagOperations.parseShowRefTags(result.stdoutString)
    }

    /// Dry-run push to discover tags that would be pushed. Exit 1/128 still
    /// yield parseable (possibly empty) output; other failures throw.
    public static func tagsToPush(repositoryPath: String, remoteName: String, branchName: String) async throws -> [String] {
        let args = TagOperations.tagsToPushArgs(remoteName: remoteName, branchName: branchName)
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if result.exitCode != 0 && result.exitCode != 1 {
            if let error = classifyGitResult(result, args: args, successExitCodes: [0, 1, 128]) { throw error }
            throw GitError(kind: parseGitError(result.stderrString), args: args,
                           stdout: result.stdoutString, stderr: result.stderrString, exitCode: result.exitCode)
        }
        return TagOperations.parseTagsToPush(result.stdoutString)
    }
}
