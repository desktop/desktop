import SwiftUI

// MARK: - Task 8 dialogs
// Port of the confirm/prompt dialogs listed in Docs/07 §4–5:
// stash-and-switch, overwrite-stash, discard-stash, create/delete tag,
// add/rename/delete worktree (+failed), warning-before-reset,
// warn-local-changes-before-undo, confirm-checkout-commit, revert.
// All destructive actions are gated by a confirm step; "Do not show again"
// checkboxes persist via `Defaults` (see `Persistence/Defaults.swift`).

// MARK: Stash dialogs

/// Port of `stash-and-switch-branch-dialog.tsx`.
public struct StashAndSwitchDialog: View {
    public var currentBranchName: String
    public var targetBranchName: String
    public var hasAssociatedStash: Bool
    public var isWorking: Bool
    public var onStashOnCurrentBranch: () -> Void
    public var onBringToNewBranch: () -> Void
    public var onCancel: () -> Void

    @State private var selection: Int = 0

    public init(
        currentBranchName: String,
        targetBranchName: String,
        hasAssociatedStash: Bool = false,
        isWorking: Bool = false,
        onStashOnCurrentBranch: @escaping () -> Void = {},
        onBringToNewBranch: @escaping () -> Void = {},
        onCancel: @escaping () -> Void = {}
    ) {
        self.currentBranchName = currentBranchName
        self.targetBranchName = targetBranchName
        self.hasAssociatedStash = hasAssociatedStash
        self.isWorking = isWorking
        self.onStashOnCurrentBranch = onStashOnCurrentBranch
        self.onBringToNewBranch = onBringToNewBranch
        self.onCancel = onCancel
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Switch Branch")
                .font(.headline)
            Text("You have changes on this branch. What would you like to do with them?")
                .font(.callout)
            Picker("Stash action", selection: $selection) {
                Text("Leave my changes on \(currentBranchName)").tag(0)
                Text("Bring my changes to \(targetBranchName)").tag(1)
            }
            .pickerStyle(.radioGroup)
            .disabled(isWorking)
            if hasAssociatedStash && selection == 0 {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.yellow)
                    Text("Your current stash will be overwritten by creating a new stash.")
                        .font(.caption)
                }
            }
            HStack {
                Spacer()
                Button("Cancel", action: onCancel)
                    .buttonStyle(.bordered)
                    .disabled(isWorking)
                Button("Switch Branch") {
                    if selection == 0 { onStashOnCurrentBranch() } else { onBringToNewBranch() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(isWorking)
                .keyboardShortcut(.defaultAction)
            }
            if isWorking { ProgressView().controlSize(.small) }
        }
        .padding(16)
        .frame(minWidth: 420)
    }
}

/// Port of `overwrite-stashed-changes-dialog.tsx` (confirm overwrite).
public struct ConfirmOverwriteStashDialog: View {
    public var branchName: String
    public var isWorking: Bool
    public var onOverwrite: () -> Void
    public var onCancel: () -> Void

    public init(branchName: String, isWorking: Bool = false, onOverwrite: @escaping () -> Void = {}, onCancel: @escaping () -> Void = {}) {
        self.branchName = branchName
        self.isWorking = isWorking
        self.onOverwrite = onOverwrite
        self.onCancel = onCancel
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Overwrite Stash?")
                .font(.headline)
            Text("A stash already exists for \(branchName). Overwriting it will discard the previously stashed changes.")
                .font(.callout)
            HStack {
                Spacer()
                Button("Cancel", action: onCancel).buttonStyle(.bordered).disabled(isWorking)
                Button("Overwrite", role: .destructive, action: onOverwrite)
                    .buttonStyle(.borderedProminent).disabled(isWorking)
                    .keyboardShortcut(.defaultAction)
            }
            if isWorking { ProgressView().controlSize(.small) }
        }
        .padding(16)
        .frame(minWidth: 380)
    }
}

/// Port of `confirm-discard-stash.tsx`.
public struct ConfirmDiscardStashDialog: View {
    public var stashName: String
    public var isDiscarding: Bool
    public var onDiscard: (Bool) -> Void
    public var onCancel: () -> Void

