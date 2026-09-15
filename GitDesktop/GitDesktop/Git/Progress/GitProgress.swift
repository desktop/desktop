import Foundation

// MARK: - GitProgress
// Pure-function port of `electron/app/src/lib/progress/git.ts`.
// `GitProgressParser` turns git's `--progress` stderr lines into weighted
// 0...1 estimates. It is a value type with a mutating `parse(line:)` so
// scripted output can drive it in unit tests without git installed.
// Callers map the resulting `GitProgressEvent` to `AppProgress` (see
// `FetchProgress.swift`, `PullProgress.swift`, …) which the toolbar renders.

/// One weighted step of a git operation (port of `IProgressStep`).
/// `weight` is relative; the parser normalizes all weights to sum to 1.
public struct GitProgressStep: Sendable, Equatable {
    public var title: String
    public var weight: Double

    public init(title: String, weight: Double) {
        self.title = title
        self.weight = weight
    }
}

/// Structured git progress line (port of `IGitProgressInfo`).
public struct GitProgressInfo: Sendable, Equatable {
    public var title: String
    /// Processed units (mirrors git's `value` field).
    public var value: Double
    /// Total units, when git reports one (mirrors git's `total` field).
    public var total: Double?
    /// Rounded 0...100 percent from git itself (not the weighted estimate).
    public var percent: Int?
    /// Trailing `, done` marker.
    public var done: Bool
    /// Untouched raw line for user-facing descriptions.
    public var text: String

    public init(
        title: String,
        value: Double,
        total: Double? = nil,
        percent: Int? = nil,
        done: Bool = false,
        text: String
    ) {
        self.title = title
        self.value = value
        self.total = total
        self.percent = percent
        self.done = done
        self.text = text
    }
}

/// Parser output (ports `IGitProgress` / `IGitOutput`).
public enum GitProgressEvent: Sendable, Equatable {
    /// A line whose title matches a registered step, with the weighted 0...1 estimate.
    case progress(percent: Double, info: GitProgressInfo)
    /// Anything else (hook output, ref updates, …) with the last known estimate.
    case context(text: String, percent: Double)
}

/// Strip ANSI/VT control sequences (mirrors `stripVTControlCharacters`).
public func stripANSIControlCharacters(_ line: String) -> String {
    guard line.contains("\u{1B}") else { return line }
    guard let regex = try? NSRegularExpression(pattern: "\u{1B}\\[[0-9;?]*[ -/]*[@-~]") else {
        return line
    }
    let range = NSRange(line.startIndex..., in: line)
    return regex.stringByReplacingMatches(in: line, range: range, withTemplate: "")
}

/// Parse one git progress line (port of `parse()` in `git.ts`).
///
/// Examples:
/// - `remote: Counting objects: 123` → value-only, no percent/total
/// - `Receiving objects:  99% (166741/167587), 272.10 MiB | 2.39 MiB/s`
/// - `Checking out files:  100% (728/728), done` → `done == true`
///
/// Returns nil when the line is not a git progress line.
public func parseGitProgressLine(_ line: String) -> GitProgressInfo? {
    // Title is everything up to the last `: ` (see git's `progress.c`).
    guard let separator = line.range(of: ": ", options: .backwards),
          separator.lowerBound != line.startIndex
    else { return nil }
    let title = String(line[..<separator.lowerBound])
    let progressText = String(line[separator.upperBound...]).trimmingCharacters(in: .whitespaces)
    guard !progressText.isEmpty else { return nil }

    let parts = progressText.components(separatedBy: ", ")
    guard let first = parts.first, !first.isEmpty else { return nil }

    let value: Double
    let total: Double?
    let percent: Int?
    if isValueOnlyProgress(first) {
        guard let parsed = Double(first) else { return nil }
        value = parsed
        total = nil
        percent = nil
    } else {
        // `NN% (value/total)` — parsed manually to stay regex- and unwrap-free.
        guard let parsed = parsePercentProgress(first) else { return nil }
        percent = parsed.percent
        value = parsed.value
        total = parsed.total
    }

    var done = false
    for part in parts.dropFirst() where part == "done." {
        done = true
        break
    }
    return GitProgressInfo(
        title: title, value: value, total: total, percent: percent,
        done: done, text: line)
}

/// `/^\d+$/`: ASCII digits only (mirrors `valueOnlyRe`).
private func isValueOnlyProgress(_ text: String) -> Bool {
    !text.isEmpty && text.allSatisfy { $0.isASCII && $0.isNumber }
}

/// `/^(\d{1,3})% \((\d+)\/(\d+)\)$/` without regex.
private func parsePercentProgress(_ text: String) -> (percent: Int, value: Double, total: Double)? {
    guard let pctEnd = text.firstIndex(of: "%") else { return nil }
    let pctText = String(text[..<pctEnd])
    guard pctText.count >= 1 && pctText.count <= 3,
          pctText.allSatisfy({ $0.isASCII && $0.isNumber }),
          let pct = Int(pctText)
    else { return nil }
    let rest = String(text[text.index(after: pctEnd)...]).trimmingCharacters(in: .whitespaces)
    guard rest.hasPrefix("("), rest.hasSuffix(")") else { return nil }
    let inner = String(rest.dropFirst().dropLast())
    let pair = inner.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false)
    guard pair.count == 2,
          let value = Double(pair[0]), let total = Double(pair[1])
    else { return nil }
    return (pct, value, total)
}

/// Weighted multi-step parser (port of `GitProgressParser`).
///
/// Steps must occur in order; once a later step is seen, earlier steps count
/// as complete. A parser instance handles a single stderr stream.
public struct GitProgressParser: Sendable {
    /// Normalized (sum == 1) step weights. Empty when constructed with no
    /// steps or an all-zero total — every line then parses as `.context`.
    public private(set) var steps: [GitProgressStep]
    public private(set) var stepIndex: Int = 0
    public private(set) var lastPercent: Double = 0

    public init(steps: [GitProgressStep]) {
        let total = steps.reduce(0) { $0 + $1.weight }
        guard total > 0 else {
            self.steps = []
            return
        }
        self.steps = steps.map { GitProgressStep(title: $0.title, weight: $0.weight / total) }
    }

    public mutating func parse(line: String) -> GitProgressEvent {
        let text = stripANSIControlCharacters(line)
        guard let progress = parseGitProgressLine(text) else {
            return .context(text: text, percent: lastPercent)
        }
        var percent = 0.0
        for i in steps.indices {
            let step = steps[i]
            if i >= stepIndex && progress.title == step.title {
                if let total = progress.total, total > 0 {
                    percent += step.weight * (progress.value / total)
                }
                stepIndex = i
                lastPercent = percent
                return .progress(percent: percent, info: progress)
            } else {
                percent += step.weight
            }
        }
        return .context(text: text, percent: lastPercent)
    }
}

// MARK: - AppProgress description access

public extension AppProgress {
    /// User-facing detail line for toolbar progress buttons.
    /// `ProgressPayload.description` is not surfaced on the union, so parsers
    /// stash the last raw git line here via this accessor's backing store.
    /// In practice callers construct the payload with `description` set and
    /// read it back through `progressDescription(_:)`.
    var progressDescription: String? {
        switch self {
        case .generic(let p): return p.description
        case .checkout(_, let p): return p.description
        case .fetch(_, let p): return p.description
        case .pull(_, let p): return p.description
        case .push(_, _, let p): return p.description
        case .clone(let p): return p.description
        case .revert(let p): return p.description
        case .multiCommitOperation(_, _, _, let p): return p.description
        }
    }
}
