import Foundation

// MARK: - ChangesLogicTests
// Task-3 unit tests for `Views/Changes/ChangesLogic.swift` (pure functions
// only — no git, no UI). Same framework-free pattern as `ParserTests`:
// `runAll()` returns the failure count and prints results, executed via a
// tiny `swiftc` harness (see the Task 3 summary).
// Main-actor bound to match the project's default actor isolation.
@MainActor
public enum ChangesLogicTests {
    public struct Failure: Sendable {
        public var test: String
        public var message: String
    }

    private static func check(
        _ condition: Bool, _ message: String,
        test: String, failures: inout [Failure]
    ) {
        if !condition {
            failures.append(Failure(test: test, message: message))
        }
    }

    @discardableResult
    public static func runAll() -> Int {
        var failures: [Failure] = []
        testFilterOptions(&failures)
        testFilterText(&failures)
        testHiddenByFilter(&failures)
        testNoResultsMessage(&failures)
        testCommitValidation(&failures)
        testButtonTextAndPlaceholder(&failures)
        testFormatCommitMessage(&failures)
        testCoAuthors(&failures)
        testAutocompleteTriggers(&failures)
        testStatusDisplay(&failures)
        testBadgeAndOversized(&failures)
        testParseCommitSHA(&failures)

        if failures.isEmpty {
            print("ChangesLogicTests: all tests passed")
        } else {
            print("ChangesLogicTests: \(failures.count) failure(s)")
            for failure in failures {
                print("  FAIL [\(failure.test)] \(failure.message)")
            }
        }
        return failures.count
    }

    // MARK: Fixtures

    static func file(
        _ path: String,
        status: AppFileStatus = .modified(submoduleStatus: nil),
        included: Bool = true
    ) -> WorkingDirectoryFileChange {
        WorkingDirectoryFileChange(
            path: path, status: status,
            selection: included
                ? .fromInitialSelection(.all)
                : .fromInitialSelection(.none))
    }

    // MARK: - Filter options (AND logic)

    static func testFilterOptions(_ failures: inout [Failure]) {
        let test = "filter-options"
        let files = [
            file("a.swift", status: .modified(submoduleStatus: nil), included: true),
            file("b.swift", status: .new(submoduleStatus: nil), included: false),
            file("c.txt", status: .deleted(submoduleStatus: nil), included: true),
            file("d.md", status: .untracked(submoduleStatus: nil), included: false),
        ]
        check(FileListFilter.default.apply(to: files).count == 4,
              "no filters show all", test: test, failures: &failures)

        var f = FileListFilter(isIncludedInCommit: true)
        check(f.apply(to: files).map(\.path) == ["a.swift", "c.txt"],
              "included only, got \(f.apply(to: files).map(\.path))",
              test: test, failures: &failures)

        f = FileListFilter(isExcludedFromCommit: true)
        check(f.apply(to: files).map(\.path) == ["b.swift", "d.md"],
              "excluded only", test: test, failures: &failures)

        f = FileListFilter(isNewFile: true)
        let newPaths = Set(f.apply(to: files).map(\.path))
        check(newPaths == ["b.swift", "d.md"], "new+untracked, got \(newPaths)",
              test: test, failures: &failures)

        f = FileListFilter(isModifiedFile: true)
        check(f.apply(to: files).map(\.path) == ["a.swift"],
              "modified only", test: test, failures: &failures)

        f = FileListFilter(isDeletedFile: true)
        check(f.apply(to: files).map(\.path) == ["c.txt"],
              "deleted only", test: test, failures: &failures)

        // AND logic: included AND modified
        f = FileListFilter(isIncludedInCommit: true, isModifiedFile: true)
        check(f.apply(to: files).map(\.path) == ["a.swift"],
              "AND combination", test: test, failures: &failures)

        check(FileListFilter(isIncludedInCommit: true).countActiveFilterOptions() == 1,
              "count 1", test: test, failures: &failures)
        check(FileListFilter.default.countActiveFilterOptions() == 0,
              "count 0", test: test, failures: &failures)
        check(!FileListFilter.default.hasActiveFilters(), "default inactive",
              test: test, failures: &failures)
        check(FileListFilter(filterText: "a").hasActiveFilters(), "text active",
              test: test, failures: &failures)
    }

