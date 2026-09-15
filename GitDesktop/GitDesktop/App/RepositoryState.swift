import Foundation

// MARK: - RepositoryState
// Per-repository UI state skeleton. Port of the `IRepositoryState` fields
// Task 1 needs; Tasks 3–8 extend this struct additively (never redefine it).

/// Which file list is selected in the Changes view.
public enum ChangesSelectionKind: String, Sendable {
    case workingDirectory
    case stash
}

public struct ChangesSelection: Sendable, Equatable {
    public var kind: ChangesSelectionKind
    public var selectedFileIDs: [String]
    public var selectedStashedFileID: String?

    public init(
        kind: ChangesSelectionKind = .workingDirectory,
        selectedFileIDs: [String] = [],
        selectedStashedFileID: String? = nil
    ) {
        self.kind = kind
        self.selectedFileIDs = selectedFileIDs
        self.selectedStashedFileID = selectedStashedFileID
    }
}

/// Per-repository state (skeleton). Extended additively by later tasks.
public struct RepositoryState: Sendable, Equatable, Identifiable {
    public var repository: Repository
    public var workingDirectory: WorkingDirectoryStatus
    public var tip: Tip
    public var aheadBehind: AheadBehind?
    public var commitMessage: CommitMessage
    public var selection: ChangesSelection
    public var branches: [Branch]
    public var remote: Remote?

    public init(
        repository: Repository,
        workingDirectory: WorkingDirectoryStatus = WorkingDirectoryStatus(files: []),
        tip: Tip = .unknown,
        aheadBehind: AheadBehind? = nil,
        commitMessage: CommitMessage = .default,
        selection: ChangesSelection = ChangesSelection(),
        branches: [Branch] = [],
        remote: Remote? = nil
    ) {
        self.repository = repository
        self.workingDirectory = workingDirectory
        self.tip = tip
        self.aheadBehind = aheadBehind
        self.commitMessage = commitMessage
        self.selection = selection
        self.branches = branches
        self.remote = remote
    }

    public var id: Int { repository.id }
}
