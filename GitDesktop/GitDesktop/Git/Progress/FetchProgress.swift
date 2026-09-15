import Foundation

// MARK: - FetchProgress
// Port of `electron/app/src/lib/progress/fetch.ts` + the `fetch()` progress
// wiring in `lib/git/fetch.ts`: weighted steps, `Fetching <remote>` title,
// initial 0-valued event, and the `remote: Counting objects` context gate
// (all other context lines are dropped to keep ref-update noise out of the
// toolbar).

public struct FetchProgressParser: Sendable {
    public static let steps = [
        GitProgressStep(title: "remote: Compressing objects", weight: 0.1),
        GitProgressStep(title: "Receiving objects", weight: 0.7),
        GitProgressStep(title: "Resolving deltas", weight: 0.2),
    ]

    public var remoteName: String
    public var core: GitProgressParser

    public init(remoteName: String) {
        self.remoteName = remoteName
        self.core = GitProgressParser(steps: Self.steps)
    }

    public var title: String { "Fetching \(remoteName)" }

    public var initialProgress: AppProgress {
        .fetch(remote: remoteName, payload: ProgressPayload(value: 0, title: title))
    }

    /// Parse one stderr line. Returns nil for lines the UI should ignore.
    public mutating func parse(line: String) -> AppProgress? {
        switch core.parse(line: line) {
        case .progress(let percent, let info):
            return .fetch(
                remote: remoteName,
                payload: ProgressPayload(value: percent, title: title, description: info.text))
        case .context(let text, let percent):
            guard text.hasPrefix("remote: Counting objects") else { return nil }
            return .fetch(
                remote: remoteName,
                payload: ProgressPayload(value: percent, title: title, description: text))
        }
    }
}
