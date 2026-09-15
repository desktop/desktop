import Foundation

// MARK: - DiffRowModel
// Pure row model for the text diff viewer. Port of
// `electron/app/src/ui/diff/diff-helpers.tsx` (DiffRowType, row builders,
// intra-line tokens), `diff-explorer.ts` (interactive ranges) and
// `changed-range.ts` (relativeChanges). No git, no SwiftUI — unit-testable.

/// Which column of a side-by-side row a line belongs to.
public enum DiffColumn: String, Sendable, Equatable {
    case before
    case after
}

/// Row kinds a diff visualization can have. `.modified` pairs a deleted
/// line with an added line (positional pairing, like the original).
public enum DiffRowType: String, Sendable, Equatable {
    case context
    case hunk
    case added
    case deleted
    case modified
}

/// What kind of changed lines an interactive range contains.
/// Port of `DiffRangeType` in `diff-explorer.ts`.
public enum DiffRangeType: Sendable, Equatable {
    case additions
    case deletions
    case mixed
}

/// An interactive range of diff lines, mapped back to original-diff line
/// numbers (so expanded lines, whose `originalLineNumber` is nil, abort).
public struct DiffRange: Sendable, Equatable {
    public var from: Int
    public var to: Int
    public var type: DiffRangeType?

    public init(from: Int, to: Int, type: DiffRangeType?) {
        self.from = from
        self.to = to
        self.type = type
    }

    public var lineCount: Int { to - from + 1 }
}

/// One side of a changed row.
public struct DiffRowData: Sendable, Equatable {
    public var content: String
    public var lineNumber: Int
    /// Line number in the original (unexpanded) diff; nil for expansion lines.
    public var diffLineNumber: Int?
    public var noNewLineIndicator: Bool
    public var isSelected: Bool
    /// Changed character range within `content` for intra-line highlight.
    public var changedRange: Range<Int>?

    public init(
        content: String,
        lineNumber: Int,
        diffLineNumber: Int?,
        noNewLineIndicator: Bool = false,
        isSelected: Bool = false,
        changedRange: Range<Int>? = nil
    ) {
        self.content = content
        self.lineNumber = lineNumber
        self.diffLineNumber = diffLineNumber
        self.noNewLineIndicator = noNewLineIndicator
        self.isSelected = isSelected
        self.changedRange = changedRange
    }
}

public enum DiffRow: Sendable, Equatable {
    case context(content: String, beforeLineNumber: Int, afterLineNumber: Int)
    case hunk(content: String, expansionType: DiffHunkExpansionType, hunkIndex: Int)
    case added(data: DiffRowData, hunkStartLine: Int)
    case deleted(data: DiffRowData, hunkStartLine: Int)
    case modified(before: DiffRowData, after: DiffRowData, hunkStartLine: Int)

    public var type: DiffRowType {
        switch self {
        case .context: return .context
        case .hunk: return .hunk
        case .added: return .added
        case .deleted: return .deleted
        case .modified: return .modified
        }
    }

    public var isChanged: Bool {
        switch self {
        case .added, .deleted, .modified: return true
        case .context, .hunk: return false
        }
    }

    /// The changed-group key: consecutive added/deleted rows share one.
    public var hunkStartLine: Int? {
        switch self {
        case .added(_, let start): return start
        case .deleted(_, let start): return start
        case .modified(_, _, let start): return start
        case .context, .hunk: return nil
        }
    }
}

// MARK: - Row builder

public enum DiffRowModel {
    /// Longest line for which intra-line change ranges are computed
    /// (matches GitHub.com behavior).
    public static let maxIntraLineDiffStringLength = 1024

    /// Flatten hunks into display rows. Port of `getDiffRows`.
    public static func buildRows(
        hunks: [DiffHunk],
        showSideBySide: Bool,
        enableExpansion: Bool,
        selection: DiffSelection? = nil
    ) -> [DiffRow] {
        var rows: [DiffRow] = []
        for (index, hunk) in hunks.enumerated() {
            rows.append(contentsOf: rowsFromHunk(
                hunkIndex: index, hunk: hunk,
                showSideBySide: showSideBySide,
                enableExpansion: enableExpansion,
                selection: selection))
        }
        return rows
    }

