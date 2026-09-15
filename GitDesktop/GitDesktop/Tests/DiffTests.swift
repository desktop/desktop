import CoreGraphics
import Foundation

// MARK: - DiffTests
// Task 4 unit tests for the diff viewer logic (`Views/Diff/*` pure
// functions). Same harness style as `ParserTests`: no test framework so the
// file compiles inside the app target; `runAll()` returns the failure count.
// Wired into `ParserTests.runAll()`.

@MainActor
public enum DiffTests {
    @discardableResult
    public static func runAll() -> Int {
        var failures: [ParserTests.Failure] = []
        testRowBuilder(&failures)
        testIntraLineRanges(&failures)
        testDiscardLabels(&failures)
        testInteractiveRanges(&failures)
        testGutterWidth(&failures)
        testExpansion(&failures)
        testSearch(&failures)
        testSyntaxHighlight(&failures)
        testImageSizing(&failures)

        if failures.isEmpty {
            print("DiffTests: all tests passed")
        } else {
            print("DiffTests: \(failures.count) failure(s)")
            for failure in failures {
                print("  FAIL [\(failure.test)] \(failure.message)")
            }
        }
        return failures.count
    }

    private static func check(
        _ condition: Bool, _ message: String, test: String,
        failures: inout [ParserTests.Failure]
    ) {
        if !condition {
            failures.append(ParserTests.Failure(test: test, message: message))
        }
    }

    // MARK: - Row builder

    static func testRowBuilder(_ failures: inout [ParserTests.Failure]) {
        let test = "diff-rows"
        let diff = DiffFixtures.smallTextDiff()
        check(diff.hunks.count == 2, "expected 2 hunks, got \(diff.hunks.count)", test: test, failures: &failures)

        // Unified: deletes before adds, no Modified rows.
        let unified = DiffRowModel.buildRows(
            hunks: diff.hunks, showSideBySide: false, enableExpansion: false)
        check(!unified.contains(where: { $0.type == .modified }),
              "unified must not pair Modified rows", test: test, failures: &failures)
        check(unified.contains(where: { $0.type == .hunk }), "missing hunk rows", test: test, failures: &failures)
        check(unified.contains(where: { $0.type == .context }), "missing context rows", test: test, failures: &failures)
        // First hunk: 1 delete + 2 adds → separate rows.
        let firstHunkRows = Array(unified.prefix(while: { _ in true }).prefix(6))
        let adds = firstHunkRows.filter { $0.type == .added }.count
        let dels = firstHunkRows.filter { $0.type == .deleted }.count
        check(adds == 2 && dels == 1, "first hunk rows: \(adds) adds \(dels) dels", test: test, failures: &failures)

        // Split: equal-count group pairs positionally into Modified.
        let split = DiffRowModel.buildRows(
            hunks: diff.hunks, showSideBySide: true, enableExpansion: false)
        let modified = split.filter { $0.type == .modified }
        check(modified.count == 1, "expected 1 Modified row, got \(modified.count)", test: test, failures: &failures)
        if case .modified(let before, let after, _) = modified.first {
            check(before.content == "old value", "before '\(before.content)'", test: test, failures: &failures)
            check(after.content == "new value", "after '\(after.content)'", test: test, failures: &failures)
            check(before.changedRange != nil && after.changedRange != nil,
                  "expected intra-line ranges", test: test, failures: &failures)
        } else {
            check(false, "no Modified row to inspect", test: test, failures: &failures)
        }

        // Selection flows into rows.
        let selected = DiffRowModel.buildRows(
            hunks: diff.hunks, showSideBySide: false, enableExpansion: false,
            selection: .fromInitialSelection(.none))
        let changedSelected = selected.compactMap { row -> Bool? in
            switch row {
            case .added(let data, _): return data.isSelected
            case .deleted(let data, _): return data.isSelected
            default: return nil
            }
        }
        check(changedSelected.allSatisfy { !$0 }, "none-selection must deselect rows", test: test, failures: &failures)
    }

    // MARK: - Intra-line ranges

    static func testIntraLineRanges(_ failures: inout [ParserTests.Failure]) {
        let test = "diff-intra-line"
        if let ranges = DiffRowModel.intraLineRanges(before: "abcXXXdef", after: "abcYYYdef") {
            check(ranges.before == 3..<6, "before \(String(describing: ranges.before))", test: test, failures: &failures)
            check(ranges.after == 3..<6, "after \(String(describing: ranges.after))", test: test, failures: &failures)
        } else {
            check(false, "expected ranges", test: test, failures: &failures)
        }
        // Identical lines → nil ranges.
        if let ranges = DiffRowModel.intraLineRanges(before: "same", after: "same") {
            check(ranges.before == nil && ranges.after == nil, "identical lines must yield nil ranges", test: test, failures: &failures)
        } else {
            check(false, "expected empty ranges, not nil result", test: test, failures: &failures)
        }
        // Over-long lines are skipped.
        let long = String(repeating: "x", count: DiffRowModel.maxIntraLineDiffStringLength + 1)
        check(DiffRowModel.intraLineRanges(before: long, after: long + "y") == nil,
              "long lines must be skipped", test: test, failures: &failures)
    }