    @State private var doNotShowAgain: Bool = false

    public init(
        stashName: String,
        isDiscarding: Bool = false,
        onDiscard: @escaping (Bool) -> Void = { _ in },
        onCancel: @escaping () -> Void = {}
    ) {
        self.stashName = stashName
        self.isDiscarding = isDiscarding
        self.onDiscard = onDiscard
        self.onCancel = onCancel
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Discard Stash?")
                .font(.headline)
            Text("Are you sure you want to discard these stashed changes (\(stashName))? This cannot be undone.")
                .font(.callout)
            Toggle("Do not show this message again", isOn: $doNotShowAgain)
                .font(.callout)
                .disabled(isDiscarding)
            HStack {
                Spacer()
                Button("Cancel", action: onCancel).buttonStyle(.bordered).disabled(isDiscarding)
                Button("Discard", role: .destructive) { onDiscard(doNotShowAgain) }
                    .buttonStyle(.borderedProminent).disabled(isDiscarding)
                    .keyboardShortcut(.defaultAction)
            }
            if isDiscarding { ProgressView().controlSize(.small) }
        }
        .padding(16)
        .frame(minWidth: 380)
    }
}

// MARK: Tag dialogs

/// Delete tag confirm with pushed-delete guard.
public struct DeleteTagDialog: View {
    public var tagName: String
    public var isPushed: Bool
    public var isDeleting: Bool
    public var onDelete: () -> Void
    public var onCancel: () -> Void

    public init(tagName: String, isPushed: Bool = false, isDeleting: Bool = false, onDelete: @escaping () -> Void = {}, onCancel: @escaping () -> Void = {}) {
        self.tagName = tagName
        self.isPushed = isPushed
        self.isDeleting = isDeleting
        self.onDelete = onDelete
        self.onCancel = onCancel
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Delete Tag “\(tagName)”?")
                .font(.headline)
            if isPushed {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.yellow)
                    Text("This tag appears to be pushed. Deleting it locally will not delete it from the remote.")
                        .font(.callout)
                }
            } else {
                Text("This will delete the local tag. This cannot be undone.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            HStack {
                Spacer()
                Button("Cancel", action: onCancel).buttonStyle(.bordered).disabled(isDeleting)
                Button("Delete", role: .destructive, action: onDelete)
                    .buttonStyle(.borderedProminent).disabled(isDeleting)
                    .keyboardShortcut(.defaultAction)
            }
            if isDeleting { ProgressView().controlSize(.small) }
        }
        .padding(16)
        .frame(minWidth: 380)
    }
}

// MARK: Worktree dialogs

public struct AddWorktreeDialog: View {
    public var initialBranchName: String?
    public var isCreating: Bool
    public var pathExists: (String) -> Bool
    public var onCreate: (String, String?, String?) -> Void
    public var onCancel: () -> Void

    @State private var path: String = ""
    @State private var createBranch: String = ""
    @State private var makeNewBranch: Bool = false
    @State private var commitish: String = ""

    public init(
        initialBranchName: String? = nil,
        isCreating: Bool = false,
        pathExists: @escaping (String) -> Bool = { _ in false },
        onCreate: @escaping (String, String?, String?) -> Void = { _, _, _ in },
        onCancel: @escaping () -> Void = {}
    ) {
        self.initialBranchName = initialBranchName
        self.isCreating = isCreating
        self.pathExists = pathExists
        self.onCreate = onCreate
        self.onCancel = onCancel
        _createBranch = State(initialValue: initialBranchName ?? "")
    }

