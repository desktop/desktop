import SwiftUI

// MARK: - FilesChangedBadge
// Port of `electron/app/src/ui/changes/files-changed-badge.tsx`: count pill
// on the Changes tab (caps at `300+`; system number formatting per scope).

public struct FilesChangedBadge: View {
    public var count: Int

    public init(count: Int) {
        self.count = count
    }

    public var body: some View {
        Text(filesChangedBadgeText(count: count))
            .font(.caption)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color(nsColor: .controlBackgroundColor))
            .clipShape(Capsule())
            .accessibilityLabel("\(count) changed files")
    }
}

// MARK: - CommitWarningView
// Port of `commit-warning.tsx`: icon + message band above the commit button.

public enum CommitWarningStyle: Sendable {
    case warning
    case information
    case error
}

public struct CommitWarningView: View {
    public var style: CommitWarningStyle
    public var message: String

    public init(style: CommitWarningStyle, message: String) {
        self.style = style
        self.message = message
    }

    public var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: iconName)
                .foregroundStyle(iconColor)
            Text(message)
                .font(.callout)
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(background)
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private var iconName: String {
        switch style {
        case .warning: return "exclamationmark.triangle.fill"
        case .information: return "info.circle.fill"
        case .error: return "octagon.fill"
        }
    }

    private var iconColor: Color {
        switch style {
        case .warning: return .yellow
        case .information: return .blue
        case .error: return .red
        }
    }

    private var background: Color {
        switch style {
        case .warning: return Color.yellow.opacity(0.15)
        case .information: return Color.blue.opacity(0.1)
        case .error: return Color.red.opacity(0.12)
        }
    }
}

// MARK: - ChangesSidebarView
// Port of `changes/sidebar.tsx` + `filter-changes-list.tsx` (list half):
// filter box + options, virtualized working-dir list, stash-entry row,
// `FilesChangedBadge`, oversized/LFS gate warning, `CommitWarning`s,
// `UndoCommit` slide. The commit form itself is `CommitBoxView` below.

public struct ChangesSidebarView: View {
    @ObservedObject public var changes: ChangesStore

    public init(changes: ChangesStore) {
        self.changes = changes
    }

    public var body: some View {
        VStack(spacing: 0) {
            if changes.showChangesFilter {
                filterRow
            }
            listHeader
            Divider()
            fileList
            if let stash = changes.stashEntry {
                Divider()
                stashRow(stash)
            }
            if let recent = changes.mostRecentLocalCommit,
               changes.commitToAmend == nil {
                Divider()
                undoCommitRow(commit: recent)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.5), value: changes.mostRecentLocalCommit?.sha)
    }

    // MARK: Filter

    private var filterRow: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("Filter changed files", text: filterTextBinding)
                .textFieldStyle(.plain)
                .accessibilityLabel("Filter changed files")
            if !changes.filter.filterText.isEmpty {
                Button {
                    changes.setFilterText("")
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear filter")
            }
            Button {
                changes.filterOptionsExpanded.toggle()
            } label: {
                Image(systemName: "line.3.horizontal.decrease.circle")
                    .foregroundColor(
                        changes.filter.countActiveFilterOptions() > 0
                            ? .accentColor : .secondary)
            }
            .buttonStyle(.plain)
            .popover(isPresented: $changes.filterOptionsExpanded) {
                filterOptions
                    .padding(10)
                    .frame(width: 220)
            }
            .accessibilityLabel("Filter options")
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
    }

    private var filterTextBinding: Binding<String> {
        Binding(
            get: { changes.filter.filterText },
            set: { changes.setFilterText($0) })
    }

