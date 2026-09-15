import Foundation

// MARK: - RepositoryManagement
// Task 9 git operations for add/create/clone + config.
// Ports (pruned per scope — no GitHub):
// - `ui/add-repository/sanitized-repository-name.ts`
// - `ui/add-repository/write-default-readme.ts`
// - `lib/git/clone.ts` (ext:: block, sensitive-path block, args)
// - `lib/git/init.ts`, `lib/git/rev-parse.ts` (getRepositoryType)
// - `lib/git/config.ts` (get/set, lock-file detection)
// - `lib/git/remote.ts` (setRemoteURL, covered by Sync.swift; re-exported here)
// - default branch helper (`helpers/default-branch.ts`)

// MARK: - Pure helpers

/// Replace emoji + illegal chars with `-` (port of `sanitizedRepositoryName`).
public func sanitizedRepositoryName(_ name: String) -> String {
    var result = name
    // Emoji ranges from the reference (surrogate-pair regex). In Swift,
    // detect scalars in the same planes and replace each with "-".
    var sanitized = ""
    sanitized.reserveCapacity(result.count)
    for scalar in result.unicodeScalars {
        let v = scalar.value
        let isEmojiRange =
            (v >= 0x1F300 && v <= 0x1F3FF)
            || (v >= 0x1F400 && v <= 0x1F64F)
            || (v >= 0x1F680 && v <= 0x1F6FF)
        sanitized.unicodeScalars.append(isEmojiRange ? "-" : scalar)
    }
    result = sanitized
    // [^\w.-] → "-" (word chars + dot + dash survive).
    let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "._-"))
    return String(result.unicodeScalars.map { allowed.contains($0) ? Character($0) : "-" })
}

/// `# name\ndescription\n` default README (port of `write-default-readme.ts`).
public func defaultReadmeContents(name: String, description: String? = nil) -> String {
    if let description, !description.isEmpty {
        return "# \(name)\n\(description)\n"
    }
    return "# \(name)\n"
}

/// Transports refused for clone (port of `unsupportedCloneProtocols`).
public let unsupportedCloneProtocols = ["ext", "ext.exe"]

/// Error when the URL uses a blocked transport.
public func cloneTransportError(url: String) -> String? {
    for proto in unsupportedCloneProtocols where url.hasPrefix("\(proto)::") {
        return "The \"\(proto)\" transport is not supported for cloning in GitDesktop."
    }
    return nil
}

/// Sensitive clone destinations (port of `isClonePathSensitive`).
/// Backstop against path traversal into `~/`, `~/.ssh`, `~/.gnupg`,
/// `~/.config`, `~/.gitconfig`.
public func isClonePathSensitive(_ unresolvedPath: String, homeDirectory: String? = nil) -> Bool {
    let home = ((homeDirectory ?? NSHomeDirectory()) as NSString).standardizingPath.lowercased()
    let clonePath = (unresolvedPath as NSString).standardizingPath.lowercased()
    if clonePath == home { return true }
    let sensitive = [
        (home as NSString).appendingPathComponent(".ssh"),
        (home as NSString).appendingPathComponent(".gnupg"),
        (home as NSString).appendingPathComponent(".config"),
        (home as NSString).appendingPathComponent(".config/git"),
        (home as NSString).appendingPathComponent(".gitconfig"),
    ]
    for location in sensitive {
        let lower = location.lowercased()
        if clonePath == lower || clonePath.hasPrefix(lower + "/") { return true }
    }
    return false
}

/// Validate a generic clone request. Returns a user-facing error or nil.
public func validateCloneRequest(url: String, destinationPath: String) -> String? {
    let trimmedURL = url.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmedURL.isEmpty { return "Enter a repository URL to clone." }
    if let transportError = cloneTransportError(url: trimmedURL) { return transportError }
    let trimmedPath = destinationPath.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmedPath.isEmpty { return "Choose a local path for the clone." }
    if isClonePathSensitive(trimmedPath) {
        return "The clone destination targets a sensitive system location. Cloning into this directory is not allowed."
    }
    return nil
}

/// Validate a create-repository request.
public func validateCreateRepository(name: String, parentPath: String) -> String? {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return "Enter a name for the repository." }
    if sanitizedRepositoryName(trimmed) != trimmed {
        return "The name contains characters that will be replaced with dashes."
    }
    if parentPath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return "Choose a location for the repository."
    }
    return nil
}

/// Clone args (port of `clone()` arg construction, minus progress plumbing).
/// `defaultBranch` falls back to the caller-provided value (reference reads
/// `getDefaultBranch()` which itself reads `init.defaultBranch`).
public func cloneArgs(url: String, defaultBranch: String, withProgress: Bool) -> [String] {
    var args = [
        "-c", "init.defaultBranch=\(defaultBranch)",
    ]
    for proto in unsupportedCloneProtocols {
        args += ["-c", "protocol.\(proto).allow=never"]
    }
    args += ["clone", "--recursive"]
    if withProgress { args.append("--progress") }
    args += ["--", url]
    return args
}

