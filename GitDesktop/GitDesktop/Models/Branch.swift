import Foundation

/// NOTE: The raw values matter: they are used to sort local before remote.
/// Direct port of `electron/app/src/models/branch.ts`.
public enum BranchType: Int, Codable, Sendable, Comparable {
    case local = 0
    case remote = 1

    public static func < (lhs: BranchType, rhs: BranchType) -> Bool {
        lhs.rawValue < rhs.rawValue
    }
}

/// The number of commits a revision range is ahead/behind.
/// Port of `IAheadBehind`.
public struct AheadBehind: Codable, Sendable, Equatable {
    public var ahead: Int
    public var behind: Int

    public init(ahead: Int, behind: Int) {
        self.ahead = ahead
        self.behind = behind
    }
}

/// Basic data about the latest commit on the branch. Port of `IBranchTip`.
public struct BranchTip: Codable, Sendable, Equatable {
    public var sha: String

    public init(sha: String) {
        self.sha = sha
    }
}

/// Basic data about a branch and the branch it is tracking. Port of `ITrackingBranch`.
public struct TrackingBranch: Sendable, Equatable {
    public var ref: String
    public var sha: String
    public var upstreamRef: String
    public var upstreamSha: String

    public init(ref: String, sha: String, upstreamRef: String, upstreamSha: String) {
        self.ref = ref
        self.sha = sha
        self.upstreamRef = upstreamRef
        self.upstreamSha = upstreamSha
    }
}

/// Default rules for where to create a branch from. Port of `StartPoint`.
/// `upstreamDefaultBranch` is only meaningful for forks; retained as data.
public enum StartPoint: String, Codable, Sendable {
    case currentBranch = "CurrentBranch"
    case defaultBranch = "DefaultBranch"
    case head = "Head"
    case upstreamDefaultBranch = "UpstreamDefaultBranch"
}

/// A branch as loaded from Git. Port of `Branch` in `branch.ts`.
public struct Branch: Sendable, Equatable, Identifiable {
    /// Short name, e.g. `main` (remote branches keep the `origin/` prefix in `name`).
    public var name: String
    /// Remote-prefixed upstream name, e.g. `origin/main`.
    public var upstream: String?
    public var tip: BranchTip
    public var type: BranchType
    /// Canonical ref, e.g. `refs/heads/main`.
    public var ref: String

    public init(name: String, upstream: String?, tip: BranchTip, type: BranchType, ref: String) {
        self.name = name
        self.upstream = upstream
        self.tip = tip
        self.type = type
        self.ref = ref
    }

    public var id: String { ref }

    /// The name of the upstream's remote.
    public var upstreamRemoteName: String? {
        guard let upstream else { return nil }
        guard let range = upstream.range(of: "^(.*?)/.*", options: .regularExpression) else { return nil }
        _ = range
        // Manual split to mirror `(.*?)\/.*` semantics.
        guard let slash = upstream.firstIndex(of: "/") else { return nil }
        let remote = String(upstream[..<slash])
        return remote.isEmpty ? nil : remote
    }

    /// The name of the remote for a remote branch, nil for local branches.
    public var remoteName: String? {
        guard type == .remote else { return nil }
        let prefix = "refs/remotes/"
        guard ref.hasPrefix(prefix) else { return nil }
        let rest = String(ref.dropFirst(prefix.count))
        guard let slash = rest.firstIndex(of: "/") else { return nil }
        return String(rest[..<slash])
    }

    /// The upstream name without the remote prefix.
    public var upstreamWithoutRemote: String? {
        guard let upstream else { return nil }
        return Branch.removeRemotePrefix(upstream)
    }

    /// The branch name without the remote prefix (local names unchanged).
    public var nameWithoutRemote: String {
        guard type != .local else { return name }
        return Branch.removeRemotePrefix(name) ?? name
    }

    /// Whether this is a remote branch on one of Desktop's auto-created
    /// (`github-desktop-`) fork remotes. Such branches are hidden as plumbing.
    public var isDesktopForkRemoteBranch: Bool {
        type == .remote && name.hasPrefix(forkedRemotePrefix)
    }

    // MARK: - Helpers

    /// Mirrors `lib/remove-remote-prefix.ts`: strips the leading `remote/` segment.
    public static func removeRemotePrefix(_ name: String) -> String? {
        guard let slash = name.firstIndex(of: "/") else { return nil }
        let rest = String(name[name.index(after: slash)...])
        return rest.isEmpty ? nil : rest
    }
}
