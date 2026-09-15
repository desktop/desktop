import SwiftUI
import UniformTypeIdentifiers

// MARK: - RepositoryViews
// No-repos / cloning / missing states (Docs/04-shell-toolbar.md §4,
// `no-repositories/*`, `missing-repository/*`, `cloning-repository/*`).
// Account pickers and CloneableRepository lists are deleted (GitHub);
// the generic-URL clone dialog lands in Task 9.

struct NoRepositoriesView: View {
    @ObservedObject var store: AppStore

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Text("Let's get started!")
                .font(.system(size: 28, weight: .light))
            Text("Add a repository to GitDesktop to start collaborating")
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
            HStack(spacing: 12) {
                getStartedButton(
                    systemIcon: "arrow.down.circle",
                    title: "Clone a Repository\nfrom the Internet…",
                    action: { store.showPopup(.cloneRepository(initialURL: nil)) },
                    autofocus: true
                )
                getStartedButton(
                    systemIcon: "plus.circle",
                    title: "Create a New Repository\non your Local Drive…",
                    action: { store.showPopup(.createRepository(path: nil)) }
                )
                getStartedButton(
                    systemIcon: "folder",
                    title: "Add an Existing Repository\nfrom your Local Drive…",
                    action: { store.showPopup(.addRepository(path: nil)) }
                )
            }
            .padding(.top, 8)
            HStack(spacing: 6) {
                Image(systemName: "lightbulb")
                    .foregroundStyle(.secondary)
                Text("ProTip! You can drag & drop an existing repository folder here to add it to GitDesktop.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
            .padding(.top, 8)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
        .onDrop(of: [.fileURL], isTargeted: nil) { _ in
            // TODO(Task 9): real drop-to-add (see RepoListView.handleDrop).
            store.showPopup(.addRepository(path: nil))
            return true
        }
    }

    private func getStartedButton(
        systemIcon: String,
        title: String,
        action: @escaping () -> Void,
        autofocus: Bool = false
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: systemIcon)
                    .font(.system(size: 28, weight: .light))
                Text(title)
                    .font(.system(size: 12))
                    .multilineTextAlignment(.center)
            }
            .frame(width: 170, height: 130)
        }
        .buttonStyle(.bordered)
    }
}

struct CloningRepositoryView: View {
    @ObservedObject var store: AppStore
    var cloning: CloningRepository

    var body: some View {
        VStack(spacing: 12) {
            Spacer()
            Text("Cloning \(cloning.name)…")
                .font(.headline)
            Text(cloning.url)
                .font(.caption)
                .foregroundStyle(.secondary)
            ProgressView()
                .progressViewStyle(.linear)
                .frame(width: 280)
            Button("Cancel") {
                // TODO(Task 9): cancel the in-flight clone via the clone
                // dispatcher and drop the CloningRepository selection.
                store.clearBanner()
            }
            .keyboardShortcut(.cancelAction)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityAnnouncement("Cloning \(cloning.name)")
    }
}

struct MissingRepositoryView: View {
    @ObservedObject var store: AppStore
    var repository: Repository

    var body: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 32))
                .foregroundStyle(.orange)
            Text("Repository not found")
                .font(.headline)
            Text("The repository at \(repository.path) could not be found. It may have been moved or deleted.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 420)
            HStack(spacing: 12) {
                Button("Locate…") {
                    // TODO(Task 9): NSOpenPanel locate + re-resolve path.
                    store.showPopup(.addRepository(path: nil))
                }
                .keyboardShortcut(.defaultAction)
                Button("Remove") {
                    store.showPopup(.removeRepository(repositoryID: repository.id))
                }
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}

#Preview {
    NoRepositoriesView(store: makePreviewStore())
        .frame(width: 700, height: 420)
}
