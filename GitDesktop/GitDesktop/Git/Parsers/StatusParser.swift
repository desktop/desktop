import Foundation

// MARK: - StatusParser
// Pure-function port of `electron/app/src/lib/status-parser.ts` plus the
// header reduction and `convertToAppStatus` logic from
// `electron/app/src/lib/git/status.ts`.
// All functions are pure and unit-testable without git installed.

/// One item of `git status --branch --porcelain=2 -z` output.
public enum StatusItem: Sendable, Equatable {
    case header(String)
    case entry(StatusEntry)
}

/// A parsed status entry (path + codes + optional rename source).
public struct StatusEntry: Sendable, Equatable {
    public var path: String
    public var statusCode: String
    public var submoduleStatusCode: String
    public var oldPath: String?
    public var renameOrCopyScore: Int?

    public init(
        path: String,
        statusCode: String,
        submoduleStatusCode: String,
        oldPath: String? = nil,
        renameOrCopyScore: Int? = nil
    ) {
        self.path = path
        self.statusCode = statusCode
        self.submoduleStatusCode = submoduleStatusCode
        self.oldPath = oldPath
        self.renameOrCopyScore = renameOrCopyScore
    }
}

public enum StatusParserError: Error, Equatable {
    case changedEntryParseError(String)
    case renamedEntryParseError(String)
    case missingOldPath
    case unmergedEntryParseError(String)
}

public enum StatusParser {
    // 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
    static let changedEntryPattern =
        #"^1 ([MADRCUTX?!.]{2}) (N\.\.\.|S[C.][M.][U.]) (\d+) (\d+) (\d+) ([a-f0-9]+) ([a-f0-9]+) ([\s\S]*?)$"#
    // 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path><sep><origPath>
    static let renamedEntryPattern =
        #"^2 ([MADRCUTX?!.]{2}) (N\.\.\.|S[C.][M.][U.]) (\d+) (\d+) (\d+) ([a-f0-9]+) ([a-f0-9]+) ([RC]\d+) ([\s\S]*?)$"#
    // u <xy> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
    static let unmergedEntryPattern =
        #"^u ([DAU]{2}) (N\.\.\.|S[C.][M.][U.]) (\d+) (\d+) (\d+) (\d+) ([a-f0-9]+) ([a-f0-9]+) ([a-f0-9]+) ([\s\S]*?)$"#

    /// Split NUL-delimited buffer output, keeping the trailing empty token
    /// semantics of the original `splitBuffer`.
    public static func splitNUL(_ data: Data) -> [Data] {
        var tokens: [Data] = []
        var start = data.startIndex
        for index in data.indices where data[index] == 0 {
            tokens.append(data[start..<index])
            start = data.index(after: index)
        }
        tokens.append(data[start...])
        return tokens
    }

    /// Parse `git status --porcelain=2 -z` buffer output.
    public static func parsePorcelainStatus(_ output: Data) throws -> [StatusItem] {
        var entries: [StatusItem] = []
        let tokens = splitNUL(output)
        var index = 0
        while index < tokens.count {
            let field = String(data: tokens[index], encoding: .utf8) ?? ""
            if field.hasPrefix("# ") && field.count > 2 {
                entries.append(.header(String(field.dropFirst(2))))
            } else if !field.isEmpty {
                let kind = field.prefix(1)
                switch kind {
                case "1":
                    entries.append(.entry(try parseChangedEntry(field)))
                case "2":
                    index += 1
                    let oldPath = index < tokens.count
                        ? (String(data: tokens[index], encoding: .utf8) ?? "")
                        : nil
                    entries.append(.entry(try parseRenamedOrCopiedEntry(field, oldPath: oldPath)))
                case "u":
                    entries.append(.entry(try parseUnmergedEntry(field)))
                case "?":
                    entries.append(.entry(parseUntrackedEntry(field)))
                case "!":
                    break // ignored
                default:
                    break
                }
            }
            index += 1
        }
        return entries
    }

    public static func parseChangedEntry(_ field: String) throws -> StatusEntry {
        let match = firstMatch(pattern: changedEntryPattern, in: field, groups: 8)
        guard let match else { throw StatusParserError.changedEntryParseError(field) }
        return StatusEntry(path: match[7], statusCode: match[0], submoduleStatusCode: match[1])
    }

    public static func parseRenamedOrCopiedEntry(_ field: String, oldPath: String?) throws -> StatusEntry {
        let match = firstMatch(pattern: renamedEntryPattern, in: field, groups: 9)
        guard let match else { throw StatusParserError.renamedEntryParseError(field) }
        guard let oldPath, !oldPath.isEmpty else { throw StatusParserError.missingOldPath }
        let score = Int(match[7].dropFirst()) ?? 0
        return StatusEntry(
            path: match[8], statusCode: match[0], submoduleStatusCode: match[1],
            oldPath: oldPath, renameOrCopyScore: score)
    }

