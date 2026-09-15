import Foundation

// MARK: - Sync
// Task 7 remote operations. Ports (pruned per scope — no GitHub API):
// - `electron/app/src/lib/git/remote.ts`: list/add/remove/set-url/get-url,
//   `remote set-head -a`.
// - `lib/git/fetch.ts`: `fetch --prune --recurse-submodules=on-demand`.
// - `lib/git/pull.ts`: `--ff` default when `pull.ff` is unset + the
//   `-c rebase.backend=merge` pin.
// - `lib/git/push.ts`: upstream/force-with-lease/tag push.
// - `lib/git/tag.ts` (`fetchTagsToPush` only): `--follow-tags --dry-run
//   --no-verify --porcelain` → `[new tag]` parse.
// - `fetch.ts` (`fastForwardBranches`): local `fetch .` fast-forward.
// - `ui/toolbar/push-pull-button.tsx` (`renderButton` + `renderAheadBehind` +
//   `renderLastFetched`): the `PushPullState` state machine below.
//
// Progress: `GitProcess` is buffer-mode, so live callbacks replay the final
// stderr through the `Git/Progress` parsers after the run (initial 0 event
// first, so the toolbar spins immediately). The parsers themselves are pure
// and covered by scripted-output tests. Incremental streaming + live
// `GIT_LFS_PROGRESS` tailing land when `GitProcess` gains async pipe
// reading; `LFSProgressParser` is ready for that consumer.

// MARK: - Pure arg builders

/// `git -c rebase.backend=merge` prefix (port of `gitRebaseArguments`).
public func rebaseBackendArgs() -> [String] {
    ["-c", "rebase.backend=merge"]
}

/// `fetch --prune --recurse-submodules=on-demand <remote>` (+ `--progress`).
public func fetchArgs(remoteName: String, withProgress: Bool) -> [String] {
    ["fetch"]
        + (withProgress ? ["--progress"] : [])
        + ["--prune", "--recurse-submodules=on-demand", remoteName]
}

/// Pull args. `pullFFConfigured == false` (no `pull.ff` in config) adds
/// `--ff`; a failed config read passes `true` (no flag), mirroring the
/// reference's catch path.
public func pullArgs(remoteName: String, withProgress: Bool, noVerify: Bool, pullFFConfigured: Bool) -> [String] {
    rebaseBackendArgs()
        + ["pull"]
        + (pullFFConfigured ? [] : ["--ff"])
        + ["--recurse-submodules"]
        + (withProgress ? ["--progress"] : [])
        + (noVerify ? ["--no-verify"] : [])
        + [remoteName]
}

/// Push args. A nil `remoteBranch` pushes the current branch with
/// `--set-upstream`; otherwise `--force-with-lease` applies when requested.
public func pushArgs(
    remoteName: String,
    localBranch: String,
    remoteBranch: String?,
    tagsToPush: [String],
    forceWithLease: Bool,
    noVerify: Bool,
    withProgress: Bool
) -> [String] {
    var refspec = localBranch
    if let remoteBranch {
        refspec = "\(localBranch):\(remoteBranch)"
    }
    var args = ["push", remoteName, refspec]
    args += tagsToPush
    if remoteBranch == nil {
        args.append("--set-upstream")
    } else if forceWithLease {
        args.append("--force-with-lease")
    }
    if noVerify { args.append("--no-verify") }
    if withProgress { args.append("--progress") }
    return args
}

// MARK: - Pure output parsers

private let remoteLinePattern: NSRegularExpression? = try? NSRegularExpression(
    pattern: #"^(.+)\t(.+)\s\(fetch\)$"#)

/// Parse `git remote -v` stdout (fetch lines only, port of `getRemotes`).
public func parseRemotes(_ stdout: String) -> [Remote] {
    var remotes: [Remote] = []
    for rawLine in stdout.components(separatedBy: "\n") {
        let line = rawLine.hasSuffix("\r") ? String(rawLine.dropLast()) : rawLine
        guard let regex = remoteLinePattern,
              let match = regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)),
              match.numberOfRanges == 3,
              let nameRange = Range(match.range(at: 1), in: line),
              let urlRange = Range(match.range(at: 2), in: line)
        else { continue }
        remotes.append(Remote(name: String(line[nameRange]), url: String(line[urlRange])))
    }
    return remotes
}

