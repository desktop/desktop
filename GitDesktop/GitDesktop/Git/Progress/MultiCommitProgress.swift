import Foundation

// MARK: - MultiCommitProgress
// Ports the rebase/cherry-pick progress regexes owned by Task 7's spec:
// - `GitRebaseParser` in `electron/app/src/lib/git/rebase.ts`:
//   `/^Rebasing \((\d+)\/(\d+)\)$/` over git stderr.
// - `GitCherryPickParser` in `electron/app/src/lib/git/cherry-pick.ts`:
//   `/^\[(.*\s.*)\]/` over git stdout (first line per picked commit:
//   `[branch sha] summary`).
// Both emit `AppProgress.multiCommitOperation` values. Task 6 owns the
// rebase/cherry-pick operations themselves; these parsers are shared
// progress infrastructure, so they live here and are tested with scripted
// output (see `ParserTests`).

/// Clamp to 0...1 at two decimal places (port of `formatRebaseValue`).
public func formatRebaseValue(_ value: Double) -> Double {
    roundToDecimals(clampProgress(value), 2)
}

/// Stateful rebase progress parser (port of `GitRebaseParser`).
public struct RebaseProgressParser: Sendable {
    private static let pattern: NSRegularExpression? = try? NSRegularExpression(
        pattern: #"^Rebasing \((\d+)\/(\d+)\)$"#)

    public var commits: [CommitOneLine]

    public init(commits: [CommitOneLine]) {
        self.commits = commits
    }

    /// Parse one stderr line. Returns nil for non-progress lines (conflict
    /// chatter, etc.), mirroring the reference.
    public func parse(line: String) -> AppProgress? {
        guard let regex = Self.pattern,
              let match = regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)),
              match.numberOfRanges == 3,
              let current = intGroup(match, 1, in: line),
              let total = intGroup(match, 2, in: line),
              total > 0
        else { return nil }

        let summary = commits.indices.contains(current - 1) ? commits[current - 1].summary : ""
        return .multiCommitOperation(
            currentCommitSummary: summary,
            position: current,
            totalCommitCount: total,
            payload: ProgressPayload(
                value: formatRebaseValue(Double(current) / Double(total)),
                description: line))
    }

    private func intGroup(_ match: NSTextCheckingResult, _ index: Int, in line: String) -> Int? {
        let range = match.range(at: index)
        guard range.location != NSNotFound, let swiftRange = Range(range, in: line) else { return nil }
        return Int(line[swiftRange])
    }
}

/// Stateful cherry-pick progress parser (port of `GitCherryPickParser`).
public struct CherryPickProgressParser: Sendable {
    private static let pattern: NSRegularExpression? = try? NSRegularExpression(
        pattern: #"^\[(.*\s.*)\]"#)

    public var commits: [CommitOneLine]
    public var count: Int

    public init(commits: [CommitOneLine], count: Int = 0) {
        self.commits = commits
        self.count = count
    }

    /// Parse one stdout line. Returns nil for lines that do not open a newly
    /// picked commit (timestamps, file stats, conflicts, …).
    public mutating func parse(line: String) -> AppProgress? {
        guard let regex = Self.pattern,
              regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)) != nil,
              !commits.isEmpty
        else { return nil }
        count += 1
        let summary = commits.indices.contains(count - 1) ? commits[count - 1].summary : ""
        return .multiCommitOperation(
            currentCommitSummary: summary,
            position: count,
            totalCommitCount: commits.count,
            payload: ProgressPayload(
                value: roundToDecimals(Double(count) / Double(commits.count), 2),
                description: line))
    }
}
