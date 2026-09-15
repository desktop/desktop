import Foundation

// MARK: - RevertProgress
// Port of `electron/app/src/lib/progress/revert.ts`.
//
// The reference declares a degenerate single step `{ title: '', weight: 0 }`
// whose total weight is 0, so no line ever matches and every line surfaces
// as context with a 0 estimate (the toolbar shows an indeterminate-style
// "Reverting…" button). Swift's parser refuses all-zero weights (they would
// normalize to NaN), so this type keeps the reference's step table for
// documentation parity but maps every line to a 0-valued revert event
// directly — observably identical to the reference behavior.

public struct RevertProgressParser: Sendable {
    /// Reference step table, kept for parity (never matches; see note above).
    public static let steps = [
        GitProgressStep(title: "", weight: 0),
    ]

    public init() {}

    public var title: String { "Reverting…" }

    public var initialProgress: AppProgress {
        .revert(ProgressPayload(value: 0, title: title))
    }

    /// Parse one stderr line. Always returns a 0-valued event carrying the
    /// raw line as the description (mirrors the all-context behavior).
    public func parse(line: String) -> AppProgress {
        let text = stripANSIControlCharacters(line)
        return .revert(ProgressPayload(value: 0, title: title, description: text))
    }
}
