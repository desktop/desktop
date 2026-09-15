import AppKit
import Combine
import Foundation
import SwiftUI

// MARK: - ChangesStore
// Per-Changes-tab view model. Codes against the Task-1 contracts
// (`AppStore`, `GitService`, `RepositoryState`, `WorkingDirectoryStatus`)
// without redefining them: selection/filter drafts live here, and confirmed
// mutations are written back via `AppStore.updateRepositoryState(_:)`.
// Staging + commit go through `GitService` so Previews/tests can use
// `MockGitService` (Task 4 adds patch-level staging for partial selections).

/// Which pre-commit confirmation is awaiting the user.
public enum PendingCommitConfirm: Sendable, Equatable {
    case unknownAuthors([Author])
    case filteredFiles(count: Int)
    case oversizedFiles([String])
    case conflicts([WorkingDirectoryFileChange])
}

/// Hook failure surfaced by the `HookFailed` sheet.
public struct HookFailure: Sendable, Equatable {
    public var hookName: String
    public var output: String

    public init(hookName: String, output: String) {
        self.hookName = hookName
        self.output = output
    }
}

@MainActor
public final class ChangesStore: ObservableObject {
    // MARK: Collaborators

    public let store: AppStore
    public let repository: Repository
    public var gitService: any GitService

    // MARK: File list state

    @Published public var filter = FileListFilter()
    @Published public var showChangesFilter: Bool
    @Published public var filterOptionsExpanded = false
    /// Row selection (file IDs). Mirrors `ChangesSelection` working-directory IDs.
    @Published public var selectedFileIDs: Set<String> = []
    /// When true the stash row is active (the Task-8 viewer renders the diff).
    @Published public var showingStash = false
    public var stashEntry: StashEntry?

    // MARK: Commit box state

    @Published public var summary = ""
    @Published public var commitDescription = ""
    @Published public var showCoAuthors = false
    @Published public var coAuthors: [Author] = []
    @Published public var skipCommitHooks = false
    @Published public var signOffCommits = false
    @Published public var allowEmptyCommit = false
    @Published public var spellcheckEnabled: Bool
    @Published public var showCommitLengthWarning = true
    @Published public var branch: String?
    @Published public var commitAuthor: CommitIdentity?
    @Published public var branches: [Branch] = []
    @Published public var localAuthors: [Author] = []
    @Published public var commitToAmend: Commit?
    @Published public var mostRecentLocalCommit: Commit?
    @Published public var isCommitting = false
    @Published public var hookProgress: String?
    @Published public var hookFailure: HookFailure?
    @Published public var pendingConfirm: PendingCommitConfirm?
    @Published public var errorMessage: String?

    public init(
        store: AppStore,
        repository: Repository,
        gitService: any GitService,
        branch: String? = nil,
        commitAuthor: CommitIdentity? = nil,
        stashEntry: StashEntry? = nil
    ) {
        self.store = store
        self.repository = repository
        self.gitService = gitService
        self.branch = branch
        self.commitAuthor = commitAuthor
        self.stashEntry = stashEntry
        self.showChangesFilter = Defaults.bool(
            Defaults.showChangesFilter, default: true)
        self.spellcheckEnabled = Defaults.bool(
            Defaults.commitSpellcheckEnabled, default: true)
    }

    // MARK: - Derived file state

    private var workingDirectory: WorkingDirectoryStatus {
        store.repositoryStates[repository.hash]?.workingDirectory
            ?? WorkingDirectoryStatus(files: [])
    }

    public var allFiles: [WorkingDirectoryFileChange] {
        workingDirectory.files
    }

    public var visibleFiles: [WorkingDirectoryFileChange] {
        filter.apply(to: allFiles, showChangesFilter: showChangesFilter)
    }

    public var filesToBeCommitted: [WorkingDirectoryFileChange] {
        allFiles.filter { $0.selection.getSelectionType() != .none }
    }

    public var anyFilesSelected: Bool { !filesToBeCommitted.isEmpty }

    public var includeAllState: Bool? { workingDirectory.includeAll }

    public var validation: CommitValidation {
        validateCommit(
            summary: effectiveSummary,
            anyFilesSelected: anyFilesSelected,
            anyFilesAvailable: !allFiles.isEmpty,
            allowEmptyCommit: allowEmptyCommit,
            isAmending: commitToAmend != nil,
            prepopulateCommitSummary: shouldPrepopulate,
            showCommitLengthWarning: showCommitLengthWarning)
    }