    // MARK: - Filter text

    static func testFilterText(_ failures: inout [Failure]) {
        let test = "filter-text"
        let files = [
            file("src/App.swift"),
            file("src/Models/User.swift"),
            file("README.md"),
        ]
        let f = FileListFilter(filterText: "app")
        check(f.apply(to: files).map(\.path) == ["src/App.swift"],
              "case-insensitive substring, got \(f.apply(to: files).map(\.path))",
              test: test, failures: &failures)
        // Hidden filter UI shows everything.
        check(f.apply(to: files, showChangesFilter: false).count == 3,
              "hidden filter shows all", test: test, failures: &failures)
        check(matchRanges(for: "app", in: "src/App.swift").count == 1,
              "one match range", test: test, failures: &failures)
        check(matchRanges(for: "", in: "a.swift").isEmpty,
              "empty filter no ranges", test: test, failures: &failures)
    }

    // MARK: - Hidden-by-filter

    static func testHiddenByFilter(_ failures: inout [Failure]) {
        let test = "hidden-by-filter"
        let filter = FileListFilter(filterText: "zzz")
        check(FileListFilter.isCommittingFileHiddenByFilter(
            fileIDsIncludedInCommit: ["Modified+a.swift"],
            filteredIDs: [], fileCount: 2, filter: filter),
              "included file hidden", test: test, failures: &failures)
        check(!FileListFilter.isCommittingFileHiddenByFilter(
            fileIDsIncludedInCommit: ["Modified+a.swift"],
            filteredIDs: ["Modified+a.swift", "Modified+b.swift"],
            fileCount: 2, filter: filter),
              "all visible → false", test: test, failures: &failures)
        check(!FileListFilter.isCommittingFileHiddenByFilter(
            fileIDsIncludedInCommit: ["Modified+a.swift"],
            filteredIDs: [], fileCount: 2, filter: .default),
              "no active filters → false", test: test, failures: &failures)
    }

    // MARK: - No-results message

    static func testNoResultsMessage(_ failures: inout [Failure]) {
        let test = "no-results-message"
        check(FileListFilter.default.noResultsMessage() == nil,
              "no filters → nil", test: test, failures: &failures)
        let one = FileListFilter(filterText: "zzz").noResultsMessage()
        check(one?.contains("\"zzz\"") == true,
              "quotes text, got \(one ?? "nil")", test: test, failures: &failures)
        let two = FileListFilter(isNewFile: true, isModifiedFile: true).noResultsMessage()
        check(two?.contains("New files and Modified files") == true,
              "two-item grammar, got \(two ?? "nil")", test: test, failures: &failures)
    }

    // MARK: - Commit validation

    static func testCommitValidation(_ failures: inout [Failure]) {
        let test = "commit-validation"
        check(isEmptyOrWhitespace("   \n "), "whitespace blank",
              test: test, failures: &failures)
        check(!isEmptyOrWhitespace(" fix "), "non-blank",
              test: test, failures: &failures)
        check(commitMessageContainsConflictMarkers(
            summary: "fix", description: "<<<<<<< HEAD\nfoo"),
              "markers detected", test: test, failures: &failures)
        check(!commitMessageContainsConflictMarkers(
            summary: "fix =======", description: nil),
              "inline ======= is not a marker", test: test, failures: &failures)

        // Empty summary blocks.
        var v = validateCommit(
            summary: "", anyFilesSelected: true, anyFilesAvailable: true,
            allowEmptyCommit: false, isAmending: false)
        check(!v.canSubmit && v.blockReason == "A commit summary is required to commit",
              "empty summary blocks, got \(v.blockReason ?? "nil")",
              test: test, failures: &failures)

        // No files blocks (unless allow-empty).
        v = validateCommit(
            summary: "fix", anyFilesSelected: false, anyFilesAvailable: true,
            allowEmptyCommit: false, isAmending: false)
        check(!v.canSubmit && v.blockReason == "Select one or more files to commit",
              "no files blocks", test: test, failures: &failures)
        v = validateCommit(
            summary: "fix", anyFilesSelected: false, anyFilesAvailable: true,
            allowEmptyCommit: true, isAmending: false)
        check(v.canCommit, "allow-empty permits", test: test, failures: &failures)

        // Happy path.
        v = validateCommit(
            summary: "fix", anyFilesSelected: true, anyFilesAvailable: true,
            allowEmptyCommit: false, isAmending: false)
        check(v.canCommit && v.blockReason == nil, "happy path",
              test: test, failures: &failures)

        // Amend without files is fine with a summary.
        v = validateCommit(
            summary: "fix", anyFilesSelected: false, anyFilesAvailable: false,
            allowEmptyCommit: false, isAmending: true)
        check(v.canAmend, "amend permits", test: test, failures: &failures)

        // Repo-rule failure blocks everything.
        v = validateCommit(
            summary: "fix", anyFilesSelected: true, anyFilesAvailable: true,
            allowEmptyCommit: false, isAmending: false, hasRepoRuleFailure: true)
        check(!v.canSubmit, "repo rules block", test: test, failures: &failures)

        // 72-char warning never blocks.
        let long = String(repeating: "x", count: 73)
        v = validateCommit(
            summary: long, anyFilesSelected: true, anyFilesAvailable: true,
            allowEmptyCommit: false, isAmending: false)
        check(v.canCommit && v.warnings == [.summaryTooLong(count: 73)],
              "72-char warns only, got \(v.warnings)",
              test: test, failures: &failures)
    }

