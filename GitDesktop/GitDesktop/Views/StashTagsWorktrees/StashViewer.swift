import SwiftUI

// MARK: - StashViewer
// Port of `electron/app/src/ui/stashing/stash-diff-viewer.tsx` +
// `stash-diff-header.tsx` (see Docs/07-branches-operations.md §5).
// Read-only: file list + selected-file detail. The full diff renderer is
// Task 4's `SeamlessDiffSwitcher`; here we show path/status/commitish until
// that lands, keeping this view compilable standalone.

public struct StashViewer: View {
    public var stashEntry: StashEntry
    public var files: [CommittedFileChange]
    public var isLoadingFiles: Bool
    public var selectedFileID: String?
    public var isRestoring: Bool
    public var isDiscarding: Bool
    public var onSelectFile: (CommittedFileChange) -> Void
    public var onRestore: () -> Void
    public var onDiscard: () -> Void

    public init(
        stashEntry: StashEntry,
        files: [CommittedFileChange] = [],
        isLoadingFiles: Bool = false,
        selectedFileID: String? = nil,
        isRestoring: Bool = false,
        isDiscarding: Bool = false,
        onSelectFile: @escaping (CommittedFileChange) -> Void = { _ in },
        onRestore: @escaping () -> Void = {},
        onDiscard: @escaping () -> Void = {}
    ) {
        self.stashEntry = stashEntry
        self.files = files
        self.isLoadingFiles = isLoadingFiles
        self.selectedFileID = selectedFileID
        self.isRestoring = isRestoring
        self.isDiscarding = isDiscarding
        self.onSelectFile = onSelectFile
        self.onRestore = onRestore
        self.onDiscard = onDiscard
    }

    private var selectedFile: CommittedFileChange? {
        files.first { $0.id == selectedFileID } ?? files.first
    }

    public var body: some View {
        VStack(spacing: 0) {
            StashDiffHeader(
                stashEntry: stashEntry,
                fileCount: files.count,
                isRestoring: isRestoring,
                isDiscarding: isDiscarding,
                onRestore: onRestore,
                onDiscard: onDiscard)
            Divider()
            HSplitView {
                fileList
                    .frame(minWidth: 180, idealWidth: 250, maxWidth: 500)
                detail
                    .frame(minWidth: 200)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Stash viewer")
    }

    @ViewBuilder
    private var fileList: some View {
        Group {
            if isLoadingFiles {
                VStack {
                    ProgressView("Loading stashed files…")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if files.isEmpty {
                VStack(spacing: 4) {
                    Text("No files in this stash")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(files, selection: Binding(
                    get: { selectedFileID },
                    set: { newValue in
                        if let file = files.first(where: { $0.id == newValue }) {
                            onSelectFile(file)
                        }
                    })) { file in
                        HStack(spacing: 8) {
                            FileStatusBadge(status: file.status)
                            Text(file.path)
                                .font(.system(size: 12))
                                .lineLimit(1)
                                .truncationMode(.middle)
                            Spacer()
                        }
                        .tag(file.id)
                        .contentShape(Rectangle())
                        .onTapGesture { onSelectFile(file) }
                    }
                    .listStyle(.sidebar)
            }
        }
    }

    @ViewBuilder
    private var detail: some View {
        if let file = selectedFile {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(file.path).font(.headline)
                    Spacer()
                    Text(shortenSHA(file.commitish))
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                }
                Text("Read-only stash diff. Full diff rendering lands with the diff viewer.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Divider()
                ScrollView {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Status: \(fileStatusLabel(file.status))")
                            .font(.caption.monospaced())
                        Text("Commit: \(file.commitish)")
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                        Text("Parent: \(file.parentCommitish)")
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                Spacer()
            }
            .padding(12)
        } else {
            VStack {
                Text("Select a file to preview its stashed changes.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

/// Header with Restore/Discard. Port of `stash-diff-header.tsx`.
public struct StashDiffHeader: View {
    public var stashEntry: StashEntry
    public var fileCount: Int
    public var isRestoring: Bool
    public var isDiscarding: Bool
    public var onRestore: () -> Void
    public var onDiscard: () -> Void

    public init(
        stashEntry: StashEntry,
        fileCount: Int = 0,
        isRestoring: Bool = false,
        isDiscarding: Bool = false,
        onRestore: @escaping () -> Void = {},
        onDiscard: @escaping () -> Void = {}
    ) {
        self.stashEntry = stashEntry
        self.fileCount = fileCount
        self.isRestoring = isRestoring
        self.isDiscarding = isDiscarding
        self.onRestore = onRestore
        self.onDiscard = onDiscard
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Stashed changes")
                        .font(.headline)
                    Text("On \(stashEntry.branchName) · \(shortenSHA(stashEntry.stashSha)) · \(fileCount) file(s)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                HStack(spacing: 8) {
                    Button("Restore") { onRestore() }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                        .disabled(isRestoring || isDiscarding)
                        .help("Move your stashed files to the Changes list")
                        .accessibilityHint("Restore will move your stashed files to the Changes list.")
                    Button("Discard") { onDiscard() }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(isRestoring || isDiscarding)
                }
            }
            if isRestoring || isDiscarding {
                ProgressView()
                    .controlSize(.small)
                    .accessibilityLabel(isRestoring ? "Restoring stash" : "Discarding stash")
            }
        }
        .padding(12)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Stash on \(stashEntry.branchName), \(fileCount) files")
        .contextMenu {
            // Task 10 context-menu parity (Docs/10 §3: Stash header).
            Button("Restore") { onRestore() }
                .disabled(isRestoring || isDiscarding)
            Button("Discard…") { onDiscard() }
                .disabled(isRestoring || isDiscarding)
        }
    }
}

/// Small status pill shared by the stash file list.
public struct FileStatusBadge: View {
    public var status: AppFileStatus

    public init(status: AppFileStatus) {
        self.status = status
    }

    public var body: some View {
        Text(fileStatusLabel(status))
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(.quaternary, in: Capsule())
            .accessibilityLabel("File status \(fileStatusLabel(status))")
    }
}

public func fileStatusLabel(_ status: AppFileStatus) -> String {
    switch status {
    case .new: return "New"
    case .modified: return "Modified"
    case .deleted: return "Deleted"
    case .copied: return "Copied"
    case .renamed: return "Renamed"
    case .conflictedWithMarkers, .manualConflict: return "Conflicted"
    case .untracked: return "Untracked"
    }
}

#Preview {
    let entry = StashEntry(
        name: "refs/stash@{0}", branchName: "main",
        stashSha: "abc1234567890", files: .notLoaded,
        tree: "tree123", parents: ["p1", "p2"])
    return StashViewer(
        stashEntry: entry,
        files: [
            CommittedFileChange(
                path: "README.md", status: .modified(submoduleStatus: nil),
                commitish: "abc1234", parentCommitish: "abc1234^"),
        ])
    .frame(width: 700, height: 400)
}
