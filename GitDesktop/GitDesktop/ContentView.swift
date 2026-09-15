import SwiftUI

// MARK: - ContentView
// App shell (Docs/04-shell-toolbar.md §1, `ui/app.tsx`):
// Toolbar + Banner stack + NavigationSplitView(repo list | detail) + dialog
// stack. Detail switches on selection: Repository | Cloning | Missing | none
// (NoRepositories). Finder drop-to-add on the empty state is stubbed
// (Task 9 owns matching + persistence).

struct ContentView: View {
    @ObservedObject var store: AppStore
    @ObservedObject var updater: UpdateService

    @State private var repoFilter = ""
    /// Task 10 (Sparkle) owns update state; non-nil renders the row.
    @State private var updateAvailableVersion: String?
    @State private var didRestore = false
    @State private var welcomeCompleted = RepositoryPersistence.hasShownWelcomeFlow

    init(store: AppStore, updater: UpdateService) {
        self.store = store
        self.updater = updater
    }

    var body: some View {
        Group {
            if shouldShowWelcome {
                WelcomeView(store: store, onComplete: { welcomeCompleted = true })
            } else {
                mainShell
            }
        }
        .onAppear(perform: restoreOnce)
        .onChange(of: store.repositories) { _, _ in
            // Task 9 owns persistence (replaces the preview seam in release).
            if didRestore { store.persistRepositories() }
        }
    }

    private var shouldShowWelcome: Bool {
        // Cold start → welcome → create/clone/add → changes.
        // Release always starts empty until the user adds a repo; the welcome
        // flow is shown once (gated by `has-shown-welcome-flow`).
        didRestore && !welcomeCompleted && store.repositories.isEmpty && !RepositoryPersistence.hasShownWelcomeFlow
    }

    private var mainShell: some View {
        VStack(spacing: 0) {
            ToolbarView(store: store)
            BannerHost(store: store, updateAvailableVersion: $updateAvailableVersion)
            UpdateBannerHost(updater: updater, store: store)
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
    }

    private func restoreOnce() {
        guard !didRestore else { return }
        didRestore = true
        // Drive the legacy Task-2 update row from the Task-10 updater state
        // (kept for compat; `UpdateBannerHost` renders progress states).
        updateAvailableVersion = updater.bannerVersion
        #if DEBUG
        if ProcessInfo.processInfo.environment["GITDESKTOP_SEED_PREVIEW"] != nil {
            populatePreviewData(store)
            return
        }
        #endif
        // Task 9: restore persisted repositories (release always starts empty
        // on first launch, which routes to Welcome via `shouldShowWelcome`).
        store.restorePersistedRepositories()
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
    ContentView(store: makePreviewStore(), updater: UpdateService())
        .frame(width: 1100, height: 700)
}

#Preview("Empty") {
    ContentView(store: AppStore(), updater: UpdateService())
        .frame(width: 1100, height: 700)
}
