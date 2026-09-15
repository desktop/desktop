import Foundation

// MARK: - Status
// Direct port of `electron/app/src/models/status.ts` plus the
// `mapStatus`/`convertToAppStatus` semantics from
// `electron/app/src/lib/status-parser.ts` and `lib/git/status.ts`.

/// Raw status code reported by git. Port of `GitStatusEntry`.
public enum GitStatusEntry: String, Codable, Sendable {
    case modified = "M"
    case added = "A"
    case deleted = "D"
    case renamed = "R"
    case copied = "C"
    case unchanged = "."
    case untracked = "?"
    case ignored = "!"
    case updatedButUnmerged = "U"
}

/// App-facing file state. Port of `AppFileStatusKind`.
public enum AppFileStatusKind: String, Codable, Sendable {
    case new = "New"
    case modified = "Modified"
    case deleted = "Deleted"
    case copied = "Copied"
    case renamed = "Renamed"
    case conflicted = "Conflicted"
    case untracked = "Untracked"
}

/// Status of a submodule. Port of `SubmoduleStatus`.
public struct SubmoduleStatus: Codable, Sendable, Equatable, Hashable {
    public var commitChanged: Bool
    public var modifiedChanges: Bool
    public var untrackedChanges: Bool

    public init(commitChanged: Bool, modifiedChanges: Bool, untrackedChanges: Bool) {
        self.commitChanged = commitChanged
        self.modifiedChanges = modifiedChanges
        self.untrackedChanges = untrackedChanges
    }
}

/// Conflict summary for unmerged entries. Port of `UnmergedEntrySummary`.
public enum UnmergedEntrySummary: String, Codable, Sendable {
    case addedByUs = "added-by-us"
    case deletedByUs = "deleted-by-us"
    case addedByThem = "added-by-them"
    case deletedByThem = "deleted-by-them"
    case bothDeleted = "both-deleted"
    case bothAdded = "both-added"
    case bothModified = "both-modified"
}

/// Details for conflicts that carry text markers (both-added / both-modified).
public struct TextConflictDetails: Sendable, Equatable, Hashable {
    public var action: UnmergedEntrySummary
    public var us: GitStatusEntry
    public var them: GitStatusEntry

    public init(action: UnmergedEntrySummary, us: GitStatusEntry, them: GitStatusEntry) {
        self.action = action
        self.us = us
        self.them = them
    }

    public var isTextConflict: Bool {
        (action == .bothAdded && us == .added && them == .added)
            || (action == .bothModified && us == .updatedButUnmerged && them == .updatedButUnmerged)
    }
}

/// Details for conflicts requiring a manual ours/theirs choice.
public struct ManualConflictDetails: Sendable, Equatable, Hashable {
    public var action: UnmergedEntrySummary
    public var us: GitStatusEntry
    public var them: GitStatusEntry

    public init(action: UnmergedEntrySummary, us: GitStatusEntry, them: GitStatusEntry) {
        self.action = action
        self.us = us
        self.them = them
    }
}

/// Raw porcelain entry before app mapping. Port of `FileEntry`.
public enum FileEntry: Sendable, Equatable {
    case ordinary(type: OrdinaryChangeType, index: GitStatusEntry?, workingTree: GitStatusEntry?, submoduleStatus: SubmoduleStatus?)
    case renamed(index: GitStatusEntry?, workingTree: GitStatusEntry?, submoduleStatus: SubmoduleStatus?, renameOrCopyScore: Int?)
    case copied(index: GitStatusEntry?, workingTree: GitStatusEntry?, submoduleStatus: SubmoduleStatus?, renameOrCopyScore: Int?)
    case conflicted(action: UnmergedEntrySummary, us: GitStatusEntry, them: GitStatusEntry, submoduleStatus: SubmoduleStatus?)
    case untracked(submoduleStatus: SubmoduleStatus?)

    public enum OrdinaryChangeType: String, Sendable {
        case added
        case modified
        case deleted
    }
}

/// App-facing file status. Port of `AppFileStatus`.
public enum AppFileStatus: Sendable, Equatable {
    case new(submoduleStatus: SubmoduleStatus?)
    case modified(submoduleStatus: SubmoduleStatus?)
    case deleted(submoduleStatus: SubmoduleStatus?)
    case copied(oldPath: String, renameIncludesModifications: Bool, submoduleStatus: SubmoduleStatus?)
    case renamed(oldPath: String, renameIncludesModifications: Bool, submoduleStatus: SubmoduleStatus?)
    case conflictedWithMarkers(action: UnmergedEntrySummary, us: GitStatusEntry, them: GitStatusEntry, conflictMarkerCount: Int, submoduleStatus: SubmoduleStatus?)
    case manualConflict(action: UnmergedEntrySummary, us: GitStatusEntry, them: GitStatusEntry, submoduleStatus: SubmoduleStatus?)
    case untracked(submoduleStatus: SubmoduleStatus?)

