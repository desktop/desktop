import {
  Repository,
  RepositoryWithGitHubRepository,
  RepositoryWithForkedGitHubRepository,
} from './repository'
import { PullRequest } from './pull-request'
import { Branch } from './branch'
import { ReleaseNote, ReleaseSummary } from './release-notes'
import { IRemote } from './remote'
import { RetryAction } from './retry-actions'
import { WorkingDirectoryFileChange } from './status'
import { PreferencesTab } from './preferences'
import { Commit, CommitOneLine, ICommitContext } from './commit'
import { IStashEntry } from './stash-entry'
import { Account } from '../models/account'
import { Progress } from './progress'
import { ITextDiff, DiffSelection, ImageDiffType } from './diff'
import { RepositorySettingsTab } from '../ui/repository-settings/repository-settings'
import { ICommitMessage } from './commit-message'
import { Author, UnknownAuthor } from './author'
import { IRefCheck } from '../lib/ci-checks/ci-checks'
import { GitHubRepository } from './github-repository'
import { ValidNotificationPullRequestReview } from '../lib/valid-notification-pull-request-review'
import { UnreachableCommitsTab } from '../ui/history/unreachable-commits-dialog'
import { IAPIComment } from '../lib/api'

export enum PopupType {
  RenameBranch = 'RenameBranch',
  DeleteBranch = 'DeleteBranch',
  DeleteRemoteBranch = 'DeleteRemoteBranch',
  ConfirmDiscardChanges = 'ConfirmDiscardChanges',
  Preferences = 'Preferences',
  RepositorySettings = 'RepositorySettings',
  AddRepository = 'AddRepository',
  CreateRepository = 'CreateRepository',
  CloneRepository = 'CloneRepository',
  CreateBranch = 'CreateBranch',
  SignIn = 'SignIn',
  About = 'About',
  InstallGit = 'InstallGit',
  PublishRepository = 'PublishRepository',
  Acknowledgements = 'Acknowledgements',
  UntrustedCertificate = 'UntrustedCertificate',
  RemoveRepository = 'RemoveRepository',
  TermsAndConditions = 'TermsAndConditions',
  PushBranchCommits = 'PushBranchCommits',
  CLIInstalled = 'CLIInstalled',
  GenericGitAuthentication = 'GenericGitAuthentication',
  ExternalEditorFailed = 'ExternalEditorFailed',
  OpenShellFailed = 'OpenShellFailed',
  InitializeLFS = 'InitializeLFS',
  LFSAttributeMismatch = 'LFSAttributeMismatch',
  UpstreamAlreadyExists = 'UpstreamAlreadyExists',
  ReleaseNotes = 'ReleaseNotes',
  DeletePullRequest = 'DeletePullRequest',
  OversizedFiles = 'OversizedFiles',
  CommitConflictsWarning = 'CommitConflictsWarning',
  PushNeedsPull = 'PushNeedsPull',
  ConfirmForcePush = 'ConfirmForcePush',
  StashAndSwitchBranch = 'StashAndSwitchBranch',
  ConfirmOverwriteStash = 'ConfirmOverwriteStash',
  ConfirmDiscardStash = 'ConfirmDiscardStash',
  ConfirmCheckoutCommit = 'ConfirmCheckoutCommit',
  CreateTutorialRepository = 'CreateTutorialRepository',
  ConfirmExitTutorial = 'ConfirmExitTutorial',
  PushRejectedDueToMissingWorkflowScope = 'PushRejectedDueToMissingWorkflowScope',
  SAMLReauthRequired = 'SAMLReauthRequired',
  CreateFork = 'CreateFork',
  CreateTag = 'CreateTag',
  DeleteTag = 'DeleteTag',
  LocalChangesOverwritten = 'LocalChangesOverwritten',
  ChooseForkSettings = 'ChooseForkSettings',
  ConfirmDiscardSelection = 'ConfirmDiscardSelection',
  MoveToApplicationsFolder = 'MoveToApplicationsFolder',
  ChangeRepositoryAlias = 'ChangeRepositoryAlias',
  ThankYou = 'ThankYou',
  CommitMessage = 'CommitMessage',
  MultiCommitOperation = 'MultiCommitOperation',
  WarnLocalChangesBeforeUndo = 'WarnLocalChangesBeforeUndo',
  WarningBeforeReset = 'WarningBeforeReset',
  InvalidatedToken = 'InvalidatedToken',
  AddSSHHost = 'AddSSHHost',
  SSHKeyPassphrase = 'SSHKeyPassphrase',
  SSHUserPassword = 'SSHUserPassword',
  PullRequestChecksFailed = 'PullRequestChecksFailed',
  CICheckRunRerun = 'CICheckRunRerun',
  WarnForcePush = 'WarnForcePush',
  DiscardChangesRetry = 'DiscardChangesRetry',
  PullRequestReview = 'PullRequestReview',
  UnreachableCommits = 'UnreachableCommits',
  StartPullRequest = 'StartPullRequest',
  Error = 'Error',
  InstallingUpdate = 'InstallingUpdate',
  TestNotifications = 'TestNotifications',
  PullRequestComment = 'PullRequestComment',
  UnknownAuthors = 'UnknownAuthors',
  ConfirmRepoRulesBypass = 'ConfirmRepoRulesBypass',
  TestIcons = 'TestIcons',
}

