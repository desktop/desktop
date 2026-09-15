import Foundation

// MARK: - Progress
// Port of `electron/app/src/models/progress.ts`.
// Named `AppProgress` to avoid colliding with `Foundation.Progress`.

/// Base progress payload (0...1). Port of `IProgress`.
public struct ProgressPayload: Sendable, Equatable {
    /// Fraction completed, clamped to 0...1.
    public var value: Double
    public var title: String?
    public var description: String?

    public init(value: Double, title: String? = nil, description: String? = nil) {
        self.value = clampProgress(value)
        self.title = title
        self.description = description
    }
}

public func clampProgress(_ value: Double) -> Double {
    min(1, max(0, value))
}

/// Operation progress. Port of the `Progress` union.
/// (`ICloneProgress` exists in the original but is not part of the union;
/// it is kept here as `.clone` for the Task 7 clone flow.)
public enum AppProgress: Sendable, Equatable {
    case generic(ProgressPayload)
    case checkout(target: String, payload: ProgressPayload)
    case fetch(remote: String, payload: ProgressPayload)
    case pull(remote: String, payload: ProgressPayload)
    case push(remote: String, branch: String, payload: ProgressPayload)
    case clone(ProgressPayload)
    case revert(ProgressPayload)
    case multiCommitOperation(currentCommitSummary: String, position: Int, totalCommitCount: Int, payload: ProgressPayload)

    public var value: Double {
        switch self {
        case .generic(let p): return p.value
        case .checkout(_, let p): return p.value
        case .fetch(_, let p): return p.value
        case .pull(_, let p): return p.value
        case .push(_, _, let p): return p.value
        case .clone(let p): return p.value
        case .revert(let p): return p.value
        case .multiCommitOperation(_, _, _, let p): return p.value
        }
    }

    public var title: String? {
        switch self {
        case .generic(let p): return p.title
        case .checkout(_, let p): return p.title
        case .fetch(_, let p): return p.title
        case .pull(_, let p): return p.title
        case .push(_, _, let p): return p.title
        case .clone(let p): return p.title
        case .revert(let p): return p.title
        case .multiCommitOperation(_, _, _, let p): return p.title
        }
    }
}

/// Fetch scheduling. Port of `FetchType`.
public enum FetchType: Int, Sendable {
    case backgroundTask
    case userInitiatedTask
}

/// Clone options. Port of `CloneOptions`.
public struct CloneOptions: Sendable, Equatable {
    public var branch: String?
    public var defaultBranch: String?

    public init(branch: String? = nil, defaultBranch: String? = nil) {
        self.branch = branch
        self.defaultBranch = defaultBranch
    }
}
