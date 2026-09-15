import Foundation

// MARK: - CloneProgress
// Port of `electron/app/src/lib/progress/clone.ts` + the clone progress
// wiring in `lib/git/clone.ts`: same step family as fetch plus a checkout
// tail. Context lines use the fetch-style `remote: Counting objects` gate.

public struct CloneProgressParser: Sendable {
    public static let steps = [
        GitProgressStep(title: "remote: Compressing objects", weight: 0.1),
        GitProgressStep(title: "Receiving objects", weight: 0.6),
        GitProgressStep(title: "Resolving deltas", weight: 0.1),
        GitProgressStep(title: "Checking out files", weight: 0.2),
    ]

    public var core: GitProgressParser

    public init() {
        self.core = GitProgressParser(steps: Self.steps)
    }

    public var title: String { "Cloning…" }

    public var initialProgress: AppProgress {
        .clone(ProgressPayload(value: 0, title: title))
    }

    /// Parse one stderr line. Returns nil for lines the UI should ignore.
    public mutating func parse(line: String) -> AppProgress? {
        switch core.parse(line: line) {
        case .progress(let percent, let info):
            return .clone(ProgressPayload(value: percent, title: title, description: info.text))
        case .context(let text, let percent):
            guard text.hasPrefix("remote: Counting objects") else { return nil }
            return .clone(ProgressPayload(value: percent, title: title, description: text))
        }
    }
}