    private var error: String? {
        WorktreeOperations.validateAdd(
            path: path,
            createBranch: makeNewBranch ? createBranch : nil,
            pathExists: pathExists(path))
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("New Worktree")
                .font(.headline)
            TextField("Worktree path", text: $path)
                .textFieldStyle(.roundedBorder)
                .disabled(isCreating)
            Toggle("Create a new branch", isOn: $makeNewBranch)
                .disabled(isCreating)
            if makeNewBranch {
                TextField("New branch name", text: $createBranch)
                    .textFieldStyle(.roundedBorder)
                    .disabled(isCreating)
            }
            TextField("Commit-ish (optional, defaults to HEAD)", text: $commitish)
                .textFieldStyle(.roundedBorder)
                .disabled(isCreating)
            if let error, !path.isEmpty {
                Text(error).font(.caption).foregroundStyle(.red)
            }
            HStack {
                Spacer()
                Button("Cancel", action: onCancel).buttonStyle(.bordered).disabled(isCreating)
                Button("Create Worktree") {
                    onCreate(
                        path.trimmingCharacters(in: .whitespacesAndNewlines),
                        makeNewBranch ? createBranch.trimmingCharacters(in: .whitespacesAndNewlines) : nil,
                        commitish.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : commitish)
                }
                .buttonStyle(.borderedProminent)
                .disabled(error != nil || isCreating)
                .keyboardShortcut(.defaultAction)
            }
            if isCreating { ProgressView().controlSize(.small) }
        }
        .padding(16)
        .frame(minWidth: 420)
    }
}

public struct RenameWorktreeDialog: View {
    public var worktreePath: String
    public var isWorking: Bool
    public var onRename: (String) -> Void
    public var onCancel: () -> Void

    @State private var newPath: String

    public init(worktreePath: String, isWorking: Bool = false, onRename: @escaping (String) -> Void = { _ in }, onCancel: @escaping () -> Void = {}) {
        self.worktreePath = worktreePath
        self.isWorking = isWorking
        self.onRename = onRename
        self.onCancel = onCancel
        _newPath = State(initialValue: worktreePath)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Rename Worktree")
                .font(.headline)
            Text("Move \(worktreePath) to a new location.")
                .font(.caption).foregroundStyle(.secondary)
            TextField("New path", text: $newPath)
                .textFieldStyle(.roundedBorder)
                .disabled(isWorking)
            HStack {
                Spacer()
                Button("Cancel", action: onCancel).buttonStyle(.bordered).disabled(isWorking)
                Button("Rename") { onRename(newPath.trimmingCharacters(in: .whitespacesAndNewlines)) }
                    .buttonStyle(.borderedProminent)
                    .disabled(newPath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isWorking)
                    .keyboardShortcut(.defaultAction)
            }
            if isWorking { ProgressView().controlSize(.small) }
        }
        .padding(16)
        .frame(minWidth: 400)
    }
}

public struct DeleteWorktreeDialog: View {
    public var worktreePath: String
    public var isDeleting: Bool
    public var onDelete: (Bool) -> Void
    public var onCancel: () -> Void

    @State private var force: Bool = false

    public init(worktreePath: String, isDeleting: Bool = false, onDelete: @escaping (Bool) -> Void = { _ in }, onCancel: @escaping () -> Void = {}) {
        self.worktreePath = worktreePath
        self.isDeleting = isDeleting
        self.onDelete = onDelete
        self.onCancel = onCancel
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Delete Worktree?")
                .font(.headline)
            Text("This removes the worktree at \(worktreePath). Uncommitted changes inside it will be lost.")
                .font(.callout)
            Toggle("Force delete (discard uncommitted changes)", isOn: $force)
                .disabled(isDeleting)
            HStack {
                Spacer()
                Button("Cancel", action: onCancel).buttonStyle(.bordered).disabled(isDeleting)
                Button("Delete", role: .destructive) { onDelete(force) }
                    .buttonStyle(.borderedProminent).disabled(isDeleting)
                    .keyboardShortcut(.defaultAction)
            }
            if isDeleting { ProgressView().controlSize(.small) }
        }
        .padding(16)
        .frame(minWidth: 400)
    }
}

public struct DeleteWorktreeFailedDialog: View {
    public var worktreePath: String
    public var message: String
    public var onDismiss: () -> Void