interface IBasePopup {
  /**
   * Unique id of the popup that it receives upon adding to the stack.
   */
  readonly id?: string
}

export type PopupDetail =
  | { type: PopupType.RenameBranch; repository: Repository; branch: Branch }
  | {
      type: PopupType.DeleteBranch
      repository: Repository
      branch: Branch
      existsOnRemote: boolean
    }
  | {
      type: PopupType.DeleteRemoteBranch
      repository: Repository
      branch: Branch
    }
  | {
      type: PopupType.ConfirmDiscardChanges
      repository: Repository
      files: ReadonlyArray<WorkingDirectoryFileChange>
      showDiscardChangesSetting?: boolean
      discardingAllChanges?: boolean
    }
  | {
      type: PopupType.ConfirmDiscardSelection
      repository: Repository
      file: WorkingDirectoryFileChange
      diff: ITextDiff
      selection: DiffSelection
    }
  | { type: PopupType.Preferences; initialSelectedTab?: PreferencesTab }
  | {
      type: PopupType.RepositorySettings
      repository: Repository
      initialSelectedTab?: RepositorySettingsTab
    }
  | { type: PopupType.AddRepository; path?: string }
  | { type: PopupType.CreateRepository; path?: string }
  | {
      type: PopupType.CloneRepository
      initialURL: string | null
    }
  | {
      type: PopupType.CreateBranch
      repository: Repository
      initialName?: string
      targetCommit?: CommitOneLine
    }
  | {
      type: PopupType.SignIn
      isCredentialHelperSignIn?: boolean
      credentialHelperUrl?: string
    }
  | { type: PopupType.About }
  | { type: PopupType.InstallGit; path: string }
  | { type: PopupType.PublishRepository; repository: Repository }
  | { type: PopupType.Acknowledgements }
  | {
      type: PopupType.UntrustedCertificate
      certificate: Electron.Certificate
      url: string
    }
  | { type: PopupType.RemoveRepository; repository: Repository }
  | { type: PopupType.TermsAndConditions }
  | {
      type: PopupType.PushBranchCommits
      repository: Repository
      branch: Branch
      unPushedCommits?: number
    }
  | { type: PopupType.CLIInstalled }
  | {
      type: PopupType.GenericGitAuthentication
      remoteUrl: string
      username?: string
      onSubmit: (username: string, password: string) => void
      onDismiss: () => void
    }
  | {
      type: PopupType.ExternalEditorFailed
      message: string
      suggestDefaultEditor?: boolean
      openPreferences?: boolean
    }
  | { type: PopupType.OpenShellFailed; message: string }
  | { type: PopupType.InitializeLFS; repositories: ReadonlyArray<Repository> }
  | { type: PopupType.LFSAttributeMismatch }
  | {
      type: PopupType.UpstreamAlreadyExists
      repository: Repository
      existingRemote: IRemote
    }
  | {
      type: PopupType.ReleaseNotes
      newReleases: ReadonlyArray<ReleaseSummary>
    }
  | {
      type: PopupType.DeletePullRequest
      repository: Repository
      branch: Branch
      pullRequest: PullRequest
    }
  | {
      type: PopupType.OversizedFiles
      oversizedFiles: ReadonlyArray<string>
      context: ICommitContext
      repository: Repository
    }
  | {
      type: PopupType.CommitConflictsWarning
      /** files that were selected for committing that are also conflicted */
      files: ReadonlyArray<WorkingDirectoryFileChange>
      /** repository user is committing in */
      repository: Repository
      /** information for completing the commit */
      context: ICommitContext
    }
  | {
      type: PopupType.PushNeedsPull
      repository: Repository
    }
  | {
      type: PopupType.ConfirmForcePush
      repository: Repository
      upstreamBranch: string
    }
  | {
      type: PopupType.StashAndSwitchBranch
      repository: Repository
      branchToCheckout: Branch
    }
  | {
      type: PopupType.ConfirmOverwriteStash
      repository: Repository
      branchToCheckout: Branch | null
    }
  | {
      type: PopupType.ConfirmDiscardStash
      repository: Repository
      stash: IStashEntry
    }
  | {
      type: PopupType.ConfirmCheckoutCommit
      repository: Repository
      commit: CommitOneLine
    }
  | {
      type: PopupType.CreateTutorialRepository
      account: Account
      progress?: Progress
    }
  | {
      type: PopupType.ConfirmExitTutorial
    }
  | {
      type: PopupType.PushRejectedDueToMissingWorkflowScope
      rejectedPath: string
      repository: RepositoryWithGitHubRepository
    }
  | {
      type: PopupType.SAMLReauthRequired
      organizationName: string
      endpoint: string
      retryAction?: RetryAction
    }
  | {
      type: PopupType.CreateFork
      repository: RepositoryWithGitHubRepository
      account: Account
    }
  | {
      type: PopupType.CreateTag
      repository: Repository
      targetCommitSha: string
      initialName?: string
      localTags: Map<string, string> | null
    }
  | {
      type: PopupType.DeleteTag
      repository: Repository
      tagName: string
    }
  | {
      type: PopupType.ChooseForkSettings
      repository: RepositoryWithForkedGitHubRepository
    }
  | {
      type: PopupType.LocalChangesOverwritten
      repository: Repository
      retryAction: RetryAction
      files: ReadonlyArray<string>
    }
  | { type: PopupType.MoveToApplicationsFolder }
  | { type: PopupType.ChangeRepositoryAlias; repository: Repository }
  | {
      type: PopupType.ThankYou
      userContributions: ReadonlyArray<ReleaseNote>
      friendlyName: string
      latestVersion: string | null
    }
  | {
      type: PopupType.CommitMessage
      coAuthors: ReadonlyArray<Author>
      showCoAuthoredBy: boolean
      commitMessage: ICommitMessage | null
      dialogTitle: string
      dialogButtonText: string
      prepopulateCommitSummary: boolean
      repository: Repository
      onSubmitCommitMessage: (context: ICommitContext) => Promise<boolean>
    }
  | {
      type: PopupType.MultiCommitOperation
      repository: Repository
    }
  | {
      type: PopupType.WarnLocalChangesBeforeUndo
      repository: Repository
      commit: Commit
      isWorkingDirectoryClean: boolean
    }
  | {
      type: PopupType.WarningBeforeReset
      repository: Repository
      commit: Commit
    }
  | {
      type: PopupType.InvalidatedToken
      account: Account
    }
  | {
      type: PopupType.AddSSHHost
      host: string
      ip: string
      keyType: string
      fingerprint: string
      onSubmit: (addHost: boolean) => void
    }
  | {
      type: PopupType.SSHKeyPassphrase
      keyPath: string
      onSubmit: (
        passphrase: string | undefined,
        storePassphrase: boolean
      ) => void
    }
  | {
      type: PopupType.SSHUserPassword
      username: string
      onSubmit: (password: string | undefined, storePassword: boolean) => void
    }
  | {
      type: PopupType.PullRequestChecksFailed
      repository: RepositoryWithGitHubRepository
      pullRequest: PullRequest
      shouldChangeRepository: boolean
      checks: ReadonlyArray<IRefCheck>
    }
  | {
      type: PopupType.CICheckRunRerun
      checkRuns: ReadonlyArray<IRefCheck>
      repository: GitHubRepository
      prRef: string
      failedOnly: boolean
    }
  | { type: PopupType.WarnForcePush; operation: string; onBegin: () => void }
  | {
      type: PopupType.DiscardChangesRetry
      retryAction: RetryAction
    }
  | {
      type: PopupType.PullRequestReview
      repository: RepositoryWithGitHubRepository
      pullRequest: PullRequest
      review: ValidNotificationPullRequestReview
      shouldCheckoutBranch: boolean
      shouldChangeRepository: boolean
    }
  | {
      type: PopupType.UnreachableCommits
      selectedTab: UnreachableCommitsTab
    }
  | {
      type: PopupType.StartPullRequest
      prBaseBranches: ReadonlyArray<Branch>
      currentBranch: Branch
      defaultBranch: Branch | null
      externalEditorLabel?: string
      imageDiffType: ImageDiffType
      prRecentBaseBranches: ReadonlyArray<Branch>
      repository: Repository
      nonLocalCommitSHA: string | null
      showSideBySideDiff: boolean
      currentBranchHasPullRequest: boolean
    }
  | {
      type: PopupType.Error
      error: Error
    }
  | {
      type: PopupType.InstallingUpdate
    }
  | {
      type: PopupType.TestNotifications
      repository: RepositoryWithGitHubRepository
    }
  | {
      type: PopupType.PullRequestComment
      repository: RepositoryWithGitHubRepository
      pullRequest: PullRequest
      comment: IAPIComment
      shouldCheckoutBranch: boolean
      shouldChangeRepository: boolean
    }
  | {
      type: PopupType.UnknownAuthors
      authors: ReadonlyArray<UnknownAuthor>
      onCommit: () => void
    }
  | {
      type: PopupType.ConfirmRepoRulesBypass
      repository: GitHubRepository
      branch: string
      onConfirm: () => void
    }
  | {
      type: PopupType.TestIcons
    }

export type Popup = IBasePopup & PopupDetail
