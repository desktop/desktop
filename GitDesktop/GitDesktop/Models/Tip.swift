import Foundation

/// Repository HEAD state. Port of `Tip` in `models/tip.ts`.
public enum Tip: Sendable, Equatable {
    case unknown
    case unborn(ref: String)
    case detached(currentSha: String)
    case valid(branch: Branch)

    public var kind: TipState {
        switch self {
        case .unknown: return .unknown
        case .unborn: return .unborn
        case .detached: return .detached
        case .valid: return .valid
        }
    }
}

public enum TipState: String, Codable, Sendable {
    case unknown = "Unknown"
    case unborn = "Unborn"
    case detached = "Detached"
    case valid = "Valid"
}

public func tipEquals(_ x: Tip, _ y: Tip) -> Bool {
    switch (x, y) {
    case (.unknown, .unknown): return true
    case (.unborn(let a), .unborn(let b)): return a == b
    case (.detached(let a), .detached(let b)): return a == b
    case (.valid(let a), .valid(let b)):
        return a.type == b.type
            && a.tip.sha == b.tip.sha
            && a.upstreamRemoteName == b.upstreamRemoteName
            && a.upstream == b.upstream
    default: return false
    }
}
