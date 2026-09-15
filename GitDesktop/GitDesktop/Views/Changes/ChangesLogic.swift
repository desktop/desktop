import Foundation

// MARK: - ChangesLogic
// Pure, testable logic for the Changes tab + commit box.
// Ports of `electron/app/src/ui/changes/filter-changes-logic.ts`,
// the `canCommit`/`canAmend` + button-text rules in
// `changes/commit-message.tsx` + `changes/filter-changes-list.tsx`,
// `lib/is-empty-or-whitespace.ts`, and the trigger regexes in
// `ui/autocompletion/*` (minus the deleted issues provider).

// MARK: - File list filter

/// Filter state for the changed-files list.
/// Port of `IFileListFilterState` (`lib/app-state.ts`).
public struct FileListFilter: Sendable, Equatable {
    public var filterText: String
    public var isIncludedInCommit: Bool
    public var isExcludedFromCommit: Bool
    public var isNewFile: Bool
    public var isModifiedFile: Bool
    public var isDeletedFile: Bool

    public init(
        filterText: String = "",
        isIncludedInCommit: Bool = false,
        isExcludedFromCommit: Bool = false,
        isNewFile: Bool = false,
        isModifiedFile: Bool = false,
        isDeletedFile: Bool = false
    ) {
        self.filterText = filterText
        self.isIncludedInCommit = isIncludedInCommit
        self.isExcludedFromCommit = isExcludedFromCommit
        self.isNewFile = isNewFile
        self.isModifiedFile = isModifiedFile
        self.isDeletedFile = isDeletedFile
    }

    public static var `default`: FileListFilter { FileListFilter() }

    /// Number of active option filters (excludes `filterText`).
    /// Port of `countActiveFilterOptions`.
    public func countActiveFilterOptions() -> Int {
        [isIncludedInCommit, isNewFile, isModifiedFile, isDeletedFile, isExcludedFromCommit]
            .filter { $0 }.count
    }

    /// Port of `hasActiveFilters`.
    public func hasActiveFilters() -> Bool {
        !filterText.isEmpty || countActiveFilterOptions() > 0
    }

    /// Option-only match (AND logic). Port of `applyFilterOptions`.
    public func matchesOptions(_ file: WorkingDirectoryFileChange) -> Bool {
        if countActiveFilterOptions() == 0 { return true }
        if isIncludedInCommit && !file.isIncludedInCommit { return false }
        if isExcludedFromCommit && !file.isExcludedFromCommit { return false }
        let kind = file.status.kind
        if isNewFile && !(kind == .new || kind == .untracked) { return false }
        if isModifiedFile && kind != .modified { return false }
        if isDeletedFile && kind != .deleted { return false }
        return true
    }

    /// Case-insensitive substring match on the path. The reference app uses
    /// fuzzy-find here; substring keeps the Swift port dependency-free while
    /// preserving the "type to narrow" behavior.
    public func matchesText(_ file: WorkingDirectoryFileChange) -> Bool {
        guard !filterText.isEmpty else { return true }
        return file.path.localizedCaseInsensitiveContains(filterText)
    }

    /// Full predicate (options AND text). Honors `showChangesFilter` like
    /// the memoized `applyFilters`: when the filter UI is hidden everything
    /// matches.
    public func matches(_ file: WorkingDirectoryFileChange, showChangesFilter: Bool = true) -> Bool {
        guard showChangesFilter else { return true }
        return matchesOptions(file) && matchesText(file)
    }

    /// Apply the filter to a file list, preserving order.
    public func apply(
        to files: [WorkingDirectoryFileChange],
        showChangesFilter: Bool = true
    ) -> [WorkingDirectoryFileChange] {
        files.filter { matches($0, showChangesFilter: showChangesFilter) }
    }

