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
import { IAuthor } from './author'
import { IRefCheck } from '../lib/ci-checks/ci-checks'
import { GitHubRepository } from './github-repository'
import { ValidNotificationPullRequestReview } from '../lib/valid-notification-pull-request-review'
import { UnreachableCommitsTab } from '../ui/history/unreachable-commits-dialog'

export enum PopupType {
  RenameBranch = 1,
  DeleteBranch,
  DeleteRemoteBranch,
  ConfirmDiscardChanges,
  Preferences,
  RepositorySettings,
  AddRepository,
  CreateRepository,
  CloneRepository,
  CreateBranch,
  SignIn,
  About,
  InstallGit,
  PublishRepository,
  Acknowledgements,
  UntrustedCertificate,
  RemoveRepository,
  TermsAndConditions,
  PushBranchCommits,
  CLIInstalled,
  GenericGitAuthentication,
  ExternalEditorFailed,
  OpenShellFailed,
  InitializeLFS,
  LFSAttributeMismatch,
  UpstreamAlreadyExists,
  ReleaseNotes,
  DeletePullRequest,
  OversizedFiles,
  CommitConflictsWarning,
  PushNeedsPull,
  ConfirmForcePush,
  StashAndSwitchBranch,
  ConfirmOverwriteStash,
  ConfirmDiscardStash,
  CreateTutorialRepository,
  ConfirmExitTutorial,
  PushRejectedDueToMissingWorkflowScope,
  SAMLReauthRequired,
  CreateFork,
  CreateTag,
  DeleteTag,
  LocalChangesOverwritten,
  ChooseForkSettings,
  ConfirmDiscardSelection,
  MoveToApplicationsFolder,
  ChangeRepositoryAlias,
  ThankYou,
  CommitMessage,
  MultiCommitOperation,
  WarnLocalChangesBeforeUndo,
  WarningBeforeReset,
  InvalidatedToken,
  AddSSHHost,
  SSHKeyPassphrase,
  SSHUserPassword,
  PullRequestChecksFailed,
  CICheckRunRerun,
  WarnForcePush,
  DiscardChangesRetry,
  PullRequestReview,
  UnreachableCommits,
  StartPullRequest,
}

interface IBasePopup {
  /**
   * Unique id of the popup that it receives upon adding to the stack.
   */
  readonly id?: string
}

interface IRenameBranchPopup extends IBasePopup {
  type: PopupType.RenameBranch
  repository: Repository
  branch: Branch
}

interface IDeleteBranchPopup extends IBasePopup {
  type: PopupType.DeleteBranch
  repository: Repository
  branch: Branch
  existsOnRemote: boolean
}

interface IDeleteRemoteBranchPopup extends IBasePopup {
  type: PopupType.DeleteRemoteBranch
  repository: Repository
  branch: Branch
}

interface IConfirmDiscardChangesPopup extends IBasePopup {
  type: PopupType.ConfirmDiscardChanges
  repository: Repository
  files: ReadonlyArray<WorkingDirectoryFileChange>
  showDiscardChangesSetting?: boolean
  discardingAllChanges?: boolean
}

interface IConfirmDiscardSelectionPopup extends IBasePopup {
  type: PopupType.ConfirmDiscardSelection
  repository: Repository
  file: WorkingDirectoryFileChange
  diff: ITextDiff
  selection: DiffSelection
}

interface IPreferencesPopup extends IBasePopup {
  type: PopupType.Preferences
  initialSelectedTab?: PreferencesTab
}

interface IRepositorySettingsPopup extends IBasePopup {
  type: PopupType.RepositorySettings
  repository: Repository
  initialSelectedTab?: RepositorySettingsTab
}

interface IAddRepositoryPopup extends IBasePopup {
  type: PopupType.AddRepository
  path?: string
}

interface ICreateRepositoryPopup extends IBasePopup {
  type: PopupType.CreateRepository
  path?: string
}

interface ICloneRepositoryPopup extends IBasePopup {
  type: PopupType.CloneRepository
  initialURL: string | null
}