/// Init args (port of `initGitRepository`).
public func initArgs(defaultBranch: String) -> [String] {
    ["-c", "init.defaultBranch=\(defaultBranch)", "init"]
}

/// Detect a git config lock-file error (port of `isConfigFileLockError`).
public func isConfigLockFileError(_ message: String) -> Bool {
    message.contains("Unable to create") && message.contains(".lock")
}

/// Extract the lock-file path from a git error (port of
/// `parseConfigLockFilePathFromError`).
public func parseConfigLockFilePath(_ message: String) -> String? {
    // Matches: Unable to create '.../config.lock': File exists.
    guard let range = message.range(of: "'") else { return nil }
    let rest = message[range.upperBound...]
    guard let end = rest.range(of: "'") else { return nil }
    let path = String(rest[..<end.lowerBound])
    return path.hasSuffix(".lock") ? path : nil
}

/// Validate a git author name (port of `identifier-rules.ts` minimal rule:
/// non-empty, no leading/trailing whitespace-only, no angle brackets).
public func gitAuthorNameIsValid(_ name: String) -> Bool {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return false }
    return !trimmed.contains("<") && !trimmed.contains(">")
}

public let invalidGitAuthorNameMessage = "The name cannot contain < or > and must not be empty."

/// Validate tab size (Appearance tab: 2/4/8 only).
public func isValidTabSize(_ value: Int) -> Bool {
    [2, 4, 8].contains(value)
}

// MARK: - Curated templates (bundled subset)

// The reference ships ~180 gitignore templates + full SPDX licenses from
// `static/`. The native app bundles a curated subset; the full catalog is
// Task-10 polish. Names match the reference where they overlap.

public let bundledGitIgnoreNames = [
    "None",
    "Swift",
    "Xcode",
    "macOS",
    "Node",
    "Python",
    "Ruby",
    "Java",
    "Go",
    "Rust",
]

public func bundledGitIgnoreText(name: String) -> String? {
    switch name {
    case "Swift":
        return "# Swift\n.build/\n*.o\n*.d\n.DS_Store\n"
    case "Xcode":
        return "# Xcode\nbuild/\n*.xcuserdata/\n*.xcworkspace/xcuserdata/\nDerivedData/\n.DS_Store\n"
    case "macOS":
        return "# macOS\n.DS_Store\n.AppleDouble\n.LSOverride\n"
    case "Node":
        return "# Node\nnode_modules/\nnpm-debug.log*\ndist/\n"
    case "Python":
        return "# Python\n__pycache__/\n*.py[cod]\n.venv/\n"
    case "Ruby":
        return "# Ruby\n.bundle/\nlog/*.log\ntmp/\n"
    case "Java":
        return "# Java\n*.class\ntarget/\n"
    case "Go":
        return "# Go\n/bin/\n/pkg/\n"
    case "Rust":
        return "# Rust\n/target/\n**/*.rs.bk\n"
    default:
        return nil
    }
}

public struct LicenseTemplate: Sendable, Equatable {
    public var name: String
    public var featured: Bool
    public var body: String

    public init(name: String, featured: Bool, body: String) {
        self.name = name
        self.featured = featured
        self.body = body
    }
}

public let bundledLicenses: [LicenseTemplate] = [
    LicenseTemplate(name: "None", featured: true, body: ""),
    LicenseTemplate(
        name: "MIT License", featured: true,
        body: "MIT License\n\nCopyright (c) {year} {fullname}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the \"Software\"), to deal in the Software without restriction.\n"),
    LicenseTemplate(
        name: "Apache License 2.0", featured: true,
        body: "Apache License\nVersion 2.0, January 2004\nCopyright {year} {fullname}\n"),
    LicenseTemplate(
        name: "GNU General Public License v3.0", featured: false,
        body: "GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007\nCopyright (C) {year} {fullname}\n"),
]

public func renderedLicense(_ template: LicenseTemplate, year: String, fullname: String, project: String, description: String, email: String) -> String {
    var body = template.body
    let fields: [(token: String, value: String)] = [
        ("year", year), ("fullname", fullname), ("project", project),
        ("description", description), ("email", email),
    ]
    for (token, value) in fields {
        // Templates mix [token] and {token}; normalize then replace.
        body = body.replacingOccurrences(of: "[\(token)]", with: "{\(token)}")
        body = body.replacingOccurrences(of: "{\(token)}", with: value)
    }
    return body
}

// MARK: - Repository type (rev-parse)