    /// Port of `getNoResultsMessage`.
    public func noResultsMessage() -> String? {
        guard hasActiveFilters() else { return nil }
        var active: [String] = []
        if !filterText.isEmpty { active.append("\"\(filterText)\"") }
        if isIncludedInCommit { active.append("Included in commit") }
        if isExcludedFromCommit { active.append("Excluded from commit") }
        if isNewFile { active.append("New files") }
        if isModifiedFile { active.append("Modified files") }
        if isDeletedFile { active.append("Deleted files") }
        guard !active.isEmpty else { return nil }
        let list: String
        switch active.count {
        case 1: list = active[0]
        case 2: list = "\(active[0]) and \(active[1])"
        default:
            list = "\(active.dropLast().joined(separator: ", ")), and \(active.last!)"
        }
        return "Sorry, I can't find any changed files matching the following filters: \(list)"
    }

    /// Port of `isCommittingFileHiddenByFilter`.
    public static func isCommittingFileHiddenByFilter(
        fileIDsIncludedInCommit: [String],
        filteredIDs: Set<String>,
        fileCount: Int,
        filter: FileListFilter
    ) -> Bool {
        if !filter.hasActiveFilters() || filteredIDs.count == fileCount { return false }
        if fileIDsIncludedInCommit.count > filteredIDs.count { return true }
        return fileIDsIncludedInCommit.contains { !filteredIDs.contains($0) }
    }
}

/// Match ranges of `filter` inside `path` for highlight purposes.
public func matchRanges(for filter: String, in path: String) -> [Range<String.Index>] {
    guard !filter.isEmpty else { return [] }
    var ranges: [Range<String.Index>] = []
    var start = path.startIndex
    while let range = path.range(
        of: filter,
        options: [.caseInsensitive],
        range: start..<path.endIndex) {
        ranges.append(range)
        start = range.upperBound
    }
    return ranges
}

// MARK: - Commit validation

/// True when the string is empty or all whitespace.
/// Port of `lib/is-empty-or-whitespace.ts`.
public func isEmptyOrWhitespace(_ string: String) -> Bool {
    string.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
}

/// Leftover merge-conflict markers (`git diff --check` reports these as
/// "leftover conflict marker"). Used to block commits of conflicted files.
private let conflictMarkerPrefixes = ["<<<<<<< ", "=======", ">>>>>>> "]

public func lineIsConflictMarker(_ line: String) -> Bool {
    conflictMarkerPrefixes.contains { line.hasPrefix($0) }
        || line == "======="
}

/// Scan a commit message for conflict markers (blocks commit).
public func commitMessageContainsConflictMarkers(summary: String, description: String?) -> Bool {
    let text = summary + "\n" + (description ?? "")
    return text.components(separatedBy: "\n").contains(where: lineIsConflictMarker)
}

/// Warning severity for the commit box. Warnings never block; errors do.
public enum CommitWarningKind: Sendable, Equatable {
    case summaryTooLong(count: Int)
    case disallowedEmail
    case misattributedEmail
}

/// Result of commit-box validation. Mirrors `canCommit`/`canAmend` plus the
/// blocking reasons surfaced as tooltips in `commit-message.tsx`.
public struct CommitValidation: Sendable, Equatable {
    public var canCommit: Bool
    public var canAmend: Bool
    /// Non-nil when the button must stay disabled.
    public var blockReason: String?
    public var warnings: [CommitWarningKind]

    public init(canCommit: Bool, canAmend: Bool, blockReason: String? = nil, warnings: [CommitWarningKind] = []) {
        self.canCommit = canCommit
        self.canAmend = canAmend
        self.blockReason = blockReason
        self.warnings = warnings
    }

    public var canSubmit: Bool { canCommit || canAmend }
}

