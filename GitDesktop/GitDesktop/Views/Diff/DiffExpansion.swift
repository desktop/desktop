import Foundation

// MARK: - DiffExpansion
// Pure hunk-expansion logic. Port of
// `electron/app/src/ui/diff/text-diff-expansion.ts`. Operates on
// `TextDiffData` so both `.text` and `.largeText` payloads expand the same
// way. No git, no SwiftUI — unit-testable.

public enum DiffExpansionKind: Sendable {
    case up
    case down
}

public enum DiffExpansion {
    /// New context lines added per expansion step.
    public static let defaultStep = 20

    /// Assign per-hunk expansion types, mirroring the reference parser
    /// (`diff-parser.ts` calls `getHunkHeaderExpansionType` while parsing).
    /// Task 1's `DiffParser` leaves `.none`; apply at the view boundary.
    public static func withExpansionTypes(_ diff: TextDiffData) -> TextDiffData {
        let hunks = diff.hunks.enumerated().map { (index, hunk) in
            DiffHunk(
                header: hunk.header,
                lines: hunk.lines,
                unifiedDiffStart: hunk.unifiedDiffStart,
                unifiedDiffEnd: hunk.unifiedDiffEnd,
                expansionType: expansionType(
                    hunkIndex: index,
                    header: hunk.header,
                    previousHunk: index > 0 ? diff.hunks[index - 1] : nil))
        }
        return TextDiffData(
            text: diff.text, hunks: hunks,
            lineEndingsChange: diff.lineEndingsChange,
            maxLineNumber: diff.maxLineNumber,
            hasHiddenBidiChars: diff.hasHiddenBidiChars)
    }

    /// Rebuild diff text from hunk lines (context lines added by expansion
    /// carry a leading space, matching git diff output).
    public static func textFromHunks(_ hunks: [DiffHunk]) -> String {
        hunks.flatMap { $0.lines }.map { $0.text }.joined(separator: "\n")
    }

    /// Merge two consecutive hunks into one. Port of `mergeDiffHunks`.
    public static func mergeHunks(_ first: DiffHunk, _ second: DiffHunk) -> DiffHunk {
        let header = DiffHunkHeader(
            oldStartLine: first.header.oldStartLine,
            oldLineCount: first.header.oldLineCount + second.header.oldLineCount,
            newStartLine: first.header.newStartLine,
            newLineCount: first.header.newLineCount + second.header.newLineCount)
        let headerLine = DiffLine(
            text: header.toDiffLineRepresentation(), type: .hunk,
            originalLineNumber: nil, oldLineNumber: nil, newLineNumber: nil)
        let lines = [headerLine]
            + first.lines.dropFirst()
            + second.lines.dropFirst()
        return DiffHunk(
            header: header,
            lines: Array(lines),
            unifiedDiffStart: first.unifiedDiffStart,
            unifiedDiffEnd: first.unifiedDiffStart + lines.count - 1,
            expansionType: first.expansionType)
    }

    /// Which way a hunk header can expand. Port of
    /// `getHunkHeaderExpansionType`.
    public static func expansionType(
        hunkIndex: Int,
        header: DiffHunkHeader,
        previousHunk: DiffHunk?
    ) -> DiffHunkExpansionType {
        if hunkIndex == 0 {
            return (header.oldStartLine > 1 && header.newStartLine > 1) ? .up : .none
        }
        let distance: Int = {
            guard let previousHunk else { return Int.max }
            return header.oldStartLine
                - previousHunk.header.oldStartLine
                - previousHunk.header.oldLineCount
        }()
        return distance <= defaultStep ? .short : .both
    }

