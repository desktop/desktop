import memoizeOne from 'memoize-one'
import * as React from 'react'
import { TransitionGroup, CSSTransition } from 'react-transition-group'
import { getDotComAPIEndpoint } from '../../lib/api'
import {
  HistoryTabMode,
  IConstrainedValue,
  IRepositoryState,
} from '../../lib/app-state'
import { assertNever } from '../../lib/fatal-error'
import { getAccountForRepository } from '../../lib/get-account-for-repository'
import { sendNonFatalException } from '../../lib/helpers/non-fatal-exception'
import { Shell } from '../../lib/shells'
import { IAccountRepositories } from '../../lib/stores/api-repositories-store'
import { RepositoryStateCache } from '../../lib/stores/repository-state-cache'
import { SignInState } from '../../lib/stores/sign-in-store'
import { Account } from '../../models/account'
import { Branch } from '../../models/branch'
import { CloneRepositoryTab } from '../../models/clone-repository-tab'
import { CloningRepository } from '../../models/cloning-repository'
import {
  GitHubRepository,
  hasWritePermission,
} from '../../models/github-repository'
import { Popup, PopupType } from '../../models/popup'
import { PreferencesTab } from '../../models/preferences'
import {
  isRepositoryWithGitHubRepository,
  getNonForkGitHubRepository,
  Repository,
} from '../../models/repository'
import { RetryAction } from '../../models/retry-actions'
import { TipState } from '../../models/tip'
import { UncommittedChangesStrategy } from '../../models/uncommitted-changes-strategy'
import { About } from '../about'
import { Acknowledgements } from '../acknowledgements'
import { AddExistingRepository, CreateRepository } from '../add-repository'
import { dialogTransitionTimeout } from '../app'
import { AppError } from '../app-error'
import { IAutocompletionProvider } from '../autocompletion'
import { PushBranchCommits } from '../branches'
import { ChangeRepositoryAlias } from '../change-repository-alias/change-repository-alias-dialog'
import { OversizedFiles } from '../changes/oversized-files-warning'
import { CICheckRunRerunDialog } from '../check-runs/ci-check-run-rerun-dialog'
import { ChooseForkSettings } from '../choose-fork-settings'
import { CLIInstalled } from '../cli-installed'
import { CloneRepository } from '../clone-repository'
import { CommitMessageDialog } from '../commit-message/commit-message-dialog'
import { CreateBranch } from '../create-branch'
import { CreateTag } from '../create-tag'
import { DeleteBranch, DeleteRemoteBranch } from '../delete-branch'
import { DeletePullRequest } from '../delete-branch/delete-pull-request-dialog'
import { DeleteTag } from '../delete-tag'
import { DiscardChanges } from '../discard-changes'
import { DiscardChangesRetryDialog } from '../discard-changes/discard-changes-retry-dialog'
import { DiscardSelection } from '../discard-changes/discard-selection-dialog'
import { Dispatcher } from '../dispatcher'
import { EditorError } from '../editor'
import { CreateForkDialog } from '../forks/create-fork-dialog'
import { GenericGitAuthentication } from '../generic-git-auth'
import { UnreachableCommitsDialog } from '../history/unreachable-commits-dialog'
import { InstallGit } from '../install-git'
import { InstallingUpdate } from '../installing-update/installing-update'
import { InvalidatedToken } from '../invalidated-token/invalidated-token'
import { InitializeLFS, AttributeMismatch } from '../lfs'
import { getVersion, getName } from '../lib/app-proxy'
import { ApplicationTheme, ICustomTheme } from '../lib/application-theme'
import { LocalChangesOverwrittenDialog } from '../local-changes-overwritten/local-changes-overwritten-dialog'
import { showCertificateTrustDialog } from '../main-process-proxy'
import { CommitConflictsWarning } from '../merge-conflicts'
import { MoveToApplicationsFolder } from '../move-to-applications-folder'
import { WarnForcePushDialog } from '../multi-commit-operation/dialog/warn-force-push-dialog'
import { MultiCommitOperation } from '../multi-commit-operation/multi-commit-operation'
import { CreateTutorialRepositoryDialog } from '../no-repositories/create-tutorial-repository-dialog'
import { PullRequestChecksFailed } from '../notifications/pull-request-checks-failed'
import { PullRequestReview } from '../notifications/pull-request-review'
import { OpenPullRequestDialog } from '../open-pull-request/open-pull-request-dialog'
import { Preferences } from '../preferences'
import { Publish } from '../publish-repository'
import { PushNeedsPullWarning } from '../push-needs-pull'
import { ConfirmForcePush } from '../rebase/confirm-force-push'
import { ReleaseNotes } from '../release-notes'
import { ConfirmRemoveRepository } from '../remove-repository'
import { RenameBranch } from '../rename-branch'
import { RepositoryView } from '../repository'
import { RepositorySettings } from '../repository-settings'
import { WarningBeforeReset } from '../reset/warning-before-reset'
import { SAMLReauthRequiredDialog } from '../saml-reauth-required/saml-reauth-required'
import { ShellError } from '../shell'
import { SignIn } from '../sign-in'
import { AddSSHHost } from '../ssh/add-ssh-host'
import { SSHKeyPassphrase } from '../ssh/ssh-key-passphrase'
import { SSHUserPassword } from '../ssh/ssh-user-password'
import { OverwriteStash } from '../stash-changes/overwrite-stashed-changes-dialog'
import { StashAndSwitchBranch } from '../stash-changes/stash-and-switch-branch-dialog'
import { ConfirmDiscardStashDialog } from '../stashing/confirm-discard-stash'
import { TermsAndConditions } from '../terms-and-conditions'
import { ThankYou } from '../thank-you'
import { ConfirmExitTutorial } from '../tutorial'
import { WarnLocalChangesBeforeUndo } from '../undo/warn-local-changes-before-undo'
import { UntrustedCertificate } from '../untrusted-certificate'
import { UpstreamAlreadyExists } from '../upstream-already-exists'
import { WorkflowPushRejectedDialog } from '../workflow-push-rejected/workflow-push-rejected'