/// Validate a pending commit. Ports `canCommit`/`canAmend` +
/// `getButtonTooltip` from `commit-message.tsx`.
///
/// - `hasRepoRuleFailure`: local `commitMessagePatterns` check failed
///   (GH rulesets fetch is deleted per scope; only local patterns apply).
public func validateCommit(
    summary: String,
    anyFilesSelected: Bool,
    anyFilesAvailable: Bool,
    allowEmptyCommit: Bool,
    isAmending: Bool,
    prepopulateCommitSummary: Bool = false,
    hasRepoRuleFailure: Bool = false,
    showCommitLengthWarning: Bool = true
) -> CommitValidation {
    let summaryBlank = isEmptyOrWhitespace(summary)
    var warnings: [CommitWarningKind] = []
    if showCommitLengthWarning && summary.count > 72 {
        warnings.append(.summaryTooLong(count: summary.count))
    }

    let canCommit =
        (((anyFilesSelected || allowEmptyCommit) && !summaryBlank) || prepopulateCommitSummary)
        && !hasRepoRuleFailure
    let canAmend =
        isAmending && (!summaryBlank || prepopulateCommitSummary) && !hasRepoRuleFailure

    var blockReason: String?
    if !(canCommit || canAmend) {
        if summaryBlank {
            blockReason = "A commit summary is required to commit"
        } else if !anyFilesSelected && anyFilesAvailable && !allowEmptyCommit && !isAmending {
            blockReason = "Select one or more files to commit"
        } else if hasRepoRuleFailure {
            blockReason = "This commit does not meet the repository rules"
        }
    }
    return CommitValidation(
        canCommit: canCommit, canAmend: canAmend,
        blockReason: blockReason, warnings: warnings)
}

// MARK: - Commit button text / placeholder

/// `Commit N files to <branch>` fragment. Port of `getFilesToBeCommittedButtonText`.
public func filesToBeCommittedText(count: Int) -> String {
    guard count > 0 else { return "" }
    return "\(count) \(count == 1 ? "file" : "files") "
}

/// Full commit-button title. Port of `getCommittingButtonTitle`.
public func commitButtonTitle(branch: String?, filesToBeCommittedCount: Int, isAmending: Bool, isCommitting: Bool) -> String {
    let verb: String
    if isAmending {
        verb = isCommitting ? "Amending" : "Amend"
    } else {
        verb = isCommitting ? "Committing" : "Commit"
    }
    if isAmending { return "\(verb) last commit" }
    guard let branch else { return verb }
    return "\(verb) \(filesToBeCommittedText(count: filesToBeCommittedCount))to \(branch)"
}

/// Placeholder summary for a single selected file.
/// Port of `getPlaceholderMessage` in `filter-changes-list.tsx`.
public func placeholderSummary(for files: [WorkingDirectoryFileChange], isTutorialRepository: Bool = false) -> String {
    guard files.count == 1, !isTutorialRepository, let file = files.first else {
        return "Summary (required)"
    }
    let fileName = (file.path as NSString).lastPathComponent
    switch file.status.kind {
    case .new, .untracked: return "Create \(fileName)"
    case .deleted: return "Delete \(fileName)"
    default: return "Update \(fileName)"
    }
}

/// Whether a single-file selection prepopulates the summary affordance.
public func shouldPrepopulateCommitSummary(fileCount: Int, isTutorialRepository: Bool = false) -> Bool {
    fileCount == 1 && !isTutorialRepository
}

// MARK: - Commit message formatting

/// Format summary + description + trailers into a git commit message.
/// Port of `lib/format-commit-message.ts` (trailer merge via
/// `git interpret-trailers` happens in `LiveGitService.commit`; here the
/// trailers are appended in `Signed-off-by`-style blocks).
public func formatCommitMessage(summary: String, description: String?, trailers: [Trailer]) -> String {
    var message = "\(summary)\n\n\(description ?? "")\n"
        .replacingOccurrences(of: "\\s+$", with: "\n", options: .regularExpression)
    for trailer in trailers {
        if !message.hasSuffix("\n") { message += "\n" }
        message += "\(trailer.token): \(trailer.value)\n"
    }
    return message
}

