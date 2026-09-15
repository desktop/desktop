import Foundation

// MARK: - CLIService
// Task 9 CLI shim (`open path`, `clone url`).
// Port of `electron/app/src/lib/cli-action.ts` + the `install-cli` flow:
// the packaged app installs a `gitdesktop` shim on PATH; invoking it with a
// path opens the repo and with a URL clones it. No GitHub code.

public enum CLIAction: Sendable, Equatable {
    case openRepository(path: String)
    case cloneURL(url: String, branch: String?)

    public var description: String {
        switch self {
        case .openRepository(let path): return "open \(path)"
        case .cloneURL(let url, let branch):
            if let branch { return "clone \(url) --branch \(branch)" }
            return "clone \(url)"
        }
    }
}

public enum CLIService {
    public static let shimName = "gitdesktop"

    /// Parse CLI argv (after the binary name) into an action.
    /// Accepted forms (port of `parseCLIAction`):
    /// - `gitdesktop open <path>`
    /// - `gitdesktop clone <url> [--branch <branch>]`
    /// - `gitdesktop <path>` (shorthand for open)
    /// - `gitdesktop <url>` (shorthand for clone)
    public static func parse(arguments: [String]) -> CLIAction? {
        var args = arguments
        // Drop the binary name when present.
        if let first = args.first, first.hasSuffix(shimName) || first.contains("/") {
            args.removeFirst()
        }
        guard !args.isEmpty else { return nil }
        switch args[0] {
        case "open":
            guard args.count >= 2 else { return nil }
            return .openRepository(path: args[1])
        case "clone":
            guard args.count >= 2 else { return nil }
            var branch: String?
            if let flag = args.firstIndex(of: "--branch"), flag + 1 < args.count {
                branch = args[flag + 1]
            }
            return .cloneURL(url: args[1], branch: branch)
        default:
            let target = args[0]
            if isProbableURL(target) {
                return .cloneURL(url: target, branch: nil)
            }
            return .openRepository(path: target)
        }
    }

    /// Heuristic: URL-like when it has a scheme or scp-like `host:path`.
    public static func isProbableURL(_ value: String) -> Bool {
        let lower = value.lowercased()
        if lower.hasPrefix("https://") || lower.hasPrefix("http://")
            || lower.hasPrefix("ssh://") || lower.hasPrefix("git://")
            || lower.hasPrefix("git@") { return true }
        // scp-like: host:path with no leading slash/file existence.
        if value.contains("@") && value.contains(":") { return true }
        if value.hasSuffix(".git") { return true }
        return false
    }

    /// Install the shim into `~/.local/bin` (symlink to the app's helper).
    /// Returns the installed path. Mirrors the reference `install-cli` which
    /// drops a shim on PATH and shows the `CLIInstalled` popup.
    @discardableResult
    public static func installShim() throws -> String {
        let binDir = (NSHomeDirectory() as NSString).appendingPathComponent(".local/bin")
        try FileManager.default.createDirectory(atPath: binDir, withIntermediateDirectories: true)
        let shimPath = (binDir as NSString).appendingPathComponent(shimName)
        let target = Bundle.main.bundlePath
        // Best-effort symlink to the app bundle; overwrite any stale shim.
        if FileManager.default.fileExists(atPath: shimPath) {
            try? FileManager.default.removeItem(atPath: shimPath)
        }
        try FileManager.default.createSymbolicLink(atPath: shimPath, withDestinationPath: target)
        return shimPath
    }

    public static var shimInstalled: Bool {
        let shimPath = (NSHomeDirectory() as NSString)
            .appendingPathComponent(".local/bin/\(shimName)")
        return FileManager.default.fileExists(atPath: shimPath)
    }
}
