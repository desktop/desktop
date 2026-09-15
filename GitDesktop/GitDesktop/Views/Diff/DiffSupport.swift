import Foundation

// MARK: - DiffSupport
// Shared data types for `Views/Diff/*`: file descriptors, file contents for
// expansion/highlighting, and status labels. Keeps Task 4 views decoupled
// from Task 3 (Changes) and Task 5 (History) selection types — both convert
// their file models into `DiffFileDescriptor`.

/// What the diff viewer needs to know about a file.
public struct DiffFileDescriptor: Sendable, Equatable, Identifiable {
    public var id: String
    public var path: String
    public var status: AppFileStatus
    /// False for committed (read-only) files; true for working-directory files.
    public var isSelectable: Bool

    public init(path: String, status: AppFileStatus, isSelectable: Bool) {
        self.path = path
        self.status = status
        self.isSelectable = isSelectable
        self.id = FileChange(path: path, status: status).id
    }

    public init(workingDirectoryFile file: WorkingDirectoryFileChange) {
        self.init(path: file.path, status: file.status, isSelectable: true)
    }

    public init(committedFile file: CommittedFileChange) {
        self.init(path: file.path, status: file.status, isSelectable: false)
    }
}

/// Old/new file contents backing syntax highlighting and hunk expansion.
/// Port of `IFileContents` (`diff/syntax-highlighting`).
public struct DiffFileContents: Sendable, Equatable {
    public var oldLines: [String]
    public var newLines: [String]
    public var canBeExpanded: Bool

    public init(oldLines: [String], newLines: [String], canBeExpanded: Bool = true) {
        self.oldLines = oldLines
        self.newLines = newLines
        self.canBeExpanded = canBeExpanded
    }
}

public enum DiffSupport {
    /// Human-readable status label. Port of `mapStatus`.
    public static func statusLabel(for status: AppFileStatus) -> String {
        status.kind.rawValue
    }

    /// Old path for renames/copies, if any.
    public static func oldPath(for status: AppFileStatus) -> String? {
        switch status {
        case .renamed(let oldPath, _, _): return oldPath
        case .copied(let oldPath, _, _): return oldPath
        default: return nil
        }
    }

    /// Whether a rename also includes modifications.
    public static func renameIncludesModifications(_ status: AppFileStatus) -> Bool {
        switch status {
        case .renamed(_, let modified, _): return modified
        case .copied(_, let modified, _): return modified
        default: return false
        }
    }

    /// Manual conflicts must be resolved outside the diff viewer.
    public static func isManualConflict(_ status: AppFileStatus) -> Bool {
        if case .manualConflict = status { return true }
        return false
    }
}