interface ICreateBranchPopup extends IBasePopup {
  type: PopupType.CreateBranch
  repository: Repository
  initialName?: string
  targetCommit?: CommitOneLine
}

interface ISignInPopup extends IBasePopup {
  type: PopupType.SignIn
}

interface IAboutPopup extends IBasePopup {
  type: PopupType.About
}

interface IInstallGitPopup extends IBasePopup {
  type: PopupType.InstallGit
  path: string
}

interface IPublishRepositoryPopup extends IBasePopup {
  type: PopupType.PublishRepository
  repository: Repository
}

interface IAcknowledgementsPopup extends IBasePopup {
  type: PopupType.Acknowledgements
}

interface IUntrustedCertificatePopup extends IBasePopup {
  type: PopupType.UntrustedCertificate
  certificate: Electron.Certificate
  url: string
}

interface IRemoveRepositoryPopup extends IBasePopup {
  type: PopupType.RemoveRepository
  repository: Repository
}

interface ITermsAndConditionsPopup extends IBasePopup {
  type: PopupType.TermsAndConditions
}

interface IPushBranchCommitsPopup extends IBasePopup {
  type: PopupType.PushBranchCommits
  repository: Repository
  branch: Branch
  unPushedCommits?: number
}

interface ICLIInstalledPopup extends IBasePopup {
  type: PopupType.CLIInstalled
}

interface IGenericGitAuthenticationPopup extends IBasePopup {
  type: PopupType.GenericGitAuthentication
  hostname: string
  retryAction: RetryAction
}

interface IExternalEditorFailedPopup extends IBasePopup {
  type: PopupType.ExternalEditorFailed
  message: string
  suggestDefaultEditor?: boolean
  openPreferences?: boolean
}

interface IOpenShellFailedPopup extends IBasePopup {
  type: PopupType.OpenShellFailed
  message: string
}

interface IInitializeLFSPopup extends IBasePopup {
  type: PopupType.InitializeLFS
  repositories: ReadonlyArray<Repository>
}

interface ILFSAttributeMismatchPopup extends IBasePopup {
  type: PopupType.LFSAttributeMismatch
}

interface IUpstreamAlreadyExistsPopup extends IBasePopup {
  type: PopupType.UpstreamAlreadyExists
  repository: Repository
  existingRemote: IRemote
}

interface IReleaseNotesPopup extends IBasePopup {
  type: PopupType.ReleaseNotes
  newReleases: ReadonlyArray<ReleaseSummary>
}

interface IDeletePullRequestPopup extends IBasePopup {
  type: PopupType.DeletePullRequest
  repository: Repository
  branch: Branch
  pullRequest: PullRequest
}

interface IOversizedFilesPopup extends IBasePopup {
  type: PopupType.OversizedFiles
  oversizedFiles: ReadonlyArray<string>
  context: ICommitContext
  repository: Repository
}

interface ICommitConflictsWarningPopup extends IBasePopup {
  type: PopupType.CommitConflictsWarning
  /** files that were selected for committing that are also conflicted */
  files: ReadonlyArray<WorkingDirectoryFileChange>
  /** repository user is committing in */
  repository: Repository
  /** information for completing the commit */
  context: ICommitContext
}

interface IPushNeedsPullPopup extends IBasePopup {
  type: PopupType.PushNeedsPull
  repository: Repository
}

interface IConfirmForcePushPopup extends IBasePopup {
  type: PopupType.ConfirmForcePush
  repository: Repository
  upstreamBranch: string
}

interface IStashAndSwitchBranchPopup extends IBasePopup {
  type: PopupType.StashAndSwitchBranch
  repository: Repository
  branchToCheckout: Branch
}

interface IConfirmOverwriteStashPopup extends IBasePopup {
  type: PopupType.ConfirmOverwriteStash
  repository: Repository
  branchToCheckout: Branch | null
}

interface IConfirmDiscardStashPopup extends IBasePopup {
  type: PopupType.ConfirmDiscardStash
  repository: Repository
  stash: IStashEntry
}