    // MARK: - Button text / placeholder

    static func testButtonTextAndPlaceholder(_ failures: inout [Failure]) {
        let test = "button-text"
        check(filesToBeCommittedText(count: 0) == "", "zero → empty",
              test: test, failures: &failures)
        check(filesToBeCommittedText(count: 1) == "1 file ", "singular",
              test: test, failures: &failures)
        check(filesToBeCommittedText(count: 3) == "3 files ", "plural",
              test: test, failures: &failures)
        check(commitButtonTitle(
            branch: "main", filesToBeCommittedCount: 2,
            isAmending: false, isCommitting: false) == "Commit 2 files to main",
              "commit title", test: test, failures: &failures)
        check(commitButtonTitle(
            branch: nil, filesToBeCommittedCount: 0,
            isAmending: false, isCommitting: false) == "Commit",
              "no branch", test: test, failures: &failures)
        check(commitButtonTitle(
            branch: "main", filesToBeCommittedCount: 0,
            isAmending: true, isCommitting: false) == "Amend last commit",
              "amend title", test: test, failures: &failures)

        check(placeholderSummary(for: []) == "Summary (required)",
              "empty placeholder", test: test, failures: &failures)
        check(placeholderSummary(for: [file("n.txt", status: .new(submoduleStatus: nil))])
            == "Create n.txt", "create placeholder",
              test: test, failures: &failures)
        check(placeholderSummary(for: [file("o.txt", status: .deleted(submoduleStatus: nil))])
            == "Delete o.txt", "delete placeholder",
              test: test, failures: &failures)
        check(placeholderSummary(for: [file("m.txt")]) == "Update m.txt",
              "update placeholder", test: test, failures: &failures)
        check(shouldPrepopulateCommitSummary(fileCount: 1),
              "single prepopulates", test: test, failures: &failures)
        check(!shouldPrepopulateCommitSummary(fileCount: 2),
              "multi does not", test: test, failures: &failures)
    }

    // MARK: - Message formatting

    static func testFormatCommitMessage(_ failures: inout [Failure]) {
        let test = "format-message"
        let msg = formatCommitMessage(summary: "fix", description: nil, trailers: [])
        check(msg == "fix\n", "summary only, got \(msg.debugDescription)",
              test: test, failures: &failures)
        let withBody = formatCommitMessage(
            summary: "fix", description: "details", trailers: [])
        check(withBody == "fix\n\ndetails\n",
              "with body, got \(withBody.debugDescription)",
              test: test, failures: &failures)
        let withTrailer = formatCommitMessage(
            summary: "fix", description: nil,
            trailers: [Trailer(token: "Co-Authored-By", value: "A <a@x.y>")])
        check(withTrailer.contains("Co-Authored-By: A <a@x.y>"),
              "trailer appended, got \(withTrailer.debugDescription)",
              test: test, failures: &failures)
    }

    // MARK: - Co-authors

