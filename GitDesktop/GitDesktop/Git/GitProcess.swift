import Foundation

// MARK: - GitProcess
// Swift port of `electron/app/src/lib/git/core.ts` + `spawn.ts` + `environment.ts`.
// Invokes the bundled/system `git` via `Process` with identical args/env to
// the reference app (see Docs/09-git-layer.md).

/// Result of a git invocation. Port of dugite's `IExecResult`.
public struct GitResult: Sendable {
    public var exitCode: Int32
    public var stdout: Data
    public var stderr: Data

    public init(exitCode: Int32, stdout: Data, stderr: Data) {
        self.exitCode = exitCode
        self.stdout = stdout
        self.stderr = stderr
    }

    public var stdoutString: String {
        String(data: stdout, encoding: .utf8) ?? ""
    }

    public var stderrString: String {
        String(data: stderr, encoding: .utf8) ?? ""
    }
}

public enum GitProcessError: Error, Sendable {
    case gitNotFound
    case launchFailed(String)
    case terminatedBySignal(Int32)
}

/// `Process`-based git execution with Desktop-compatible environment.
public enum GitProcess {
    /// Terminal output cap for error messages (256 KB; log last 1024 chars).
    public static let maxTerminalOutputSize = 256 * 1024
    public static let terminalLogTailLength = 1024

    /// Locate the git binary: `GIT_PATH` override, then `/usr/bin/git`,
    /// then `xcrun -f git`, falling back to `git` on PATH.
    public static func locateGit() -> String {
        if let override_ = ProcessInfo.processInfo.environment["GIT_PATH"],
           !override_.isEmpty,
           FileManager.default.isExecutableFile(atPath: override_) {
            return override_
        }
        for candidate in ["/opt/homebrew/bin/git", "/usr/local/bin/git", "/usr/bin/git"] {
            if FileManager.default.isExecutableFile(atPath: candidate) {
                return candidate
            }
        }
        return "git"
    }

    /// Base environment applied to every git call.
    /// Mirrors `core.ts` + `authentication.ts` + `trampoline-environment.ts`:
    /// `TERM=dumb`, `GIT_TERMINAL_PROMPT=0`, `GIT_CONFIG_PARAMETERS`
    /// (unsets the user credential helper, adds the Desktop helper),
    /// `GIT_USER_AGENT`, SSH askpass suppression.
    public static func defaultEnvironment(extra: [String: String] = [:]) -> [String: String] {
        var env = ProcessInfo.processInfo.environment
        env["TERM"] = "dumb"
        env["GIT_TERMINAL_PROMPT"] = "0"
        if env["GIT_TRACE"] == nil { env["GIT_TRACE"] = "0" }
        let existing = env["GIT_CONFIG_PARAMETERS"] ?? ""
        let helperParams = "'credential.helper=' 'credential.helper=desktop'"
        env["GIT_CONFIG_PARAMETERS"] = existing.isEmpty
            ? helperParams
            : "\(existing) \(helperParams)"
        if env["GIT_USER_AGENT"] == nil {
            let gitVersion = "2.0"
            let appVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0"
            env["GIT_USER_AGENT"] = "git/\(gitVersion) (GitDesktop/\(appVersion); mac arm64)"
        }
        // Never prompt interactively; background callers rely on this.
        env["GIT_ASKPASS"] = ""
        for (key, value) in extra {
            env[key] = value
        }
        return env
    }

    /// Run git with the given args in `workingDirectory`.
    /// - Parameters:
    ///   - args: Arguments after the `git` binary.
    ///   - workingDirectory: Repository path (nil = no cwd override).
    ///   - stdin: Optional data piped to stdin (e.g. commit message via `-F -`).
    ///   - environment: Extra env vars merged over `defaultEnvironment()`.
    public static func run(
        _ args: [String],
        workingDirectory: String? = nil,
        stdin: Data? = nil,
        environment: [String: String] = [:]
    ) async throws -> GitResult {
        try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    let result = try runBlocking(
                        args,
                        workingDirectory: workingDirectory,
                        stdin: stdin,
                        environment: environment)
                    continuation.resume(returning: result)
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    private static func runBlocking(
        _ args: [String],
        workingDirectory: String?,
        stdin: Data?,
        environment: [String: String]
    ) throws -> GitResult {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: locateGit())
        process.arguments = args
        if let workingDirectory {
            process.currentDirectoryURL = URL(fileURLWithPath: workingDirectory)
        }
        process.environment = defaultEnvironment(extra: environment)

        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        let stdinPipe: Pipe?
        if stdin != nil {
            stdinPipe = Pipe()
            process.standardInput = stdinPipe
        } else {
            stdinPipe = nil
            process.standardInput = FileHandle.nullDevice
        }

        do {
            try process.run()
        } catch {
            throw GitProcessError.launchFailed(error.localizedDescription)
        }

        if let stdin, let pipe = stdinPipe {
            pipe.fileHandleForWriting.write(stdin)
            pipe.fileHandleForWriting.closeFile()
        }

        process.waitUntilExit()

        let stdout = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
        let stderr = stderrPipe.fileHandleForReading.readDataToEndOfFile()

        if process.terminationReason != .exit {
            throw GitProcessError.terminatedBySignal(process.terminationStatus)
        }
        return GitResult(exitCode: process.terminationStatus, stdout: stdout, stderr: stderr)
    }

    /// Last N chars of terminal output for error display (mirrors the
    /// "log last 1024 chars" rule in Docs/09-git-layer.md).
    public static func terminalTail(_ output: String) -> String {
        guard output.count > terminalLogTailLength else { return output }
        return String(output.suffix(terminalLogTailLength))
    }

    /// Truncate oversized terminal output to the 256 KB cap.
    public static func truncateTerminalOutput(_ data: Data) -> Data {
        guard data.count > maxTerminalOutputSize else { return data }
        return data.suffix(maxTerminalOutputSize)
    }
}
