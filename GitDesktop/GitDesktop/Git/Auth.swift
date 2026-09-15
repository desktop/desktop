import Foundation

// MARK: - Auth
// Task 7 auth + remote-environment + sync error-chain support.
//
// Ports (pruned per scope — no GitHub API, OAuth, SAML, or bypass flows):
// - `electron/app/src/lib/git/credential.ts`: `parseCredential` /
//   `formatCredential` + `fill`/`approve`/`reject` over `git credential`.
// - `lib/git/authentication.ts`: non-interactive auth env.
// - `lib/git/environment.ts`: remote-operation env + proxy passthrough.
//   System proxy auto-resolution (Electron session in the reference) is
//   deferred; configured `*_proxy` env is respected and never overridden.
// - `lib/git/config.ts` (`addSafeDirectory` only).
// - `ui/dispatcher/error-handlers.ts`: the `performFailableOperation` →
//   popup chain for sync failures (push-needs-pull, LFS mismatch,
//   permissions, local-changes-overwritten, secret-scan display only).
//   Merge/rebase conflict errors defer to Tasks 5–6 (return nil here).

// MARK: - Credential helpers

public enum CredentialFormatError: Error, Sendable, Equatable {
    case forbiddenCharacters(key: String)
}

/// Parse `git credential` protocol output (`key=value` lines).
/// Array keys (`key[]`) expand to `key[0]…key[n]` (port of `parseCredential`).
public func parseCredential(_ value: String) -> [String: String] {
    var credential: [String: String] = [:]
    for line in value.components(separatedBy: CharacterSet.newlines) {
        guard let separator = line.firstIndex(of: "=") else { continue }
        let key = String(line[..<separator])
        let val = String(line[line.index(after: separator)...])
        if key.hasSuffix("[]") {
            let base = String(key.dropLast(2))
            var index = 0
            var expanded = "\(base)[\(index)]"
            while credential[expanded] != nil {
                index += 1
                expanded = "\(base)[\(index)]"
            }
            credential[expanded] = val
        } else {
            credential[key] = val
        }
    }
    return credential
}

