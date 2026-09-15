import Foundation

// MARK: - PushProgress
// Port of `electron/app/src/lib/progress/push.ts` + the `push()` progress
// wiring in `lib/git/push.ts`. Unlike fetch/pull, push forwards every event
// (progress and context alike) to the callback.

public struct PushProgressParser: Sendable {
    public static let steps = [
        GitProgressStep(title: "Compressing objects", weight: 0.2),
        GitProgressStep(title: "Writing objects", weight: 0.7),
        GitProgressStep(title: "remote: Resolving deltas", weight: 0.1),
    ]

    public var remoteName: String
    public var branchName: String
    public var core: GitProgressParser

    public init(remoteName: String, branchName: String) {
        self.remoteName = remoteName
        self.branchName = branchName
        self.core = GitProgressParser(steps: Self.steps)
    }

    public var title: String { "Pushing to \(remoteName)" }

    public var initialProgress: AppProgress {
        .push(
            remote: remoteName, branch: branchName,
            payload: ProgressPayload(value: 0, title: title))
    }

    /// Parse one stderr line. Never drops lines (mirrors `push.ts`).
    public mutating func parse(line: String) -> AppProgress {
        switch core.parse(line: line) {
        case .progress(let percent, let info):
            return .push(
                remote: remoteName, branch: branchName,
                payload: ProgressPayload(value: percent, title: title, description: info.text))
        case .context(let text, let percent):
            return .push(
                remote: remoteName, branch: branchName,
                payload: ProgressPayload(value: percent, title: title, description: text))
        }
    }
}