    public var effectiveSummary: String {
        if summary.isEmpty && shouldPrepopulate {
            return placeholderSummary(
                for: filesToBeCommitted,
                isTutorialRepository: repository.isTutorialRepository)
        }
        return summary
    }

    public var shouldPrepopulate: Bool {
        shouldPrepopulateCommitSummary(
            fileCount: filesToBeCommitted.count,
            isTutorialRepository: repository.isTutorialRepository)
    }

    public var commitButtonTitle: String {
        CommitBoxTitles.buttonTitle(
            branch: branch,
            filesToBeCommittedCount: filesToBeCommitted.count,
            isAmending: commitToAmend != nil,
            isCommitting: isCommitting)
    }

    public var placeholder: String {
        placeholderSummary(
            for: filesToBeCommitted,
            isTutorialRepository: repository.isTutorialRepository)
    }

    /// True when at least one to-be-committed file is hidden by the filter.
    public var isCommittingHiddenFile: Bool {
        FileListFilter.isCommittingFileHiddenByFilter(
            fileIDsIncludedInCommit: filesToBeCommitted.map(\.id),
            filteredIDs: Set(visibleFiles.map(\.id)),
            fileCount: allFiles.count,
            filter: filter)
    }

    // MARK: - Selection / inclusion

    private func updateFiles(_ transform: (WorkingDirectoryFileChange) -> WorkingDirectoryFileChange) {
        guard var state = store.repositoryStates[repository.hash] else { return }
        state.workingDirectory = WorkingDirectoryStatus.fromFiles(
            state.workingDirectory.files.map(transform))
        store.updateRepositoryState(state)
    }

    /// Toggle include for a file. Partial selections clear (indeterminate
    /// checkbox behavior from `sidebar.tsx`).
    public func toggleInclude(_ file: WorkingDirectoryFileChange) {
        let current = file.selection.getSelectionType()
        setInclude(file, include: current == .none)
    }

    public func setInclude(_ file: WorkingDirectoryFileChange, include: Bool) {
        updateFiles {
            $0.id == file.id ? $0.withIncludeAll(include) : $0
        }
    }

    public func setIncludeAll(_ include: Bool) {
        guard var state = store.repositoryStates[repository.hash] else { return }
        state.workingDirectory = state.workingDirectory.withIncludeAllFiles(include)
        store.updateRepositoryState(state)
    }

    public func selectFiles(_ ids: Set<String>) {
        selectedFileIDs = ids
    }

    public func setFilterText(_ text: String) {
        filter.filterText = text
    }

    public func clearFilter() {
        filter = FileListFilter()
    }

    // MARK: - Commit flow

    /// Entry point for the Commit button / `Cmd+Enter`.
    public func commit() {
        guard validation.canSubmit, !isCommitting else { return }
        Task { await createCommit() }
    }

    private struct BypassedWarnings: OptionSet, Sendable {
        let rawValue: Int
        static let unknownAuthors = BypassedWarnings(rawValue: 1 << 0)
        static let filteredFiles = BypassedWarnings(rawValue: 1 << 1)
    }

    private func createCommit(bypassed: BypassedWarnings = []) async {
        // 1. Unknown co-authors confirm.
        if !bypassed.contains(.unknownAuthors) {
            let unknown = unknownCoAuthors(in: coAuthors)
            if !unknown.isEmpty {
                pendingConfirm = .unknownAuthors(unknown)
                return
            }
        }
        // 2. Filtered-files confirm.
        if !bypassed.contains(.filteredFiles) {
            let askFiltered = Defaults.bool(
                Defaults.confirmCommitFilteredChanges, default: true)
            if askFiltered && isCommittingHiddenFile {
                pendingConfirm = .filteredFiles(count: filesToBeCommitted.count)
                return
            }
        }
        // 3. Oversized-files (LFS gate) confirm.
        let oversized = oversizedPaths(
            in: repository.path, paths: filesToBeCommitted.map(\.path))
        if !oversized.isEmpty {
            pendingConfirm = .oversizedFiles(oversized)
            return
        }
        // 4. Conflict-markers confirm.
        let conflicted = filesToBeCommitted.filter { $0.status.isConflictWithMarkers }
        if !conflicted.isEmpty {
            pendingConfirm = .conflicts(conflicted)
            return
        }
        await performCommit()
    }

