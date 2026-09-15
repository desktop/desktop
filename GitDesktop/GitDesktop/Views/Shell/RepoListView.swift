import AppKit
import SwiftUI
import UniformTypeIdentifiers

// MARK: - RepoListView
// Grouped Recent/Other repository list (Docs/04-shell-toolbar.md §3,
// `repositories-list/*`). Row height 29; badges for ahead/behind + dirty dot;
// filter field; Add ▾ menu; pruned context menu (Show in Finder, alias,
// worktrees, Remove — no shell/editor/GitHub items per scope).
// Finder drop-to-add is stubbed: drops surface the Add dialog (Task 9 owns
// matching + multi-drop).

struct RepoListView: View {
    @ObservedObject var store: AppStore
    @Binding var filterText: String
    /// When hosted inside the repository foldout, autofocus the filter field.
    var autofocusFilter: Bool = false

    @FocusState private var filterFocused: Bool

    private var sections: [RepoListSection] {
        groupRepositoriesForList(
            repositories: store.repositories,
            recentIDs: store.recentRepositoryIDs,
            filter: filterText)
    }

    private var selectedID: Int? { store.selectedRepository?.id }

    var body: some View {
        VStack(spacing: 0) {
            filterField
            Divider()
            listContent
            Divider()
            addFooter
        }
        .onDrop(of: [.fileURL], isTargeted: nil, perform: handleDrop)
    }

    // MARK: Filter

