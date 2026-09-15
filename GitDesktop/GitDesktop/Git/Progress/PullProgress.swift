import Foundation

// MARK: - PullProgress
// Port of `electron/app/src/lib/progress/pull.ts` + the `pull()` progress
// wiring in `lib/git/pull.ts`. A pull is a fetch plus a checkout tail, so an
// extra `Checking out files` step carries the final weight.

public struct PullProgressParser: Sendable {
    public static let steps = [
        GitProgressStep(title: "remote: Compressing objects", weight: 0.1),
        GitProgressStep(title: "Receiving objects", weight: 0.7),
        GitProgressStep(title: "Resolving deltas", weight: 0.15),
        GitProgressStep(title: "Checking out files", weight: 0.15),
    ]

    public var remoteName: String
    public var core: GitProgressParser

    public init(remoteName: String) {
        self.remoteName = remoteName
        self.core = GitProgressParser(steps: Self.steps)
    }

    public var title: String { "Pulling \(remoteName)" }

    public var initialProgress: AppProgress {
        .pull(remote: remoteName, payload: ProgressPayload(value: 0, title: title))
    }

    /// Parse one stderr line. Returns nil for lines the UI should ignore
    /// (same `remote: Counting objects` gate as fetch).
    public mutating func parse(line: String) -> AppProgress? {
        switch core.parse(line: line) {
        case .progress(let percent, let info):
            return .pull(
                remote: remoteName,
                payload: ProgressPayload(value: percent, title: title, description: info.text))
        case .context(let text, let percent):
            guard text.hasPrefix("remote: Counting objects") else { return nil }
            return .pull(
                remote: remoteName,
                payload: ProgressPayload(value: percent, title: title, description: text))
        }
    }
}
