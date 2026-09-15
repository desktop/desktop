import Foundation

/// A stash entry. Port of `IStashEntry` in `models/stash-entry.ts`.
/// Files are `.notLoaded`/`.loading` until Task 8 resolves the diff.
public struct StashEntry: Sendable, Equatable, Identifiable {
    /// Fully qualified name, e.g. `refs/stash@{0}`.
    public var name: String
    public var branchName: String
    public var stashSha: String
    public var files: StashedFileChanges
    public var tree: String
    public var parents: [String]

    public init(
        name: String,
        branchName: String,
        stashSha: String,
        files: StashedFileChanges = .notLoaded,
        tree: String,
        parents: [String]
    ) {
        self.name = name
        self.branchName = branchName
        self.stashSha = stashSha
        self.files = files
        self.tree = tree
        self.parents = parents
    }

    public var id: String { name }
}

public enum StashedChangesLoadState: String, Sendable {
    case notLoaded = "NotLoaded"
    case loading = "Loading"
    case loaded = "Loaded"
}

public enum StashedFileChanges: Sendable, Equatable {
    case notLoaded
    case loading
    case loaded(files: [CommittedFileChange])

    public var kind: StashedChangesLoadState {
        switch self {
        case .notLoaded: return .notLoaded
        case .loading: return .loading
        case .loaded: return .loaded
        }
    }
}