    /// Expand one hunk up or down using the new-file content lines.
    /// Returns nil when the hunk is not in the diff or nothing can be added.
    /// Port of `expandTextDiffHunk`.
    public static func expandHunk(
        _ diff: TextDiffData,
        hunkIndex: Int,
        kind: DiffExpansionKind,
        newContentLines: [String],
        step: Int = defaultStep
    ) -> TextDiffData? {
        guard diff.hunks.indices.contains(hunkIndex) else { return nil }
        let hunk = diff.hunks[hunkIndex]
        let expandingUp = kind == .up
        let adjacentIndex: Int? = {
            if expandingUp && hunkIndex > 0 { return hunkIndex - 1 }
            if !expandingUp && hunkIndex < diff.hunks.count - 1 { return hunkIndex + 1 }
            return nil
        }()
        let adjacent = adjacentIndex.flatMap { diff.hunks.indices.contains($0) ? diff.hunks[$0] : nil }
        let isAdjacentDummy = adjacent != nil
            && !expandingUp
            && adjacent?.lines.count == 1
            && adjacent?.lines.first?.type == .hunk
            && adjacentIndex == diff.hunks.count - 1

        let newStart = hunk.header.newStartLine
        let oldStart = hunk.header.oldStartLine
        var from: Int
        var to: Int
        if expandingUp {
            from = newStart - step
            to = newStart
        } else {
            from = newStart + hunk.header.newLineCount
            to = newStart + hunk.header.newLineCount + step
        }

        var mergeWithAdjacent = false
        if let adjacent, let adjacentIndex {
            if expandingUp {
                let limit = adjacent.header.newStartLine + adjacent.header.newLineCount
                from = max(from, limit)
                mergeWithAdjacent = from == limit
            } else if !isAdjacentDummy {
                let limit = adjacent.header.newStartLine
                to = min(to, limit)
                mergeWithAdjacent = to == limit
            }
            _ = adjacentIndex
        }

        // Clamp to valid content bounds (JS `slice` clamps implicitly).
        let lower = min(max(from - 1, 0), newContentLines.count)
        let upper = min(max(to - 1, lower), newContentLines.count)
        let newLines = Array(newContentLines[lower..<upper])
        guard !newLines.isEmpty else { return nil }
        let count = newLines.count

        let addedLines = newLines.enumerated().map { (offset, content) -> DiffLine in
            let newNumber = expandingUp
                ? newStart - (count - offset)
                : newStart + hunk.header.newLineCount + offset
            let oldNumber = expandingUp
                ? oldStart - (count - offset)
                : oldStart + hunk.header.oldLineCount + offset
            return DiffLine(
                text: " " + content, type: .context,
                originalLineNumber: nil,
                oldLineNumber: oldNumber, newLineNumber: newNumber)
        }

        let hasBidi = diff.hasHiddenBidiChars
            || newLines.contains(where: { DiffParser.containsHiddenBidiChars($0) })

        let newHeader = DiffHunkHeader(
            oldStartLine: expandingUp ? hunk.header.oldStartLine - count : hunk.header.oldStartLine,
            oldLineCount: hunk.header.oldLineCount + count,
            newStartLine: expandingUp ? hunk.header.newStartLine - count : hunk.header.newStartLine,
            newLineCount: hunk.header.newLineCount + count)
        let firstLine = hunk.lines.first
        let newHeaderLine = DiffLine(
            text: newHeader.toDiffLineRepresentation(), type: .hunk,
            originalLineNumber: nil,
            oldLineNumber: firstLine?.oldLineNumber,
            newLineNumber: firstLine?.newLineNumber,
            noTrailingNewLine: firstLine?.noTrailingNewLine ?? false)
        let body = Array(hunk.lines.dropFirst())
        let updatedLines = expandingUp
            ? [newHeaderLine] + addedLines + body
            : [newHeaderLine] + body + addedLines
        let addedCount = updatedLines.count - hunk.lines.count

        let previous = hunkIndex == 0 ? nil : diff.hunks[hunkIndex - 1]
        var updated = DiffHunk(
            header: newHeader,
            lines: updatedLines,
            unifiedDiffStart: hunk.unifiedDiffStart,
            unifiedDiffEnd: hunk.unifiedDiffEnd + addedCount,
            expansionType: expansionType(
                hunkIndex: hunkIndex, header: newHeader, previousHunk: previous))

        var removedHunkCount = 0
        var endIndex: Int
        var startIndex: Int
        if mergeWithAdjacent, let adjacent, let adjacentIndex {
            if expandingUp {
                updated = mergeHunks(adjacent, updated)
                endIndex = hunkIndex - 1
                startIndex = hunkIndex + 1
            } else {
                updated = mergeHunks(updated, adjacent)
                endIndex = hunkIndex
                startIndex = hunkIndex + 2
            }
            removedHunkCount = 1 // one header line disappears in the merge
            _ = adjacentIndex
        } else {
            endIndex = hunkIndex
            startIndex = hunkIndex + 1
        }
        let shift = addedCount - removedHunkCount

        let previousHunks = Array(diff.hunks[..<endIndex])
        // When the expanded hunk reaches the end of the file, hunks after it
        // (including the bottom dummy hunk) are dropped.
        let lastNewLine = newHeader.newStartLine + newHeader.newLineCount - 1
        var followingHunks: [DiffHunk] = []
        if lastNewLine < newContentLines.count {
            followingHunks = diff.hunks[startIndex...].enumerated().map { (offset, following) in
                let absolute = startIndex + offset
                let isLastDummy = absolute == diff.hunks.count - 1
                    && following.lines.count == 1
                    && following.lines.first?.type == .hunk
                let recompute = offset == 0 && !isLastDummy
                return DiffHunk(
                    header: following.header,
                    lines: following.lines,
                    unifiedDiffStart: following.unifiedDiffStart + shift,
                    unifiedDiffEnd: following.unifiedDiffEnd + shift,
                    expansionType: recompute
                        ? expansionType(hunkIndex: startIndex, header: following.header, previousHunk: updated)
                        : following.expansionType)
            }
        }

        let hunks = previousHunks + [updated] + followingHunks
        return TextDiffData(
            text: textFromHunks(hunks),
            hunks: hunks,
            lineEndingsChange: diff.lineEndingsChange,
            maxLineNumber: DiffParser.largestLineNumber(in: hunks),
            hasHiddenBidiChars: hasBidi)
    }