public enum RepositoryTypeResult: Sendable, Equatable {
    case bare
    case regular(topLevel: String, gitDir: String)
    case missing
    case unsafe(path: String)
}

/// Classify `path` via `git rev-parse` (port of `getRepositoryType`).
public func repositoryType(at path: String) async throws -> RepositoryTypeResult {
    var isDir: ObjCBool = false
    guard FileManager.default.fileExists(atPath: path, isDirectory: &isDir) else {
        return .missing
    }
    let result = try await GitProcess.run(
        ["rev-parse", "--is-bare-repository", "--show-cdup", "--git-dir"],
        workingDirectory: path)
    if result.exitCode == 0 {
        let stdout = result.stdoutString
        if stdout.hasPrefix("true\n") { return .bare }
        // Lines: is-bare, cdup, gitdir (gitdir may contain newlines).
        var lines = stdout.components(separatedBy: "\n")
        // Drop trailing empty component from final newline.
        if lines.last == "" { lines.removeLast() }
        if lines.count >= 3 {
            let isBare = lines[0]
            let cdup = lines[1]
            let gitDir = lines[2...].joined(separator: "\n")
            if isBare == "true" { return .bare }
            let base = (path as NSString).standardizingPath
            let topLevel = ((base as NSString).appendingPathComponent(cdup) as NSString).standardizingPath
            let resolvedGitDir: String
            if (gitDir as NSString).isAbsolutePath {
                resolvedGitDir = gitDir
            } else {
                resolvedGitDir = ((base as NSString).appendingPathComponent(gitDir) as NSString).standardizingPath
            }
            return .regular(topLevel: topLevel, gitDir: resolvedGitDir)
        }
    }
    let stderr = result.stderrString
    if let range = stderr.range(of: "fatal: detected dubious ownership in repository at '"),
       let end = stderr[range.upperBound...].range(of: "'") {
        return .unsafe(path: String(stderr[range.upperBound..<end.lowerBound]))
    }
    return .missing
}

/// Resolve the working-tree toplevel (`rev-parse --show-toplevel`).
public func toplevelForPath(_ path: String) async throws -> String? {
    switch try await repositoryType(at: path) {
    case .regular(let topLevel, _): return topLevel
    case .bare, .missing, .unsafe: return nil
    }
}

// MARK: - Live operations

/// Default branch from global `init.defaultBranch` (port of
/// `helpers/default-branch.ts`; falls back to `main`).
public func getDefaultBranch() async -> String {
    do {
        let result = try await GitProcess.run(
            ["config", "--global", "init.defaultBranch"], workingDirectory: nil)
        if result.exitCode == 0 {
            let value = result.stdoutString.trimmingCharacters(in: .whitespacesAndNewlines)
            if !value.isEmpty { return value }
        }
    } catch {}
    return "main"
}

public enum RepositoryManagement {
    /// `git init` a new repository at `path`.
    public static func initRepository(at path: String) async throws {
        try FileManager.default.createDirectory(atPath: path, withIntermediateDirectories: true)
        let branch = await getDefaultBranch()
        let result = try await GitProcess.run(initArgs(defaultBranch: branch), workingDirectory: path)
        if let error = classifyGitResult(result, args: ["init"]) { throw error }
    }

    /// Write the default README.
    public static func writeDefaultReadme(at repositoryPath: String, name: String, description: String? = nil) throws {
        let contents = defaultReadmeContents(name: name, description: description)
        let url = URL(fileURLWithPath: (repositoryPath as NSString).appendingPathComponent("README.md"))
        try contents.write(to: url, atomically: true, encoding: .utf8)
    }

    /// Write a bundled gitignore (no-op for "None").
    public static func writeGitIgnore(at repositoryPath: String, name: String) throws {
        guard name != "None", let text = bundledGitIgnoreText(name: name) else { return }
        let url = URL(fileURLWithPath: (repositoryPath as NSString).appendingPathComponent(".gitignore"))
        try text.write(to: url, atomically: true, encoding: .utf8)
    }

    /// Write a bundled license (no-op for "None").
    public static func writeLicense(at repositoryPath: String, template: LicenseTemplate, project: String, fullname: String, email: String, description: String) throws {
        guard template.name != "None" else { return }
        let year = Calendar.current.component(.year, from: Date()).description
        let body = renderedLicense(template, year: year, fullname: fullname, project: project, description: description, email: email)
        let url = URL(fileURLWithPath: (repositoryPath as NSString).appendingPathComponent("LICENSE"))
        try body.write(to: url, atomically: true, encoding: .utf8)
    }

