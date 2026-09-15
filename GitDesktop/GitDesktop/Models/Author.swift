import Foundation

/// Commit co-author. Port of `models/author.ts`.
/// (Kept generic; the original gated co-authors to GitHub repos.)
public enum Author: Sendable, Equatable, Hashable {
    case known(name: String, email: String, username: String?)
    case unknown(username: String, state: UnknownAuthorState)

    public enum UnknownAuthorState: String, Sendable {
        case searching
        case error
    }
}

/// Manual conflict resolution choice (`--ours` / `--theirs`).
/// Port of `models/manual-conflict-resolution.ts`.
public enum ManualConflictResolution: String, Codable, Sendable {
    case ours
    case theirs

    public var gitFlag: String {
        switch self {
        case .ours: return "--ours"
        case .theirs: return "--theirs"
        }
    }
}
