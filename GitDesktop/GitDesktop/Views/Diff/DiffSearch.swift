import Foundation

// MARK: - DiffSearch
// Pure find-in-diff logic. Port of the search half of
// `electron/app/src/ui/diff/side-by-side-diff.tsx` (`calcSearchTokens`,
// `onSearch` result messages). Case-insensitive literal match.

/// One find hit: row index, column, and character offset/length.
public struct DiffSearchHit: Sendable, Equatable {
    public var row: Int
    public var column: DiffColumn
    public var offset: Int
    public var length: Int

    public init(row: Int, column: DiffColumn, offset: Int, length: Int) {
        self.row = row
        self.column = column
        self.offset = offset
        self.length = length
    }
}

public enum DiffSearch {
    /// Collect all literal, case-insensitive hits of `query` in `rows`.
    /// Context rows search the before side (plus the after side in split
    /// mode); added rows search after; deleted rows search before; modified
    /// rows search both. Hunk headers are skipped. Mirrors
    /// `calcSearchTokens`/`enumerateColumnContents`.
    public static func findHits(
        rows: [DiffRow],
        query: String,
        showSideBySide: Bool
    ) -> [DiffSearchHit] {
        guard !query.isEmpty else { return [] }
        let needle = query.lowercased()
        var hits: [DiffSearchHit] = []
        func collect(row: Int, column: DiffColumn, content: String) {
            let haystack = content.lowercased()
            var from = haystack.startIndex
            while from < haystack.endIndex,
                  let range = haystack.range(of: needle, range: from..<haystack.endIndex) {
                let offset = haystack.distance(from: haystack.startIndex, to: range.lowerBound)
                // Map back to the original string's character offset. For
                // ASCII (the common case) this equals the lowered offset;
                // recompute safely via prefix matching.
                let originalOffset = originalOffset(of: content, loweredOffset: offset)
                hits.append(DiffSearchHit(
                    row: row, column: column,
                    offset: originalOffset, length: query.count))
                from = range.upperBound
            }
        }
        for (index, row) in rows.enumerated() {
            switch row {
            case .hunk:
                continue
            case .context(let content, _, _):
                collect(row: index, column: .before, content: content)
                if showSideBySide {
                    collect(row: index, column: .after, content: content)
                }
            case .added(let data, _):
                collect(row: index, column: .after, content: data.content)
            case .deleted(let data, _):
                collect(row: index, column: .before, content: data.content)
            case .modified(let before, let after, _):
                collect(row: index, column: .before, content: before.content)
                collect(row: index, column: .after, content: after.content)
            }
        }
        return hits
    }

    /// Best-effort map of a lowercased-string offset back to the original.
    private static func originalOffset(of content: String, loweredOffset: Int) -> Int {
        var loweredCount = 0
        for (index, char) in content.enumerated() {
            if loweredCount >= loweredOffset { return index }
            loweredCount += String(char).lowercased().count
        }
        return min(loweredOffset, content.count)
    }

    /// Live-region message after (re)starting a search. Mirrors the
    /// original: `Result 1 of N for "q"` / `No results for "q"`.
    public static func startedMessage(query: String, hitCount: Int) -> String {
        hitCount == 0
            ? "No results for \"\(query)\""
            : "Result 1 of \(hitCount) for \"\(query)\""
    }

    /// Live-region message when stepping through hits (wraps around).
    public static func steppedMessage(query: String, selected: Int, hitCount: Int) -> String {
        "Result \(selected + 1) of \(hitCount) for \"\(query)\""
    }
}

/// Mutable find state owned by `TextDiffView`.
struct DiffSearchState: Equatable {
    var isOpen: Bool = false
    var query: String = ""
    /// Committed hits for the last searched query.
    var hits: [DiffSearchHit] = []
    var selected: Int? = nil
    var liveMessage: String = ""

    var selectedHit: DiffSearchHit? {
        guard let selected, hits.indices.contains(selected) else { return nil }
        return hits[selected]
    }

    mutating func commit(query: String, hits: [DiffSearchHit]) {
        self.query = query
        self.hits = hits
        if hits.isEmpty {
            selected = nil
            liveMessage = query.trimmingCharacters(in: .whitespaces).isEmpty
                ? "No results"
                : DiffSearch.startedMessage(query: query, hitCount: 0)
        } else {
            selected = 0
            liveMessage = DiffSearch.startedMessage(query: query, hitCount: hits.count)
        }
    }

    mutating func step(_ direction: StepDirection) {
        guard !hits.isEmpty else { return }
        let current = selected ?? 0
        let next = (current + direction.delta + hits.count) % hits.count
        selected = next
        liveMessage = DiffSearch.steppedMessage(query: query, selected: next, hitCount: hits.count)
    }

    mutating func close() {
        isOpen = false
        query = ""
        hits = []
        selected = nil
        liveMessage = ""
    }

    enum StepDirection {
        case next
        case previous

        var delta: Int {
            switch self {
            case .next: return 1
            case .previous: return -1
            }
        }
    }
}