    public init(worktreePath: String, message: String, onDismiss: @escaping () -> Void = {}) {
        self.worktreePath = worktreePath
        self.message = message
        self.onDismiss = onDismiss
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Couldn’t Delete Worktree")
                .font(.headline)
            Text("Could not delete \(worktreePath).")
                .font(.callout)
            Text(message)
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
            HStack {
                Spacer()
                Button("OK", action: onDismiss)
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(16)
        .frame(minWidth: 400)
    }
}

// MARK: Undo / reset / revert / checkout dialogs

/// Port of `warning-before-reset.tsx` + mode radio (Soft/Mixed/Hard).
public struct WarningBeforeResetDialog: View {
    public var commitSha: String
    public var commitSummary: String?
    public var isWorkingDirectoryClean: Bool
    public var isWorking: Bool
    public var onReset: (GitResetMode) -> Void
    public var onCancel: () -> Void

    @State private var mode: GitResetMode = .mixed

    public init(
        commitSha: String,
        commitSummary: String? = nil,
        isWorkingDirectoryClean: Bool = true,
        isWorking: Bool = false,
        onReset: @escaping (GitResetMode) -> Void = { _ in },
        onCancel: @escaping () -> Void = {}
    ) {
        self.commitSha = commitSha
        self.commitSummary = commitSummary
        self.isWorkingDirectoryClean = isWorkingDirectoryClean
        self.isWorking = isWorking
        self.onReset = onReset
        self.onCancel = onCancel
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Reset to Commit")
                .font(.headline)
            Text("Reset to \(shortenSHA(commitSha))\(commitSummary.map { " “\($0)”" } ?? "")?")
                .font(.callout)
            if !isWorkingDirectoryClean {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.yellow)
                    Text("You have changes in progress. Resetting might result in some of these changes being lost.")
                        .font(.caption)
                }
            }
            Picker("Mode", selection: $mode) {
                ForEach(GitResetMode.allCases, id: \.self) { m in
                    VStack(alignment: .leading) {
                        Text(m.displayName)
                    }.tag(m)
                }
            }
            .pickerStyle(.radioGroup)
            .disabled(isWorking)
            Text(mode.explanation)
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack {
                Spacer()
                Button("Cancel", action: onCancel).buttonStyle(.bordered).disabled(isWorking)
                Button(mode == .hard ? "Reset (Hard)" : "Continue", role: .destructive) { onReset(mode) }
                    .buttonStyle(.borderedProminent).disabled(isWorking)
                    .keyboardShortcut(.defaultAction)
            }
            if isWorking { ProgressView().controlSize(.small) }
        }
        .padding(16)
        .frame(minWidth: 420)
    }
}

/// Port of `warn-local-changes-before-undo.tsx`.
public struct WarnLocalChangesBeforeUndoDialog: View {
    public var commitSha: String
    public var isMergeCommit: Bool
    public var isWorkingDirectoryClean: Bool
    public var isWorking: Bool
    public var onContinue: (Bool) -> Void
    public var onCancel: () -> Void

    @State private var doNotShowAgain: Bool = false

    public init(
        commitSha: String,
        isMergeCommit: Bool = false,
        isWorkingDirectoryClean: Bool = true,
        isWorking: Bool = false,
        onContinue: @escaping (Bool) -> Void = { _ in },
        onCancel: @escaping () -> Void = {}
    ) {
        self.commitSha = commitSha
        self.isMergeCommit = isMergeCommit
        self.isWorkingDirectoryClean = isWorkingDirectoryClean
        self.isWorking = isWorking
        self.onContinue = onContinue
        self.onCancel = onCancel
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Undo Commit")
                .font(.headline)
            if isMergeCommit {
                if !isWorkingDirectoryClean {
                    Text("You have changes in progress. Undoing the merge commit might result in some of these changes being lost.")
                        .font(.callout)
                }
                Text("Undoing a merge commit will apply the changes from the merge into your working directory, and committing again will create an entirely new commit. This means you will lose the merge commit and, as a result, commits from the merged branch could disappear from this branch.")
                    .font(.callout)
                Text("Do you want to continue anyway?")
                    .font(.callout)
            } else {
                Text("You have changes in progress. Undoing the commit (\(shortenSHA(commitSha))) might result in some of these changes being lost. Do you want to continue anyway?")
                    .font(.callout)
            }
            if !isMergeCommit {
                Toggle("Do not show this message again", isOn: $doNotShowAgain)
                    .disabled(isWorking)
            }
            HStack {
                Spacer()
                Button("Cancel", action: onCancel).buttonStyle(.bordered).disabled(isWorking)
                Button("Continue", role: .destructive) { onContinue(doNotShowAgain) }
                    .buttonStyle(.borderedProminent).disabled(isWorking)
                    .keyboardShortcut(.defaultAction)
            }
            if isWorking { ProgressView().controlSize(.small) }
        }
        .padding(16)
        .frame(minWidth: 420)
    }
}

