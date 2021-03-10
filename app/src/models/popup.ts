import {
  Repository,
  RepositoryWithGitHubRepository,
  RepositoryWithForkedGitHubRepository,
} from './repository'
import { PullRequest } from './pull-request'
import { Branch } from './branch'
import { ReleaseSummary } from './release-notes'
import { IRemote } from './remote'
import { RetryAction } from './retry-actions'
import { WorkingDirectoryFileChange } from './status'
import { PreferencesTab } from './preferences'
import { CommitOneLine, ICommitContext } from './commit'
import { IStashEntry } from './stash-entry'
import { Account } from '../models/account'
import { Progress } from './progress'
import { ITextDiff, DiffSelection } from './diff'
import { RepositorySettingsTab } from '../ui/repository-settings/repository-settings'

export enum PopupType {
  RenameBranch = 1,
  DeleteBranch,
  DeleteRemoteBranch,
  ConfirmDiscardChanges,
  Preferences,
  MergeBranch,
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
  MergeConflicts,
  AbortMerge,
  OversizedFiles,
  UsageReportingChanges,
  CommitConflictsWarning,
  PushNeedsPull,
  RebaseFlow,
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
  CherryPick,
}

export type Popup =
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
      type: PopupType.MergeBranch
      repository: Repository
      branch?: Branch
    }
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
    }
  | { type: PopupType.SignIn }
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
      hostname: string
      retryAction: RetryAction
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
      newRelease: ReleaseSummary
    }
  | {
      type: PopupType.DeletePullRequest
      repository: Repository
      branch: Branch
      pullRequest: PullRequest
    }
  | {
      type: PopupType.MergeConflicts
      repository: Repository
      ourBranch: string
      theirBranch?: string
    }
  | {
      type: PopupType.AbortMerge
      repository: Repository
      ourBranch: string
      theirBranch?: string
    }
  | {
      type: PopupType.OversizedFiles
      oversizedFiles: ReadonlyArray<string>
      context: ICommitContext
      repository: Repository
    }
  | { type: PopupType.UsageReportingChanges }
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
      type: PopupType.RebaseFlow
      repository: Repository
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
      repository: Repository
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
  | {
      type: PopupType.CherryPick
      repository: Repository
      commits: ReadonlyArray<CommitOneLine>
      sourceBranch: Branch | null
    }