interface ICreateTutorialRepositoryPopup extends IBasePopup {
  type: PopupType.CreateTutorialRepository
  account: Account
  progress?: Progress
}

interface IConfirmExitTutorialPopup extends IBasePopup {
  type: PopupType.ConfirmExitTutorial
}

interface IPushRejectedDueToMissingWorkflowScopePopup extends IBasePopup {
  type: PopupType.PushRejectedDueToMissingWorkflowScope
  rejectedPath: string
  repository: RepositoryWithGitHubRepository
}

interface ISAMLReauthRequiredPopup extends IBasePopup {
  type: PopupType.SAMLReauthRequired
  organizationName: string
  endpoint: string
  retryAction?: RetryAction
}

interface ICreateForkPopup extends IBasePopup {
  type: PopupType.CreateFork
  repository: RepositoryWithGitHubRepository
  account: Account
}

interface ICreateTagPopup extends IBasePopup {
  type: PopupType.CreateTag
  repository: Repository
  targetCommitSha: string
  initialName?: string
  localTags: Map<string, string> | null
}

interface IDeleteTagPopup extends IBasePopup {
  type: PopupType.DeleteTag
  repository: Repository
  tagName: string
}

interface IChooseForkSettingsPopup extends IBasePopup {
  type: PopupType.ChooseForkSettings
  repository: RepositoryWithForkedGitHubRepository
}

interface ILocalChangesOverwrittenPopup extends IBasePopup {
  type: PopupType.LocalChangesOverwritten
  repository: Repository
  retryAction: RetryAction
  files: ReadonlyArray<string>
}

interface IMoveToApplicationsFolderPopup extends IBasePopup {
  type: PopupType.MoveToApplicationsFolder
}

interface IChangeRepositoryAliasPopup extends IBasePopup {
  type: PopupType.ChangeRepositoryAlias
  repository: Repository
}

interface IThankYouPopup extends IBasePopup {
  type: PopupType.ThankYou
  userContributions: ReadonlyArray<ReleaseNote>
  friendlyName: string
  latestVersion: string | null
}

interface ICommitMessagePopup extends IBasePopup {
  type: PopupType.CommitMessage
  coAuthors: ReadonlyArray<IAuthor>
  showCoAuthoredBy: boolean
  commitMessage: ICommitMessage | null
  dialogTitle: string
  dialogButtonText: string
  prepopulateCommitSummary: boolean
  repository: Repository
  onSubmitCommitMessage: (context: ICommitContext) => Promise<boolean>
}

interface IMultiCommitOperationPopup extends IBasePopup {
  type: PopupType.MultiCommitOperation
  repository: Repository
}

interface IWarnLocalChangesBeforeUndoPopup extends IBasePopup {
  type: PopupType.WarnLocalChangesBeforeUndo
  repository: Repository
  commit: Commit
  isWorkingDirectoryClean: boolean
}

interface IWarningBeforeResetPopup extends IBasePopup {
  type: PopupType.WarningBeforeReset
  repository: Repository
  commit: Commit
}

interface IInvalidatedTokenPopup extends IBasePopup {
  type: PopupType.InvalidatedToken
  account: Account
}

interface IAddSSHHostPopup extends IBasePopup {
  type: PopupType.AddSSHHost
  host: string
  ip: string
  keyType: string
  fingerprint: string
  onSubmit: (addHost: boolean) => void
}

interface ISSHKeyPassphrasePopup extends IBasePopup {
  type: PopupType.SSHKeyPassphrase
  keyPath: string
  onSubmit: (passphrase: string | undefined, storePassphrase: boolean) => void
}

interface ISSHUserPasswordPopup extends IBasePopup {
  type: PopupType.SSHUserPassword
  username: string
  onSubmit: (password: string | undefined, storePassword: boolean) => void
}

interface IPullRequestChecksFailedPopup extends IBasePopup {
  type: PopupType.PullRequestChecksFailed
  repository: RepositoryWithGitHubRepository
  pullRequest: PullRequest
  shouldChangeRepository: boolean
  commitMessage: string
  commitSha: string
  checks: ReadonlyArray<IRefCheck>
}

