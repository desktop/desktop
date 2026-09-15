import SwiftUI

// MARK: - RepositoryView
// Main detail for a selected repository (Docs/04-shell-toolbar.md §1,
// `repository.tsx`). Left `repository-sidebar` TabBar (Changes + History,
// Ctrl+Tab toggles); right detail hosts the Changes UI (Task 3) and the
// history UI (Task 5). Task 2 renders the tab chrome + placeholders wired
// to the shared `AppStore` so later tasks plug into `tab` + `state`.

enum RepositoryTab: String, CaseIterable {
    case changes = "Changes"
    case history = "History"
}

struct RepositoryView: View {
    @ObservedObject var store: AppStore
    var repository: Repository
    @State private var tab: RepositoryTab = .changes

    private var state: RepositoryState {
        store.repositoryStates[repository.hash] ?? RepositoryState(repository: repository)
    }

    private var changedCount: Int { state.workingDirectory.files.count }

    var body: some View {
        HSplitView {
            sidebar
                .frame(minWidth: 200, maxWidth: 350)
            detail
                .frame(minWidth: 300, maxWidth: .infinity, maxHeight: .infinity)
        }
        .ignoresSafeArea(.all, edges: .bottom)
        .onReceive(NotificationCenter.default.publisher(for: .gitDesktopMenuAction)) { note in
            guard let action = GitDesktopMenuAction.from(note) else { return }
            switch action {
            case .showChanges: tab = .changes
            case .showHistory: tab = .history
            case .goToCommitMessage: tab = .changes
            default: break
            }
        }
    }

    // MARK: Sidebar with TabBar

    private var sidebar: some View {
        VStack(spacing: 0) {
            tabBar
            Divider()
            tabSidebarContent
        }
    }

    private var tabBar: some View {
        HStack(spacing: 0) {
            ForEach(RepositoryTab.allCases, id: \.self) { item in
                Button {
                    tab = item
                } label: {
                    HStack(spacing: 4) {
                        Text(item.rawValue)
                        if item == .changes, changedCount > 0 {
                            FilesChangedBadge(count: changedCount)
                        }
                    }
                    .font(.system(size: 12, weight: tab == item ? .semibold : .regular))
                    .foregroundStyle(tab == item ? .primary : .secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .contentShape(Rectangle())
                    .background(tab == item ? Color(nsColor: .selectedContentBackgroundColor).opacity(0.5) : Color.clear)
                }
                .buttonStyle(.plain)
                .help("Show \(item.rawValue) (Ctrl+Tab to switch)")
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .background {
            // Ctrl+Tab toggles Changes/History (mirrors `repository.tsx`).
            Button("Toggle tab") {
                tab = tab == .changes ? .history : .changes
            }
            .keyboardShortcut("\t", modifiers: .control)
            .opacity(0)
            .frame(width: 0, height: 0)
        }
    }

    private var tabSidebarContent: some View {
        Group {
            switch tab {
            case .changes:
                // TODO(Task 3): ChangesSidebar (virtualized list, tri-state
                // checkboxes, PathLabel, filter, stash row).
                SidebarPlaceholder(
                    title: "Changes",
                    detail: changedCount == 0
                        ? "No local changes."
                        : "\(changedCount) changed file(s). The file list lands in Task 3.")
            case .history:
                // TODO(Task 5): CompareSidebar (filter, History/Behind-Ahead,
                // infinite scroll) + CommitList.
                SidebarPlaceholder(title: "History", detail: "The commit list lands in Task 5.")
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: Detail

    private var detail: some View {
        Group {
            switch tab {
            case .changes:
                // TODO(Task 3): diff viewer (Task 4) + CommitBoxView.
                DetailPlaceholder(
                    title: "No changes selected",
                    detail: "Select files in the Changes list to preview diffs and commit. Lands in Tasks 3–4.")
            case .history:
                // TODO(Task 5): SelectedCommits + read-only diff.
                DetailPlaceholder(
                    title: "No commit selected",
                    detail: "Select a commit in History to inspect it. Lands in Task 5.")
            }
        }
    }
}

// NOTE (Tasks 2+3 merge): the Task-2 shell declared a placeholder
// `FilesChangedBadge` here. Task 3 owns the real spec port of
// `files-changed-badge.tsx` (count pill capped at `300+`, system number
// formatting) as `public struct FilesChangedBadge` in
// `Views/Changes/ChangesSidebarView.swift`; the shell twin was removed to fix
// the duplicate declaration, and `tabBar` above uses the Task 3 type.

// MARK: - Placeholders

private struct SidebarPlaceholder: View {
    var title: String
    var detail: String

    var body: some View {
        VStack(spacing: 6) {
            Text(title)
                .font(.headline)
            Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}

private struct DetailPlaceholder: View {
    var title: String
    var detail: String

    var body: some View {
        VStack(spacing: 6) {
            Spacer()
            Text(title)
                .font(.title2)
            Text(detail)
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 420)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#Preview {
    let store = makePreviewStore()
    return RepositoryView(store: store, repository: store.repositories[0])
        .frame(width: 900, height: 560)
}