/// Parse `git push --follow-tags --dry-run --porcelain` stdout into unpushed
/// tag names (port of `fetchTagsToPush`).
public func parseTagsToPush(_ stdout: String) -> [String] {
    let lines = stdout.components(separatedBy: "\n")
    var tags: [String] = []
    var index = 1
    while index < lines.count && lines[index] != "Done" {
        let parts = lines[index].components(separatedBy: "\t")
        if parts.count >= 3 && parts[0] == "*" && parts[2] == "[new tag]" {
            let ref = parts[1].split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init)
            if let ref, !ref.isEmpty {
                tags.append(ref.hasPrefix("refs/tags/") ? String(ref.dropFirst("refs/tags/".count)) : ref)
            }
        }
        index += 1
    }
    return tags
}

/// Split buffered stderr into progress segments on CR/LF (git overwrites
/// progress lines with `\r`; see `progress.c`).
public func progressLines(from stderr: String) -> [String] {
    stderr
        .components(separatedBy: CharacterSet(charactersIn: "\r\n"))
        .filter { !$0.isEmpty }
}

/// Whether a stderr line describes the LFS smudge filter rather than the
/// fetch/push itself. Such lines are skipped during replay; live streaming
/// (future work) will restore the reference's active-flag suppression.
public func isLFSFilterLine(_ line: String) -> Bool {
    parseGitProgressLine(stripANSIControlCharacters(line))?.title == "Filtering content"
}

// MARK: - Config helper

/// Read `git config -z <name>`; nil when unset (exit 1).
public func gitConfigValue(repositoryPath: String, name: String) async throws -> String? {
    let result = try await GitProcess.run(["config", "-z", name], workingDirectory: repositoryPath)
    if result.exitCode == 1 { return nil }
    if let error = classifyGitResult(result, args: ["config", name], successExitCodes: [0]) {
        throw error
    }
    let pieces = result.stdoutString.split(separator: "\0", omittingEmptySubsequences: false)
    return pieces.first.map(String.init)
}

// MARK: - Remote CRUD

public func listRemotes(repositoryPath: String) async throws -> [Remote] {
    let result = try await GitProcess.run(["remote", "-v"], workingDirectory: repositoryPath)
    if result.exitCode == 128, parseGitError(result.stderrString) == .notAGitRepository {
        return []
    }
    if let error = classifyGitResult(result, args: ["remote", "-v"]) {
        throw error
    }
    return parseRemotes(result.stdoutString)
}

public func addRemote(repositoryPath: String, name: String, url: String) async throws -> Remote {
    let args = ["remote", "add", name, url]
    let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
    if let error = classifyGitResult(result, args: args) {
        throw error
    }
    return Remote(name: name, url: url)
}

public func removeRemote(repositoryPath: String, name: String) async throws {
    let args = ["remote", "remove", name]
    let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
    if let error = classifyGitResult(result, args: args, successExitCodes: [0, 2, 128]) {
        throw error
    }
}

public func setRemoteURL(repositoryPath: String, name: String, url: String) async throws {
    let args = ["remote", "set-url", name, url]
    let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
    if let error = classifyGitResult(result, args: args) {
        throw error
    }
}

public func getRemoteURL(repositoryPath: String, name: String) async throws -> String? {
    let args = ["remote", "get-url", name]
    let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
    if result.exitCode != 0 {
        if let error = classifyGitResult(result, args: args, successExitCodes: [0, 2, 128]) {
            throw error
        }
        return nil
    }
    let url = result.stdoutString.trimmingCharacters(in: .whitespacesAndNewlines)
    return url.isEmpty ? nil : url
}

/// `remote set-head -a` (exits 0/1/128 all acceptable, port of `updateRemoteHEAD`).
public func updateRemoteHEAD(repositoryPath: String, remote: Remote, isBackgroundTask: Bool) async throws {
    _ = isBackgroundTask
    let args = ["remote", "set-head", "-a", remote.name]
    let result = try await GitProcess.run(
        args, workingDirectory: repositoryPath,
        environment: envForRemoteOperation(remote.url))
    if let error = classifyGitResult(result, args: args, successExitCodes: [0, 1, 128]) {
        throw error
    }
}

// MARK: - Fetch / pull / push

public typealias SyncProgressCallback = @Sendable (AppProgress) -> Void