interface IDialogProps {
  readonly dispatcher: Dispatcher
  readonly repositoryViewRef: React.RefObject<RepositoryView>
  readonly repositoryStateManager: RepositoryStateCache
  readonly checkForUpdates: (
    inBackground: boolean,
    skipGuidCheck: boolean
  ) => void
  readonly buildAutocompletionProviders: (
    repository: Repository
  ) => ReadonlyArray<IAutocompletionProvider<any>>

  // App state references
  readonly accounts: ReadonlyArray<Account>
  readonly repositoryState: IRepositoryState | null
  readonly selectedRepository: Repository | CloningRepository | null

  readonly signInState: SignInState | null
  readonly selectedCloneRepositoryTab: CloneRepositoryTab
  readonly apiRepositories: ReadonlyMap<Account, IAccountRepositories>
  readonly emoji: Map<string, string>
  readonly commitSpellcheckEnabled: boolean
  readonly resolvedExternalEditor: string | null
  readonly hideWhitespaceInPullRequestDiff: boolean
  readonly pullRequestFilesListWidth: IConstrainedValue
  readonly currentPopup: Popup | null

  // Preference dialog app state references
  readonly askForConfirmationOnRepositoryRemoval: boolean
  readonly askForConfirmationOnDiscardChanges: boolean
  readonly askForConfirmationOnDiscardChangesPermanently: boolean
  readonly askForConfirmationOnDiscardStash: boolean
  readonly askForConfirmationOnForcePush: boolean
  readonly askForConfirmationOnUndoCommit: boolean
  readonly uncommittedChangesStrategy: UncommittedChangesStrategy
  readonly selectedExternalEditor: string | null
  readonly useWindowsOpenSSH: boolean
  readonly notificationsEnabled: boolean
  readonly optOutOfUsageTracking: boolean
  readonly selectedShell: Shell
  readonly selectedTheme: ApplicationTheme
  readonly customTheme?: ICustomTheme
  readonly repositoryIndicatorsEnabled: boolean
}

export class AppPopup extends React.Component<IDialogProps> {
  /**
   * Returns a memoized instance of onPopupDismissed() bound to the
   * passed popupType, so it can be used in render() without creating
   * multiple instances when the component gets re-rendered.
   */
  private getOnPopupDismissedFn = memoizeOne((popupId: string) => {
    return () => this.onPopupDismissed(popupId)
  })

  private getSelectedTutorialRepository() {
    const selectedRepository =
      this.props.selectedRepository instanceof Repository
        ? this.props.selectedRepository
        : null

    const isTutorialRepository =
      selectedRepository && selectedRepository.isTutorialRepository

    return isTutorialRepository ? selectedRepository : null
  }

  private onExitTutorialToHomeScreen = () => {
    const tutorialRepository = this.getSelectedTutorialRepository()
    if (!tutorialRepository) {
      return false
    }

    this.props.dispatcher.pauseTutorial(tutorialRepository)
    return true
  }

  private onCreateTutorialRepository = (account: Account) => {
    this.props.dispatcher.createTutorialRepository(account)
  }

  private onUpdateExistingUpstreamRemote = (repository: Repository) => {
    this.props.dispatcher.updateExistingUpstreamRemote(repository)
  }

  private onIgnoreExistingUpstreamRemote = (repository: Repository) => {
    this.props.dispatcher.ignoreExistingUpstreamRemote(repository)
  }

  private updateExistingLFSFilters = () => {
    this.props.dispatcher.installGlobalLFSFilters(true)
  }

  private initializeLFS = (repositories: ReadonlyArray<Repository>) => {
    this.props.dispatcher.installLFSHooks(repositories)
  }

  private onCloneRepositoriesTabSelected = (tab: CloneRepositoryTab) => {
    this.props.dispatcher.changeCloneRepositoriesTab(tab)
  }