    public var kind: AppFileStatusKind {
        switch self {
        case .new: return .new
        case .modified: return .modified
        case .deleted: return .deleted
        case .copied: return .copied
        case .renamed: return .renamed
        case .conflictedWithMarkers, .manualConflict: return .conflicted
        case .untracked: return .untracked
        }
    }

    public var isConflicted: Bool { kind == .conflicted }

    public var isConflictWithMarkers: Bool {
        if case .conflictedWithMarkers = self { return true }
        return false
    }
}

// MARK: - File changes

/// A change to a file. Port of `FileChange`.
public struct FileChange: Sendable, Equatable, Identifiable {
    public var path: String
    public var status: AppFileStatus
    public var id: String {
        switch status {
        case .copied(let oldPath, _, _): return "\(status.kind.rawValue)+\(path)+\(oldPath)"
        case .renamed(let oldPath, _, _): return "\(status.kind.rawValue)+\(path)+\(oldPath)"
        default: return "\(status.kind.rawValue)+\(path)"
        }
    }

    public init(path: String, status: AppFileStatus) {
        self.path = path
        self.status = status
    }

    public var isDeleted: Bool { status.kind == .deleted }
    public var isNew: Bool { status.kind == .new }
    public var isModified: Bool { status.kind == .modified }
    public var isUntracked: Bool { status.kind == .untracked }
}

/// A working-directory change with commit selection. Port of `WorkingDirectoryFileChange`.
public struct WorkingDirectoryFileChange: Sendable, Equatable, Identifiable {
    public var path: String
    public var status: AppFileStatus
    public var selection: DiffSelection

    public var id: String {
        FileChange(path: path, status: status).id
    }

    public init(path: String, status: AppFileStatus, selection: DiffSelection) {
        self.path = path
        self.status = status
        self.selection = selection
    }

    public func withIncludeAll(_ include: Bool) -> WorkingDirectoryFileChange {
        withSelection(include ? selection.withSelectAll() : selection.withSelectNone())
    }

    public func withSelection(_ selection: DiffSelection) -> WorkingDirectoryFileChange {
        WorkingDirectoryFileChange(path: path, status: status, selection: selection)
    }

    public var isIncludedInCommit: Bool { selection.getSelectionType() == .all }
    public var isExcludedFromCommit: Bool { selection.getSelectionType() == .none }
}

/// A committed change. Port of `CommittedFileChange`.
public struct CommittedFileChange: Sendable, Equatable, Identifiable {
    public var path: String
    public var status: AppFileStatus
    /// Commitish pointing at the "after" version of this change.
    public var commitish: String
    public var parentCommitish: String

    public var id: String {
        FileChange(path: path, status: status).id
    }

    public init(path: String, status: AppFileStatus, commitish: String, parentCommitish: String) {
        self.path = path
        self.status = status
        self.commitish = commitish
        self.parentCommitish = parentCommitish
    }
}

/// Working-directory state. Port of `WorkingDirectoryStatus`.
public struct WorkingDirectoryStatus: Sendable, Equatable {
    public var files: [WorkingDirectoryFileChange]
    /// True when all files are included, false when none are, nil when partial.
    /// True for an empty file list (mirrors the original).
    public var includeAll: Bool?

    public init(files: [WorkingDirectoryFileChange], includeAll: Bool? = true) {
        self.files = files
        self.includeAll = includeAll
    }

    public static func fromFiles(_ files: [WorkingDirectoryFileChange]) -> WorkingDirectoryStatus {
        WorkingDirectoryStatus(files: files, includeAll: includeAllState(for: files))
    }

    public func withIncludeAllFiles(_ includeAll: Bool) -> WorkingDirectoryStatus {
        WorkingDirectoryStatus(files: files.map { $0.withIncludeAll(includeAll) }, includeAll: includeAll)
    }

    public func findFile(withID id: String) -> WorkingDirectoryFileChange? {
        files.first(where: { $0.id == id })
    }

    public func findFileIndex(withID id: String) -> Int {
        files.firstIndex(where: { $0.id == id }) ?? -1
    }

    private static func includeAllState(for files: [WorkingDirectoryFileChange]) -> Bool? {
        if files.isEmpty { return true }
        let allSelected = files.allSatisfy { $0.selection.getSelectionType() == .all }
        let noneSelected = files.allSatisfy { $0.selection.getSelectionType() == .none }
        if allSelected { return true }
        if noneSelected { return false }
        return nil
    }
}
