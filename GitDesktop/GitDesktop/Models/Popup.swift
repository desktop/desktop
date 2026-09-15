import Foundation

// MARK: - Popup (pruned)
// Port of `electron/app/src/models/popup.ts` with the AGENTS.md deletions
// applied: no GitHub (SignIn, PublishRepository, PRs, forks, SAML/re-auth,
// token, secret-scanning bypass API), no editor/terminal integration, no
// Copilot, no OS notifications. Closures in the original (`onSubmit`,
// `resolve`, …) become plain data here; Task 2's DialogHost wires them to
// `AppStore` actions.

public enum PopupType: String, Codable, Sendable {
    case renameBranch
    case deleteBranch
    case deleteRemoteBranch
    case confirmDiscardChanges
    case confirmDiscardSelection
    case preferences
    case repositorySettings
    case addRepository
    case createRepository
    case cloneRepository
    case createBranch
    case about
    case installGit
    case acknowledgements
    case shortcuts
    case untrustedCertificate
    case removeRepository
    case termsAndConditions
    case pushBranchCommits
    case cliInstalled
    case genericGitAuthentication
    case initializeLFS
    case lfsAttributeMismatch
    case upstreamAlreadyExists
    case releaseNotes
    case oversizedFiles
    case commitConflictsWarning
    case pushNeedsPull
    case confirmForcePush
    case stashAndSwitchBranch
    case confirmOverwriteStash
    case confirmDiscardStash
    case confirmCheckoutCommit
    case createTutorialRepository
    case confirmExitTutorial
    case createTag
    case deleteTag
    case localChangesOverwritten
    case moveToApplicationsFolder
    case changeRepositoryAlias
    case thankYou
    case commitMessage
    case multiCommitOperation
    case warnLocalChangesBeforeUndo
    case warningBeforeReset
    case addSSHHost
    case sshKeyPassphrase
    case sshUserPassword
    case warnForcePush
    case discardChangesRetry
    case unreachableCommits
    case error
    case installingUpdate
    case unknownAuthors
    case confirmCommitFilteredChanges
    case hookFailed
    case commitProgress
    case addWorktree
    case renameWorktree
    case deleteWorktree
    case deleteWorktreeFailed
}

public enum Popup: Sendable, Equatable, Identifiable {
    case renameBranch(repositoryID: Int, branchRef: String)
    case deleteBranch(repositoryID: Int, branchRef: String, existsOnRemote: Bool)
    case deleteRemoteBranch(repositoryID: Int, branchRef: String)
    case confirmDiscardChanges(repositoryID: Int, fileIDs: [String], showDiscardChangesSetting: Bool, discardingAllChanges: Bool)
    case confirmDiscardSelection(repositoryID: Int, fileID: String)
    case preferences(initialTab: String?)
    case repositorySettings(repositoryID: Int, initialTab: String?)
    case addRepository(path: String?)
    case createRepository(path: String?)
    case cloneRepository(initialURL: String?)
    case createBranch(repositoryID: Int, initialName: String?, targetCommitSHA: String?)
    case about
    case installGit(path: String)
    case acknowledgements
    case shortcuts
    case untrustedCertificate(host: String, certificateData: String)
    case removeRepository(repositoryID: Int)
    case termsAndConditions
    case pushBranchCommits(repositoryID: Int, branchRef: String, unPushedCommits: Int?)
    case cliInstalled
    case genericGitAuthentication(remoteURL: String, username: String?)
    case initializeLFS(repositoryIDs: [Int])
    case lfsAttributeMismatch
    case upstreamAlreadyExists(repositoryID: Int, existingRemoteName: String)
    case releaseNotes
    case oversizedFiles(repositoryID: Int, filePaths: [String])
    case commitConflictsWarning(repositoryID: Int, fileIDs: [String])
    case pushNeedsPull(repositoryID: Int)
    case confirmForcePush(repositoryID: Int, upstreamBranch: String)
    case stashAndSwitchBranch(repositoryID: Int, branchRef: String)
    case confirmOverwriteStash(repositoryID: Int, branchRef: String?)
    case confirmDiscardStash(repositoryID: Int, stashName: String)
    case confirmCheckoutCommit(repositoryID: Int, commitSHA: String)
    case createTutorialRepository
    case confirmExitTutorial
    case createTag(repositoryID: Int, targetCommitSHA: String, initialName: String?)
    case deleteTag(repositoryID: Int, tagName: String)
    case localChangesOverwritten(repositoryID: Int, files: [String])
    case moveToApplicationsFolder
    case changeRepositoryAlias(repositoryID: Int)
    case thankYou
    case commitMessage(repositoryID: Int, dialogTitle: String, dialogButtonText: String)
    case multiCommitOperation(repositoryID: Int)
    case warnLocalChangesBeforeUndo(repositoryID: Int, commitSHA: String, isWorkingDirectoryClean: Bool)
    case warningBeforeReset(repositoryID: Int, commitSHA: String)
    case addSSHHost(host: String, fingerprint: String)
    case sshKeyPassphrase(keyPath: String)
    case sshUserPassword(username: String)
    case warnForcePush(operation: String)
    case discardChangesRetry(repositoryID: Int)
    case unreachableCommits(repositoryID: Int)
    case error(message: String)
    case installingUpdate
    case unknownAuthors(repositoryID: Int, authors: [String])
    case confirmCommitFilteredChanges(fileCount: Int)
    case hookFailed(hookName: String, terminalOutput: String)
    case commitProgress
    case addWorktree(repositoryID: Int, initialBranchName: String?, initialWorktreeName: String?)
    case renameWorktree(repositoryID: Int, worktreePath: String)
    case deleteWorktree(repositoryID: Int, worktreePath: String)
    case deleteWorktreeFailed(repositoryID: Int, worktreePath: String, message: String)