interface ICICheckRunRerunPopup extends IBasePopup {
  type: PopupType.CICheckRunRerun
  checkRuns: ReadonlyArray<IRefCheck>
  repository: GitHubRepository
  prRef: string
  failedOnly: boolean
}

interface IWarnForcePushPopup extends IBasePopup {
  type: PopupType.WarnForcePush
  operation: string
  onBegin: () => void
}

interface IDiscardChangesRetryPopup extends IBasePopup {
  type: PopupType.DiscardChangesRetry
  retryAction: RetryAction
}

interface IPullRequestReviewPopup extends IBasePopup {
  type: PopupType.PullRequestReview
  repository: RepositoryWithGitHubRepository
  pullRequest: PullRequest
  review: ValidNotificationPullRequestReview
  numberOfComments: number
  shouldCheckoutBranch: boolean
  shouldChangeRepository: boolean
}

interface IUnreachableCommitsPopup extends IBasePopup {
  type: PopupType.UnreachableCommits
  selectedTab: UnreachableCommitsTab
}

interface IStartPullRequestPopup extends IBasePopup {
  type: PopupType.StartPullRequest
  allBranches: ReadonlyArray<Branch>
  currentBranch: Branch
  defaultBranch: Branch | null
  externalEditorLabel?: string
  imageDiffType: ImageDiffType
  recentBranches: ReadonlyArray<Branch>
  repository: Repository
  nonLocalCommitSHA: string | null
  showSideBySideDiff: boolean
}

export type Popup =
  | IRenameBranchPopup
  | IDeleteBranchPopup
  | IDeleteRemoteBranchPopup
  | IConfirmDiscardChangesPopup
  | IConfirmDiscardSelectionPopup
  | IPreferencesPopup
  | IRepositorySettingsPopup
  | IAddRepositoryPopup
  | ICreateRepositoryPopup
  | ICloneRepositoryPopup
  | ICreateBranchPopup
  | ISignInPopup
  | IAboutPopup
  | IInstallGitPopup
  | IPublishRepositoryPopup
  | IAcknowledgementsPopup
  | IUntrustedCertificatePopup
  | IRemoveRepositoryPopup
  | ITermsAndConditionsPopup
  | IPushBranchCommitsPopup
  | ICLIInstalledPopup
  | IGenericGitAuthenticationPopup
  | IExternalEditorFailedPopup
  | IOpenShellFailedPopup
  | IInitializeLFSPopup
  | ILFSAttributeMismatchPopup
  | IUpstreamAlreadyExistsPopup
  | IReleaseNotesPopup
  | IDeletePullRequestPopup
  | IOversizedFilesPopup
  | ICommitConflictsWarningPopup
  | IPushNeedsPullPopup
  | IConfirmForcePushPopup
  | IStashAndSwitchBranchPopup
  | IConfirmOverwriteStashPopup
  | IConfirmDiscardStashPopup
  | ICreateTutorialRepositoryPopup
  | IConfirmExitTutorialPopup
  | IPushRejectedDueToMissingWorkflowScopePopup
  | ISAMLReauthRequiredPopup
  | ICreateForkPopup
  | ICreateTagPopup
  | IDeleteTagPopup
  | IChooseForkSettingsPopup
  | ILocalChangesOverwrittenPopup
  | IMoveToApplicationsFolderPopup
  | IChangeRepositoryAliasPopup
  | IThankYouPopup
  | ICommitMessagePopup
  | IMultiCommitOperationPopup
  | IWarnLocalChangesBeforeUndoPopup
  | IWarningBeforeResetPopup
  | IInvalidatedTokenPopup
  | IAddSSHHostPopup
  | ISSHKeyPassphrasePopup
  | ISSHUserPasswordPopup
  | IPullRequestChecksFailedPopup
  | ICICheckRunRerunPopup
  | IWarnForcePushPopup
  | IDiscardChangesRetryPopup
  | IPullRequestReviewPopup
  | IUnreachableCommitsPopup
  | IStartPullRequestPopup
