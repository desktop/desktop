import SwiftUI

// MARK: - PathLabel
// Port of `electron/app/src/ui/lib/path-label.tsx`: directory in secondary
// text + basename in primary text, middle-truncated, with optional
// filter-match highlighting. Tooltips come from `.help()` at the call site
// (overflow-only tooltips map to `help()` per Docs/03).

public struct PathLabel: View {
    public var path: String
    /// Ranges of `path` (UTF-16) matching the filter text, highlighted.
    public var matchRanges: [Range<String.Index>]?

    public init(path: String, matchRanges: [Range<String.Index>]? = nil) {
        self.path = path
        self.matchRanges = matchRanges
    }

    private var directory: String {
        let ns = path as NSString
        let dir = ns.deletingLastPathComponent
        return dir == "." ? "" : dir
    }

    private var fileName: String {
        (path as NSString).lastPathComponent
    }

    public var body: some View {
        HStack(spacing: 0) {
            if !directory.isEmpty {
                Text(directory + "/")
                    .foregroundStyle(.secondary)
            }
            highlightedFileName
        }
        .lineLimit(1)
        .truncationMode(.middle)
    }

    @ViewBuilder
    private var highlightedFileName: some View {
        if let ranges = matchRanges, !ranges.isEmpty {
            let segments = highlightedSegments(
                fileName, ranges: rangesInFileName(ranges))
            HStack(spacing: 0) {
                ForEach(segments) { segment in
                    Text(segment.text)
                        .background(
                            segment.highlight
                                ? Color.accentColor.opacity(0.3) : Color.clear)
                }
            }
        } else {
            Text(fileName)
        }
    }

    private func rangesInFileName(_ ranges: [Range<String.Index>]) -> [Range<String.Index>] {
        let dirPrefix = directory.isEmpty ? 0 : directory.count + 1
        return ranges.compactMap { range in
            let lower = path.distance(from: path.startIndex, to: range.lowerBound) - dirPrefix
            let upper = path.distance(from: path.startIndex, to: range.upperBound) - dirPrefix
            guard upper > 0, lower < fileName.count else { return nil }
            let from = fileName.index(fileName.startIndex, offsetBy: max(0, lower))
            let to = fileName.index(fileName.startIndex, offsetBy: min(fileName.count, upper))
            guard from < to else { return nil }
            return from..<to
        }
    }

    private struct HighlightSegment: Identifiable {
        var id: Int
        var text: String
        var highlight: Bool
    }

    private func highlightedSegments(
        _ text: String, ranges: [Range<String.Index>]
    ) -> [HighlightSegment] {
        var segments: [HighlightSegment] = []
        var cursor = text.startIndex
        var id = 0
        for range in ranges.sorted(by: { $0.lowerBound < $1.lowerBound }) {
            if cursor < range.lowerBound {
                segments.append(HighlightSegment(
                    id: id, text: String(text[cursor..<range.lowerBound]),
                    highlight: false))
                id += 1
            }
            segments.append(HighlightSegment(
                id: id, text: String(text[range]), highlight: true))
            id += 1
            cursor = range.upperBound
        }
        if cursor < text.endIndex {
            segments.append(HighlightSegment(
                id: id, text: String(text[cursor...]), highlight: false))
        }
        return segments
    }
}