    // MARK: - Discard labels

    static func testDiscardLabels(_ failures: inout [ParserTests.Failure]) {
        let test = "diff-discard-labels"
        check(DiffRowModel.discardLabel(rangeType: .additions, lineCount: 1, askForConfirmation: true) == "Discard Added Line…",
              "additions label", test: test, failures: &failures)
        check(DiffRowModel.discardLabel(rangeType: .deletions, lineCount: 2, askForConfirmation: false) == "Discard Removed Lines",
              "deletions label", test: test, failures: &failures)
        check(DiffRowModel.discardLabel(rangeType: .mixed, lineCount: 1, askForConfirmation: false) == "Discard Modified Line",
              "mixed label", test: test, failures: &failures)
        check(DiffRowModel.discardLabel(rangeType: nil, lineCount: 3, askForConfirmation: true) == "Discard Modified Lines…",
              "nil-type label", test: test, failures: &failures)
    }

    // MARK: - Interactive ranges

    static func testInteractiveRanges(_ failures: inout [ParserTests.Failure]) {
        let test = "diff-interactive-range"
        let diff = DiffFixtures.smallTextDiff()
        guard diff.hunks.count == 2 else {
            check(false, "fixture hunks", test: test, failures: &failures)
            return
        }
        let hunk = diff.hunks[1]
        // Lines: [hunk, context, delete, add, context]; delete at start+2.
        let deleteIndex = hunk.unifiedDiffStart + 2
        guard let range = DiffRowModel.findInteractiveOriginalDiffRange(hunks: diff.hunks, index: deleteIndex) else {
            check(false, "expected range at delete line", test: test, failures: &failures)
            return
        }
        check(range.type == .mixed, "type \(String(describing: range.type))", test: test, failures: &failures)
        check(range.lineCount == 2, "lineCount \(range.lineCount)", test: test, failures: &failures)
        // Indices outside any hunk are not interactive. (Like the reference,
        // context lines resolve to their neighboring changed group, so
        // callers only ever pass changed-line indices.)
        let outside = DiffRowModel.findInteractiveOriginalDiffRange(hunks: diff.hunks, index: 999_999)
        check(outside == nil, "out-of-range index must not be interactive", test: test, failures: &failures)
    }

    // MARK: - Gutter width

    static func testGutterWidth(_ failures: inout [ParserTests.Failure]) {
        let test = "diff-gutter-width"
        check(DiffRowModel.gutterWidth(forMaxLineNumber: 0) == 35, "min width", test: test, failures: &failures)
        check(DiffRowModel.gutterWidth(forMaxLineNumber: 999) == 35, "3-digit width", test: test, failures: &failures)
        check(DiffRowModel.gutterWidth(forMaxLineNumber: 12345) == 55, "5-digit width", test: test, failures: &failures)
    }

    // MARK: - Expansion

    static func testExpansion(_ failures: inout [ParserTests.Failure]) {
        let test = "diff-expansion"
        // First hunk at line 1 cannot expand up.
        let first = DiffFixtures.smallTextDiff().hunks[0]
        check(DiffExpansion.expansionType(hunkIndex: 0, header: first.header, previousHunk: nil) == .none,
              "first hunk at line 1 → none", test: test, failures: &failures)
        // Second hunk far from the first expands both ways.
        let second = DiffFixtures.smallTextDiff().hunks[1]
        check(DiffExpansion.expansionType(hunkIndex: 1, header: second.header, previousHunk: first) == .both,
              "distant second hunk → both", test: test, failures: &failures)

        // Expand the second hunk up with filler contents.
        let contents = DiffFixtures.smallContents()
        let diff = DiffFixtures.smallTextDiff()
        guard let expanded = DiffExpansion.expandHunk(
            diff, hunkIndex: 1, kind: .up, newContentLines: contents.newLines, step: 5)
        else {
            check(false, "expandHunk returned nil", test: test, failures: &failures)
            return
        }
        check(expanded.hunks[1].lines.count == diff.hunks[1].lines.count + 5,
              "expected 5 added lines, got \(expanded.hunks[1].lines.count)", test: test, failures: &failures)

        // Bottom dummy hunk appears when the file continues past the diff.
        let manyLines = (1...100).map { "line \($0)" }
        let withDummy = DiffExpansion.withBottomDummyHunk(diff, oldLineCount: 100, newLineCount: 100)
        check(withDummy != nil && withDummy?.hunks.count == 3, "dummy hunk", test: test, failures: &failures)
        check(DiffExpansion.withBottomDummyHunk(diff, oldLineCount: 22, newLineCount: 23) == nil,
              "no dummy when diff reaches EOF", test: test, failures: &failures)
        _ = manyLines

        // Whole-file expansion collapses to one hunk.
        if let whole = DiffExpansion.expandWhole(diff, newContentLines: contents.newLines) {
            check(whole.hunks.count == 1, "whole-file hunks \(whole.hunks.count)", test: test, failures: &failures)
        } else {
            check(false, "expandWhole returned nil", test: test, failures: &failures)
        }

        // Round-trip: text rebuilt from hunks preserves headers and lines
        // (`textFromHunks` covers hunk bodies only, like the original —
        // it is stored as display text, never reparsed).
        let rebuilt = DiffExpansion.textFromHunks(diff.hunks)
        check(rebuilt.contains("@@ -1,4 +1,5 @@"), "rebuilt header", test: test, failures: &failures)
        check(rebuilt.contains("+let extra = 42"), "rebuilt added line", test: test, failures: &failures)
        check(rebuilt.components(separatedBy: "\n").count == diff.hunks.flatMap({ $0.lines }).count,
              "rebuilt line count", test: test, failures: &failures)
    }

