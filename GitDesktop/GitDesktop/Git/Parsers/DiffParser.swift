import Foundation

// MARK: - DiffParser
// Pure-function port of `electron/app/src/lib/diff-parser.ts`
// (GNU unified diff format). No git required.

public enum DiffParserError: Error, Equatable {
    case emptyHunk(header: String)
    case malformedHunkHeader(String)
}

public enum DiffParser {
    static let hunkHeaderPattern = #"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@"#

    /// Matches invisible bidirectional Unicode characters that may render
    /// misleadingly. Port of `HiddenBidiCharsRegex`.
    public static func containsHiddenBidiChars(_ text: String) -> Bool {
        text.unicodeScalars.contains {
            (0x202A...0x202E).contains($0.value) || (0x2066...0x2069).contains($0.value)
        }
    }

    /// Parse `lineEndingsChange` from a diff warning line:
    /// `', CRLF will be replaced by LF the ...'`.
    public static func parseLineEndingsChange(_ text: String) -> LineEndingsChange? {
        let pattern = #"', (CRLF|CR|LF) will be replaced by (CRLF|CR|LF) the .*"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              match.numberOfRanges == 3,
              let fromRange = Range(match.range(at: 1), in: text),
              let toRange = Range(match.range(at: 2), in: text),
              let from = parseLineEndingText(String(text[fromRange])),
              let to = parseLineEndingText(String(text[toRange]))
        else { return nil }
        return LineEndingsChange(from: from, to: to)
    }

    public static func largestLineNumber(in hunks: [DiffHunk]) -> Int {
        var maxNumber = 0
        for hunk in hunks {
            for line in hunk.lines {
                if let n = line.oldLineNumber { maxNumber = max(maxNumber, n) }
                if let n = line.newLineNumber { maxNumber = max(maxNumber, n) }
            }
        }
        return maxNumber
    }

    public static func parseHunkHeader(_ line: String) -> DiffHunkHeader? {
        guard let regex = try? NSRegularExpression(pattern: hunkHeaderPattern),
              let match = regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line))
        else { return nil }
        func group(_ i: Int, default defaultValue: Int) -> Int {
            let range = match.range(at: i)
            guard range.location != NSNotFound,
                  let swiftRange = Range(range, in: line)
            else { return defaultValue }
            return Int(line[swiftRange]) ?? defaultValue
        }
        return DiffHunkHeader(
            oldStartLine: group(1, default: 0),
            oldLineCount: group(2, default: 1),
            newStartLine: group(3, default: 0),
            newLineCount: group(4, default: 1))
    }

    /// Parse unified diff text into a `RawDiff`.
    public static func parse(_ text: String) throws -> RawDiff {
        let lines = text.components(separatedBy: "\n")
        var index = 0
        var headerEndLine = 0
        var isBinary = false
        var foundHeader = false

        // Scan the diff header.
        while index < lines.count {
            let line = lines[index]
            if line.hasPrefix("Binary files ") && line.hasSuffix("differ") {
                isBinary = true
                foundHeader = true
                headerEndLine = index
                break
            }
            if line.hasPrefix("+++") {
                foundHeader = true
                headerEndLine = index
                break
            }
            index += 1
        }

        let header = foundHeader ? lines[..<min(headerEndLine + 1, lines.count)].joined(separator: "\n") : text
        if !foundHeader {
            return RawDiff(
                header: header, contents: "", hunks: [],
                isBinary: false, maxLineNumber: 0,
                hasHiddenBidiChars: containsHiddenBidiChars(text))
        }
        if isBinary {
            return RawDiff(
                header: header, contents: "", hunks: [],
                isBinary: true, maxLineNumber: 0,
                hasHiddenBidiChars: false)
        }

        var hunks: [DiffHunk] = []
        var lineNumber = headerEndLine + 1
        index = headerEndLine + 1

        while index < lines.count {
            let headerLine = lines[index]
            guard let hunkHeader = parseHunkHeader(headerLine) else { break }
            let unifiedStart = lineNumber
            var hunkLines: [DiffLine] = [
                DiffLine(
                    text: headerLine, type: .hunk,
                    originalLineNumber: lineNumber,
                    oldLineNumber: nil, newLineNumber: nil)
            ]
            var oldCounter = hunkHeader.oldStartLine
            var newCounter = hunkHeader.newStartLine
            index += 1
            lineNumber += 1

            while index < lines.count {
                let line = lines[index]
                guard let prefix = line.first, "+- \\".contains(prefix) else { break }
                if prefix == "\\" {
                    // "\ No newline at end of file" — attaches to the previous line.
                    if var last = hunkLines.popLast() {
                        last = last.withNoTrailingNewLine(true)
                        hunkLines.append(last)
                    }
                    index += 1
                    lineNumber += 1
                    continue
                }
                let diffLineNumber = lineNumber
                let diffLine: DiffLine
                switch prefix {
                case "+":
                    diffLine = DiffLine(
                        text: line, type: .add,
                        originalLineNumber: diffLineNumber,
                        oldLineNumber: nil, newLineNumber: newCounter)
                    newCounter += 1
                case "-":
                    diffLine = DiffLine(
                        text: line, type: .delete,
                        originalLineNumber: diffLineNumber,
                        oldLineNumber: oldCounter, newLineNumber: nil)
                    oldCounter += 1
                default:
                    diffLine = DiffLine(
                        text: line, type: .context,
                        originalLineNumber: diffLineNumber,
                        oldLineNumber: oldCounter, newLineNumber: newCounter)
                    oldCounter += 1
                    newCounter += 1
                }
                hunkLines.append(diffLine)
                index += 1
                lineNumber += 1
            }

            guard hunkLines.count > 1 else {
                throw DiffParserError.emptyHunk(header: headerLine)
            }
            hunks.append(DiffHunk(
                header: hunkHeader,
                lines: hunkLines,
                unifiedDiffStart: unifiedStart,
                unifiedDiffEnd: lineNumber - 1))
        }

        // Contents exclude the "\ No newline at end of file" markers.
        let contents = text.replacingOccurrences(of: "\n\\ No newline at end of file", with: "")
        return RawDiff(
            header: header,
            contents: contents,
            hunks: hunks,
            isBinary: false,
            maxLineNumber: largestLineNumber(in: hunks),
            hasHiddenBidiChars: containsHiddenBidiChars(text))
    }
}