    private static func rowsFromHunk(
        hunkIndex: Int,
        hunk: DiffHunk,
        showSideBySide: Bool,
        enableExpansion: Bool,
        selection: DiffSelection?
    ) -> [DiffRow] {
        var rows: [DiffRow] = []
        // Pending consecutive add/delete lines, flushed on context/hunk/end.
        var pending: [(line: DiffLine, diffLineNumber: Int)] = []
        func flush() {
            if !pending.isEmpty {
                rows.append(contentsOf: modifiedRows(
                    pending, showSideBySide: showSideBySide, selection: selection))
                pending = []
            }
        }
        for (offset, line) in hunk.lines.enumerated() {
            let diffLineNumber = hunk.unifiedDiffStart + offset
            switch line.type {
            case .hunk:
                flush()
                rows.append(.hunk(
                    content: line.text,
                    expansionType: enableExpansion ? hunk.expansionType : .none,
                    hunkIndex: hunkIndex))
            case .context:
                flush()
                rows.append(.context(
                    content: line.content,
                    beforeLineNumber: line.oldLineNumber ?? 0,
                    afterLineNumber: line.newLineNumber ?? 0))
            case .add, .delete:
                pending.append((line, diffLineNumber))
            }
        }
        flush()
        return rows
    }

    private static func modifiedRows(
        _ pending: [(line: DiffLine, diffLineNumber: Int)],
        showSideBySide: Bool,
        selection: DiffSelection?
    ) -> [DiffRow] {
        let hunkStartLine = pending[0].diffLineNumber
        let deletes = pending.filter { $0.line.type == .delete }
        let adds = pending.filter { $0.line.type == .add }
        func data(for entry: (line: DiffLine, diffLineNumber: Int), changedRange: Range<Int>? = nil) -> DiffRowData {
            let useNew = entry.line.type == .add
            return DiffRowData(
                content: entry.line.content,
                lineNumber: (useNew ? entry.line.newLineNumber : entry.line.oldLineNumber) ?? 0,
                diffLineNumber: entry.line.originalLineNumber,
                noNewLineIndicator: entry.line.noTrailingNewLine,
                isSelected: selection?.isSelected(lineIndex: entry.line.originalLineNumber ?? -1) ?? false,
                changedRange: changedRange)
        }
        var rows: [DiffRow] = []
        // Intra-line ranges apply whenever added/deleted counts match
        // (github.com behavior), in both unified and split modes.
        let pairRanges: [IntraLineRanges?] = (adds.count == deletes.count)
            ? zip(deletes, adds).map { intraLineRanges(before: $0.line.content, after: $1.line.content) }
            : []
        // Pair positionally only in split mode.
        if showSideBySide && adds.count == deletes.count {
            for (i, (del, add)) in zip(deletes, adds).enumerated() {
                rows.append(.modified(
                    before: data(for: del, changedRange: pairRanges[i]?.before),
                    after: data(for: add, changedRange: pairRanges[i]?.after),
                    hunkStartLine: hunkStartLine))
            }
        } else {
            for (i, del) in deletes.enumerated() {
                let range = (adds.count == deletes.count) ? pairRanges[i]?.before : nil
                rows.append(.deleted(data: data(for: del, changedRange: range), hunkStartLine: hunkStartLine))
            }
            for (i, add) in adds.enumerated() {
                let range = (adds.count == deletes.count) ? pairRanges[i]?.after : nil
                rows.append(.added(data: data(for: add, changedRange: range), hunkStartLine: hunkStartLine))
            }
        }
        return rows
    }

    // MARK: Intra-line changes (port of `relativeChanges`)

    public struct IntraLineRanges: Sendable, Equatable {
        public var before: Range<Int>?
        public var after: Range<Int>?
    }

    /// Common-prefix/common-suffix change ranges, or nil when either line
    /// is too long. Empty ranges (identical lines) yield nil ranges.
    public static func intraLineRanges(before: String, after: String) -> IntraLineRanges? {
        guard before.count <= maxIntraLineDiffStringLength,
              after.count <= maxIntraLineDiffStringLength
        else { return nil }
        let a = Array(before)
        let b = Array(after)
        var prefix = 0
        while prefix < a.count && prefix < b.count && a[prefix] == b[prefix] {
            prefix += 1
        }
        var suffix = 0
        while suffix < (a.count - prefix) && suffix < (b.count - prefix)
                && a[a.count - 1 - suffix] == b[b.count - 1 - suffix] {
            suffix += 1
        }
        func range(location: Int, length: Int) -> Range<Int>? {
            length > 0 ? location..<(location + length) : nil
        }
        return IntraLineRanges(
            before: range(location: prefix, length: a.count - prefix - suffix),
            after: range(location: prefix, length: b.count - prefix - suffix))
    }

    // MARK: - Interactive ranges (port of `diff-explorer.ts`)