// MARK: - Co-authors

/// Co-author trailers for known authors only (unknown authors trigger the
/// confirm sheet first). Port of `getCoAuthorTrailers`.
public func coAuthorTrailers(for coAuthors: [Author]) -> [Trailer] {
    coAuthors.compactMap { author in
        if case .known(let name, let email, _) = author {
            return Trailer(token: "Co-Authored-By", value: "\(name) <\(email)>")
        }
        return nil
    }
}

public func unknownCoAuthors(in coAuthors: [Author]) -> [Author] {
    coAuthors.filter {
        if case .unknown = $0 { return true }
        return false
    }
}

public func authorDisplayName(_ author: Author) -> String {
    switch author {
    case .known(let name, let email, _): return "\(name) <\(email)>"
    case .unknown(let username, _): return username
    }
}

// MARK: - Autocompletion (triggers)

/// A completion suggestion for the commit box popup.
public struct CommitAutocompleteItem: Sendable, Equatable, Identifiable {
    public enum Kind: Sendable, Equatable {
        case coAuthor
        case emoji
        case branch
    }
    public var id: String { "\(kind)-\(text)" }
    public var kind: Kind
    public var text: String
    public var detail: String?

    public init(kind: Kind, text: String, detail: String? = nil) {
        self.kind = kind
        self.text = text
        self.detail = detail
    }
}

/// Detect an `@mention` query immediately before `cursor` (UTF-16 offset).
/// Trigger regex port of `user-autocompletion-provider.tsx`:
/// `/(?:^|\n| )(?:@)([a-z\d\\+-][a-z\d_-]*)?/g`.
public func coAuthorQuery(in text: String, cursor: Int) -> String? {
    let ns = text as NSString
    let clamped = max(0, min(cursor, ns.length))
    let prefix = ns.substring(to: clamped)
    let pattern = "(?:^|\\n| )@([A-Za-z0-9\\\\+\\-][A-Za-z0-9_\\-]*)?$"
    guard let regex = try? NSRegularExpression(pattern: pattern),
          let match = regex.firstMatch(
            in: prefix, range: NSRange(prefix.startIndex..., in: prefix)),
          match.numberOfRanges >= 2,
          let range = Range(match.range(at: 1), in: prefix)
    else { return nil }
    return String(prefix[range])
}

/// Detect a `:emoji:` query immediately before `cursor`.
/// Trigger regex port of `emoji-autocompletion-provider.tsx`.
public func emojiQuery(in text: String, cursor: Int) -> String? {
    let ns = text as NSString
    let clamped = max(0, min(cursor, ns.length))
    let prefix = ns.substring(to: clamped)
    let pattern = "(?:^|\\n| ):([a-z\\d\\\\+\\-][a-z\\d_]*)?$"
    guard let regex = try? NSRegularExpression(
        pattern: pattern, options: [.caseInsensitive]),
          let match = regex.firstMatch(
            in: prefix, range: NSRange(prefix.startIndex..., in: prefix)),
          match.numberOfRanges >= 2,
          let range = Range(match.range(at: 1), in: prefix)
    else { return nil }
    return String(prefix[range])
}

/// Filter local authors by a case-insensitive substring query.
public func filterCoAuthors(_ authors: [Author], query: String) -> [Author] {
    guard !query.isEmpty else { return Array(authors.prefix(25)) }
    return authors.filter {
        authorDisplayName($0).localizedCaseInsensitiveContains(query)
    }.prefix(25).map { $0 }
}

// NOTE (Tasks 3+5 merge): Task 3 stopped here with a branch-name provider
// (`filterBranches(_:query:)`, 25-result cap) awaiting Task 5's branch UI.
// Task 5 landed the real one — `filterBranches(_:filterText:)` in
// `Views/Branches/BranchModels.swift`, used by `BranchesContainer`/`BranchList`
// and covered by `HistoryTests` — so the Task 3 placeholder was removed to fix
// the duplicate declaration.

