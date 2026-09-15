import Foundation

// MARK: - MultiCommitProgress
// Pure parsers for multi-commit-operation progress output.
// Ports `GitRebaseParser` + `parseRebaseResult` (`lib/git/rebase.ts`),
// `GitCherryPickParser` + `parseCherryPickResult` (`lib/git/cherry-pick.ts`)
// and the sequencer-file readers (`getCherryPickSnapshot`,
// `getRebaseSnapshot`). All functions are pure so they are unit-testable
// without git installed; `MultiCommitService.swift` wires them to live output.

// MARK: Rebase progress

/// Matches git's per-commit rebase status line on stderr, e.g.
/// `Rebasing (3/12)`. Port of `rebasingRe` in `lib/git/rebase.ts`.
private let rebasingPattern = #"^Rebasing \((\d+)/(\d+)\)$"#

/// Parses one stderr line of `git rebase` into progress, or nil when the line
/// is unrelated output (conflict hunks, hook output, …).
/// `commits` is the to-be-rebased list in display order; the summary falls
/// back to `""` when the position is out of range (mirrors `?.summary ?? ''`).
public func parseRebaseProgressLine(_ line: String, commits: [CommitOneLine]) -> MultiCommitProgress? {
    guard let regex = try? NSRegularExpression(pattern: rebasingPattern),
          let match = regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)),
          match.numberOfRanges == 3,
          let firstRange = Range(match.range(at: 1), in: line),
          let totalRange = Range(match.range(at: 2), in: line),
          let position = Int(line[firstRange]),
          let totalCount = Int(line[totalRange]),
          totalCount > 0
    else { return nil }
    let summary = (position >= 1 && position <= commits.count) ? commits[position - 1].summary : ""
    return MultiCommitProgress(
        value: formatRebaseValue(Double(position) / Double(totalCount)),
        position: position,
        totalCommitCount: totalCount,
        currentCommitSummary: summary)
}

// MARK: Cherry-pick progress

/// Matches the first line git prints per successfully picked commit:
/// `[branchName commitSha] commitSummary`. Port of `cherryPickRe`.
private let cherryPickPattern = #"^\[(.*\s.*)\]"#

/// Stateful parser for `git cherry-pick` stdout. Each matching line advances
/// the count; non-matching lines (timestamps, diffstats, conflicts) are
/// skipped. Port of `GitCherryPickParser`.
public struct CherryPickProgressParser: Sendable {
    public var commits: [CommitOneLine]
    public private(set) var count: Int

    public init(commits: [CommitOneLine], count: Int = 0) {
        self.commits = commits
        self.count = count
    }

    public mutating func parse(line: String) -> MultiCommitProgress? {
        guard let regex = try? NSRegularExpression(pattern: cherryPickPattern),
              regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)) != nil
        else { return nil }
        count += 1
        let total = max(commits.count, 1)
        return MultiCommitProgress(
            value: formatRebaseValue(Double(count) / Double(total)),
            position: count,
            totalCommitCount: commits.count,
            currentCommitSummary: commits.indices.contains(count - 1) ? commits[count - 1].summary : "")
    }
}

// MARK: Result classification

/// Matches git's "already up to date" message. Port of the
/// `parseRebaseResult` stdout check in `lib/git/rebase.ts`.
public func isRebaseUpToDateMessage(_ stdout: String) -> Bool {
    let pattern = #"^Current branch [^ ]+ is up to date\.$"#
    let trimmed = stdout.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return false }
    return regex.firstMatch(in: trimmed, range: NSRange(trimmed.startIndex..., in: trimmed)) != nil
}

/// Classifies a finished `git rebase`. Port of `parseRebaseResult`.
/// Returns nil for unexpected failures so the caller can surface the raw
/// `GitError` (the original throws `Unhandled result found`).
public func parseRebaseResult(exitCode: Int32, stdout: String, error: GitErrorKind?) -> RebaseResult? {
    if exitCode == 0 {
        return isRebaseUpToDateMessage(stdout) ? .alreadyUpToDate : .completedWithoutError
    }
    switch error {
    case .rebaseConflicts: return .conflictsEncountered
    case .unresolvedConflicts: return .outstandingFilesNotStaged
    default: return nil
    }
}

/// Classifies a finished `git cherry-pick`. Port of `parseCherryPickResult`.
public func parseCherryPickResult(exitCode: Int32, error: GitErrorKind?) -> CherryPickResult? {
    if exitCode == 0 { return .completedWithoutError }
    switch error {
    case .mergeConflicts, .conflictModifyDeletedInBranch: return .conflictsEncountered
    case .unresolvedConflicts: return .outstandingFilesNotStaged
    default: return nil
    }
}

// MARK: Rebase snapshot (`.git/rebase-merge/*`)

/// Pure core of `getRebaseSnapshot`: folds `msgnum`/`end`/`orig-head`/`onto`
/// file contents into progress. Returns nil when the files are missing or
/// unparseable (rebase finished/aborted mid-read).
public func rebaseSnapshotProgress(
    msgnumText: String?,
    endText: String?,
    origHead: String?,
    onto: String?
) -> (position: Int, total: Int, value: Double)? {
    guard let msgnumText, let endText, let origHead, let onto,
          let position = Int(msgnumText.trimmingCharacters(in: .whitespacesAndNewlines)),
          let total = Int(endText.trimmingCharacters(in: .whitespacesAndNewlines)),
          position > 0, total > 0,
          !origHead.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
          !onto.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else { return nil }
    return (position, total, formatRebaseValue(Double(position) / Double(total)))
}

// MARK: Cherry-pick snapshot (`.git/sequencer/*`)

/// Parses one line of `.git/sequencer/todo` (`pick <sha> <summary>`).
/// Port of the `remainingPicks` loop in `getCherryPickSnapshot`.
public func parseSequencerTodoLine(_ line: String) -> CommitOneLine? {
    let stripped = line.hasPrefix("pick ") ? String(line.dropFirst("pick ".count)) : line
    guard let space = stripped.firstIndex(of: " ") else { return nil }
    let sha = String(stripped[..<space])
    let summary = String(stripped[stripped.index(after: space)...])
    guard !sha.isEmpty, !summary.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
    return CommitOneLine(sha: sha, summary: summary)
}

/// Parses the whole `.git/sequencer/todo` file. Returns nil when empty or when
/// no line parses (corrupt sequencer files).
public func parseSequencerTodo(_ text: String) -> [CommitOneLine]? {
    let commits = text
        .split(separator: "\n", omittingEmptySubsequences: false)
        .map(String.init)
        .compactMap(parseSequencerTodoLine)
    return commits.isEmpty ? nil : commits
}

/// Pure core of `getCherryPickSnapshot`: folds already-picked count +
/// remaining todo into progress. `total = picked + remaining`,
/// `position = picked + 1`.
public func cherryPickSnapshotProgress(
    cherryPickedCount: Int,
    remainingCommits: [CommitOneLine]
) -> MultiCommitProgress? {
    guard !remainingCommits.isEmpty else { return nil }
    let total = cherryPickedCount + remainingCommits.count
    let position = cherryPickedCount + 1
    return MultiCommitProgress(
        value: formatRebaseValue(Double(position) / Double(total)),
        position: position,
        totalCommitCount: total,
        currentCommitSummary: remainingCommits[0].summary)
}