/// Detached-HEAD confirm for checking out a commit.
public struct ConfirmCheckoutCommitDialog: View {
    public var commitSha: String
    public var commitSummary: String?
    public var isWorking: Bool
    public var onCheckout: () -> Void
    public var onCancel: () -> Void

    public init(
        commitSha: String,
        commitSummary: String? = nil,
        isWorking: Bool = false,
        onCheckout: @escaping () -> Void = {},
        onCancel: @escaping () -> Void = {}
    ) {
        self.commitSha = commitSha
        self.commitSummary = commitSummary
        self.isWorking = isWorking
        self.onCheckout = onCheckout
        self.onCancel = onCancel
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Check Out Commit?")
                .font(.headline)
            Text("Checking out \(shortenSHA(commitSha))\(commitSummary.map { " “\($0)”" } ?? "") will leave you in a detached HEAD state. Create a branch from here to keep any new commits.")
                .font(.callout)
            HStack {
                Spacer()
                Button("Cancel", action: onCancel).buttonStyle(.bordered).disabled(isWorking)
                Button("Check Out") { onCheckout() }
                    .buttonStyle(.borderedProminent).disabled(isWorking)
                    .keyboardShortcut(.defaultAction)
            }
            if isWorking { ProgressView().controlSize(.small) }
        }
        .padding(16)
        .frame(minWidth: 400)
    }
}

/// Revert confirm: shows `-m 1` notice for merges + LFS note.
public struct RevertCommitDialog: View {
    public var commitSha: String
    public var commitSummary: String?
    public var isMergeCommit: Bool
    public var isWorking: Bool
    public var onRevert: () -> Void
    public var onCancel: () -> Void

    public init(
        commitSha: String,
        commitSummary: String? = nil,
        isMergeCommit: Bool = false,
        isWorking: Bool = false,
        onRevert: @escaping () -> Void = {},
        onCancel: @escaping () -> Void = {}
    ) {
        self.commitSha = commitSha
        self.commitSummary = commitSummary
        self.isMergeCommit = isMergeCommit
        self.isWorking = isWorking
        self.onRevert = onRevert
        self.onCancel = onCancel
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Revert Commit?")
                .font(.headline)
            Text("Create a new commit that undoes \(shortenSHA(commitSha))\(commitSummary.map { " “\($0)”" } ?? "")?")
                .font(.callout)
            if isMergeCommit {
                Text("This is a merge commit; it will be reverted with `-m 1` (first parent).")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text("Large files tracked by Git LFS are reverted with progress in the toolbar.")
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack {
                Spacer()
                Button("Cancel", action: onCancel).buttonStyle(.bordered).disabled(isWorking)
                Button("Revert", action: onRevert)
                    .buttonStyle(.borderedProminent).disabled(isWorking)
                    .keyboardShortcut(.defaultAction)
            }
            if isWorking { ProgressView().controlSize(.small) }
        }
        .padding(16)
        .frame(minWidth: 400)
    }
}

#Preview {
    VStack(spacing: 16) {
        ConfirmDiscardStashDialog(stashName: "refs/stash@{0}")
        WarningBeforeResetDialog(commitSha: "abc1234567890", isWorkingDirectoryClean: false)
    }
    .padding()
}