    /// Continue after the user accepts the pending confirmation sheet.
    public func acceptPendingConfirm() {
        guard let pending = pendingConfirm else { return }
        pendingConfirm = nil
        Task {
            switch pending {
            case .unknownAuthors:
                await createCommit(bypassed: [.unknownAuthors])
            case .filteredFiles:
                await createCommit(bypassed: [.unknownAuthors, .filteredFiles])
            case .oversizedFiles, .conflicts:
                await performCommit()
            }
        }
    }

    public func cancelPendingConfirm() {
        pendingConfirm = nil
    }

    private func performCommit() async {
        let context = CommitContext(
            summary: effectiveSummary,
            description: commitDescription.isEmpty ? nil : commitDescription,
            amend: commitToAmend != nil,
            trailers: coAuthorTrailers(for: coAuthors),
            filePaths: filesToBeCommitted.map(\.path),
            noVerify: skipCommitHooks,
            signOff: signOffCommits,
            allowEmpty: allowEmptyCommit)
        isCommitting = true
        hookProgress = "Running commit hooks…"
        defer {
            isCommitting = false
            hookProgress = nil
        }
        do {
            // Stage full-file inclusions up front so `commit` reflects the
            // checkbox state (mirrors `unstageAll` + `stageFiles`). Partial
            // line-level staging lands with the Task-4 diff viewer.
            let included = filesToBeCommitted.map(\.path)
            if !included.isEmpty {
                try await gitService.stage(files: included)
            }
            _ = try await gitService.commit(context: context)
            summary = ""
            commitDescription = ""
            coAuthors = []
            allowEmptyCommit = false // one-shot flag, mirrors the reference app
            clearFilter()
            stopAmending()
        } catch let error as GitError {
            if error.kind == .gpgFailedToSignData {
                hookFailure = HookFailure(
                    hookName: "gpg", output: error.displayMessage)
            } else {
                errorMessage = error.displayMessage
                store.showPopup(.error(message: error.displayMessage))
            }
        } catch {
            errorMessage = error.localizedDescription
            store.showPopup(.error(message: error.localizedDescription))
        }
    }

    // MARK: - Amend

    public func stopAmending() {
        commitToAmend = nil
    }

    // MARK: - Row actions

    /// Discard routes through the global confirm popup (Task 8 owns the
    /// destructive execution; Task 2's DialogHost renders it).
    public func requestDiscard(files: [WorkingDirectoryFileChange]) {
        store.showPopup(.confirmDiscardChanges(
            repositoryID: repository.id,
            fileIDs: files.map(\.id),
            showDiscardChangesSetting: true,
            discardingAllChanges: files.count == allFiles.count))
    }

    /// Append a path or extension pattern to the repo `.gitignore`.
    public func ignore(path: String) {
        appendGitignoreLine(path)
    }

    public func ignoreExtension(of path: String) {
        let ext = (path as NSString).pathExtension
        guard !ext.isEmpty else { return }
        appendGitignoreLine("*.\(ext)")
    }

    private func appendGitignoreLine(_ line: String) {
        let gitignore = (repository.path as NSString)
            .appendingPathComponent(".gitignore")
        let entry = line.hasSuffix("\n") ? line : line + "\n"
        do {
            if FileManager.default.fileExists(atPath: gitignore) {
                let handle = try FileHandle(forWritingTo: URL(fileURLWithPath: gitignore))
                defer { try? handle.close() }
                try handle.seekToEnd()
                handle.write(Data(entry.utf8))
            } else {
                try entry.write(toFile: gitignore, atomically: true, encoding: .utf8)
            }
            Task { await refreshStatus() }
        } catch {
            errorMessage = error.localizedDescription
            store.showPopup(.error(message: error.localizedDescription))
        }
    }

    public func revealInFinder(path: String) {
        let url = URL(fileURLWithPath:
            (repository.path as NSString).appendingPathComponent(path))
        NSWorkspace.shared.activateFileViewerSelecting([url])
    }

    public func copyPath(_ path: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(path, forType: .string)
    }

    public func refreshStatus() async {
        guard let fresh = try? await gitService.status(includeUntracked: true),
              var state = store.repositoryStates[repository.hash]
        else { return }
        state.workingDirectory = fresh.workingDirectory
        store.updateRepositoryState(state)
    }
}

// MARK: - Commit button titles

private enum CommitBoxTitles {
    static func buttonTitle(
        branch: String?, filesToBeCommittedCount: Int,
        isAmending: Bool, isCommitting: Bool
    ) -> String {
        commitButtonTitle(
            branch: branch,
            filesToBeCommittedCount: filesToBeCommittedCount,
            isAmending: isAmending,
            isCommitting: isCommitting)
    }
}
