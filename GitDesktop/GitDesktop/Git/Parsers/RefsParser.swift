import Foundation

// MARK: - RefsParser
// Pure-function port of `electron/app/src/lib/git/for-each-ref.ts` and
// `lib/git/refs.ts`: `for-each-ref --format` output parsing, local-ref
// formatting, and branch construction.

/// One parsed `for-each-ref` row.
public struct RefRow: Sendable, Equatable {
    public var fullName: String
    public var shortName: String
    public var upstreamShortName: String
    public var sha: String
    public var symRef: String

    public init(fullName: String, shortName: String, upstreamShortName: String, sha: String, symRef: String) {
        self.fullName = fullName
        self.shortName = shortName
        self.upstreamShortName = upstreamShortName
        self.sha = sha
        self.symRef = symRef
    }
}

public enum RefsParser {
    /// Parse `for-each-ref --format=%00<fields>%00`-style output.
    /// Mirrors `createForEachRefParser` in `git-delimiter-parser.ts`:
    /// records are NUL-separated with `\n` sentinels between entries.
    public static func parseForEachRef(_ output: String, fieldCount: Int) -> [[String]] {
        let records = output.components(separatedBy: "\0")
        var entries: [[String]] = []
        var current: [String] = []
        var index = 1
        while index < records.count - 1 {
            if index % (fieldCount + 1) == 0 {
                // Newline sentinel between entries.
                if !current.isEmpty {
                    entries.append(current)
                    current = []
                }
            } else {
                current.append(records[index])
                if current.count == fieldCount {
                    entries.append(current)
                    current = []
                }
            }
            index += 1
        }
        if !current.isEmpty { entries.append(current) }
        return entries
    }

    /// Build `Branch` values from parsed ref rows.
    /// Skips symbolic refs (e.g. `origin/HEAD`), mirroring `getBranches`.
    public static func branches(from rows: [RefRow]) -> [Branch] {
        rows.compactMap { row in
            guard row.symRef.isEmpty else { return nil }
            let type: BranchType = row.fullName.hasPrefix("refs/heads") ? .local : .remote
            // Remote `shortName` values arrive as `origin/main`; local as `main`.
            return Branch(
                name: row.shortName,
                upstream: row.upstreamShortName.isEmpty ? nil : row.upstreamShortName,
                tip: BranchTip(sha: row.sha),
                type: type,
                ref: row.fullName)
        }
    }

    /// Format a short branch name as a local ref. Port of `formatAsLocalRef`.
    public static func formatAsLocalRef(_ name: String) -> String {
        if name.hasPrefix("refs/heads/") { return name }
        if name.hasPrefix("heads/") { return "refs/\(name)" }
        return "refs/heads/\(name)"
    }

    /// Parse `git symbolic-ref -q <ref>` output (nil for exit 1/128).
    public static func parseSymbolicRef(_ stdout: String) -> String? {
        let trimmed = stdout.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// Parse `git worktree list --porcelain -z` output.
    public static func parseWorktrees(_ output: String) -> [WorktreeEntry] {
        // Records are NUL-separated; blank line separates worktrees.
        // Fields: `worktree <path>`, `HEAD <sha>`, `branch <ref>`|detached,
        // `bare`, `locked [reason]`, `prunable <reason>`, `main` (first only).
        var entries: [WorktreeEntry] = []
        let chunks = output.components(separatedBy: "\n\0")
        for (position, chunk) in chunks.enumerated() {
            let lines = chunk.components(separatedBy: "\0").map {
                $0.trimmingCharacters(in: .whitespacesAndNewlines)
            }.filter { !$0.isEmpty }
            guard !lines.isEmpty else { continue }
            var path: String? = nil
            var head: String? = nil
            var branch: String? = nil
            var isBare = false
            var isLocked = false
            var isPrunable = false
            for line in lines {
                if line.hasPrefix("worktree ") { path = String(line.dropFirst("worktree ".count)) }
                else if line.hasPrefix("HEAD ") { head = String(line.dropFirst("HEAD ".count)) }
                else if line.hasPrefix("branch ") { branch = String(line.dropFirst("branch ".count)) }
                else if line == "bare" { isBare = true }
                else if line.hasPrefix("locked") { isLocked = true }
                else if line.hasPrefix("prunable") { isPrunable = true }
            }
            guard let path, let head, !isBare else { continue }
            entries.append(WorktreeEntry(
                path: path,
                head: head,
                branch: branch,
                type: position == 0 ? .main : .linked,
                isLocked: isLocked,
                isPrunable: isPrunable))
        }
        return entries
    }
}