    public var type: PopupType {
        switch self {
        case .renameBranch: return .renameBranch
        case .deleteBranch: return .deleteBranch
        case .deleteRemoteBranch: return .deleteRemoteBranch
        case .confirmDiscardChanges: return .confirmDiscardChanges
        case .confirmDiscardSelection: return .confirmDiscardSelection
        case .preferences: return .preferences
        case .repositorySettings: return .repositorySettings
        case .addRepository: return .addRepository
        case .createRepository: return .createRepository
        case .cloneRepository: return .cloneRepository
        case .createBranch: return .createBranch
        case .about: return .about
        case .installGit: return .installGit
        case .acknowledgements: return .acknowledgements
        case .shortcuts: return .shortcuts
        case .untrustedCertificate: return .untrustedCertificate
        case .removeRepository: return .removeRepository
        case .termsAndConditions: return .termsAndConditions
        case .pushBranchCommits: return .pushBranchCommits
        case .cliInstalled: return .cliInstalled
        case .genericGitAuthentication: return .genericGitAuthentication
        case .initializeLFS: return .initializeLFS
        case .lfsAttributeMismatch: return .lfsAttributeMismatch
        case .upstreamAlreadyExists: return .upstreamAlreadyExists
        case .releaseNotes: return .releaseNotes
        case .oversizedFiles: return .oversizedFiles
        case .commitConflictsWarning: return .commitConflictsWarning
        case .pushNeedsPull: return .pushNeedsPull
        case .confirmForcePush: return .confirmForcePush
        case .stashAndSwitchBranch: return .stashAndSwitchBranch
        case .confirmOverwriteStash: return .confirmOverwriteStash
        case .confirmDiscardStash: return .confirmDiscardStash
        case .confirmCheckoutCommit: return .confirmCheckoutCommit
        case .createTutorialRepository: return .createTutorialRepository
        case .confirmExitTutorial: return .confirmExitTutorial
        case .createTag: return .createTag
        case .deleteTag: return .deleteTag
        case .localChangesOverwritten: return .localChangesOverwritten
        case .moveToApplicationsFolder: return .moveToApplicationsFolder
        case .changeRepositoryAlias: return .changeRepositoryAlias
        case .thankYou: return .thankYou
        case .commitMessage: return .commitMessage
        case .multiCommitOperation: return .multiCommitOperation
        case .warnLocalChangesBeforeUndo: return .warnLocalChangesBeforeUndo
        case .warningBeforeReset: return .warningBeforeReset
        case .addSSHHost: return .addSSHHost
        case .sshKeyPassphrase: return .sshKeyPassphrase
        case .sshUserPassword: return .sshUserPassword
        case .warnForcePush: return .warnForcePush
        case .discardChangesRetry: return .discardChangesRetry
        case .unreachableCommits: return .unreachableCommits
        case .error: return .error
        case .installingUpdate: return .installingUpdate
        case .unknownAuthors: return .unknownAuthors
        case .confirmCommitFilteredChanges: return .confirmCommitFilteredChanges
        case .hookFailed: return .hookFailed
        case .commitProgress: return .commitProgress
        case .addWorktree: return .addWorktree
        case .renameWorktree: return .renameWorktree
        case .deleteWorktree: return .deleteWorktree
        case .deleteWorktreeFailed: return .deleteWorktreeFailed
        }
    }

    /// Stable identity for sheet presentation. Error popups stack (they are
    /// never deduped); all other types have one instance per type.
    public var id: String {
        switch self {
        case .error(let message): return "error-\(abs(message.hashValue))"
        default: return "popup-\(type.rawValue)"
        }
    }
}