public func fetchRemote(
    repositoryPath: String,
    remote: Remote,
    progress: SyncProgressCallback? = nil,
    isBackgroundTask: Bool = false
) async throws {
    if let progress {
        var parser = FetchProgressParser(remoteName: remote.name)
        progress(parser.initialProgress)
        let result = try await GitProcess.run(
            fetchArgs(remoteName: remote.name, withProgress: true),
            workingDirectory: repositoryPath,
            environment: envForRemoteOperation(remote.url))
        if let error = classifyGitResult(result, args: ["fetch", remote.name]) {
            throw error
        }
        for line in progressLines(from: result.stderrString) where !isLFSFilterLine(line) {
            if let event = parser.parse(line: line) { progress(event) }
        }
    } else {
        let result = try await GitProcess.run(
            fetchArgs(remoteName: remote.name, withProgress: false),
            workingDirectory: repositoryPath,
            environment: envForRemoteOperation(remote.url))
        if let error = classifyGitResult(result, args: ["fetch", remote.name]) {
            throw error
        }
    }
    // Non-critical: never fail the fetch when the HEAD symref update fails.
    do {
        try await updateRemoteHEAD(repositoryPath: repositoryPath, remote: remote, isBackgroundTask: isBackgroundTask)
    } catch {
        // Intentionally ignored (mirrors the reference's `.catch(log)`).
    }
}

/// Fetch one refspec (exits 0/128 acceptable, port of `fetchRefspec`).
public func fetchRefspec(repositoryPath: String, remote: Remote, refspec: String) async throws {
    let args = ["fetch", remote.name, refspec]
    let result = try await GitProcess.run(
        args, workingDirectory: repositoryPath,
        environment: envForRemoteOperation(remote.url))
    if let error = classifyGitResult(result, args: args, successExitCodes: [0, 128]) {
        throw error
    }
}

/// Fast-forward local tracking branches (port of `fastForwardBranches`).
/// `refPairs` are `"<upstreamRef>:<ref>"` strings fed via `--stdin`.
public func fastForwardBranches(repositoryPath: String, refPairs: [String]) async throws {
    guard !refPairs.isEmpty else { return }
    let args = ["fetch", ".", "--show-forced-updates", "--no-write-fetch-head", "--stdin"]
    let result = try await GitProcess.run(
        args, workingDirectory: repositoryPath,
        stdin: Data(refPairs.joined(separator: "\n").utf8),
        environment: ["GIT_REFLOG_ACTION": "pull"])
    if let error = classifyGitResult(result, args: args, successExitCodes: [0, 1]) {
        throw error
    }
}

public func pullRepository(
    repositoryPath: String,
    remote: Remote,
    progress: SyncProgressCallback? = nil,
    noVerify: Bool = false
) async throws {
    // Mirror `getDefaultPullDivergentBranchArguments`: `--ff` unless the user
    // set `pull.ff`; a failed read also yields no flag.
    let configured: Bool = await { () async -> Bool in
        do {
            return try await gitConfigValue(repositoryPath: repositoryPath, name: "pull.ff") != nil
        } catch {
            return true
        }
    }()
    let args = pullArgs(
        remoteName: remote.name, withProgress: progress != nil,
        noVerify: noVerify, pullFFConfigured: configured)
    if let progress {
        var parser = PullProgressParser(remoteName: remote.name)
        progress(parser.initialProgress)
        let result = try await GitProcess.run(
            args, workingDirectory: repositoryPath,
            environment: envForRemoteOperation(remote.url))
        if let error = classifyGitResult(result, args: args) {
            throw error
        }
        for line in progressLines(from: result.stderrString) where !isLFSFilterLine(line) {
            if let event = parser.parse(line: line) { progress(event) }
        }
    } else {
        let result = try await GitProcess.run(
            args, workingDirectory: repositoryPath,
            environment: envForRemoteOperation(remote.url))
        if let error = classifyGitResult(result, args: args) {
            throw error
        }
    }
}

