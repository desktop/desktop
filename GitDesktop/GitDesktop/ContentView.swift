import SwiftUI

/// Task 1 placeholder shell. Compiles against the new `AppStore`;
/// Task 2 replaces this with the `NavigationSplitView` toolbar + repo list.
struct ContentView: View {
    @ObservedObject var store: AppStore

    init(store: AppStore) {
        self.store = store
    }

    var body: some View {
        Group {
            if let repository = store.selectedRepository {
                VStack(spacing: 8) {
                    Text(repository.name)
                        .font(.headline)
                    Text(repository.path)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let state = store.selectedState {
                        Text("\(state.workingDirectory.files.count) changed file(s)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding()
            } else {
                VStack(spacing: 8) {
                    Text("No repository selected")
                        .font(.headline)
                    Text("Add a repository to get started.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding()
            }
        }
        .frame(minWidth: 400, minHeight: 300)
    }
}

#Preview {
    ContentView(store: makePreviewStore())
}

@MainActor
private func makePreviewStore() -> AppStore {
    let store = AppStore()
    let repository = Repository(path: "/tmp/mock-repo", id: 1)
    store.setRepositories([repository])
    store.selectRepository(repository)
    return store
}
