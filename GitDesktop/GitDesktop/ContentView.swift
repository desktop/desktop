import SwiftUI

// MARK: - ContentView
// App shell (Docs/04-shell-toolbar.md §1, `ui/app.tsx`):
// Toolbar + Banner stack + NavigationSplitView(repo list | detail) + dialog
// stack. Detail switches on selection: Repository | Cloning | Missing | none
// (NoRepositories). Finder drop-to-add on the empty state is stubbed
// (Task 9 owns matching + persistence).

struct ContentView: View {
    @ObservedObject var store: AppStore

    @State private var repoFilter = ""
    /// Task 10 (Sparkle) owns update state; non-nil renders the row.
    @State private var updateAvailableVersion: String?

    init(store: AppStore) {
        self.store = store
    }

    var body: some View {
        VStack(spacing: 0) {
            ToolbarView(store: store)
            BannerHost(store: store, updateAvailableVersion: $updateAvailableVersion)
            NavigationSplitView {
                RepoListView(store: store, filterText: $repoFilter)
                    .navigationSplitViewColumnWidth(
                        min: store.widths.sidebar.min,
                        ideal: store.widths.sidebar.value,
                        max: store.widths.sidebar.max)
            } detail: {
                detailContent
            }
            .navigationSplitViewStyle(.balanced)
        }
        .frame(minWidth: 800, minHeight: 500)
        .background(DialogHost(store: store))
        .onAppear {
            #if DEBUG
            // Smoke-test seam: launch with GITDESKTOP_SEED_PREVIEW=1 to see
            // the shell against mock repos. Task 9 replaces this with real
            // persistence; release builds always start empty.
            if ProcessInfo.processInfo.environment["GITDESKTOP_SEED_PREVIEW"] != nil {
                populatePreviewData(store)
            }
            #endif
        }
    }

    @ViewBuilder
    private var detailContent: some View {
        switch store.selection {
        case .repository(let state):
            RepositoryView(store: store, repository: state.repository)
        case .cloning(let cloning):
            CloningRepositoryView(store: store, cloning: cloning)
        case .missing(let repository):
            MissingRepositoryView(store: store, repository: repository)
        case .none:
            if store.repositories.isEmpty {
                NoRepositoriesView(store: store)
            } else if let first = store.repositories.first {
                // Selection cleared (e.g. after removal picked nothing);
                // fall back to the first repository.
                RepositoryView(store: store, repository: first)
            } else {
                NoRepositoriesView(store: store)
            }
        }
    }
}

#Preview("With repositories") {
    ContentView(store: makePreviewStore())
        .frame(width: 1100, height: 700)
}

#Preview("Empty") {
    ContentView(store: AppStore())
        .frame(width: 1100, height: 700)
}
