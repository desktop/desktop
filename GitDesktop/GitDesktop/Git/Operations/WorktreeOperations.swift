import Foundation

// MARK: - WorktreeOperations
// Port of `electron/app/src/lib/git/worktree.ts` (see Docs/09-git-layer.md).

public enum WorktreeOperations {
    public static func listArgs() -> [String] {
        ["worktree", "list", "--porcelain", "-z"]
    }

    public static func listFromGitDirArgs(gitDir: String) -> [String] {
        ["--git-dir", gitDir, "worktree", "list", "--porcelain", "-z"]
    }

    public static func addArgs(path: String, createBranch: String?, commitish: String?) -> [String] {
        var args = ["worktree", "add"]
        if let createBranch, !createBranch.isEmpty {
            args += ["-b", createBranch]
        }
        args.append(path)
        if let commitish, !commitish.isEmpty {
            args.append(commitish)
        }
        return args
    }

    public static func removeArgs(worktreePath: String, force: Bool) -> [String] {
        var args = ["worktree", "remove"]
        if force { args.append("--force") }
        args.append(worktreePath)
        return args
    }

    public static func moveArgs(oldPath: String, newPath: String) -> [String] {
        ["worktree", "move", oldPath, newPath]
    }

    /// Validate an Add Worktree dialog: path must be non-empty and not exist;
    /// when creating a branch the name must be non-empty. Returns an error
    /// string, or nil when valid.
    public static func validateAdd(path: String, createBranch: String?, pathExists: Bool) -> String? {
        let trimmed = path.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "Choose a location for the new worktree." }
        if pathExists { return "That location already exists. Choose an empty folder or a new path." }
        if let createBranch, createBranch.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "Branch name cannot be empty."
        }
        return nil
    }

    /// Group entries into Main-first ordering for the list UI.
    public static func sortedForDisplay(_ entries: [WorktreeEntry]) -> [WorktreeEntry] {
        entries.sorted { lhs, rhs in
            if lhs.type != rhs.type { return lhs.type == .main }
            return lhs.path.localizedStandardCompare(rhs.path) == .orderedAscending
        }
    }

    /// Case-insensitive filter used by the WorktreeList filter box.
    public static func filter(_ entries: [WorktreeEntry], query: String) -> [WorktreeEntry] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return entries }
        return entries.filter {
            worktreeDisplayName($0).lowercased().contains(q)
                || $0.path.lowercased().contains(q)
                || worktreeDescription($0).lowercased().contains(q)
        }
    }
}

public enum WorktreeLiveOperations {
    public static func listWorktrees(repositoryPath: String) async throws -> [WorktreeEntry] {
        let args = WorktreeOperations.listArgs()
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
        return RefsParser.parseWorktrees(result.stdoutString)
    }

    public static func listWorktreesFromGitDir(gitDir: String) async throws -> [WorktreeEntry] {
        let args = WorktreeOperations.listFromGitDirArgs(gitDir: gitDir)
        let result = try await GitProcess.run(args, workingDirectory: gitDir)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
        return RefsParser.parseWorktrees(result.stdoutString)
    }

    public static func addWorktree(repositoryPath: String, path: String, createBranch: String?, commitish: String?) async throws {
        let args = WorktreeOperations.addArgs(path: path, createBranch: createBranch, commitish: commitish)
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
    }

    public static func removeWorktree(repositoryPath: String, worktreePath: String, force: Bool = false) async throws {
        let args = WorktreeOperations.removeArgs(worktreePath: worktreePath, force: force)
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
    }

    public static func moveWorktree(repositoryPath: String, oldPath: String, newPath: String) async throws {
        let args = WorktreeOperations.moveArgs(oldPath: oldPath, newPath: newPath)
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
    }
}