    public static func parseUnmergedEntry(_ field: String) throws -> StatusEntry {
        let match = firstMatch(pattern: unmergedEntryPattern, in: field, groups: 10)
        guard let match else { throw StatusParserError.unmergedEntryParseError(field) }
        return StatusEntry(path: match[9], statusCode: match[0], submoduleStatusCode: match[1])
    }

    public static func parseUntrackedEntry(_ field: String) -> StatusEntry {
        StatusEntry(path: String(field.dropFirst(2)), statusCode: "??", submoduleStatusCode: "????")
    }

    // MARK: - Mapping

    public static func mapSubmoduleStatus(_ code: String) -> SubmoduleStatus? {
        guard code.hasPrefix("S"), code.count >= 4 else { return nil }
        let chars = Array(code)
        return SubmoduleStatus(
            commitChanged: chars[1] == "C",
            modifiedChanges: chars[2] == "M",
            untrackedChanges: chars[3] == "U")
    }

    /// Map raw XY + submodule codes to a `FileEntry`.
    /// Exhaustive table ported from `mapStatus` in `status-parser.ts`.
    public static func mapStatus(
        _ statusCode: String,
        submoduleStatusCode: String,
        renameOrCopyScore: Int? = nil
    ) -> FileEntry {
        let submoduleStatus = mapSubmoduleStatus(submoduleStatusCode)
        switch statusCode {
        case "??": return .untracked(submoduleStatus: submoduleStatus)
        case ".M": return .ordinary(type: .modified, index: .unchanged, workingTree: .modified, submoduleStatus: submoduleStatus)
        case "M.": return .ordinary(type: .modified, index: .modified, workingTree: .unchanged, submoduleStatus: submoduleStatus)
        case ".A": return .ordinary(type: .added, index: .unchanged, workingTree: .added, submoduleStatus: submoduleStatus)
        case "A.": return .ordinary(type: .added, index: .added, workingTree: .unchanged, submoduleStatus: submoduleStatus)
        case ".D": return .ordinary(type: .deleted, index: .unchanged, workingTree: .deleted, submoduleStatus: submoduleStatus)
        case "D.": return .ordinary(type: .deleted, index: .deleted, workingTree: .unchanged, submoduleStatus: submoduleStatus)
        case "R.": return .renamed(index: .renamed, workingTree: .unchanged, submoduleStatus: submoduleStatus, renameOrCopyScore: renameOrCopyScore)
        case ".R": return .renamed(index: .unchanged, workingTree: .renamed, submoduleStatus: submoduleStatus, renameOrCopyScore: renameOrCopyScore)
        case "C.": return .copied(index: .copied, workingTree: .unchanged, submoduleStatus: submoduleStatus, renameOrCopyScore: renameOrCopyScore)
        case ".C": return .copied(index: .unchanged, workingTree: .copied, submoduleStatus: submoduleStatus, renameOrCopyScore: renameOrCopyScore)
        case "AD": return .ordinary(type: .added, index: .added, workingTree: .deleted, submoduleStatus: submoduleStatus)
        case "AM": return .ordinary(type: .added, index: .added, workingTree: .modified, submoduleStatus: submoduleStatus)
        case "RM": return .renamed(index: .renamed, workingTree: .modified, submoduleStatus: submoduleStatus, renameOrCopyScore: renameOrCopyScore)
        case "RD": return .renamed(index: .renamed, workingTree: .deleted, submoduleStatus: submoduleStatus, renameOrCopyScore: renameOrCopyScore)
        case "DD": return .conflicted(action: .bothDeleted, us: .deleted, them: .deleted, submoduleStatus: submoduleStatus)
        case "AU": return .conflicted(action: .addedByUs, us: .added, them: .updatedButUnmerged, submoduleStatus: submoduleStatus)
        case "UD": return .conflicted(action: .deletedByThem, us: .updatedButUnmerged, them: .deleted, submoduleStatus: submoduleStatus)
        case "UA": return .conflicted(action: .addedByThem, us: .updatedButUnmerged, them: .added, submoduleStatus: submoduleStatus)
        case "DU": return .conflicted(action: .deletedByUs, us: .deleted, them: .updatedButUnmerged, submoduleStatus: submoduleStatus)
        case "AA": return .conflicted(action: .bothAdded, us: .added, them: .added, submoduleStatus: submoduleStatus)
        case "UU": return .conflicted(action: .bothModified, us: .updatedButUnmerged, them: .updatedButUnmerged, submoduleStatus: submoduleStatus)
        default: return .ordinary(type: .modified, index: nil, workingTree: nil, submoduleStatus: submoduleStatus)
        }
    }

    // MARK: - Headers

    public struct StatusHeaders: Sendable, Equatable {
        public var currentBranch: String?
        public var currentUpstreamBranch: String?
        public var currentTip: String?
        public var aheadBehind: AheadBehind?

        public init(
            currentBranch: String? = nil,
            currentUpstreamBranch: String? = nil,
            currentTip: String? = nil,
            aheadBehind: AheadBehind? = nil
        ) {
            self.currentBranch = currentBranch
            self.currentUpstreamBranch = currentUpstreamBranch
            self.currentTip = currentTip
            self.aheadBehind = aheadBehind
        }
    }