public func pushRepository(
    repositoryPath: String,
    remote: Remote,
    localBranch: String,
    remoteBranch: String?,
    tagsToPush: [String] = [],
    forceWithLease: Bool = false,
    noVerify: Bool = false,
    progress: SyncProgressCallback? = nil
) async throws {
    let args = pushArgs(
        remoteName: remote.name, localBranch: localBranch, remoteBranch: remoteBranch,
        tagsToPush: tagsToPush, forceWithLease: forceWithLease,
        noVerify: noVerify, withProgress: progress != nil)
    if let progress {
        var parser = PushProgressParser(remoteName: remote.name, branchName: localBranch)
        progress(parser.initialProgress)
        let result = try await GitProcess.run(
            args, workingDirectory: repositoryPath,
            environment: envForRemoteOperation(remote.url))
        if let error = classifyGitResult(result, args: args) {
            throw error
        }
        for line in progressLines(from: result.stderrString) where !isLFSFilterLine(line) {
            progress(parser.parse(line: line))
        }
    } else {
        let result = try await GitProcess.run(
            args, workingDirectory: repositoryPath,
            environment: envForRemoteOperation(remote.url))
        if let error = classifyGitResult(result, args: args) {
            throw error
        }
    }
}

/// Tags `--follow-tags` would push (port of `fetchTagsToPush`).
public func fetchTagsToPush(repositoryPath: String, remote: Remote, branchName: String) async throws -> [String] {
    let args = ["push", remote.name, branchName, "--follow-tags", "--dry-run", "--no-verify", "--porcelain"]
    let result = try await GitProcess.run(
        args, workingDirectory: repositoryPath,
        environment: envForRemoteOperation(remote.url))
    if result.exitCode != 0 && result.exitCode != 1 {
        if let error = classifyGitResult(result, args: args, successExitCodes: [0, 1, 128]) {
            throw error
        }
        throw GitError(kind: nil, args: args, stdout: result.stdoutString, stderr: result.stderrString, exitCode: result.exitCode)
    }
    return parseTagsToPush(result.stdoutString)
}

// MARK: - Push/pull button state machine

/// Force-push availability (port of `ForcePushBranchState`).
public enum ForcePushState: String, Sendable, Equatable {
    case notAvailable
    case available
    case recommended
}

/// What the toolbar's main push/pull button does when clicked.
public enum PushPullAction: Sendable, Equatable {
    case publishRepository
    case publishBranch
    case fetch
    case pull(pullWithRebase: Bool)
    case push
    case forcePush
    /// A network operation is running; the button shows progress, disabled.
    case progress
    /// Detached HEAD; the button is disabled.
    case detached(rebaseInProgress: Bool)
}

public enum PushPullDropdownItem: String, Sendable, Equatable {
    case fetch
    case forcePush
}

/// Compact `↑N ↓M` badge (port of `renderAheadBehind`).
public struct AheadBehindBadge: Sendable, Equatable {
    /// Up count (`ahead + tagsToPush`), formatted, when > 0.
    public var up: String?
    /// Down count (`behind`), formatted, when > 0.
    public var down: String?

    public init(up: String? = nil, down: String? = nil) {
        self.up = up
        self.down = down
    }
}

private let badgeNumberFormatter: NumberFormatter = {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    return formatter
}()

/// Port of `renderAheadBehind`. Nil when there is nothing to show.
public func aheadBehindBadge(ahead: Int, behind: Int, tagsToPush: Int) -> AheadBehindBadge? {
    let upCount = ahead + tagsToPush
    guard upCount > 0 || behind > 0 else { return nil }
    func format(_ value: Int) -> String {
        badgeNumberFormatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }
    return AheadBehindBadge(
        up: upCount > 0 ? format(upCount) : nil,
        down: behind > 0 ? format(behind) : nil)
}

/// Port of `renderLastFetched` (system formatters only, per scope).
public func lastFetchedDescription(_ date: Date?) -> String {
    guard let date else { return "Never fetched" }
    let formatter = RelativeDateTimeFormatter()
    return "Last fetched \(formatter.localizedString(for: date, relativeTo: Date()))"
}

/// Toolbar push/pull button state (port of `PushPullButton.renderButton`).
public struct PushPullState: Sendable, Equatable {
    public var action: PushPullAction
    public var title: String
    public var description: String
    public var badge: AheadBehindBadge?
    public var dropdownItems: [PushPullDropdownItem]
    public var enabled: Bool
    public var showsProgress: Bool
    public var progressValue: Double?

    public init(
        action: PushPullAction,
        title: String,
        description: String,
        badge: AheadBehindBadge? = nil,
        dropdownItems: [PushPullDropdownItem] = [],
        enabled: Bool = true,
        showsProgress: Bool = false,
        progressValue: Double? = nil
    ) {
        self.action = action
        self.title = title
        self.description = description
        self.badge = badge
        self.dropdownItems = dropdownItems
        self.enabled = enabled
        self.showsProgress = showsProgress
        self.progressValue = progressValue
    }
}