    static func testCoAuthors(_ failures: inout [Failure]) {
        let test = "co-authors"
        let authors: [Author] = [
            .known(name: "Ada", email: "ada@x.y", username: nil),
            .unknown(username: "???", state: .error),
        ]
        let trailers = coAuthorTrailers(for: authors)
        check(trailers == [Trailer(token: "Co-Authored-By", value: "Ada <ada@x.y>")],
              "known only, got \(trailers)", test: test, failures: &failures)
        check(unknownCoAuthors(in: authors).count == 1,
              "one unknown", test: test, failures: &failures)
    }

    // MARK: - Autocomplete triggers

    static func testAutocompleteTriggers(_ failures: inout [Failure]) {
        let test = "autocomplete"
        check(coAuthorQuery(in: "thanks @ada", cursor: 11) == "ada",
              "@ trigger, got \(coAuthorQuery(in: "thanks @ada", cursor: 11) ?? "nil")",
              test: test, failures: &failures)
        check(coAuthorQuery(in: "no trigger", cursor: 10) == nil,
              "@ absent", test: test, failures: &failures)
        check(emojiQuery(in: "ship :rock", cursor: 10) == "rock",
              ":emoji: trigger, got \(emojiQuery(in: "ship :rock", cursor: 10) ?? "nil")",
              test: test, failures: &failures)
        check(emojiQuery(in: "plain", cursor: 5) == nil,
              ":emoji: absent", test: test, failures: &failures)

        let authors: [Author] = [
            .known(name: "Ada Lovelace", email: "ada@x.y", username: nil),
            .known(name: "Grace Hopper", email: "grace@x.y", username: nil),
        ]
        check(filterCoAuthors(authors, query: "grace").count == 1,
              "author filter", test: test, failures: &failures)
        check(filterCoAuthors(authors, query: "").count == 2,
              "empty author query returns all", test: test, failures: &failures)
        check(filterEmoji(query: "rock").map(\.name) == ["rocket"],
              "emoji filter", test: test, failures: &failures)
    }

    // MARK: - Status display

    static func testStatusDisplay(_ failures: inout [Failure]) {
        let test = "status-display"
        check(displayName(for: .new(submoduleStatus: nil)) == "New", "new",
              test: test, failures: &failures)
        check(displayName(for: .untracked(submoduleStatus: nil)) == "New",
              "untracked → New", test: test, failures: &failures)
        check(displayName(for: .renamed(
            oldPath: "a", renameIncludesModifications: false,
            submoduleStatus: nil)) == "Renamed", "renamed",
              test: test, failures: &failures)
        check(includeState(for: file("a", included: true)) == .on,
              "include on", test: test, failures: &failures)
        check(includeState(for: file("a", included: false)) == .off,
              "include off", test: test, failures: &failures)
        let partial = WorkingDirectoryFileChange(
            path: "p", status: .modified(submoduleStatus: nil),
            selection: .all.withToggleLineSelection(lineIndex: 1))
        check(includeState(for: partial) == .mixed, "partial → mixed",
              test: test, failures: &failures)
    }

    // MARK: - parseCommitSHA (root-commit form)

    static func testParseCommitSHA(_ failures: inout [Failure]) {
        let test = "parse-commit-sha"
        check(parseCommitSHA("[main abc1234] Add thing\n") == "abc1234",
              "normal form", test: test, failures: &failures)
        check(parseCommitSHA("[main (root-commit) def5678] Add thing\n") == "def5678",
              "root-commit form, got \(parseCommitSHA("[main (root-commit) def5678] Add thing\n") ?? "nil")",
              test: test, failures: &failures)
    }

    // MARK: - Badge / oversized

    static func testBadgeAndOversized(_ failures: inout [Failure]) {
        let test = "badge-oversized"
        check(filesChangedBadgeText(count: 5) == "5", "small count",
              test: test, failures: &failures)
        check(filesChangedBadgeText(count: 301) == "300+", "capped",
              test: test, failures: &failures)
        check(oversizedFileThresholdBytes == 100 * 1024 * 1024,
              "100MiB gate", test: test, failures: &failures)
        check(oversizedPaths(in: "/nonexistent", paths: ["a.bin"]).isEmpty,
              "missing files not oversized", test: test, failures: &failures)
    }
}