    // MARK: - Search

    static func testSearch(_ failures: inout [ParserTests.Failure]) {
        let test = "diff-search"
        let rows = DiffRowModel.buildRows(
            hunks: DiffFixtures.smallTextDiff().hunks,
            showSideBySide: false, enableExpansion: false)
        check(DiffSearch.findHits(rows: rows, query: "", showSideBySide: false).isEmpty,
              "empty query → no hits", test: test, failures: &failures)
        let hits = DiffSearch.findHits(rows: rows, query: "value", showSideBySide: false)
        check(hits.count == 2, "expected 2 hits for 'value', got \(hits.count)", test: test, failures: &failures)
        // Case-insensitive.
        let upper = DiffSearch.findHits(rows: rows, query: "GREETING", showSideBySide: false)
        check(!upper.isEmpty, "case-insensitive search", test: test, failures: &failures)
        // Hunk headers are skipped.
        let hunkHits = DiffSearch.findHits(rows: rows, query: "@@", showSideBySide: false)
        check(hunkHits.isEmpty, "hunk headers skipped", test: test, failures: &failures)
        // Messages mirror the original strings.
        check(DiffSearch.startedMessage(query: "x", hitCount: 0) == "No results for \"x\"",
              "no-results message", test: test, failures: &failures)
        check(DiffSearch.startedMessage(query: "x", hitCount: 3) == "Result 1 of 3 for \"x\"",
              "started message", test: test, failures: &failures)
        check(DiffSearch.steppedMessage(query: "x", selected: 1, hitCount: 3) == "Result 2 of 3 for \"x\"",
              "stepped message", test: test, failures: &failures)
    }

    // MARK: - Syntax highlight

    static func testSyntaxHighlight(_ failures: inout [ParserTests.Failure]) {
        let test = "diff-syntax"
        check(DiffSyntaxHighlight.language(forPath: "a.swift") == .cLike, "swift → cLike", test: test, failures: &failures)
        check(DiffSyntaxHighlight.language(forPath: "a.HTML") == .markup, "html → markup", test: test, failures: &failures)
        check(DiffSyntaxHighlight.language(forPath: "README") == .plain, "no ext → plain", test: test, failures: &failures)
        let comment = DiffSyntaxHighlight.tokenize("// hello", language: .cLike)
        check(comment.count == 1 && comment[0].kind == .comment && comment[0].range == 0..<8,
              "line comment \(comment)", test: test, failures: &failures)
        let string = DiffSyntaxHighlight.tokenize("let s = \"hi\"", language: .cLike)
        check(string.contains(where: { $0.kind == .string }), "string token", test: test, failures: &failures)
        let keyword = DiffSyntaxHighlight.tokenize("func main()", language: .cLike)
        check(keyword.contains(where: { $0.kind == .keyword && $0.range == 0..<4 }),
              "keyword token", test: test, failures: &failures)
        check(DiffSyntaxHighlight.tokenize("anything", language: .plain).isEmpty,
              "plain → no tokens", test: test, failures: &failures)
        check(DiffParser.containsHiddenBidiChars("a‪b"), "bidi detection", test: test, failures: &failures)
        check(!DiffParser.containsHiddenBidiChars("plain"), "no false bidi", test: test, failures: &failures)
    }

    // MARK: - Image sizing

    static func testImageSizing(_ failures: inout [ParserTests.Failure]) {
        let test = "diff-image-sizing"
        let fit = ImageDiffSizing.aspectFit(
            imageSize: CGSize(width: 400, height: 200),
            containerSize: CGSize(width: 100, height: 100))
        check(fit == CGSize(width: 100, height: 50), "aspect fit \(fit)", test: test, failures: &failures)
        // Never upscale.
        let small = ImageDiffSizing.aspectFit(
            imageSize: CGSize(width: 10, height: 10),
            containerSize: CGSize(width: 100, height: 100))
        check(small == CGSize(width: 10, height: 10), "no upscale \(small)", test: test, failures: &failures)
        let max = ImageDiffSizing.maxFit(
            previous: CGSize(width: 400, height: 200),
            current: CGSize(width: 50, height: 50),
            container: CGSize(width: 100, height: 100))
        check(max == CGSize(width: 100, height: 50), "max fit \(max)", test: test, failures: &failures)
    }
}