    /// Clone with progress replay (buffer-mode: initial event first, then
    /// replay final stderr through `CloneProgressParser`).
    public static func clone(
        url: String,
        destinationPath: String,
        branch: String? = nil,
        progress: (@Sendable (AppProgress) -> Void)? = nil
    ) async throws {
        if let transportError = cloneTransportError(url: url) {
            throw GitError(kind: nil, args: ["clone", url], stdout: "", stderr: transportError, exitCode: 128)
        }
        if isClonePathSensitive(destinationPath) {
            throw GitError(kind: nil, args: ["clone", url], stdout: "", stderr: "Clone destination targets a sensitive system location.", exitCode: 128)
        }
        let defaultBranch = await getDefaultBranch()
        var args = cloneArgs(url: url, defaultBranch: defaultBranch, withProgress: progress != nil)
        // Insert --branch before "--".
        if let branch, !branch.isEmpty, let dashDash = args.firstIndex(of: "--") {
            args.insert(contentsOf: ["--branch", branch], at: dashDash)
        }
        // Destination goes after the URL: args end with ["--", url].
        args.append(destinationPath)
        var parser = CloneProgressParser()
        progress?(parser.initialProgress)
        var env = envForRemoteOperation(url)
        env["GIT_CLONE_PROTECTION_ACTIVE"] = "false"
        let result = try await GitProcess.run(args, workingDirectory: nil, environment: env)
        if let progress {
            for line in progressLines(from: result.stderrString) {
                if let event = parser.parse(line: line) { progress(event) }
            }
        }
        if let error = classifyGitResult(result, args: ["clone", url]) { throw error }
    }

    /// Read a config value (local by default; global when `repositoryPath` is nil).
    public static func configValue(name: String, repositoryPath: String?, onlyLocal: Bool = false) async throws -> String? {
        var args = ["config", "-z"]
        if repositoryPath == nil {
            args.append("--global")
        } else if onlyLocal {
            args.append("--local")
        }
        args.append(name)
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if result.exitCode == 1 { return nil }
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
        let pieces = result.stdoutString.split(separator: "\0", omittingEmptySubsequences: false)
        return pieces.first.map(String.init)
    }

    /// Set a config value (global when `repositoryPath` is nil).
    public static func setConfigValue(_ value: String, name: String, repositoryPath: String?) async throws {
        var args = ["config"]
        args.append(repositoryPath == nil ? "--global" : "--local")
        args += [name, value]
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) { throw error }
    }

    /// Set the primary remote URL (`git remote set-url origin <url>`).
    public static func setRemoteURL(repositoryPath: String, name: String, url: String) async throws {
        try await GitDesktop.setRemoteURL(repositoryPath: repositoryPath, name: name, url: url)
    }
}

// MARK: - Tutorial repository

/// Tutorial repo scaffolding (port of `CreateTutorialRepositoryDialog` flow).
public enum TutorialRepository {
    public static let defaultName = "Tutorial"

    /// Create a tutorial repo at `parentPath/name` with a README + initial commit.
    public static func create(at parentPath: String, name: String = defaultName) async throws -> String {
        let path = (parentPath as NSString).appendingPathComponent(name)
        try await RepositoryManagement.initRepository(at: path)
        try RepositoryManagement.writeDefaultReadme(at: path, name: name, description: "A tutorial repository for learning GitDesktop.")
        let add = try await GitProcess.run(["add", "--", "README.md"], workingDirectory: path)
        if let error = classifyGitResult(add, args: ["add"]) { throw error }
        let commit = try await GitProcess.run(
            ["commit", "-m", "Initial commit"], workingDirectory: path)
        // An unborn repo with no identity configured fails; surface the error.
        if let error = classifyGitResult(commit, args: ["commit"]) { throw error }
        return path
    }
}

// MARK: - Drop resolution

/// How a dropped path should be handled (port of `App.componentDidMount`
/// `ondrop` + `application openFile` folders-only rule).
public enum DroppedPathAction: Sendable, Equatable {
    case selectExisting(repositoryID: Int)
    case add(path: String)
    case ignoreNotDirectory
}

/// Resolve dropped file URLs against known repositories.
/// - `toplevels`: maps a dropped path to its resolved toplevel (nil = not a repo).
public func resolveDroppedPaths(
    _ paths: [String],
    isDirectory: (String) -> Bool,
    toplevel: (String) -> String?,
    existingID: (String) -> Int?
) -> [DroppedPathAction] {
    var actions: [DroppedPathAction] = []
    for path in paths {
        guard isDirectory(path) else {
            actions.append(.ignoreNotDirectory)
            continue
        }
        guard let top = toplevel(path) else {
            actions.append(.add(path: path))
            continue
        }
        if let id = existingID(top) {
            actions.append(.selectExisting(repositoryID: id))
        } else {
            actions.append(.add(path: top))
        }
    }
    return actions
}
