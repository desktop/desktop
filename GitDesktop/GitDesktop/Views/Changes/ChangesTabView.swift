import SwiftUI

// MARK: - ChangesTabView
// Composition of the Changes tab: `ChangesSidebarView` (file list) +
// `CommitBoxView` pinned at the bottom. Mirrors `changes/sidebar.tsx` →
// `FilterChangesList` (commit form pinned bottom, undo slide overlay).
// The file-detail diff beside this tab is Task 4's `SeamlessDiffSwitcher`;
// when `showingStash` is set, a placeholder notes the Task-8 viewer.

public struct ChangesTabView: View {
    @ObservedObject public var changes: ChangesStore

    public init(changes: ChangesStore) {
        self.changes = changes
    }

    public var body: some View {
        VStack(spacing: 0) {
            if changes.showingStash, let stash = changes.stashEntry {
                stashPlaceholder(stash)
            } else {
                ChangesSidebarView(changes: changes)
            }
            Divider()
            CommitBoxView(changes: changes)
        }
        .alert(
            "Error",
            isPresented: Binding(
                get: { changes.errorMessage != nil },
                set: { if !$0 { changes.errorMessage = nil } }),
            actions: {
                Button("OK") { changes.errorMessage = nil }
            },
            message: {
                Text(changes.errorMessage ?? "")
            })
    }

    private func stashPlaceholder(_ stash: StashEntry) -> some View {
        VStack(spacing: 8) {
            Image(systemName: "archivebox")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("Stash on \(stash.branchName)")
                .font(.headline)
            Text("The stash diff viewer lands in Task 8.")
                .font(.caption)
                .foregroundStyle(.secondary)
            Button("Back to changes") {
                changes.showingStash = false
            }
            .buttonStyle(.link)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}

// MARK: - Preview

#Preview("Changes tab") {
    ChangesTabPreview()
}

@MainActor
private struct ChangesTabPreview: View {
    @StateObject private var store: AppStore
    @StateObject private var changes: ChangesStore

    init() {
        let store = AppStore()
        let repository = Repository(path: "/tmp/mock-repo", id: 1)
        store.setRepositories([repository])
        store.selectRepository(repository)
        if var state = store.repositoryStates[repository.hash] {
            state.workingDirectory = .fromFiles([
                WorkingDirectoryFileChange(
                    path: "README.md",
                    status: .modified(submoduleStatus: nil),
                    selection: .fromInitialSelection(.all)),
                WorkingDirectoryFileChange(
                    path: "Sources/App.swift",
                    status: .new(submoduleStatus: nil),
                    selection: .fromInitialSelection(.none)),
                WorkingDirectoryFileChange(
                    path: "old-notes.txt",
                    status: .deleted(submoduleStatus: nil),
                    selection: .fromInitialSelection(.all)),
                WorkingDirectoryFileChange(
                    path: "new-untracked.txt",
                    status: .untracked(submoduleStatus: nil),
                    selection: .fromInitialSelection(.all)),
            ])
            store.updateRepositoryState(state)
        }
        let mock = MockGitService.preview
        let changes = ChangesStore(
            store: store,
            repository: repository,
            gitService: mock,
            branch: "main",
            commitAuthor: CommitIdentity(
                name: "Ada Lovelace", email: "ada@example.com",
                date: Date(), tzOffset: 0))
        changes.localAuthors = [
            .known(name: "Ada Lovelace", email: "ada@example.com", username: nil),
            .known(name: "Grace Hopper", email: "grace@example.com", username: nil),
        ]
        _store = StateObject(wrappedValue: store)
        _changes = StateObject(wrappedValue: changes)
    }

    var body: some View {
        ChangesTabView(changes: changes)
            .frame(width: 340, height: 640)
    }
}