    /// Reduce `# branch.*` headers. Port of `parseStatusHeader` in `status.ts`.
    public static func parseHeaders(_ items: [StatusItem]) -> StatusHeaders {
        var headers = StatusHeaders()
        for item in items {
            guard case .header(let value) = item else { continue }
            if value.hasPrefix("branch.oid ") {
                let sha = String(value.dropFirst("branch.oid ".count))
                if sha.range(of: #"^[a-f0-9]+$"#, options: .regularExpression) != nil {
                    headers.currentTip = sha
                }
            } else if value.hasPrefix("branch.head ") {
                let branch = String(value.dropFirst("branch.head ".count))
                if branch != "(detached)" {
                    headers.currentBranch = branch
                }
            } else if value.hasPrefix("branch.upstream ") {
                headers.currentUpstreamBranch = String(value.dropFirst("branch.upstream ".count))
            } else if value.hasPrefix("branch.ab ") {
                let rest = String(value.dropFirst("branch.ab ".count))
                if let match = firstMatch(pattern: #"^\+(\d+) -(\d+)$"#, in: rest, groups: 2) {
                    if let ahead = Int(match[0]), let behind = Int(match[1]) {
                        headers.aheadBehind = AheadBehind(ahead: ahead, behind: behind)
                    }
                }
            }
        }
        return headers
    }

    // MARK: - App mapping

    public struct ConflictDetails: Sendable {
        public var conflictCountsByPath: [String: Int]
        public var binaryFilePaths: Set<String>

        public init(conflictCountsByPath: [String: Int] = [:], binaryFilePaths: Set<String> = []) {
            self.conflictCountsByPath = conflictCountsByPath
            self.binaryFilePaths = binaryFilePaths
        }
    }

    /// Known conflicted index codes (mirrors `conflictStatusCodes`).
    public static let conflictStatusCodes: Set<String> = ["DD", "AU", "UD", "UA", "DU", "AA", "UU"]

    /// Convert a `FileEntry` to an app-facing `AppFileStatus`.
    /// Port of `convertToAppStatus` in `lib/git/status.ts`.
    public static func convertToAppStatus(
        path: String,
        entry: FileEntry,
        oldPath: String? = nil,
        conflictDetails: ConflictDetails = ConflictDetails()
    ) -> AppFileStatus {
        switch entry {
        case .ordinary(let type, _, _, let submoduleStatus):
            switch type {
            case .added: return .new(submoduleStatus: submoduleStatus)
            case .modified: return .modified(submoduleStatus: submoduleStatus)
            case .deleted: return .deleted(submoduleStatus: submoduleStatus)
            }
        case .copied(_, _, let submoduleStatus, _) where oldPath != nil:
            return .copied(oldPath: oldPath!, renameIncludesModifications: false, submoduleStatus: submoduleStatus)
        case .renamed(let index, let workingTree, let submoduleStatus, let score) where oldPath != nil:
            let includesModifications = workingTree == .modified
                || (score.map { $0 < 100 } ?? false)
            _ = index
            return .renamed(oldPath: oldPath!, renameIncludesModifications: includesModifications, submoduleStatus: submoduleStatus)
        case .untracked(let submoduleStatus):
            return .untracked(submoduleStatus: submoduleStatus)
        case .conflicted(let action, let us, let them, let submoduleStatus):
            return parseConflictedState(
                action: action, us: us, them: them,
                path: path, submoduleStatus: submoduleStatus,
                conflictDetails: conflictDetails)
        default:
            return .modified(submoduleStatus: nil)
        }
    }

    private static func parseConflictedState(
        action: UnmergedEntrySummary,
        us: GitStatusEntry,
        them: GitStatusEntry,
        path: String,
        submoduleStatus: SubmoduleStatus?,
        conflictDetails: ConflictDetails
    ) -> AppFileStatus {
        switch action {
        case .bothAdded, .bothModified:
            if !conflictDetails.binaryFilePaths.contains(path) {
                return .conflictedWithMarkers(
                    action: action, us: us, them: them,
                    conflictMarkerCount: conflictDetails.conflictCountsByPath[path] ?? 0,
                    submoduleStatus: submoduleStatus)
            }
            return .manualConflict(action: action, us: us, them: them, submoduleStatus: submoduleStatus)
        default:
            return .manualConflict(action: action, us: us, them: them, submoduleStatus: submoduleStatus)
        }
    }

    // MARK: - Regex helper

    static func firstMatch(pattern: String, in text: String, groups: Int) -> [String]? {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        guard let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              match.numberOfRanges == groups + 1
        else { return nil }
        var out: [String] = []
        for i in 1...groups {
            let range = match.range(at: i)
            guard range.location != NSNotFound,
                  let swiftRange = Range(range, in: text)
            else { return nil }
            out.append(String(text[swiftRange]))
        }
        return out
    }
}