/// Serialize back to `key[]=value` protocol form (port of `formatCredential`).
/// Keys are sorted for deterministic output.
public func formatCredential(_ credential: [String: String]) throws -> String {
    var lines: [String] = []
    for key in credential.keys.sorted() {
        guard let value = credential[key] else { continue }
        if value.contains("\n") || value.contains("\0") {
            throw CredentialFormatError.forbiddenCharacters(key: key)
        }
        let wireKey = key.replacingOccurrences(
            of: #"\[\d+\]$"#, with: "[]", options: .regularExpression)
        lines.append("\(wireKey)=\(value)\n")
    }
    return lines.joined()
}

/// Run `git credential <command>` with stdin context (port of `exec` in
/// `credential.ts`). `helper` selects the backing store; it defaults to the
/// macOS keychain. Desktop's GCM trampoline is future work — callers that
/// need it pass their helper name explicitly.
public func runCredentialHelper(
    command: String,
    credential: [String: String],
    repositoryPath: String,
    helper: String = "osxkeychain"
) async throws -> [String: String] {
    let stdin = try Data(formatCredential(credential).utf8)
    let result = try await GitProcess.run(
        ["-c", "credential.helper=", "-c", "credential.helper=\(helper)",
         "credential", command],
        workingDirectory: repositoryPath,
        stdin: stdin,
        environment: ["GIT_TERMINAL_PROMPT": "0", "GIT_ASKPASS": "", "TERM": "dumb"])
    if let error = classifyGitResult(result, args: ["credential", command]) {
        throw error
    }
    return parseCredential(result.stdoutString)
}

public func fillCredential(
    _ credential: [String: String],
    repositoryPath: String,
    helper: String = "osxkeychain"
) async throws -> [String: String] {
    try await runCredentialHelper(
        command: "fill", credential: credential,
        repositoryPath: repositoryPath, helper: helper)
}

public func approveCredential(
    _ credential: [String: String],
    repositoryPath: String,
    helper: String = "osxkeychain"
) async throws {
    _ = try await runCredentialHelper(
        command: "approve", credential: credential,
        repositoryPath: repositoryPath, helper: helper)
}

public func rejectCredential(
    _ credential: [String: String],
    repositoryPath: String,
    helper: String = "osxkeychain"
) async throws {
    _ = try await runCredentialHelper(
        command: "reject", credential: credential,
        repositoryPath: repositoryPath, helper: helper)
}

// MARK: - Remote-operation environment

/// Non-interactive auth env (port of `envForAuthentication`).
public func envForAuthentication() -> [String: String] {
    var env: [String: String] = ["GIT_TERMINAL_PROMPT": "0"]
    if let trace = ProcessInfo.processInfo.environment["GIT_TRACE"] {
        env["GIT_TRACE"] = trace
    }
    return env
}

/// Proxy env for an http(s) remote URL (port of `envForProxy`).
/// Returns nil when no proxy applies: non-http(s) URLs, an existing
/// `ALL_PROXY`/`all_proxy`, or an already-configured protocol proxy.
/// System proxy auto-resolution is deferred (no dependency); explicit env wins.
public func proxyEnvForRemoteURL(
    _ remoteURL: String,
    environment: [String: String] = ProcessInfo.processInfo.environment
) -> [String: String]? {
    let lower = remoteURL.lowercased()
    let proto: String
    if lower.hasPrefix("https://") {
        proto = "https"
    } else if lower.hasPrefix("http://") {
        proto = "http"
    } else {
        return nil
    }
    if environment["ALL_PROXY"] != nil || environment["all_proxy"] != nil {
        return nil
    }
    let key = "\(proto)_proxy"
    if environment[key] != nil || (proto == "https" && environment["HTTPS_PROXY"] != nil) {
        return nil
    }
    return nil
}

/// Env for fetch/clone/push/pull (port of `envForRemoteOperation`).
public func envForRemoteOperation(_ remoteURL: String) -> [String: String] {
    var env = envForAuthentication()
    if let proxy = proxyEnvForRemoteURL(remoteURL) {
        for (key, value) in proxy { env[key] = value }
    }
    return env
}

// MARK: - safe.directory

/// Add `path` to `safe.directory` when missing (port of `addSafeDirectory`).
/// The Windows UNC `%(prefix)/` rewrite from the reference is macOS-dead code
/// and omitted.
public func addSafeDirectory(_ path: String) async throws {
    let check = try await GitProcess.run(
        ["config", "--global", "-z", "--get-all", "safe.directory", path])
    // Exit 1 (or output lacking the value) means "not present" — add it.
    if check.exitCode == 1 || !check.stdoutString.split(separator: "\0").map(String.init).contains(path) {
        let result = try await GitProcess.run(
            ["config", "--global", "--add", "safe.directory", path])
        if let error = classifyGitResult(result, args: ["config", "--global", "--add"]) {
            throw error
        }
    } else if let error = classifyGitResult(check, args: ["config"], successExitCodes: [0, 1]) {
        throw error
    }
}

// MARK: - Sync error chain

/// Which sync operation failed (drives popup selection + retry semantics).
public enum SyncOperationKind: String, Sendable {
    case fetch
    case pull
    case push
    case clone
    case remote
}

/// Context for mapping a sync failure to a popup.
public struct SyncErrorContext: Sendable, Equatable {
    public var repositoryID: Int
    public var remoteURL: String?
    public var operation: SyncOperationKind
    public var isBackgroundTask: Bool

    public init(
        repositoryID: Int,
        remoteURL: String? = nil,
        operation: SyncOperationKind,
        isBackgroundTask: Bool = false
    ) {
        self.repositoryID = repositoryID
        self.remoteURL = remoteURL
        self.operation = operation
        self.isBackgroundTask = isBackgroundTask
    }
}

/// Errors in the "authentication failed" umbrella (port of
/// `isAuthFailureError` + `AuthenticationErrors`, pruned to non-GH kinds).
public func isAuthFailure(_ kind: GitErrorKind?) -> Bool {
    switch kind {
    case .httpsAuthenticationFailed, .sshAuthenticationFailed, .sshPermissionDenied:
        return true
    default:
        return false
    }
}

/// `remote: `-prefixed server lines from git stderr (port of `getRemoteMessage`).
public func remoteMessage(from stderr: String) -> String {
    let needle = "remote: "
    return stderr
        .components(separatedBy: "\n")
        .map { $0.hasSuffix("\r") ? String($0.dropLast()) : $0 }
        .filter { $0.hasPrefix(needle) }
        .map { String($0.dropFirst(needle.count)) }
        .joined(separator: "\n")
}

/// Files listed after `error: … files would be overwritten by …:`
/// (port of `parseFilesToBeOverwritten`).
public func parseFilesToBeOverwritten(_ errorMessage: String) -> [String] {
    var files: [String] = []
    var inFilesList = false
    for line in errorMessage.components(separatedBy: "\n") {
        if inFilesList {
            guard line.hasPrefix("\t") else { break }
            files.append(line.trimmingCharacters(in: .whitespaces))
        } else if line.hasPrefix("error:"),
                  line.contains("files would be overwritten"),
                  line.hasSuffix(":") {
            inFilesList = true
        }
    }
    return files
}

/// Request to re-show the discard-changes retry dialog (port of the
/// `discardChangesHandler` branch: Task 3's trash failure surfaces here).
public struct DiscardChangesRetryRequest: Error, Sendable {
    public var repositoryID: Int

    public init(repositoryID: Int) {
        self.repositoryID = repositoryID
    }
}

/// Map a classified `GitError` to the popup the dialog stack should show.
/// Returns nil when no UI applies:
/// - background auth failures are suppressed (port of `backgroundTaskHandler`);
/// - merge/rebase/revert conflict errors defer to Tasks 5–6 conflict flows.
public func popupForSyncError(_ error: GitError, context: SyncErrorContext) -> Popup? {
    switch error.kind {
    case .pushNotFastForward:
        return .pushNeedsPull(repositoryID: context.repositoryID)
    case .localChangesOverwritten, .mergeWithLocalChanges, .rebaseWithLocalChanges:
        return .localChangesOverwritten(
            repositoryID: context.repositoryID,
            files: parseFilesToBeOverwritten(error.stderr))
    case .lfsAttributeDoesNotMatch:
        return .lfsAttributeMismatch
    case .pushWithSecretDetected:
        // Display only: there is no bypass API (scope rule).
        return .error(message: error.displayMessage)
    case .mergeConflicts, .rebaseConflicts, .revertConflicts, .unresolvedConflicts:
        // Owned by the merge/rebase flows (Tasks 5–6).
        return nil
    default:
        break
    }

    if isAuthFailure(error.kind)
        || error.kind == .httpsRepositoryNotFound
        || error.kind == .sshRepositoryNotFound {
        if context.isBackgroundTask { return nil }
        return .genericGitAuthentication(
            remoteURL: context.remoteURL ?? "", username: nil)
    }

    return .error(message: error.displayMessage)
}

/// Map any sync-thrown error to a popup (non-git errors become `.error`).
public func popupForSyncFailure(_ error: Error, context: SyncErrorContext) -> Popup? {
    if let retry = error as? DiscardChangesRetryRequest {
        return .discardChangesRetry(repositoryID: retry.repositoryID)
    }
    if let gitError = error as? GitError {
        return popupForSyncError(gitError, context: context)
    }
    return .error(message: error.localizedDescription)
}

// MARK: - performFailableOperation

@MainActor
public extension AppStore {
    /// Run a sync operation, showing the mapped popup on failure and
    /// returning nil (port of `GitStore.performFailableOperation` + the
    /// `error-handlers.ts` chain, pruned per scope).
    func performSyncOperation<T>(
        context: SyncErrorContext,
        operation: () async throws -> T
    ) async -> T? {
        do {
            return try await operation()
        } catch {
            if let popup = popupForSyncFailure(error, context: context) {
                showPopup(popup)
            }
            return nil
        }
    }
}

// MARK: - SSH / certificate challenges

/// Data for the "unknown SSH host" sheet. `Popup.addSSHHost` carries only
/// `host` + `fingerprint`; the extra fields ride directly into
/// `AddSSHHostView` when the full challenge is known (port of the
/// `AddSSHHost` props + `TrampolineUIHelper.promptAddingSSHHost`).
public struct SSHHostChallenge: Sendable, Equatable {
    public var host: String
    public var ip: String
    public var keyType: String
    public var fingerprint: String

    public init(host: String, ip: String, keyType: String, fingerprint: String) {
        self.host = host
        self.ip = ip
        self.keyType = keyType
        self.fingerprint = fingerprint
    }

    public var popup: Popup {
        .addSSHHost(host: host, fingerprint: fingerprint)
    }
}
