import Foundation

// MARK: - Submodule + LFS operations
// Port of `electron/app/src/lib/git/submodule.ts` + `lfs.ts`
// (see Docs/09-git-layer.md). Pure parsers are unit-tested; live functions
// use `GitProcess` with identical args to the reference app.

public enum SubmoduleOperations {
    public static func statusArgs() -> [String] {
        ["submodule", "status", "--"]
    }

    public static func updateAfterOperationArgs(allowFileProtocol: Bool) -> [String] {
        var args: [String] = []
        if allowFileProtocol {
            args += ["-c", "protocol.file.allow=always"]
        }
        args += ["submodule", "update", "--init", "--recursive"]
        return args
    }

    public static func resetPathsArgs(paths: [String]) -> [String] {
        ["submodule", "update", "--recursive", "--force", "--"] + paths
    }

    /// Parse `git submodule status` output.
    /// Lines look like: ` 1eaabe3… path (describe)`, where the leading char is
    /// ` ` (clean), `-` (uninitialized), `+` (different SHA) or `U` (conflict).
    /// Port of the `statusRe = /^.([^ ]+) (.+) \((.+?)\)$/gm` loop.
    public static func parseStatus(_ stdout: String) -> [SubmoduleEntry] {
        var out: [SubmoduleEntry] = []
        let pattern = #"^.([^ ]+) (.+) \((.+?)\)$"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.anchorsMatchLines]) else {
            return out
        }
        let range = NSRange(stdout.startIndex..., in: stdout)
        for match in regex.matches(in: stdout, range: range) {
            guard match.numberOfRanges == 4,
                  let shaRange = Range(match.range(at: 1), in: stdout),
                  let pathRange = Range(match.range(at: 2), in: stdout),
                  let describeRange = Range(match.range(at: 3), in: stdout)
            else { continue }
            out.append(SubmoduleEntry(
                sha: String(stdout[shaRange]),
                path: String(stdout[pathRange]),
                describe: String(stdout[describeRange])))
        }
        return out
    }
}

public enum LFSOperations {
    public static func installGlobalArgs(force: Bool) -> [String] {
        var args = ["lfs", "install", "--skip-repo"]
        if force { args.append("--force") }
        return args
    }

    public static func installRepoArgs(force: Bool) -> [String] {
        var args = ["lfs", "install"]
        if force { args.append("--force") }
        return args
    }

    public static func trackJSONArgs() -> [String] {
        ["lfs", "track", "--json"]
    }

    public static func checkAttrArgs(path: String) -> [String] {
        ["check-attr", "filter", path]
    }

    public static let trackNoInstallHooksEnv = ["GIT_LFS_TRACK_NO_INSTALL_HOOKS": "1"]

    /// `git check-attr filter <path>` prints `… filter: lfs` when tracked.
    public static func isTrackedOutput(_ stdout: String) -> Bool {
        stdout.range(of: ": filter: lfs") != nil
    }

    /// Minimal `git lfs track --json` shape: `{patterns: [{tracked: bool}]}`.
    public static func isUsingLFS(json: String) -> Bool {
        guard let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let patterns = obj["patterns"] as? [[String: Any]]
        else { return false }
        return patterns.contains { ($0["tracked"] as? Bool) == true }
    }
}

public enum SubmoduleLFSLiveOperations {
    public static func listSubmodules(repositoryPath: String) async throws -> [SubmoduleEntry] {
        let fm = FileManager.default
        let gitmodules = (repositoryPath as NSString).appendingPathComponent(".gitmodules")
        let modulesDir = (repositoryPath as NSString).appendingPathComponent(".git/modules")
        if !fm.fileExists(atPath: gitmodules) && !fm.fileExists(atPath: modulesDir) {
            return []
        }
        let args = SubmoduleOperations.statusArgs()
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if result.exitCode == 128 { return [] }
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
        return SubmoduleOperations.parseStatus(result.stdoutString)
    }

    public static func resetSubmodulePaths(repositoryPath: String, paths: [String]) async throws {
        guard !paths.isEmpty else { return }
        let args = SubmoduleOperations.resetPathsArgs(paths: paths)
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
    }

    public static func updateSubmodules(repositoryPath: String, allowFileProtocol: Bool = false) async throws {
        let args = SubmoduleOperations.updateAfterOperationArgs(allowFileProtocol: allowFileProtocol)
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
    }

    public static func installLFSHooks(repositoryPath: String, force: Bool) async throws {
        let args = LFSOperations.installRepoArgs(force: force)
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
    }

    public static func installGlobalLFSFilters(force: Bool) async throws {
        let args = LFSOperations.installGlobalArgs(force: force)
        let result = try await GitProcess.run(args, workingDirectory: nil)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
    }

    public static func isUsingLFS(repositoryPath: String) async throws -> Bool {
        let args = LFSOperations.trackJSONArgs()
        let result = try await GitProcess.run(
            args, workingDirectory: repositoryPath,
            environment: LFSOperations.trackNoInstallHooksEnv)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
        return LFSOperations.isUsingLFS(json: result.stdoutString)
    }

    public static func isTrackedByLFS(repositoryPath: String, path: String) async throws -> Bool {
        let args = LFSOperations.checkAttrArgs(path: path)
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
        return LFSOperations.isTrackedOutput(result.stdoutString)
    }
}