    private var filterOptions: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Show only:")
                .font(.caption)
                .foregroundStyle(.secondary)
            Toggle("Included in commit", isOn: includedBinding)
            Toggle("Excluded from commit", isOn: excludedBinding)
            Divider()
            Toggle("New files", isOn: newBinding)
            Toggle("Modified files", isOn: modifiedBinding)
            Toggle("Deleted files", isOn: deletedBinding)
        }
        .toggleStyle(.checkbox)
    }

    private var includedBinding: Binding<Bool> {
        Binding(
            get: { changes.filter.isIncludedInCommit },
            set: { changes.filter.isIncludedInCommit = $0 })
    }

    private var excludedBinding: Binding<Bool> {
        Binding(
            get: { changes.filter.isExcludedFromCommit },
            set: { changes.filter.isExcludedFromCommit = $0 })
    }

    private var newBinding: Binding<Bool> {
        Binding(
            get: { changes.filter.isNewFile },
            set: { changes.filter.isNewFile = $0 })
    }

    private var modifiedBinding: Binding<Bool> {
        Binding(
            get: { changes.filter.isModifiedFile },
            set: { changes.filter.isModifiedFile = $0 })
    }

    private var deletedBinding: Binding<Bool> {
        Binding(
            get: { changes.filter.isDeletedFile },
            set: { changes.filter.isDeletedFile = $0 })
    }

    // MARK: List

    private var listHeader: some View {
        HStack(spacing: 6) {
            TriStateCheckbox(
                state: headerIncludeState,
                action: { changes.setIncludeAll(headerIncludeState != .on) }
            )
            .help("Stage or unstage all files")
            Text("\(changes.allFiles.count) changed files")
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            FilesChangedBadge(count: changes.allFiles.count)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
    }

    private var headerIncludeState: IncludeState {
        switch changes.includeAllState {
        case true: return .on
        case false: return .off
        default: return .mixed
        }
    }

    private var fileList: some View {
        Group {
            if changes.allFiles.isEmpty {
                noChangesView
            } else if changes.visibleFiles.isEmpty {
                noResultsView
            } else {
                List(selection: $changes.selectedFileIDs) {
                    ForEach(changes.visibleFiles) { file in
                        ChangedFileRow(
                            changes: changes,
                            file: file,
                            isSelected: changes.selectedFileIDs.contains(file.id))
                            .tag(file.id)
                    }
                }
                .listStyle(.plain)
                .onKeyPress { press in
                    if press.key == .space || press.key == .return {
                        toggleSelected()
                        return .handled
                    }
                    return .ignored
                }
            }
        }
        .frame(minHeight: 120)
    }

    private func toggleSelected() {
        let files = changes.visibleFiles.filter {
            changes.selectedFileIDs.contains($0.id)
        }
        guard !files.isEmpty else { return }
        let anyExcluded = files.contains {
            $0.selection.getSelectionType() == .none
        }
        for file in files {
            changes.setInclude(file, include: anyExcluded)
        }
    }

    private var noChangesView: some View {
        VStack(spacing: 4) {
            Text("No changes")
                .font(.headline)
            Text("All changes are committed.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    private var noResultsView: some View {
        VStack(spacing: 4) {
            Text(changes.filter.noResultsMessage() ?? "No matching files")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Clear filter") {
                changes.clearFilter()
            }
            .buttonStyle(.link)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    // MARK: Stash row

    private func stashRow(_ stash: StashEntry) -> some View {
        Button {
            changes.showingStash.toggle()
        } label: {
            HStack {
                Image(systemName: "archivebox")
                Text("Stash: \(stash.branchName)")
                    .lineLimit(1)
                    .truncationMode(.middle)
                Spacer()
                Text(changes.showingStash ? "Hide" : "View stash")
                    .foregroundColor(.accentColor)
            }
            .font(.callout)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(changes.showingStash ? "Hide stash" : "View stash")
        .help("Switches the selection to the stash (viewer lands in Task 8)")
    }

    // MARK: Undo slide

    /// `UndoCommit` slide (500ms, per `sidebar.tsx`). Execution (local-only
    /// guard + confirm) is Task 8; this row routes through the global popup.
    private func undoCommitRow(commit: Commit) -> some View {
        HStack {
            Image(systemName: "arrow.uturn.backward")
            Text("Committed \(commit.summary)")
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer()
            Button("Undo") {
                changes.store.showPopup(.warnLocalChangesBeforeUndo(
                    repositoryID: changes.repository.id,
                    commitSHA: commit.sha,
                    isWorkingDirectoryClean: changes.allFiles.isEmpty))
            }
            .disabled(changes.isCommitting)
        }
        .font(.callout)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
    }
}
