import Foundation

// MARK: - DiffFixtures
// In-memory fixtures for Previews and the Task 4 accept criteria:
// large, binary, image, submodule, CRLF, and bidi diffs.

public enum DiffFixtures {
    public static func modifiedFile() -> DiffFileDescriptor {
        DiffFileDescriptor(
            path: "Sources/App.swift",
            status: .modified(submoduleStatus: nil),
            isSelectable: true)
    }

    /// Small two-hunk text diff with an add/delete pair (intra-line ranges apply).
    public static func smallTextDiff() -> TextDiffData {
        let raw = """
        diff --git a/Sources/App.swift b/Sources/App.swift
        index 1111111..2222222 100644
        --- a/Sources/App.swift
        +++ b/Sources/App.swift
        @@ -1,4 +1,5 @@
         import Foundation
        -let greeting = "Hello"
        +let greeting = "Hello, world"
        +let extra = 42
         print(greeting)
        @@ -30,3 +31,3 @@ func main() {
         context line
        -old value
        +new value
         end
        """
        return parsedText(raw)
    }

    public static func smallContents() -> DiffFileContents {
        DiffFileContents(
            oldLines: [
                "import Foundation",
                "let greeting = \"Hello\"",
                "print(greeting)",
            ] + (4...30).map { "old filler \($0)" },
            newLines: [
                "import Foundation",
                "let greeting = \"Hello, world\"",
                "let extra = 42",
                "print(greeting)",
            ] + (4...30).map { "new filler \($0)" })
    }

    /// Large diff (forces the `.largeText` gate path).
    public static func largeTextDiff(lineCount: Int = 2_000) -> TextDiffData {
        var lines = [
            "diff --git a/big.txt b/big.txt",
            "index 1111111..2222222 100644",
            "--- a/big.txt",
            "+++ b/big.txt",
            "@@ -1,\(lineCount) +1,\(lineCount) @@",
        ]
        for i in 1...lineCount {
            lines.append(i % 2 == 0 ? "-old line \(i)" : " context \(i)")
            if i % 2 == 0 { lines.append("+new line \(i)") }
        }
        let data = parsedText(lines.joined(separator: "\n"))
        // Simulate classification as LargeText (size-based in production).
        return TextDiffData(
            text: data.text, hunks: data.hunks,
            lineEndingsChange: data.lineEndingsChange,
            maxLineNumber: data.maxLineNumber,
            hasHiddenBidiChars: data.hasHiddenBidiChars)
    }

    public static func binaryDiff() -> Diff { .binary }

    public static func submoduleDiff() -> Diff {
        .submodule(SubmoduleDiffData(
            fullPath: "/tmp/repo/vendor/lib",
            path: "vendor/lib",
            url: "https://example.com/vendor/lib.git",
            status: SubmoduleStatus(commitChanged: true, modifiedChanges: false, untrackedChanges: false),
            oldSHA: "abc1234567890abcdef",
            newSHA: "def9876543210fedcba"))
    }

    public static func imageDiff() -> Diff {
        .image(
            previous: DiffImage(base64Contents: redPixel, mediaType: "image/png", bytes: 70),
            current: DiffImage(base64Contents: bluePixel, mediaType: "image/png", bytes: 70))
    }

    /// Text diff with a CRLF→LF line-endings change.
    public static func crlfDiff() -> TextDiffData {
        var data = smallTextDiff()
        data = TextDiffData(
            text: data.text, hunks: data.hunks,
            lineEndingsChange: LineEndingsChange(from: .crlf, to: .lf),
            maxLineNumber: data.maxLineNumber,
            hasHiddenBidiChars: data.hasHiddenBidiChars)
        return data
    }

    /// Text diff containing a hidden bidi control character.
    public static func bidiDiff() -> TextDiffData {
        let raw = "diff --git a/note.txt b/note.txt\n--- a/note.txt\n+++ b/note.txt\n" + "@@ -1,2 +1,2 @@\n context\n-old \u{202E}reversed\n+new line\n"
        return parsedText(raw)
    }

    /// 1x1 red PNG.
    public static let redPixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    /// 1x1 blue PNG.
    public static let bluePixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

    // MARK: Helpers

    static func parsedText(_ raw: String) -> TextDiffData {
        guard let parsed = try? DiffParser.parse(raw) else {
            return TextDiffData(
                text: "", hunks: [], maxLineNumber: 0, hasHiddenBidiChars: false)
        }
        return TextDiffData(
            text: parsed.contents, hunks: parsed.hunks,
            maxLineNumber: parsed.maxLineNumber,
            hasHiddenBidiChars: parsed.hasHiddenBidiChars)
    }
}
