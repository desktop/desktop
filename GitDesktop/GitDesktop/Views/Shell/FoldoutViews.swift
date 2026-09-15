import SwiftUI

// MARK: - FoldoutViews
// Popover contents for the one-open `Foldout` set (Docs/04-shell-toolbar.md
// §5). One open at a time is enforced by `AppStore.currentFoldout`; popovers
// dismiss via overlay click / Esc automatically. Full containers land in
// their owning tasks (Branches → 5, Worktrees → 8, Push/Pull actions → 7).

// MARK: Repository foldout

struct RepositoryFoldoutContent: View {
    @ObservedObject var store: AppStore
    @State private var filter = ""

    var body: some View {
        RepoListView(store: store, filterText: $filter, autofocusFilter: true)
            .frame(width: 320, height: 440)
    }
}

// MARK: Branch foldout (BranchesContainer stub — Task 5)

struct BranchFoldoutContent: View {
    @ObservedObject var store: AppStore
    @State private var filter = ""

    private var branches: [Branch] {
        let all = store.selectedState?.branches ?? []
        let needle = filter.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !needle.isEmpty else { return all }
        return all.filter { $0.name.lowercased().contains(needle) }
    }

    private var currentBranchName: String? {
        if case .valid(let branch) = store.selectedState?.tip { return branch.name }
        return nil
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                    .font(.system(size: 12))
                TextField("Filter branches", text: $filter)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12))
            }
            .padding(.horizontal, 8)
            .frame(height: 30)
            Divider()
            if branches.isEmpty {
                Text("No branches match")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(branches) { branch in
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.triangle.branch")
                            .foregroundStyle(.secondary)
                            .font(.system(size: 12))
                        Text(branch.name)
                            .font(.system(size: 12))
                            .lineLimit(1)
                            .truncationMode(.middle)
                        Spacer()
                        if branch.name == currentBranchName {
                            Image(systemName: "checkmark")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(.secondary)
                        }
                    }
                    .contentShape(Rectangle())
                    // TODO(Task 5): checkout on select; context menus
                    // Rename/Delete per `10-interactions.md` §3.
                    .onTapGesture { store.closeFoldout() }
                }
                .listStyle(.plain)
            }
            Divider()
            HStack {
                Button("New Branch…") {
                    if let id = store.selectedRepository?.id {
                        store.showPopup(.createBranch(
                            repositoryID: id, initialName: nil, targetCommitSHA: nil))
                    }
                    store.closeFoldout()
                }
                .buttonStyle(.link)
                .disabled(store.selectedRepository == nil)
                Spacer()
            }
            .padding(8)
        }
        .frame(width: 365, height: 380)
    }
}

// MARK: Add menu foldout

struct AddMenuFoldoutContent: View {
    @ObservedObject var store: AppStore

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            foldoutButton(title: "Clone Repository…", detail: "Clone from a URL") {
                store.showPopup(.cloneRepository(initialURL: nil))
                store.closeFoldout()
            }
            foldoutButton(title: "Create New Repository…", detail: "Create on your local drive") {
                store.showPopup(.createRepository(path: nil))
                store.closeFoldout()
            }
            foldoutButton(title: "Add Existing Repository…", detail: "Add from your local drive") {
                store.showPopup(.addRepository(path: nil))
                store.closeFoldout()
            }
        }
        .padding(6)
        .frame(width: 280)
    }

    private func foldoutButton(title: String, detail: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.system(size: 12, weight: .semibold))
                Text(detail).font(.system(size: 11)).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: Push/pull foldout (Fetch / Force push options)

struct PushPullFoldoutContent: View {
    @ObservedObject var store: AppStore
    var pushPull: PushPullViewState

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            foldoutButton(
                title: fetchTitle,
                detail: "Fetch the remote without merging"
                // TODO(Task 7): dispatcher.fetch(UserInitiatedTask).
            ) {
                store.closeFoldout()
            }
            if pushPull.showsForcePushMenuItem {
                foldoutButton(
                    title: forcePushTitle,
                    detail: "Overwrite the remote branch"
                    // TODO(Task 6/7): confirmOrForcePush + warn-force-push dialog.
                ) {
                    if let id = store.selectedRepository?.id,
                       let remote = remoteName {
                        store.showPopup(.confirmForcePush(
                            repositoryID: id, upstreamBranch: "\(remote)/branch"))
                    }
                    store.closeFoldout()
                }
            }
        }
        .padding(6)
        .frame(width: 300)
    }

    private var remoteName: String? { store.selectedState?.remote?.name }

    private var fetchTitle: String {
        remoteName.map { "Fetch \($0)" } ?? "Fetch"
    }

    private var forcePushTitle: String {
        remoteName.map { "Force push \($0)…" } ?? "Force push…"
    }

    private func foldoutButton(title: String, detail: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.system(size: 12, weight: .semibold))
                Text(detail).font(.system(size: 11)).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: Worktree foldout (WorktreeList stub — Task 8)

struct WorktreeFoldoutContent: View {
    @ObservedObject var store: AppStore

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                Image(systemName: "tree")
                    .foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 1) {
                    Text(store.selectedRepository?.name ?? "No repository")
                        .font(.system(size: 12, weight: .semibold))
                        .lineLimit(1)
                    Text("Main worktree")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "checkmark")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(8)
            Divider()
            // TODO(Task 8): full WorktreeList (Main/Linked, filter, switch +
            // state transfer, Add/Rename/Delete + failed dialog).
            HStack {
                Button("New Worktree…") {
                    if let id = store.selectedRepository?.id {
                        store.showPopup(.addWorktree(
                            repositoryID: id,
                            initialBranchName: nil,
                            initialWorktreeName: nil))
                    }
                    store.closeFoldout()
                }
                .buttonStyle(.link)
                .disabled(store.selectedRepository == nil)
                Spacer()
            }
            .padding(8)
        }
        .frame(width: 320)
    }
}

#Preview {
    HStack {
        BranchFoldoutContent(store: makePreviewStore())
        WorktreeFoldoutContent(store: makePreviewStore())
    }
    .padding()
}