    /// Expand the first hunk until the whole file is shown.
    /// Port of `expandWholeTextDiff`.
    public static func expandWhole(
        _ diff: TextDiffData,
        newContentLines: [String]
    ) -> TextDiffData? {
        var result = diff
        while result.hunks.count > 1
                || (result.hunks.count == 1 && result.hunks[0].expansionType == .up) {
            guard let first = result.hunks.first else { break }
            let kind: DiffExpansionKind = first.expansionType == .up ? .up : .down
            guard let next = expandHunk(
                    result, hunkIndex: 0, kind: kind,
                    newContentLines: newContentLines,
                    step: newContentLines.count)
            else { return nil }
            result = next
        }
        return result
    }

    /// Append a bottom dummy hunk so the last hunk can expand down.
    /// Returns nil when the last hunk already reaches the end of the file.
    /// Port of `getTextDiffWithBottomDummyHunk`.
    public static func withBottomDummyHunk(
        _ diff: TextDiffData,
        oldLineCount: Int,
        newLineCount: Int
    ) -> TextDiffData? {
        guard let last = diff.hunks.last else { return nil }
        let lastNewLine = last.header.newStartLine + last.header.newLineCount
        guard lastNewLine < newLineCount else { return nil }
        let dummyHeader = DiffHunkHeader(
            oldStartLine: last.header.oldStartLine + last.header.oldLineCount,
            oldLineCount: oldLineCount - (last.header.oldStartLine + last.header.oldLineCount) + 1,
            newStartLine: last.header.newStartLine + last.header.newLineCount,
            newLineCount: newLineCount - (last.header.newStartLine + last.header.newLineCount) + 1)
        let dummy = DiffHunk(
            header: dummyHeader,
            lines: [DiffLine(text: "", type: .hunk, originalLineNumber: nil, oldLineNumber: nil, newLineNumber: nil)],
            unifiedDiffStart: last.unifiedDiffEnd + 1,
            unifiedDiffEnd: last.unifiedDiffEnd + 1,
            expansionType: .down)
        let hunks = diff.hunks + [dummy]
        return TextDiffData(
            text: textFromHunks(hunks),
            hunks: hunks,
            lineEndingsChange: diff.lineEndingsChange,
            maxLineNumber: diff.maxLineNumber,
            hasHiddenBidiChars: diff.hasHiddenBidiChars)
    }
}