    private var filterField: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
                .font(.system(size: 12))
            TextField("Filter repositories", text: $filterText)
                .textFieldStyle(.plain)
                .font(.system(size: 12))
                .focused($filterFocused)
                .accessibilityLabel("Filter repositories")
            if !filterText.isEmpty {
                Button {
                    filterText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                        .font(.system(size: 12))
                }
                .buttonStyle(.plain)
                .help("Clear filter")
                .accessibilityLabel("Clear filter")
            }
        }
        .padding(.horizontal, 8)
        .frame(height: 30)
        .background(Color(nsColor: .textBackgroundColor))
        .onAppear {
            if autofocusFilter { filterFocused = true }
        }
    }

    // MARK: List

    private var listContent: some View {
        Group {
            if store.repositories.isEmpty {
                emptyState
            } else if sections.isEmpty {
                noResultsState
            } else {
                List {
                    ForEach(sections, id: \.title) { section in
                        Section(header: Text(section.title).font(.caption)) {
                            ForEach(section.repositories) { repository in
                                RepoRowView(
                                    repository: repository,
                                    aheadBehind: store.repositoryStates[repository.hash]?.aheadBehind,
                                    changedFilesCount: store.repositoryStates[repository.hash]?.workingDirectory.files.count ?? 0,
                                    isSelected: repository.id == selectedID,
                                    store: store
                                )
                                .frame(height: 29)
                                .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                                .listRowSeparator(.hidden)
                            }
                        }
                    }
                }
                .listStyle(.sidebar)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "folder")
                .font(.system(size: 28))
                .foregroundStyle(.secondary)
            Text("No repositories yet")
                .font(.headline)
            Text("Add a repository below to get started.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    private var noResultsState: some View {
        VStack(spacing: 8) {
            Text("Sorry, I can't find that repository")
                .font(.headline)
            Text("Press Ctrl+O to add a local repository, and Ctrl+Shift+O to clone from anywhere within the app")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    // MARK: Add footer

    private var addFooter: some View {
        HStack {
            Menu {
                Button("Clone Repository…") {
                    store.showPopup(.cloneRepository(initialURL: nil))
                    store.closeFoldout()
                }
                .keyboardShortcut("O", modifiers: [.control, .shift])
                Button("Create New Repository…") {
                    store.showPopup(.createRepository(path: nil))
                    store.closeFoldout()
                }
                Button("Add Existing Repository…") {
                    store.showPopup(.addRepository(path: nil))
                    store.closeFoldout()
                }
                .keyboardShortcut("o", modifiers: .control)
            } label: {
                HStack(spacing: 4) {
                    Text("Add")
                    Image(systemName: "triangle.fill")
                        .font(.system(size: 7))
                }
                .frame(maxWidth: .infinity)
            }
            .menuStyle(.borderlessButton)
            .help("Add a repository (Clone, Create, Add)")
            .accessibilityLabel("Add a repository")
            Spacer()
        }
        .padding(.horizontal, 8)
        .frame(height: 32)
    }

    // MARK: Drop (stubbed — Task 9)

    private func handleDrop(_ providers: [NSItemProvider]) -> Bool {
        // TODO(Task 9): matchExistingRepository, multi-drop add, toplevel
        // resolution. For now surface the Add dialog with the first path.
        guard let provider = providers.first else { return false }
        _ = provider.loadObject(ofClass: URL.self) { url, _ in
            guard let url, url.isFileURL else { return }
            Task { @MainActor in
                store.showPopup(.addRepository(path: url.path))
            }
        }
        return true
    }
}

// MARK: - RepoRowView

struct RepoRowView: View {
    var repository: Repository
    var aheadBehind: AheadBehind?
    var changedFilesCount: Int
    var isSelected: Bool
    @ObservedObject var store: AppStore

    @State private var isHovering = false

    private var badge: String? {
        aheadBehindBadgeText(
            ahead: aheadBehind?.ahead ?? 0,
            behind: aheadBehind?.behind ?? 0)
    }

    var body: some View {
        Button {
            store.selectRepository(repository)
            store.closeFoldout()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: repository.missing ? "exclamationmark.triangle" : "folder")
                    .font(.system(size: 13))
                    .foregroundStyle(repository.missing ? .orange : .secondary)
                    .frame(width: 20)
                VStack(alignment: .leading, spacing: 0) {
                    Text(displayName)
                        .font(.system(size: 12))
                        .lineLimit(1)
                        .truncationMode(.middle)
                    if repository.alias != nil {
                        Text(repository.path)
                            .font(.system(size: 10))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                }
                Spacer(minLength: 4)
                if let badge {
                    Text(badge)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .accessibilityLabel(aheadBehindLabel)
                }
                if changedFilesCount > 0 {
                    Circle()
                        .fill(Color.orange)
                        .frame(width: 7, height: 7)
                        .help("There are uncommitted changes in this repository.")
                        .accessibilityLabel("Uncommitted changes")
                }
            }
            .padding(.horizontal, 8)
            .frame(height: 29)
            .contentShape(Rectangle())
            .background(
                RoundedRectangle(cornerRadius: 5)
                    .fill(isSelected ? Color.accentColor.opacity(0.85) : (isHovering ? Color(nsColor: .selectedContentBackgroundColor).opacity(0.4) : Color.clear))
            )
            .foregroundStyle(isSelected ? .white : .primary)
        }
        .buttonStyle(.plain)
        .onHover { isHovering = $0 }
        .help(repositoryRowTooltip(
            repository: repository,
            aheadBehind: aheadBehind,
            changedFilesCount: changedFilesCount))
        .accessibilityLabel(repository.name)
        .contextMenu { rowContextMenu }
    }

    private var displayName: String {
        if let alias = repository.alias, !alias.isEmpty {
            return "\(repository.name)"
        }
        return repository.name
    }

    private var aheadBehindLabel: String {
        let ahead = aheadBehind?.ahead ?? 0
        let behind = aheadBehind?.behind ?? 0
        var parts: [String] = []
        if ahead > 0 { parts.append("\(ahead) ahead") }
        if behind > 0 { parts.append("\(behind) behind") }
        return parts.joined(separator: ", ")
    }

    @ViewBuilder
    private var rowContextMenu: some View {
        Button("Show in Finder") {
            NSWorkspace.shared.activateFileViewerSelecting(
                [URL(fileURLWithPath: repository.path)])
        }
        .disabled(repository.missing)
        Divider()
        Button(repository.alias == nil ? "Create Alias…" : "Change Alias…") {
            store.showPopup(.changeRepositoryAlias(repositoryID: repository.id))
        }
        if repository.alias != nil {
            Button("Remove Alias") {
                store.setAlias(nil, for: repository)
            }
        }
        Divider()
        Button("Show Worktrees") {
            store.selectRepository(repository)
            store.showFoldout(.worktree)
        }
        Button("New Worktree…") {
            store.showPopup(.addWorktree(
                repositoryID: repository.id,
                initialBranchName: nil,
                initialWorktreeName: nil))
        }
        Divider()
        let needsConfirm = Defaults.bool(Defaults.confirmRepoRemoval, default: true)
        Button(needsConfirm ? "Remove…" : "Remove") {
            if needsConfirm {
                store.showPopup(.removeRepository(repositoryID: repository.id))
            } else {
                store.removeRepository(repository)
            }
        }
    }
}

#Preview {
    RepoListView(store: makePreviewStore(), filterText: .constant(""))
        .frame(width: 280, height: 420)
}