/// Resolve the button state (port of `renderButton`).
public func resolvePushPullState(
    tip: Tip,
    remoteName: String?,
    aheadBehind: AheadBehind?,
    numTagsToPush: Int,
    progress: AppProgress?,
    forcePushState: ForcePushState,
    pullWithRebase: Bool,
    rebaseInProgress: Bool,
    lastFetched: Date?
) -> PushPullState {
    if let progress {
        return PushPullState(
            action: .progress,
            title: progress.title ?? "Hang on…",
            description: progress.progressDescription ?? progress.title ?? "Hang on…",
            enabled: false,
            showsProgress: true,
            progressValue: progress.value)
    }

    guard let remoteName else {
        return PushPullState(
            action: .publishRepository,
            title: "Publish repository",
            description: "Publish this repository")
    }

    switch tip.kind {
    case .unborn:
        return PushPullState(
            action: .fetch,
            title: "Fetch \(remoteName)",
            description: lastFetchedDescription(lastFetched))
    case .detached:
        return PushPullState(
            action: .detached(rebaseInProgress: rebaseInProgress),
            title: "Publish branch",
            description: rebaseInProgress ? "Rebase in progress" : "Cannot publish detached HEAD",
            enabled: false)
    case .unknown:
        return PushPullState(
            action: .fetch,
            title: "Fetch \(remoteName)",
            description: lastFetchedDescription(lastFetched))
    case .valid:
        break
    }

    guard let aheadBehind else {
        return PushPullState(
            action: .publishBranch,
            title: "Publish branch",
            description: "Publish this branch to the remote",
            dropdownItems: [.fetch])
    }

    let badge = aheadBehindBadge(
        ahead: aheadBehind.ahead, behind: aheadBehind.behind, tagsToPush: numTagsToPush)

    if aheadBehind.ahead == 0 && aheadBehind.behind == 0 && numTagsToPush == 0 {
        return PushPullState(
            action: .fetch,
            title: "Fetch \(remoteName)",
            description: lastFetchedDescription(lastFetched))
    }

    if forcePushState == .recommended {
        return PushPullState(
            action: .forcePush,
            title: "Force push \(remoteName)",
            description: lastFetchedDescription(lastFetched),
            badge: badge,
            dropdownItems: [.fetch])
    }

    if aheadBehind.behind > 0 {
        var items: [PushPullDropdownItem] = [.fetch]
        if forcePushState != .notAvailable {
            items.append(.forcePush)
        }
        return PushPullState(
            action: .pull(pullWithRebase: pullWithRebase),
            title: pullWithRebase ? "Pull \(remoteName) with rebase" : "Pull \(remoteName)",
            description: lastFetchedDescription(lastFetched),
            badge: badge,
            dropdownItems: items)
    }

    return PushPullState(
        action: .push,
        title: "Push \(remoteName)",
        description: lastFetchedDescription(lastFetched),
        badge: badge,
        dropdownItems: [.fetch])
}

// MARK: - SyncOperations protocol

/// Task 7's additive seam on top of `GitService`. `LiveGitService` runs real
/// git; `MockGitService` records remotes CRUD in-memory for UI work. (A
/// separate refined protocol — rather than new `GitService` requirements —
/// keeps parallel tasks compiling against the Task 1 contract.)
public protocol SyncOperations: GitService {
    func fetch(remote: Remote, progress: SyncProgressCallback?, isBackgroundTask: Bool) async throws
    func fetchRefspec(remote: Remote, refspec: String) async throws
    func fastForwardBranches(refPairs: [String]) async throws
    func pull(remote: Remote, progress: SyncProgressCallback?, noVerify: Bool) async throws
    func push(
        remote: Remote,
        localBranch: String,
        remoteBranch: String?,
        tagsToPush: [String],
        forceWithLease: Bool,
        noVerify: Bool,
        progress: SyncProgressCallback?
    ) async throws
    func fetchTagsToPush(remote: Remote, branchName: String) async throws -> [String]
    func getRemoteURL(name: String) async throws -> String?
    func addRemote(name: String, url: String) async throws -> Remote
    func removeRemote(name: String) async throws
    func setRemoteURL(name: String, url: String) async throws
    func updateRemoteHEAD(remote: Remote, isBackgroundTask: Bool) async throws
}

