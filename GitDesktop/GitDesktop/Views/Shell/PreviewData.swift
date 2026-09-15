import Foundation

// MARK: - PreviewData
// Task 2 preview + manual-verification data built on `MockGitService.preview`
// shapes. The shipped app starts empty (Task 9 owns persistence); `MyApp`
// seeds this only for `#if DEBUG` smoke-testing (see `MyApp.swift`).

@MainActor
public func makePreviewStore() -> AppStore {
    let store = AppStore()
    populatePreviewData(store)
    return store
}

/// Fill an empty store with smoke-test data. Used by previews and by
/// `ContentView` when `GITDESKTOP_SEED_PREVIEW=1` (DEBUG only, Task 9 owns
/// real persistence and removes this path).
@MainActor
public func populatePreviewData(_ store: AppStore) {
    guard store.repositories.isEmpty else { return }
    let repositories = previewRepositories()
    store.setRepositories(repositories)
    for repository in repositories {
        store.updateRepositoryState(previewState(for: repository))
    }
    if let first = repositories.first {
        store.selectRepository(first)
    }
}

public func previewRepositories() -> [Repository] {
    [
        Repository(path: "/Users/preview/Code/GitDesktop", id: 1),
        Repository(path: "/Users/preview/Code/personal-website", id: 2, alias: "Personal website"),
        Repository(path: "/Users/preview/Code/design-tokens", id: 3),
        Repository(path: "/Volumes/Archive/old-blog", id: 4, missing: true),
    ]
}

public func previewState(for repository: Repository) -> RepositoryState {
    switch repository.id {
    case 1:
        let main = Branch(
            name: "main", upstream: "origin/main",
            tip: BranchTip(sha: "abc1234567890"),
            type: .local, ref: "refs/heads/main")
        let feature = Branch(
            name: "feature/dark-toolbar", upstream: nil,
            tip: BranchTip(sha: "def9876543210"),
            type: .local, ref: "refs/heads/feature/dark-toolbar")
        let files = [
            WorkingDirectoryFileChange(
                path: "GitDesktop/GitDesktop/Views/Shell/ToolbarView.swift",
                status: .modified(submoduleStatus: nil),
                selection: .fromInitialSelection(.all)),
            WorkingDirectoryFileChange(
                path: "GitDesktop/GitDesktop/Views/Shell/RepoListView.swift",
                status: .new(submoduleStatus: nil),
                selection: .fromInitialSelection(.all)),
            WorkingDirectoryFileChange(
                path: "old-notes.txt",
                status: .deleted(submoduleStatus: nil),
                selection: .fromInitialSelection(.all)),
        ]
        return RepositoryState(
            repository: repository,
            workingDirectory: .fromFiles(files),
            tip: .valid(branch: main),
            aheadBehind: AheadBehind(ahead: 2, behind: 1),
            branches: [main, feature],
            remote: Remote(name: "origin", url: "https://example.com/GitDesktop.git"))
    case 2:
        let main = Branch(
            name: "main", upstream: "origin/main",
            tip: BranchTip(sha: "1111111111111"),
            type: .local, ref: "refs/heads/main")
        return RepositoryState(
            repository: repository,
            workingDirectory: .fromFiles([]),
            tip: .valid(branch: main),
            aheadBehind: AheadBehind(ahead: 0, behind: 0),
            branches: [main],
            remote: Remote(name: "origin", url: "https://example.com/personal-website.git"))
    case 3:
        let develop = Branch(
            name: "develop", upstream: nil,
            tip: BranchTip(sha: "2222222222222"),
            type: .local, ref: "refs/heads/develop")
        let files = [
            WorkingDirectoryFileChange(
                path: "tokens.json",
                status: .modified(submoduleStatus: nil),
                selection: .fromInitialSelection(.all)),
        ]
        return RepositoryState(
            repository: repository,
            workingDirectory: .fromFiles(files),
            tip: .valid(branch: develop),
            aheadBehind: nil,
            branches: [develop],
            remote: nil)
    default:
        return RepositoryState(repository: repository)
    }
}