  private onShowAdvancedPreferences = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.Preferences,
      initialSelectedTab: PreferencesTab.Advanced,
    })
  }

  private onBranchCreatedFromCommit = () => {
    const repositoryView = this.props.repositoryViewRef.current
    if (repositoryView !== null) {
      repositoryView.scrollCompareListToTop()
    }
  }

  private onOpenShellIgnoreWarning = (path: string) => {
    this.props.dispatcher.openShell(path, true)
  }

  private onSaveCredentials = async (
    hostname: string,
    username: string,
    password: string,
    retryAction: RetryAction
  ) => {
    await this.props.dispatcher.saveGenericGitCredentials(
      hostname,
      username,
      password
    )

    this.props.dispatcher.performRetry(retryAction)
  }

  private onCheckForUpdates = () => this.props.checkForUpdates(false, false)
  private onCheckForNonStaggeredUpdates = () =>
    this.props.checkForUpdates(false, true)

  private showAcknowledgements = () => {
    this.props.dispatcher.showPopup({ type: PopupType.Acknowledgements })
  }

  private showTermsAndConditions = () => {
    this.props.dispatcher.showPopup({ type: PopupType.TermsAndConditions })
  }

  private getPullRequestState() {
    return this.props.repositoryState?.pullRequestState ?? null
  }

  private getWarnForcePushDialogOnBegin(
    onBegin: () => void,
    onPopupDismissedFn: () => void
  ) {
    return () => {
      onBegin()
      onPopupDismissedFn()
    }
  }

  private onContinueWithUntrustedCertificate = (
    certificate: Electron.Certificate
  ) => {
    showCertificateTrustDialog(
      certificate,
      'Could not securely connect to the server, because its certificate is not trusted. Attackers might be trying to steal your information.\n\nTo connect unsafely, which may put your data at risk, you can “Always trust” the certificate and try again.'
    )
  }

  private onBranchDeleted = (repository: Repository) => {
    // In the event a user is in the middle of a compare
    // we need to exit out of the compare state after the
    // branch has been deleted. Calling executeCompare allows
    // us to do just that.
    this.props.dispatcher.executeCompare(repository, {
      kind: HistoryTabMode.History,
    })
  }

  private onConfirmDiscardChangesChanged = (value: boolean) => {
    this.props.dispatcher.setConfirmDiscardChangesSetting(value)
  }

  private onConfirmDiscardChangesPermanentlyChanged = (value: boolean) => {
    this.props.dispatcher.setConfirmDiscardChangesPermanentlySetting(value)
  }

  private onRetryAction = (retryAction: RetryAction) => {
    this.props.dispatcher.performRetry(retryAction)
  }

  private getDotComAccount(): Account | null {
    const dotComAccount = this.props.accounts.find(
      a => a.endpoint === getDotComAPIEndpoint()
    )
    return dotComAccount || null
  }

  private getEnterpriseAccount(): Account | null {
    const enterpriseAccount = this.props.accounts.find(
      a => a.endpoint !== getDotComAPIEndpoint()
    )
    return enterpriseAccount || null
  }

  private onRefreshRepositories = (account: Account) => {
    this.props.dispatcher.refreshApiRepositories(account)
  }

  private onConfirmRepoRemoval = async (
    repository: Repository,
    deleteRepoFromDisk: boolean
  ) => {
    await this.props.dispatcher.removeRepository(repository, deleteRepoFromDisk)
  }

  private openCreatePullRequestInBrowser = (
    repository: Repository,
    branch: Branch
  ) => {
    this.props.dispatcher.openCreatePullRequestInBrowser(repository, branch)
  }

  private openFileInExternalEditor = (fullPath: string) => {
    this.props.dispatcher.openInExternalEditor(fullPath)
  }

  private openCurrentRepositoryInShell = () => {
    const { selectedRepository } = this.props
    if (!selectedRepository) {
      return
    }

    this.openInShell(selectedRepository)
  }

  private openInShell = (repository: Repository | CloningRepository) => {
    if (!(repository instanceof Repository)) {
      return
    }

    this.props.dispatcher.openShell(repository.path)
  }

  private showPopup = (popup: Popup) => {
    this.props.dispatcher.showPopup(popup)
  }

  private onPopupDismissed = (popupId: string) => {
    return this.props.dispatcher.closePopupById(popupId)
  }

  private currentPopupContent(): JSX.Element | null {
    const popup = this.props.currentPopup

    if (!popup) {
      return null
    }

    if (popup.id === undefined) {
      // Should not be possible... but if it does we want to know about it.
      sendNonFatalException(
        'PopupNoId',
        new Error(
          `Attempted to open a popup of type '${popup.type}' without an Id`
        )
      )
      return null
    }

    const onPopupDismissedFn = this.getOnPopupDismissedFn(popup.id)

    switch (popup.type) {
      case PopupType.RenameBranch:
        const stash =
          this.props.repositoryState?.changesState.stashEntry ?? null

        return (
          <RenameBranch
            key="rename-branch"
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            branch={popup.branch}
            stash={stash}
            onDismissed={onPopupDismissedFn}
          />
        )
      case PopupType.DeleteBranch:
        return (
          <DeleteBranch
            key="delete-branch"
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            branch={popup.branch}
            existsOnRemote={popup.existsOnRemote}
            onDismissed={onPopupDismissedFn}
            onDeleted={this.onBranchDeleted}
          />
        )
      case PopupType.DeleteRemoteBranch:
        return (
          <DeleteRemoteBranch
            key="delete-remote-branch"
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            branch={popup.branch}
            onDismissed={onPopupDismissedFn}
            onDeleted={this.onBranchDeleted}
          />
        )
      case PopupType.ConfirmDiscardChanges:
        const showSetting =
          popup.showDiscardChangesSetting === undefined
            ? true
            : popup.showDiscardChangesSetting
        const discardingAllChanges =
          popup.discardingAllChanges === undefined
            ? false
            : popup.discardingAllChanges

        return (
          <DiscardChanges
            key="discard-changes"
            repository={popup.repository}
            dispatcher={this.props.dispatcher}
            files={popup.files}
            confirmDiscardChanges={
              this.props.askForConfirmationOnDiscardChanges
            }
            showDiscardChangesSetting={showSetting}
            discardingAllChanges={discardingAllChanges}
            onDismissed={onPopupDismissedFn}
            onConfirmDiscardChangesChanged={this.onConfirmDiscardChangesChanged}
          />
        )
      case PopupType.ConfirmDiscardSelection:
        return (
          <DiscardSelection
            key="discard-selection"
            repository={popup.repository}
            dispatcher={this.props.dispatcher}
            file={popup.file}
            diff={popup.diff}
            selection={popup.selection}
            onDismissed={onPopupDismissedFn}
          />
        )
      case PopupType.Preferences:
        let repository = this.props.selectedRepository

        if (repository instanceof CloningRepository) {
          repository = null
        }

        return (
          <Preferences
            key="preferences"
            initialSelectedTab={popup.initialSelectedTab}
            dispatcher={this.props.dispatcher}
            dotComAccount={this.getDotComAccount()}
            confirmRepositoryRemoval={
              this.props.askForConfirmationOnRepositoryRemoval
            }
            confirmDiscardChanges={
              this.props.askForConfirmationOnDiscardChanges
            }
            confirmDiscardChangesPermanently={
              this.props.askForConfirmationOnDiscardChangesPermanently
            }
            confirmDiscardStash={this.props.askForConfirmationOnDiscardStash}
            confirmForcePush={this.props.askForConfirmationOnForcePush}
            confirmUndoCommit={this.props.askForConfirmationOnUndoCommit}
            uncommittedChangesStrategy={this.props.uncommittedChangesStrategy}
            selectedExternalEditor={this.props.selectedExternalEditor}
            useWindowsOpenSSH={this.props.useWindowsOpenSSH}
            notificationsEnabled={this.props.notificationsEnabled}
            optOutOfUsageTracking={this.props.optOutOfUsageTracking}
            enterpriseAccount={this.getEnterpriseAccount()}
            repository={repository}
            onDismissed={onPopupDismissedFn}
            selectedShell={this.props.selectedShell}
            selectedTheme={this.props.selectedTheme}
            customTheme={this.props.customTheme}
            repositoryIndicatorsEnabled={this.props.repositoryIndicatorsEnabled}
          />
        )
      case PopupType.RepositorySettings: {
        const repository = popup.repository
        const state = this.props.repositoryStateManager.get(repository)
        const repositoryAccount = getAccountForRepository(
          this.props.accounts,
          repository
        )

        return (
          <RepositorySettings
            key={`repository-settings-${repository.hash}`}
            initialSelectedTab={popup.initialSelectedTab}
            remote={state.remote}
            dispatcher={this.props.dispatcher}
            repository={repository}
            repositoryAccount={repositoryAccount}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.SignIn:
        return (
          <SignIn
            key="sign-in"
            signInState={this.props.signInState}
            dispatcher={this.props.dispatcher}
            onDismissed={onPopupDismissedFn}
          />
        )
      case PopupType.AddRepository:
        return (
          <AddExistingRepository
            key="add-existing-repository"
            onDismissed={onPopupDismissedFn}
            dispatcher={this.props.dispatcher}
            path={popup.path}
          />
        )
      case PopupType.CreateRepository:
        return (
          <CreateRepository
            key="create-repository"
            onDismissed={onPopupDismissedFn}
            dispatcher={this.props.dispatcher}
            initialPath={popup.path}
          />
        )
      case PopupType.CloneRepository:
        return (
          <CloneRepository
            key="clone-repository"
            dotComAccount={this.getDotComAccount()}
            enterpriseAccount={this.getEnterpriseAccount()}
            initialURL={popup.initialURL}
            onDismissed={onPopupDismissedFn}
            dispatcher={this.props.dispatcher}
            selectedTab={this.props.selectedCloneRepositoryTab}
            onTabSelected={this.onCloneRepositoriesTabSelected}
            apiRepositories={this.props.apiRepositories}
            onRefreshRepositories={this.onRefreshRepositories}
          />
        )
      case PopupType.CreateBranch: {
        const state = this.props.repositoryStateManager.get(popup.repository)
        const branchesState = state.branchesState
        const repository = popup.repository

        if (branchesState.tip.kind === TipState.Unknown) {
          onPopupDismissedFn()
          return null
        }

        let upstreamGhRepo: GitHubRepository | null = null
        let upstreamDefaultBranch: Branch | null = null

        if (isRepositoryWithGitHubRepository(repository)) {
          upstreamGhRepo = getNonForkGitHubRepository(repository)
          upstreamDefaultBranch = branchesState.upstreamDefaultBranch
        }

        return (
          <CreateBranch
            key="create-branch"
            tip={branchesState.tip}
            defaultBranch={branchesState.defaultBranch}
            upstreamDefaultBranch={upstreamDefaultBranch}
            allBranches={branchesState.allBranches}
            repository={repository}
            targetCommit={popup.targetCommit}
            upstreamGitHubRepository={upstreamGhRepo}
            onBranchCreatedFromCommit={this.onBranchCreatedFromCommit}
            onDismissed={onPopupDismissedFn}
            dispatcher={this.props.dispatcher}
            initialName={popup.initialName || ''}
          />
        )
      }
      case PopupType.InstallGit:
        return (
          <InstallGit
            key="install-git"
            onDismissed={onPopupDismissedFn}
            onOpenShell={this.onOpenShellIgnoreWarning}
            path={popup.path}
          />
        )
      case PopupType.About:
        const version = __DEV__ ? __SHA__.substring(0, 10) : getVersion()

        return (
          <About
            key="about"
            onDismissed={onPopupDismissedFn}
            applicationName={getName()}
            applicationVersion={version}
            applicationArchitecture={process.arch}
            onCheckForUpdates={this.onCheckForUpdates}
            onCheckForNonStaggeredUpdates={this.onCheckForNonStaggeredUpdates}
            onShowAcknowledgements={this.showAcknowledgements}
            onShowTermsAndConditions={this.showTermsAndConditions}
          />
        )
      case PopupType.PublishRepository:
        return (
          <Publish
            key="publish"
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            accounts={this.props.accounts}
            onDismissed={onPopupDismissedFn}
          />
        )
      case PopupType.UntrustedCertificate:
        return (
          <UntrustedCertificate
            key="untrusted-certificate"
            certificate={popup.certificate}
            url={popup.url}
            onDismissed={onPopupDismissedFn}
            onContinue={this.onContinueWithUntrustedCertificate}
          />
        )
      case PopupType.Acknowledgements:
        return (
          <Acknowledgements
            key="acknowledgements"
            onDismissed={onPopupDismissedFn}
            applicationVersion={getVersion()}
          />
        )
      case PopupType.RemoveRepository:
        return (
          <ConfirmRemoveRepository
            key="confirm-remove-repository"
            repository={popup.repository}
            onConfirmation={this.onConfirmRepoRemoval}
            onDismissed={onPopupDismissedFn}
          />
        )
      case PopupType.TermsAndConditions:
        return (
          <TermsAndConditions
            key="terms-and-conditions"
            onDismissed={onPopupDismissedFn}
          />
        )
      case PopupType.PushBranchCommits:
        return (
          <PushBranchCommits
            key="push-branch-commits"
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            branch={popup.branch}
            unPushedCommits={popup.unPushedCommits}
            onConfirm={this.openCreatePullRequestInBrowser}
            onDismissed={onPopupDismissedFn}
          />
        )
      case PopupType.CLIInstalled:
        return (
          <CLIInstalled key="cli-installed" onDismissed={onPopupDismissedFn} />
        )
      case PopupType.GenericGitAuthentication:
        return (
          <GenericGitAuthentication
            key="generic-git-authentication"
            hostname={popup.hostname}
            onDismiss={onPopupDismissedFn}
            onSave={this.onSaveCredentials}
            retryAction={popup.retryAction}
          />
        )
      case PopupType.ExternalEditorFailed:
        const openPreferences = popup.openPreferences
        const suggestDefaultEditor = popup.suggestDefaultEditor

        return (
          <EditorError
            key="editor-error"
            message={popup.message}
            onDismissed={onPopupDismissedFn}
            showPreferencesDialog={this.onShowAdvancedPreferences}
            viewPreferences={openPreferences}
            suggestDefaultEditor={suggestDefaultEditor}
          />
        )
      case PopupType.OpenShellFailed:
        return (
          <ShellError
            key="shell-error"
            message={popup.message}
            onDismissed={onPopupDismissedFn}
            showPreferencesDialog={this.onShowAdvancedPreferences}
          />
        )
      case PopupType.InitializeLFS:
        return (
          <InitializeLFS
            key="initialize-lfs"
            repositories={popup.repositories}
            onDismissed={onPopupDismissedFn}
            onInitialize={this.initializeLFS}
          />
        )
      case PopupType.LFSAttributeMismatch:
        return (
          <AttributeMismatch
            key="lsf-attribute-mismatch"
            onDismissed={onPopupDismissedFn}
            onUpdateExistingFilters={this.updateExistingLFSFilters}
          />
        )
      case PopupType.UpstreamAlreadyExists:
        return (
          <UpstreamAlreadyExists
            key="upstream-already-exists"
            repository={popup.repository}
            existingRemote={popup.existingRemote}
            onDismissed={onPopupDismissedFn}
            onUpdate={this.onUpdateExistingUpstreamRemote}
            onIgnore={this.onIgnoreExistingUpstreamRemote}
          />
        )
      case PopupType.ReleaseNotes:
        return (
          <ReleaseNotes
            key="release-notes"
            emoji={this.props.emoji}
            newReleases={popup.newReleases}
            onDismissed={onPopupDismissedFn}
          />
        )
      case PopupType.DeletePullRequest:
        return (
          <DeletePullRequest
            key="delete-pull-request"
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            branch={popup.branch}
            onDismissed={onPopupDismissedFn}
            pullRequest={popup.pullRequest}
          />
        )
      case PopupType.OversizedFiles:
        return (
          <OversizedFiles
            key="oversized-files"
            oversizedFiles={popup.oversizedFiles}
            onDismissed={onPopupDismissedFn}
            dispatcher={this.props.dispatcher}
            context={popup.context}
            repository={popup.repository}
          />
        )
      case PopupType.CommitConflictsWarning:
        return (
          <CommitConflictsWarning
            key="commit-conflicts-warning"
            dispatcher={this.props.dispatcher}
            files={popup.files}
            repository={popup.repository}
            context={popup.context}
            onDismissed={onPopupDismissedFn}
          />
        )
      case PopupType.PushNeedsPull:
        return (
          <PushNeedsPullWarning
            key="push-needs-pull"
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            onDismissed={onPopupDismissedFn}
          />
        )
      case PopupType.ConfirmForcePush: {
        const { askForConfirmationOnForcePush } = this.props

        return (
          <ConfirmForcePush
            key="confirm-force-push"
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            upstreamBranch={popup.upstreamBranch}
            askForConfirmationOnForcePush={askForConfirmationOnForcePush}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.StashAndSwitchBranch: {
        const { repository, branchToCheckout } = popup
        const { branchesState, changesState } =
          this.props.repositoryStateManager.get(repository)
        const { tip } = branchesState

        if (tip.kind !== TipState.Valid) {
          return null
        }

        const currentBranch = tip.branch
        const hasAssociatedStash = changesState.stashEntry !== null

        return (
          <StashAndSwitchBranch
            key="stash-and-switch-branch"
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            currentBranch={currentBranch}
            branchToCheckout={branchToCheckout}
            hasAssociatedStash={hasAssociatedStash}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.ConfirmOverwriteStash: {
        const { repository, branchToCheckout: branchToCheckout } = popup
        return (
          <OverwriteStash
            key="overwrite-stash"
            dispatcher={this.props.dispatcher}
            repository={repository}
            branchToCheckout={branchToCheckout}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.ConfirmDiscardStash: {
        const { repository, stash } = popup

        return (
          <ConfirmDiscardStashDialog
            key="confirm-discard-stash-dialog"
            dispatcher={this.props.dispatcher}
            askForConfirmationOnDiscardStash={
              this.props.askForConfirmationOnDiscardStash
            }
            repository={repository}
            stash={stash}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.CreateTutorialRepository: {
        return (
          <CreateTutorialRepositoryDialog
            key="create-tutorial-repository-dialog"
            account={popup.account}
            progress={popup.progress}
            onDismissed={onPopupDismissedFn}
            onCreateTutorialRepository={this.onCreateTutorialRepository}
          />
        )
      }
      case PopupType.ConfirmExitTutorial: {
        return (
          <ConfirmExitTutorial
            key="confirm-exit-tutorial"
            onDismissed={onPopupDismissedFn}
            onContinue={this.onExitTutorialToHomeScreen}
          />
        )
      }
      case PopupType.PushRejectedDueToMissingWorkflowScope:
        return (
          <WorkflowPushRejectedDialog
            onDismissed={onPopupDismissedFn}
            rejectedPath={popup.rejectedPath}
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
          />
        )
      case PopupType.SAMLReauthRequired:
        return (
          <SAMLReauthRequiredDialog
            onDismissed={onPopupDismissedFn}
            organizationName={popup.organizationName}
            endpoint={popup.endpoint}
            retryAction={popup.retryAction}
            dispatcher={this.props.dispatcher}
          />
        )
      case PopupType.CreateFork:
        return (
          <CreateForkDialog
            onDismissed={onPopupDismissedFn}
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            account={popup.account}
          />
        )
      case PopupType.CreateTag: {
        return (
          <CreateTag
            key="create-tag"
            repository={popup.repository}
            onDismissed={onPopupDismissedFn}
            dispatcher={this.props.dispatcher}
            targetCommitSha={popup.targetCommitSha}
            initialName={popup.initialName}
            localTags={popup.localTags}
          />
        )
      }
      case PopupType.DeleteTag: {
        return (
          <DeleteTag
            key="delete-tag"
            repository={popup.repository}
            onDismissed={onPopupDismissedFn}
            dispatcher={this.props.dispatcher}
            tagName={popup.tagName}
          />
        )
      }
      case PopupType.ChooseForkSettings: {
        return (
          <ChooseForkSettings
            repository={popup.repository}
            onDismissed={onPopupDismissedFn}
            dispatcher={this.props.dispatcher}
          />
        )
      }
      case PopupType.LocalChangesOverwritten:
        const existingStash =
          this.props.repositoryState?.changesState.stashEntry ?? null

        return (
          <LocalChangesOverwrittenDialog
            repository={popup.repository}
            dispatcher={this.props.dispatcher}
            hasExistingStash={existingStash !== null}
            retryAction={popup.retryAction}
            onDismissed={onPopupDismissedFn}
            files={popup.files}
          />
        )
      case PopupType.MoveToApplicationsFolder: {
        return (
          <MoveToApplicationsFolder
            dispatcher={this.props.dispatcher}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.ChangeRepositoryAlias: {
        return (
          <ChangeRepositoryAlias
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.ThankYou:
        return (
          <ThankYou
            key="thank-you"
            emoji={this.props.emoji}
            userContributions={popup.userContributions}
            friendlyName={popup.friendlyName}
            latestVersion={popup.latestVersion}
            onDismissed={onPopupDismissedFn}
          />
        )
      case PopupType.CommitMessage:
        const repositoryState = this.props.repositoryStateManager.get(
          popup.repository
        )

        const { tip } = repositoryState.branchesState
        const currentBranchName: string | null =
          tip.kind === TipState.Valid ? tip.branch.name : null

        const hasWritePermissionForRepository =
          popup.repository.gitHubRepository === null ||
          hasWritePermission(popup.repository.gitHubRepository)

        const autocompletionProviders = this.props.buildAutocompletionProviders(
          popup.repository
        )

        const repositoryAccount = getAccountForRepository(
          this.props.accounts,
          popup.repository
        )

        return (
          <CommitMessageDialog
            key="commit-message"
            autocompletionProviders={autocompletionProviders}
            branch={currentBranchName}
            coAuthors={popup.coAuthors}
            commitAuthor={repositoryState.commitAuthor}
            commitMessage={popup.commitMessage}
            commitSpellcheckEnabled={this.props.commitSpellcheckEnabled}
            dialogButtonText={popup.dialogButtonText}
            dialogTitle={popup.dialogTitle}
            dispatcher={this.props.dispatcher}
            prepopulateCommitSummary={popup.prepopulateCommitSummary}
            repository={popup.repository}
            showBranchProtected={
              repositoryState.changesState.currentBranchProtected
            }
            showCoAuthoredBy={popup.showCoAuthoredBy}
            showNoWriteAccess={!hasWritePermissionForRepository}
            onDismissed={onPopupDismissedFn}
            onSubmitCommitMessage={popup.onSubmitCommitMessage}
            repositoryAccount={repositoryAccount}
          />
        )
      case PopupType.MultiCommitOperation: {
        const { repositoryState, emoji, askForConfirmationOnForcePush } =
          this.props

        if (repositoryState === null) {
          return null
        }

        const { changesState, multiCommitOperationState } = repositoryState
        const { workingDirectory, conflictState } = changesState
        if (multiCommitOperationState === null) {
          log.warn(
            '[App] invalid state encountered - multi commit flow should not be active when step is null'
          )
          return null
        }

        return (
          <MultiCommitOperation
            key="multi-commit-operation"
            repository={popup.repository}
            dispatcher={this.props.dispatcher}
            state={multiCommitOperationState}
            conflictState={conflictState}
            emoji={emoji}
            workingDirectory={workingDirectory}
            askForConfirmationOnForcePush={askForConfirmationOnForcePush}
            openFileInExternalEditor={this.openFileInExternalEditor}
            resolvedExternalEditor={this.props.resolvedExternalEditor}
            openRepositoryInShell={this.openCurrentRepositoryInShell}
          />
        )
      }
      case PopupType.WarnLocalChangesBeforeUndo: {
        const { repository, commit, isWorkingDirectoryClean } = popup
        return (
          <WarnLocalChangesBeforeUndo
            key="warn-local-changes-before-undo"
            dispatcher={this.props.dispatcher}
            repository={repository}
            commit={commit}
            isWorkingDirectoryClean={isWorkingDirectoryClean}
            confirmUndoCommit={this.props.askForConfirmationOnUndoCommit}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.WarningBeforeReset: {
        const { repository, commit } = popup
        return (
          <WarningBeforeReset
            key="warning-before-reset"
            dispatcher={this.props.dispatcher}
            repository={repository}
            commit={commit}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.InvalidatedToken: {
        return (
          <InvalidatedToken
            key="invalidated-token"
            dispatcher={this.props.dispatcher}
            account={popup.account}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.AddSSHHost: {
        return (
          <AddSSHHost
            key="add-ssh-host"
            host={popup.host}
            ip={popup.ip}
            keyType={popup.keyType}
            fingerprint={popup.fingerprint}
            onSubmit={popup.onSubmit}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.SSHKeyPassphrase: {
        return (
          <SSHKeyPassphrase
            key="ssh-key-passphrase"
            keyPath={popup.keyPath}
            onSubmit={popup.onSubmit}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.SSHUserPassword: {
        return (
          <SSHUserPassword
            key="ssh-user-password"
            username={popup.username}
            onSubmit={popup.onSubmit}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.PullRequestChecksFailed: {
        return (
          <PullRequestChecksFailed
            key="pull-request-checks-failed"
            dispatcher={this.props.dispatcher}
            shouldChangeRepository={popup.shouldChangeRepository}
            repository={popup.repository}
            pullRequest={popup.pullRequest}
            commitMessage={popup.commitMessage}
            commitSha={popup.commitSha}
            checks={popup.checks}
            accounts={this.props.accounts}
            onSubmit={onPopupDismissedFn}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.CICheckRunRerun: {
        return (
          <CICheckRunRerunDialog
            key="rerun-check-runs"
            checkRuns={popup.checkRuns}
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            prRef={popup.prRef}
            onDismissed={onPopupDismissedFn}
            failedOnly={popup.failedOnly}
          />
        )
      }
      case PopupType.WarnForcePush: {
        const { askForConfirmationOnForcePush } = this.props
        return (
          <WarnForcePushDialog
            key="warn-force-push"
            dispatcher={this.props.dispatcher}
            operation={popup.operation}
            askForConfirmationOnForcePush={askForConfirmationOnForcePush}
            onBegin={this.getWarnForcePushDialogOnBegin(
              popup.onBegin,
              onPopupDismissedFn
            )}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.DiscardChangesRetry: {
        return (
          <DiscardChangesRetryDialog
            key="discard-changes-retry"
            dispatcher={this.props.dispatcher}
            retryAction={popup.retryAction}
            onDismissed={onPopupDismissedFn}
            onConfirmDiscardChangesChanged={
              this.onConfirmDiscardChangesPermanentlyChanged
            }
          />
        )
      }
      case PopupType.PullRequestReview: {
        return (
          <PullRequestReview
            key="pull-request-checks-failed"
            dispatcher={this.props.dispatcher}
            shouldCheckoutBranch={popup.shouldCheckoutBranch}
            shouldChangeRepository={popup.shouldChangeRepository}
            repository={popup.repository}
            pullRequest={popup.pullRequest}
            review={popup.review}
            numberOfComments={popup.numberOfComments}
            emoji={this.props.emoji}
            accounts={this.props.accounts}
            onSubmit={onPopupDismissedFn}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.UnreachableCommits: {
        const { repositoryState, emoji } = this.props

        if (repositoryState == null) {
          return null
        }

        const {
          commitLookup,
          commitSelection: { shas, shasInDiff },
        } = repositoryState

        return (
          <UnreachableCommitsDialog
            selectedShas={shas}
            shasInDiff={shasInDiff}
            commitLookup={commitLookup}
            selectedTab={popup.selectedTab}
            emoji={emoji}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.StartPullRequest: {
        // Intentionally chose to get the current pull request state  on
        // rerender because state variables such as file selection change
        // via the dispatcher.
        const pullRequestState = this.getPullRequestState()
        if (pullRequestState === null) {
          // This shouldn't happen..
          sendNonFatalException(
            'FailedToStartPullRequest',
            new Error(
              'Failed to start pull request because pull request state was null'
            )
          )
          return null
        }

        const { pullRequestFilesListWidth, hideWhitespaceInPullRequestDiff } =
          this.props

        const {
          allBranches,
          currentBranch,
          defaultBranch,
          imageDiffType,
          externalEditorLabel,
          nonLocalCommitSHA,
          recentBranches,
          repository,
          showSideBySideDiff,
        } = popup

        return (
          <OpenPullRequestDialog
            key="open-pull-request"
            allBranches={allBranches}
            currentBranch={currentBranch}
            defaultBranch={defaultBranch}
            dispatcher={this.props.dispatcher}
            fileListWidth={pullRequestFilesListWidth}
            hideWhitespaceInDiff={hideWhitespaceInPullRequestDiff}
            imageDiffType={imageDiffType}
            nonLocalCommitSHA={nonLocalCommitSHA}
            pullRequestState={pullRequestState}
            recentBranches={recentBranches}
            repository={repository}
            externalEditorLabel={externalEditorLabel}
            showSideBySideDiff={showSideBySideDiff}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.Error: {
        return (
          <AppError
            error={popup.error}
            onDismissed={onPopupDismissedFn}
            onShowPopup={this.showPopup}
            onRetryAction={this.onRetryAction}
          />
        )
      }
      case PopupType.InstallingUpdate: {
        return (
          <InstallingUpdate
            key="installing-update"
            dispatcher={this.props.dispatcher}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      default:
        return assertNever(popup, `Unknown popup type: ${popup}`)
    }
  }

  public render() {
    const popupContent = this.currentPopupContent()

    return (
      <TransitionGroup>
        {popupContent && (
          <CSSTransition classNames="modal" timeout={dialogTransitionTimeout}>
            {popupContent}
          </CSSTransition>
        )}
      </TransitionGroup>
    )
  }
}
