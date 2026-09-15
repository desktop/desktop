import Foundation

// MARK: - PopupDescriptors
// Pure dialog copy mapping for the pruned `Popup` stack
// (Docs/04-shell-toolbar.md §7). Task 2 renders every kept popup as a sheet:
// the handful the shell owns get bespoke dialogs in `DialogHost`, the rest
// get a generic dialog whose `owningTask` note names the implementing task.

public struct PopupDescriptor: Sendable, Equatable {
    public var title: String
    public var message: String?
    public var primaryTitle: String
    public var showsCancel: Bool
    /// Owning PLAN task for the full dialog; nil when Task 2 owns it.
    public var owningTask: Int?

    public init(title: String, message: String? = nil, primaryTitle: String, showsCancel: Bool = true, owningTask: Int? = nil) {
        self.title = title
        self.message = message
        self.primaryTitle = primaryTitle
        self.showsCancel = showsCancel
        self.owningTask = owningTask
    }
}

public func describePopup(_ popup: Popup) -> PopupDescriptor {
    switch popup {
    case .renameBranch:
        return PopupDescriptor(title: "Rename Branch", primaryTitle: "Rename")
    case .deleteBranch(_, _, let existsOnRemote):
        return PopupDescriptor(
            title: "Delete Branch",
            message: existsOnRemote
                ? "This branch exists on the remote. Deleting it here will not delete the remote branch."
                : nil,
            primaryTitle: "Delete")
    case .deleteRemoteBranch:
        return PopupDescriptor(title: "Delete Remote Branch", primaryTitle: "Delete")
    case .confirmDiscardChanges(_, _, _, let discardingAllChanges):
        return PopupDescriptor(
            title: discardingAllChanges ? "Discard All Changes" : "Discard Changes",
            message: "Discarded changes cannot be recovered.",
            primaryTitle: "Discard Changes")
    case .confirmDiscardSelection:
        return PopupDescriptor(
            title: "Discard Selection",
            message: "Discarded changes cannot be recovered.",
            primaryTitle: "Discard Selection")
    case .preferences:
        return PopupDescriptor(title: "Settings", primaryTitle: "Save", owningTask: 9)
    case .repositorySettings:
        return PopupDescriptor(title: "Repository Settings", primaryTitle: "Save", owningTask: 9)
    case .addRepository:
        return PopupDescriptor(title: "Add Existing Repository", primaryTitle: "Add", owningTask: 9)
    case .createRepository:
        return PopupDescriptor(title: "Create a New Repository", primaryTitle: "Create", owningTask: 9)
    case .cloneRepository:
        return PopupDescriptor(title: "Clone a Repository", primaryTitle: "Clone", owningTask: 9)
    case .createBranch:
        return PopupDescriptor(title: "Create a Branch", primaryTitle: "Create Branch")
    case .about:
        return PopupDescriptor(title: "About GitDesktop", primaryTitle: "Close", showsCancel: false)
    case .installGit(let path):
        return PopupDescriptor(
            title: "Install Command Line Tools",
            message: "The command line tools will be installed at \(path).",
            primaryTitle: "Install", owningTask: 9)
    case .acknowledgements:
        return PopupDescriptor(title: "Acknowledgements", primaryTitle: "Close", showsCancel: false)
    case .shortcuts:
        return PopupDescriptor(title: "Keyboard Shortcuts", primaryTitle: "Close", showsCancel: false)
    case .untrustedCertificate(let host, _):
        return PopupDescriptor(
            title: "Untrusted Certificate",
            message: "The certificate for \(host) could not be verified.",
            primaryTitle: "Trust")
    case .removeRepository:
        return PopupDescriptor(title: "Remove Repository", primaryTitle: "Remove")
    case .termsAndConditions:
        return PopupDescriptor(title: "Terms and Conditions", primaryTitle: "Accept", owningTask: 9)
    case .pushBranchCommits:
        return PopupDescriptor(title: "Push Branch", primaryTitle: "Push", owningTask: 7)
    case .cliInstalled:
        return PopupDescriptor(
            title: "Command Line Tools Installed", primaryTitle: "Close", showsCancel: false, owningTask: 9)
    case .genericGitAuthentication(let remoteURL, _):
        return PopupDescriptor(
            title: "Authentication Required",
            message: "Enter your credentials for \(remoteURL).",
            primaryTitle: "Sign In")
    case .initializeLFS:
        return PopupDescriptor(title: "Initialize Git LFS", primaryTitle: "Initialize", owningTask: 8)
    case .lfsAttributeMismatch:
        return PopupDescriptor(title: "Git LFS Configuration", primaryTitle: "Close", showsCancel: false, owningTask: 8)
    case .upstreamAlreadyExists(_, let existingRemoteName):
        return PopupDescriptor(
            title: "Upstream Already Exists",
            message: "The remote '\(existingRemoteName)' already exists.",
            primaryTitle: "Close", showsCancel: false, owningTask: 7)
    case .releaseNotes:
        return PopupDescriptor(title: "Release Notes", primaryTitle: "Close", showsCancel: false, owningTask: 10)
    case .oversizedFiles(_, let filePaths):
        return PopupDescriptor(
            title: "Oversized Files",
            message: "\(filePaths.count) file(s) exceed the recommended size limit.",
            primaryTitle: "Continue", owningTask: 3)
    case .commitConflictsWarning(_, let fileIDs):
        return PopupDescriptor(
            title: "Commit Conflicts Warning",
            message: "\(fileIDs.count) file(s) contain conflict markers.",
            primaryTitle: "Commit Anyway", owningTask: 3)
    case .pushNeedsPull:
        return PopupDescriptor(
            title: "Push Needs Pull",
            message: "The remote contains work that you do not have locally. Fetch and merge the remote changes, then push again.",
            primaryTitle: "Fetch", owningTask: 7)
    case .confirmForcePush(_, let upstreamBranch):
        return PopupDescriptor(
            title: "Confirm Force Push",
            message: "Force pushing will overwrite \(upstreamBranch) on the remote. This cannot be undone.",
            primaryTitle: "Force Push", owningTask: 7)
    case .stashAndSwitchBranch(_, let branchRef):
        return PopupDescriptor(
            title: "Stash and Switch Branch",
            message: "You have uncommitted changes. Stash them before switching to \(branchRef)?",
            primaryTitle: "Stash and Switch", owningTask: 8)
    case .confirmOverwriteStash:
        return PopupDescriptor(
            title: "Overwrite Stash",
            message: "Applying these changes will overwrite your existing stash.",
            primaryTitle: "Overwrite", owningTask: 8)
    case .confirmDiscardStash(_, let stashName):
        return PopupDescriptor(
            title: "Discard Stash",
            message: "Discarding '\(stashName)' cannot be undone.",
            primaryTitle: "Discard Stash", owningTask: 8)
    case .confirmCheckoutCommit:
        return PopupDescriptor(
            title: "Checkout Commit",
            message: "Checking out a commit puts you in a detached HEAD state.",
            primaryTitle: "Checkout", owningTask: 8)
    case .createTutorialRepository:
        return PopupDescriptor(title: "Create Tutorial Repository", primaryTitle: "Create", owningTask: 9)
    case .confirmExitTutorial:
        return PopupDescriptor(title: "Exit Tutorial", primaryTitle: "Exit Tutorial", owningTask: 9)
    case .createTag:
        return PopupDescriptor(title: "Create a Tag", primaryTitle: "Create Tag", owningTask: 8)
    case .deleteTag(_, let tagName):
        return PopupDescriptor(
            title: "Delete Tag",
            message: "Delete the tag '\(tagName)'?",
            primaryTitle: "Delete", owningTask: 8)
    case .localChangesOverwritten(_, let files):
        return PopupDescriptor(
            title: "Local Changes Overwritten",
            message: "\(files.count) file(s) with local changes would be overwritten.",
            primaryTitle: "Close", showsCancel: false, owningTask: 7)
    case .moveToApplicationsFolder:
        return PopupDescriptor(
            title: "Move to Applications Folder",
            message: "Move GitDesktop to the Applications folder?",
            primaryTitle: "Move", owningTask: 9)
    case .changeRepositoryAlias:
        return PopupDescriptor(title: "Change Repository Alias", primaryTitle: "Save")
    case .thankYou:
        // Deleted surface per scope (GH contributions); retained in the model
        // only so Task 1's popup taxonomy stays exhaustive. Never presented.
        return PopupDescriptor(title: "Thank You", primaryTitle: "Close", showsCancel: false)
    case .commitMessage(_, let dialogTitle, let dialogButtonText):
        return PopupDescriptor(title: dialogTitle, primaryTitle: dialogButtonText, owningTask: 6)
    case .multiCommitOperation:
        return PopupDescriptor(title: "Operation in Progress", primaryTitle: "Close", showsCancel: false, owningTask: 6)
    case .warnLocalChangesBeforeUndo:
        return PopupDescriptor(
            title: "Undo Commit",
            message: "Undoing this commit may affect your local changes.",
            primaryTitle: "Undo Commit", owningTask: 8)
    case .warningBeforeReset(_, let commitSHA):
        return PopupDescriptor(
            title: "Reset to Commit",
            message: "Resetting to \(shortenSHA(commitSHA)) may discard local changes.",
            primaryTitle: "Reset", owningTask: 8)
    case .addSSHHost(let host, _):
        return PopupDescriptor(
            title: "Unknown SSH Host",
            message: "The host \(host) is unknown. Add it to your known hosts?",
            primaryTitle: "Add Host", owningTask: 7)
    case .sshKeyPassphrase(let keyPath):
        return PopupDescriptor(
            title: "SSH Key Passphrase",
            message: "Enter the passphrase for \(keyPath).",
            primaryTitle: "Unlock", owningTask: 7)
    case .sshUserPassword(let username):
        return PopupDescriptor(
            title: "SSH Authentication",
            message: "Enter the password for \(username).",
            primaryTitle: "Authenticate", owningTask: 7)
    case .warnForcePush(let operation):
        return PopupDescriptor(
            title: "Confirm Force Push",
            message: "\(operation) will rewrite history on the remote. This cannot be undone.",
            primaryTitle: "Force Push", owningTask: 6)
    case .discardChangesRetry:
        return PopupDescriptor(
            title: "Discard Changes Failed",
            message: "Some changes could not be discarded. Try again?",
            primaryTitle: "Retry", owningTask: 3)
    case .unreachableCommits:
        return PopupDescriptor(title: "Unreachable Commits", primaryTitle: "Close", showsCancel: false, owningTask: 5)
    case .error(let message):
        return PopupDescriptor(title: "Error", message: message, primaryTitle: "Dismiss", showsCancel: false)
    case .installingUpdate:
        return PopupDescriptor(title: "Installing Update", primaryTitle: "Close", showsCancel: false, owningTask: 10)
    case .unknownAuthors(_, let authors):
        return PopupDescriptor(
            title: "Unknown Authors",
            message: authors.joined(separator: ", "),
            primaryTitle: "Continue", owningTask: 3)
    case .confirmCommitFilteredChanges(let fileCount):
        return PopupDescriptor(
            title: "Confirm Commit",
            message: "\(fileCount) changed file(s) are filtered out and will not be committed.",
            primaryTitle: "Commit", owningTask: 3)
    case .hookFailed(let hookName, _):
        return PopupDescriptor(
            title: "Hook Failed",
            message: "The '\(hookName)' hook failed.",
            primaryTitle: "Close", showsCancel: false, owningTask: 3)
    case .commitProgress:
        return PopupDescriptor(title: "Committing", primaryTitle: "Close", showsCancel: false, owningTask: 3)
    case .addWorktree:
        return PopupDescriptor(title: "Create a Worktree", primaryTitle: "Create", owningTask: 8)
    case .renameWorktree:
        return PopupDescriptor(title: "Rename Worktree", primaryTitle: "Rename", owningTask: 8)
    case .deleteWorktree:
        return PopupDescriptor(title: "Delete Worktree", primaryTitle: "Delete", owningTask: 8)
    case .deleteWorktreeFailed(_, _, let message):
        return PopupDescriptor(title: "Delete Worktree Failed", message: message, primaryTitle: "Close", showsCancel: false, owningTask: 8)
    }
}