/// Small built-in emoji map for `:emoji:` completion (the reference app
/// loads the full gemoji set; a curated subset keeps the port dependency-free).
public let bundledEmoji: [(name: String, character: String)] = [
    ("tada", "🎉"), ("sparkles", "✨"), ("bug", "🐛"), ("fire", "🔥"),
    ("rocket", "🚀"), ("white_check_mark", "✅"), ("warning", "⚠️"),
    ("wastebasket", "🗑️"), ("art", "🎨"), ("zap", "⚡"),
    ("memo", "📝"), ("lock", "🔒"), ("recycle", "♻️"), ("test_tube", "🧪"),
    ("books", "📚"), ("wrench", "🔧"), ("green_heart", "💚"),
]

public func filterEmoji(query: String) -> [(name: String, character: String)] {
    guard !query.isEmpty else { return Array(bundledEmoji.prefix(25)) }
    return bundledEmoji.filter {
        $0.name.localizedCaseInsensitiveContains(query)
    }
}

// MARK: - Status display

/// Human-readable status name. Port of `mapStatus` (`lib/status.ts`).
public func displayName(for status: AppFileStatus) -> String {
    switch status.kind {
    case .new, .untracked: return "New"
    case .modified: return "Modified"
    case .deleted: return "Deleted"
    case .renamed: return "Renamed"
    case .copied: return "Copied"
    case .conflicted:
        if case .conflictedWithMarkers(_, _, _, let count, _) = status {
            return count > 0 ? "Conflicted" : "Resolved"
        }
        return "Conflicted"
    }
}

/// SF Symbol for a file status. Maps `iconForStatus` octicons per Docs/03.
public func statusIconName(for status: AppFileStatus) -> String {
    switch status.kind {
    case .new, .untracked: return "plus.circle.fill"
    case .modified: return "pencil.circle.fill"
    case .deleted: return "minus.circle.fill"
    case .renamed: return "arrow.right.circle.fill"
    case .copied: return "doc.on.doc.fill"
    case .conflicted: return "exclamationmark.triangle.fill"
    }
}

/// Tri-state include value for a row checkbox.
public enum IncludeState: Sendable, Equatable {
    case on
    case off
    case mixed
}

/// Port of `ChangedFile`'s `checkboxValue` + `includedText`.
public func includeState(for file: WorkingDirectoryFileChange) -> IncludeState {
    switch file.selection.getSelectionType() {
    case .all: return .on
    case .none: return .off
    case .partial: return .mixed
    }
}

public func includeDescription(for file: WorkingDirectoryFileChange) -> String {
    switch includeState(for: file) {
    case .on: return "included"
    case .off: return "not included"
    case .mixed: return "partially included"
    }
}

// MARK: - Oversized files

/// Files over this size cannot be pushed to GitHub.com.
/// Port of `ReceiveLimit` in `lib/large-files.ts` (100 MiB).
public let oversizedFileThresholdBytes: Int64 = 100 * 1024 * 1024

/// Return the subset of `paths` (repo-relative) exceeding the threshold.
public func oversizedPaths(
    in repositoryPath: String,
    paths: [String],
    fileManager: FileManager = .default
) -> [String] {
    paths.filter { relative in
        let full = (repositoryPath as NSString).appendingPathComponent(relative)
        guard let attrs = try? fileManager.attributesOfItem(atPath: full),
              let size = attrs[.size] as? NSNumber
        else { return false }
        return size.int64Value > oversizedFileThresholdBytes
    }
}

// MARK: - Files-changed badge

public let maximumChangesCount = 300

/// Port of `FilesChangedBadge`: caps the pill at `300+`.
public func filesChangedBadgeText(count: Int) -> String {
    count > maximumChangesCount ? "\(maximumChangesCount)+" : "\(count)"
}
