import Foundation

// MARK: - CheckoutProgress
// Port of `electron/app/src/lib/progress/checkout.ts`: a single
// `Checking out files` step carrying the full weight.

public struct CheckoutProgressParser: Sendable {
    public static let steps = [
        GitProgressStep(title: "Checking out files", weight: 1),
    ]

    public var target: String
    public var core: GitProgressParser

    public init(target: String) {
        self.target = target
        self.core = GitProgressParser(steps: Self.steps)
    }

    public var title: String { "Checking out \(target)…" }

    public var initialProgress: AppProgress {
        .checkout(target: target, payload: ProgressPayload(value: 0, title: title))
    }

    /// Parse one stderr line. Never drops lines.
    public mutating func parse(line: String) -> AppProgress {
        switch core.parse(line: line) {
        case .progress(let percent, let info):
            return .checkout(
                target: target,
                payload: ProgressPayload(value: percent, title: title, description: info.text))
        case .context(let text, let percent):
            return .checkout(
                target: target,
                payload: ProgressPayload(value: percent, title: title, description: text))
        }
    }
}
