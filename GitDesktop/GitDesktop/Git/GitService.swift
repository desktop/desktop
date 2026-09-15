import Foundation

// MARK: - GitService
// Protocol for per-repository git work (see Docs/02-architecture.md §2:
// per-repo work runs in an `actor GitStore`; this protocol is the seam that
// actor — and Task 1's mock — implement).
// Task 1 implements `status()` + `commits(limit:)` for real; every other
// operation stubs with `fatalError("Task N")` for its owning task.

/// Brushstroke status result used by the UI layer.
public struct RepositoryStatus: Sendable, Equatable {
    public var headers: StatusParser.StatusHeaders
    public var workingDirectory: WorkingDirectoryStatus
    public var mergeHeadFound: Bool
    public var squashMsgFound: Bool
    public var isCherryPicking: Bool
    public var doConflictedFilesExist: Bool

    public init(
        headers: StatusParser.StatusHeaders,
        workingDirectory: WorkingDirectoryStatus,
        mergeHeadFound: Bool = false,
        squashMsgFound: Bool = false,
        isCherryPicking: Bool = false,
        doConflictedFilesExist: Bool = false
    ) {
        self.headers = headers
        self.workingDirectory = workingDirectory
        self.mergeHeadFound = mergeHeadFound
        self.squashMsgFound = squashMsgFound
        self.isCherryPicking = isCherryPicking
        self.doConflictedFilesExist = doConflictedFilesExist
    }
}

public protocol GitService: Sendable {
    var repositoryPath: String { get }

    // --- Task 1 (real) ---
    func status(includeUntracked: Bool) async throws -> RepositoryStatus?
    func commits(range: String?, limit: Int) async throws -> [Commit]

    // --- Task 3 (staging / commit box) ---
    func stage(files: [String]) async throws
    func unstage(files: [String]) async throws
    func commit(context: CommitContext) async throws -> String

    // --- Task 5 (branches / history) ---
    func branches() async throws -> [Branch]
    func remotes() async throws -> [Remote]
}

// MARK: - LiveGitService

/// Real `Process`-backed implementation. Only `status` + `commits` are
/// implemented in Task 1; the rest abort with the owning task number.
public struct LiveGitService: GitService, Sendable {
    public var repositoryPath: String

    public init(repositoryPath: String) {
        self.repositoryPath = repositoryPath
    }

    // MARK: Status

    public func status(includeUntracked: Bool = true) async throws -> RepositoryStatus? {
        var args = ["--no-optional-locks", "status"]
        if includeUntracked { args.append("--untracked-files=all") }
        args += ["--branch", "--porcelain=2", "-z"]
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if result.exitCode == 128 { return nil } // not a repo
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) {
            throw error
        }
        let items = try StatusParser.parsePorcelainStatus(result.stdout)
        let headers = StatusParser.parseHeaders(items)

        var files: [WorkingDirectoryFileChange] = []
        var seenPaths = Set<String>()
        for item in items {
            guard case .entry(let entry) = item else { continue }
            let fileEntry = StatusParser.mapStatus(
                entry.statusCode,
                submoduleStatusCode: entry.submoduleStatusCode,
                renameOrCopyScore: entry.renameOrCopyScore)
            let appStatus = StatusParser.convertToAppStatus(
                path: entry.path, entry: fileEntry, oldPath: entry.oldPath)
            // Mirrors `buildStatusMap`: staged-delete + untracked collision —
            // the untracked entry wins.
            if entry.statusCode == "??" { seenPaths.remove(entry.path) }
            if seenPaths.contains(entry.path) { continue }
            seenPaths.insert(entry.path)
            let initial: DiffSelection.InitialSelection = {
                if case .modified(let submoduleStatus) = appStatus,
                   submoduleStatus != nil { return .none }
                return .all
            }()
            _ = initial
            files.append(WorkingDirectoryFileChange(
                path: entry.path, status: appStatus,
                selection: .fromInitialSelection(.all)))
        }

