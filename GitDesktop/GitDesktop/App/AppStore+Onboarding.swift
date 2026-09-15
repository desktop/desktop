import Foundation

// MARK: - AppStore+Onboarding (Task 9 additive seam)
// Persistence + repository add/locate helpers. Task 1/2 own `AppState.swift`;
// this extension only adds Task 9 behavior so parallel tasks keep compiling.

@MainActor
public extension AppStore {
    // MARK: Persistence

    func persistRepositories() {
        RepositoryPersistence.save(repositories, selectedID: selectedRepository?.id)
    }

    func restorePersistedRepositories() {
        let (repos, selectedID) = RepositoryPersistence.load()
        guard !repos.isEmpty else { return }
        // Drop entries whose paths vanished → mark missing (port of the
        // reference startup missing-repo scan).
        let checked = repos.map { repo -> Repository in
            var copy = repo
            var isDir: ObjCBool = false
            if !FileManager.default.fileExists(atPath: repo.path, isDirectory: &isDir) {
                copy.missing = true
            }
            return copy
        }
        setRepositories(checked)
        for repo in checked {
            if repositoryStates[repo.hash] == nil {
                repositoryStates[repo.hash] = RepositoryState(repository: repo)
            }
        }
        if let selectedID, let match = checked.first(where: { $0.id == selectedID }) {
            if match.missing {
                selectMissingRepository(match)
            } else {
                selectRepository(match)
            }
        } else if let first = checked.first {
            selectRepository(first)
        }
    }

    func nextRepositoryID() -> Int {
        RepositoryPersistence.nextID(for: repositories)
    }

    // MARK: Add / locate

    /// Add a local path: resolve toplevel, match existing else create.
    /// Returns the repository that was selected (or matched).
    @discardableResult
    func addLocalRepository(at path: String) async throws -> Repository {
        let toplevel = try await toplevelForPath(path) ?? path
        if let existing = RepositoryPersistence.matchExisting(repositories: repositories, toplevel: toplevel) {
            selectRepository(existing)
            return existing
        }
        let type = try await repositoryType(at: toplevel)
        switch type {
        case .bare:
            throw GitError(kind: nil, args: ["add", toplevel], stdout: "", stderr: "The path is a bare repository, which cannot be opened.", exitCode: 128)
        case .unsafe(let unsafePath):
            throw GitError(kind: .unsafeDirectory, args: ["add", toplevel], stdout: "", stderr: "Git blocked this repository as dubiously owned: \(unsafePath)", exitCode: 128)
        case .missing:
            throw GitError(kind: .notAGitRepository, args: ["add", toplevel], stdout: "", stderr: "The path is not a git repository.", exitCode: 128)
        case .regular(let top, let gitDir):
            let repo = Repository(path: top, id: nextRepositoryID(), gitDir: gitDir)
            addRepositories([repo])
            persistRepositories()
            return repo
        }
    }

    /// Relocate a missing repository to a new path.
    func relocateRepository(_ repository: Repository, to newPath: String) async throws -> Repository {
        let toplevel = try await toplevelForPath(newPath) ?? newPath
        guard let index = repositories.firstIndex(where: { $0.id == repository.id }) else {
            return repository
        }
        var updated = repositories[index]
        // Repository.path is immutable; rebuild preserving id/alias/tutorial flag.
        updated = Repository(
            path: toplevel, id: updated.id, missing: false,
            alias: updated.alias,
            workflowPreferences: updated.workflowPreferences,
            isTutorialRepository: updated.isTutorialRepository)
        var merged = repositories
        merged[index] = updated
        setRepositories(merged)
        repositoryStates.removeValue(forKey: repository.hash)
        repositoryStates[updated.hash] = RepositoryState(repository: updated)
        selectRepository(updated)
        persistRepositories()
        return updated
    }
}
