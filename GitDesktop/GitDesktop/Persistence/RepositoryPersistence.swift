import Foundation

// MARK: - RepositoryPersistence
// Task 9 persistence for the repository list + selection.
// The reference uses Dexie (`repositories-database.ts`); the native app
// persists a lightweight JSON snapshot in UserDefaults until Task 10 decides
// GRDB vs SwiftData (see Docs/11-build-plan.md §4). Only path/id/alias +
// tutorial flag survive; per-repo state is re-derived from git on launch.

public struct PersistedRepository: Codable, Sendable, Equatable {
    public var id: Int
    public var path: String
    public var alias: String?
    public var isTutorialRepository: Bool

    public init(id: Int, path: String, alias: String? = nil, isTutorialRepository: Bool = false) {
        self.id = id
        self.path = path
        self.alias = alias
        self.isTutorialRepository = isTutorialRepository
    }

    public init(_ repository: Repository) {
        self.id = repository.id
        self.path = repository.path
        self.alias = repository.alias
        self.isTutorialRepository = repository.isTutorialRepository
    }

    public func toRepository() -> Repository {
        Repository(path: path, id: id, alias: alias, isTutorialRepository: isTutorialRepository)
    }
}

public enum RepositoryPersistence {
    public static func save(
        _ repositories: [Repository],
        selectedID: Int?,
        in store: UserDefaults = .standard
    ) {
        let snapshots = repositories.map(PersistedRepository.init)
        if let data = try? JSONEncoder().encode(snapshots) {
            store.set(data, forKey: Defaults.persistedRepositories)
        }
        if let selectedID {
            store.set(selectedID, forKey: Defaults.lastSelectedRepositoryID)
        } else {
            store.removeObject(forKey: Defaults.lastSelectedRepositoryID)
        }
        Defaults.setRecentIDs(repositories.prefix(3).map(\.id), in: store)
    }

    public static func load(in store: UserDefaults = .standard) -> (repositories: [Repository], selectedID: Int?) {
        guard let data = store.data(forKey: Defaults.persistedRepositories),
              let snapshots = try? JSONDecoder().decode([PersistedRepository].self, from: data)
        else { return ([], nil) }
        let repositories = snapshots.map { $0.toRepository() }
        let selectedID = store.object(forKey: Defaults.lastSelectedRepositoryID) as? Int
        return (repositories, selectedID)
    }

    /// Next repository ID (max + 1, starting at 1). Port of the auto-increment
    /// in `repositories-database.ts`.
    public static func nextID(for repositories: [Repository]) -> Int {
        (repositories.map(\.id).max() ?? 0) + 1
    }

    /// Match an existing repository by resolved toplevel path.
    public static func matchExisting(repositories: [Repository], toplevel: String) -> Repository? {
        let normalized = (toplevel as NSString).standardizingPath
        return repositories.first {
            ($0.path as NSString).standardizingPath == normalized
        }
    }

    public static var hasShownWelcomeFlow: Bool {
        Defaults.bool(Defaults.hasShownWelcomeFlow, default: false)
    }

    public static func setHasShownWelcomeFlow(_ value: Bool = true) {
        Defaults.setBool(value, Defaults.hasShownWelcomeFlow)
    }
}