        let fm = FileManager.default
        let gitDir = (repositoryPath as NSString).appendingPathComponent(".git")
        let mergeHeadFound = fm.fileExists(atPath: (gitDir as NSString).appendingPathComponent("MERGE_HEAD"))
        let squashMsgFound = fm.fileExists(atPath: (gitDir as NSString).appendingPathComponent("SQUASH_MSG"))
        let cherryPicking = fm.fileExists(atPath: (gitDir as NSString).appendingPathComponent("CHERRY_PICK_HEAD"))
        let conflicted = files.contains { $0.status.isConflicted }
        return RepositoryStatus(
            headers: headers,
            workingDirectory: .fromFiles(files),
            mergeHeadFound: mergeHeadFound,
            squashMsgFound: squashMsgFound,
            isCherryPicking: cherryPicking,
            doConflictedFilesExist: conflicted)
    }

    // MARK: Log

    public func commits(range: String? = nil, limit: Int = 100) async throws -> [Commit] {
        let format = ["%H", "%h", "%s", "%b", "%an <%ae> %ad", "%cn <%ce> %cd", "%P", "%(trailers:unfold,only)", "%D"]
            .joined(separator: "%x00")
        var args = ["log"]
        if let range { args.append(range) }
        args += ["--date=raw", "--max-count=\(limit)", "-z", "--format=\(format)",
                 "--no-show-signature", "--no-color", "--"]
        let result = try await GitProcess.run(args, workingDirectory: repositoryPath)
        if result.exitCode == 128 { return [] } // unborn HEAD
        if let error = classifyGitResult(result, args: args, successExitCodes: [0]) {
            throw error
        }
        let records = LogParser.parseDelimitedRecords(result.stdout, fieldCount: LogParser.logFieldOrder.count)
        return records.compactMap { fields in
            LogParser.commitFromRecord(
                sha: fields[0], shortSha: fields[1], summary: fields[2],
                body: fields[3], author: fields[4], committer: fields[5],
                parents: fields[6], trailers: fields[7], refs: fields[8])
        }
    }

    // MARK: Stubs for later tasks

    public func stage(files: [String]) async throws { fatalError("Task 3") }
    public func unstage(files: [String]) async throws { fatalError("Task 3") }
    public func commit(context: CommitContext) async throws -> String { fatalError("Task 3") }
    public func branches() async throws -> [Branch] { fatalError("Task 5") }
    public func remotes() async throws -> [Remote] { fatalError("Task 7") }
}

// MARK: - MockGitService

/// In-memory fake for Previews and Tasks 2–8 UI work.
public final class MockGitService: GitService, Sendable {
    public let repositoryPath: String
    public var stubStatus: RepositoryStatus?
    public var stubCommits: [Commit]
    public var stubBranches: [Branch]
    public var stubRemotes: [Remote]
    public private(set) var stagedPaths: [String] = []
    public private(set) var committedContexts: [CommitContext] = []

    public init(
        repositoryPath: String = "/tmp/mock-repo",
        stubStatus: RepositoryStatus? = nil,
        stubCommits: [Commit] = [],
        stubBranches: [Branch] = [],
        stubRemotes: [Remote] = []
    ) {
        self.repositoryPath = repositoryPath
        self.stubStatus = stubStatus
        self.stubCommits = stubCommits
        self.stubBranches = stubBranches
        self.stubRemotes = stubRemotes
    }

    public func status(includeUntracked: Bool) async throws -> RepositoryStatus? {
        stubStatus
    }

    public func commits(range: String?, limit: Int) async throws -> [Commit] {
        Array(stubCommits.prefix(limit))
    }

    public func stage(files: [String]) async throws {
        stagedPaths.append(contentsOf: files)
    }

    public func unstage(files: [String]) async throws {
        stagedPaths.removeAll { files.contains($0) }
    }

    public func commit(context: CommitContext) async throws -> String {
        committedContexts.append(context)
        return "mock-sha-\(committedContexts.count)"
    }

    public func branches() async throws -> [Branch] { stubBranches }
    public func remotes() async throws -> [Remote] { stubRemotes }
}

extension MockGitService {
    /// Preview-friendly mock with two changed files and two commits.
    public static var preview: MockGitService {
        let identity = CommitIdentity(
            name: "Ada Lovelace", email: "ada@example.com",
            date: Date(timeIntervalSince1970: 1_700_000_000), tzOffset: 0)
        let commit = Commit(
            sha: "abc1234567890", shortSha: "abc1234",
            summary: "Add engine", body: "First commit",
            author: identity, committer: identity,
            parentSHAs: [], trailers: [])
        let files = [
            WorkingDirectoryFileChange(
                path: "README.md", status: .modified(submoduleStatus: nil),
                selection: .fromInitialSelection(.all)),
            WorkingDirectoryFileChange(
                path: "new.txt", status: .untracked(submoduleStatus: nil),
                selection: .fromInitialSelection(.all)),
        ]
        let status = RepositoryStatus(
            headers: StatusParser.StatusHeaders(
                currentBranch: "main", currentTip: "abc1234567890",
                aheadBehind: AheadBehind(ahead: 0, behind: 0)),
            workingDirectory: .fromFiles(files))
        return MockGitService(
            stubStatus: status,
            stubCommits: [commit],
            stubBranches: [
                Branch(name: "main", upstream: "origin/main",
                       tip: BranchTip(sha: "abc1234567890"),
                       type: .local, ref: "refs/heads/main")
            ],
            stubRemotes: [Remote(name: "origin", url: "https://example.com/repo.git")])
    }
}