extension LiveGitService: SyncOperations {
    public func fetch(remote: Remote, progress: SyncProgressCallback? = nil, isBackgroundTask: Bool = false) async throws {
        try await fetchRemote(
            repositoryPath: repositoryPath, remote: remote,
            progress: progress, isBackgroundTask: isBackgroundTask)
    }

    public func fetchRefspec(remote: Remote, refspec: String) async throws {
        try await GitDesktop.fetchRefspec(repositoryPath: repositoryPath, remote: remote, refspec: refspec)
    }

    public func fastForwardBranches(refPairs: [String]) async throws {
        try await GitDesktop.fastForwardBranches(repositoryPath: repositoryPath, refPairs: refPairs)
    }

    public func pull(remote: Remote, progress: SyncProgressCallback? = nil, noVerify: Bool = false) async throws {
        try await pullRepository(
            repositoryPath: repositoryPath, remote: remote,
            progress: progress, noVerify: noVerify)
    }

    public func push(
        remote: Remote,
        localBranch: String,
        remoteBranch: String?,
        tagsToPush: [String] = [],
        forceWithLease: Bool = false,
        noVerify: Bool = false,
        progress: SyncProgressCallback? = nil
    ) async throws {
        try await pushRepository(
            repositoryPath: repositoryPath, remote: remote,
            localBranch: localBranch, remoteBranch: remoteBranch,
            tagsToPush: tagsToPush, forceWithLease: forceWithLease,
            noVerify: noVerify, progress: progress)
    }

    public func fetchTagsToPush(remote: Remote, branchName: String) async throws -> [String] {
        try await GitDesktop.fetchTagsToPush(repositoryPath: repositoryPath, remote: remote, branchName: branchName)
    }

    public func getRemoteURL(name: String) async throws -> String? {
        try await GitDesktop.getRemoteURL(repositoryPath: repositoryPath, name: name)
    }

    public func addRemote(name: String, url: String) async throws -> Remote {
        try await GitDesktop.addRemote(repositoryPath: repositoryPath, name: name, url: url)
    }

    public func removeRemote(name: String) async throws {
        try await GitDesktop.removeRemote(repositoryPath: repositoryPath, name: name)
    }

    public func setRemoteURL(name: String, url: String) async throws {
        try await GitDesktop.setRemoteURL(repositoryPath: repositoryPath, name: name, url: url)
    }

    public func updateRemoteHEAD(remote: Remote, isBackgroundTask: Bool = false) async throws {
        try await GitDesktop.updateRemoteHEAD(
            repositoryPath: repositoryPath, remote: remote, isBackgroundTask: isBackgroundTask)
    }
}

extension MockGitService: SyncOperations {
    public func fetch(remote: Remote, progress: SyncProgressCallback?, isBackgroundTask: Bool) async throws {
        if let progress {
            let parser = FetchProgressParser(remoteName: remote.name)
            progress(parser.initialProgress)
        }
    }

    public func fetchRefspec(remote: Remote, refspec: String) async throws {}

    public func fastForwardBranches(refPairs: [String]) async throws {}

    public func pull(remote: Remote, progress: SyncProgressCallback?, noVerify: Bool) async throws {
        if let progress {
            let parser = PullProgressParser(remoteName: remote.name)
            progress(parser.initialProgress)
        }
    }

    public func push(
        remote: Remote,
        localBranch: String,
        remoteBranch: String?,
        tagsToPush: [String],
        forceWithLease: Bool,
        noVerify: Bool,
        progress: SyncProgressCallback?
    ) async throws {
        if let progress {
            let parser = PushProgressParser(remoteName: remote.name, branchName: localBranch)
            progress(parser.initialProgress)
        }
    }

    public func fetchTagsToPush(remote: Remote, branchName: String) async throws -> [String] {
        []
    }

    public func getRemoteURL(name: String) async throws -> String? {
        stubRemotes.first { $0.name == name }?.url
    }

    public func addRemote(name: String, url: String) async throws -> Remote {
        let remote = Remote(name: name, url: url)
        stubRemotes.append(remote)
        return remote
    }

    public func removeRemote(name: String) async throws {
        stubRemotes.removeAll { $0.name == name }
    }

    public func setRemoteURL(name: String, url: String) async throws {
        if let index = stubRemotes.firstIndex(where: { $0.name == name }) {
            stubRemotes[index] = Remote(name: name, url: url)
        }
    }

    public func updateRemoteHEAD(remote: Remote, isBackgroundTask: Bool) async throws {}
}