    /// Changed-line group around `index` (current-diff coordinates),
    /// mapped to original-diff line numbers. Nil when `index` is not on an
    /// includeable line or maps to an expansion line.
    public static func findInteractiveOriginalDiffRange(
        hunks: [DiffHunk],
        index: Int
    ) -> DiffRange? {
        guard let current = findInteractiveDiffRange(hunks: hunks, index: index) else {
            return nil
        }
        guard let from = lineInOriginalDiff(hunks: hunks, index: current.from),
              let to = lineInOriginalDiff(hunks: hunks, index: current.to)
        else { return nil }
        return DiffRange(from: from, to: to, type: current.type)
    }

    public static func findInteractiveDiffRange(hunks: [DiffHunk], index: Int) -> DiffRange? {
        guard let hunk = hunks.first(where: { index >= $0.unifiedDiffStart && index <= $0.unifiedDiffEnd }) else {
            return nil
        }
        let relative = index - hunk.unifiedDiffStart
        guard hunk.lines.indices.contains(relative) else { return nil }
        var rangeType = nextRangeType(nil, hunk.lines[relative])
        var beforeIndex: Int? = nil
        if relative > 0 {
            for i in stride(from: relative - 1, through: 0, by: -1) {
                let line = hunk.lines[i]
                if !line.isIncludeableLine {
                    beforeIndex = hunk.unifiedDiffStart + i + 1
                    break
                }
                rangeType = nextRangeType(rangeType, line)
            }
        }
        let from = beforeIndex ?? (hunk.unifiedDiffStart + 1)
        var afterIndex: Int? = nil
        if relative + 1 < hunk.lines.count {
            for i in (relative + 1)..<hunk.lines.count {
                let line = hunk.lines[i]
                if !line.isIncludeableLine {
                    afterIndex = hunk.unifiedDiffStart + i - 1
                    break
                }
                rangeType = nextRangeType(rangeType, line)
            }
        }
        let to = afterIndex ?? hunk.unifiedDiffEnd
        return DiffRange(from: from, to: to, type: rangeType)
    }

    private static func nextRangeType(_ current: DiffRangeType?, _ line: DiffLine) -> DiffRangeType? {
        guard line.type == .add || line.type == .delete else { return current }
        let lineType: DiffRangeType = line.type == .add ? .additions : .deletions
        guard let current else { return lineType }
        if current == .mixed { return current }
        return current == lineType ? current : .mixed
    }

    public static func lineInOriginalDiff(hunks: [DiffHunk], index: Int) -> Int? {
        guard let hunk = hunks.first(where: { index >= $0.unifiedDiffStart && index <= $0.unifiedDiffEnd }) else {
            return nil
        }
        let relative = index - hunk.unifiedDiffStart
        guard hunk.lines.indices.contains(relative) else { return nil }
        return hunk.lines[relative].originalLineNumber
    }

    // MARK: - Labels / metrics

    /// macOS discard menu label, e.g. "Discard Added Line…" / "Discard Modified Lines".
    public static func discardLabel(
        rangeType: DiffRangeType?,
        lineCount: Int,
        askForConfirmation: Bool
    ) -> String {
        let suffix = askForConfirmation ? "…" : ""
        let kind: String
        switch rangeType {
        case .additions: kind = "Added"
        case .deletions: kind = "Removed"
        case .mixed, .none: kind = "Modified"
        }
        let plural = lineCount > 1 ? "s" : ""
        return "Discard \(kind) Line\(plural)\(suffix)"
    }

    /// Gutter width for the largest line number (mirrors
    /// `getLineWidthFromDigitCount`). Minimum 3 digits.
    public static func gutterWidth(forMaxLineNumber maxLineNumber: Int) -> Double {
        let digits = max(String(maxLineNumber).count, 3)
        return Double(digits) * 10 + 5
    }

    /// Whether the row is the first/last of its added/deleted group
    /// (for rounded group corners). Port of
    /// `getFirstAndLastClassesSideBySide`.
    public static func groupEdges(
        rows: [DiffRow], index: Int, kind: DiffRowType
    ) -> (isFirst: Bool, isLast: Bool) {
        guard rows.indices.contains(index),
              rows[index].type == kind || rows[index].type == .modified
        else { return (false, false) }
        func matches(_ row: DiffRow) -> Bool {
            row.type == kind || row.type == .modified
        }
        let isFirst = index == 0 || !matches(rows[index - 1])
        let isLast = index == rows.count - 1 || !matches(rows[index + 1])
        return (isFirst, isLast)
    }
}
