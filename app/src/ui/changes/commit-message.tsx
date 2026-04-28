import * as React from 'react'
import classNames from 'classnames'
import {
  AutocompletingTextArea,
  AutocompletingInput,
  IAutocompletionProvider,
  CoAuthorAutocompletionProvider,
} from '../autocompletion'
import { CommitIdentity } from '../../models/commit-identity'
import {
  DefaultCommitMessage,
  ICommitMessage,
} from '../../models/commit-message'
import { Repository } from '../../models/repository'
import { Button } from '../lib/button'
import { Loading } from '../lib/loading'
import { AuthorInput } from '../lib/author-input/author-input'
import { FocusContainer } from '../lib/focus-container'
import { Octicon, OcticonSymbolVariant } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Author, UnknownAuthor, isKnownAuthor } from '../../models/author'
import { IMenuItem } from '../../lib/menu-item'
import { Commit, ICommitContext } from '../../models/commit'
import { startTimer } from '../lib/timing'
import { CommitWarning, CommitWarningIcon } from './commit-warning'
import { LinkButton } from '../lib/link-button'
import { CommitOptions, Foldout, FoldoutType } from '../../lib/app-state'
import { IAvatarUser, getAvatarUserFromAuthor } from '../../models/avatar'
import { showContextualMenu } from '../../lib/menu-item'
import { Account, isEnterpriseAccount } from '../../models/account'
import {
  CommitMessageAvatar,
  CommitMessageAvatarWarningType,
} from './commit-message-avatar'
import {
  getStealthEmailForUser,
  isAttributableEmailFor,
  lookupPreferredEmail,
} from '../../lib/email'
import { setGlobalConfigValue } from '../../lib/git/config'
import { Popup, PopupType } from '../../models/popup'
import { RepositorySettingsTab } from '../repository-settings/repository-settings'
import { IdealSummaryLength } from '../../lib/wrap-rich-text-commit-message'
import { isEmptyOrWhitespace } from '../../lib/is-empty-or-whitespace'
import { TooltipDirection } from '../lib/tooltip'
import { ToggledtippedContent } from '../lib/toggletipped-content'
import { PreferencesTab } from '../../models/preferences'
import {
  RepoRuleEnforced,
  RepoRulesInfo,
  RepoRulesMetadataFailures,
} from '../../models/repo-rules'
import { IAheadBehind } from '../../models/branch'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import { RepoRulesetsForBranchLink } from '../repository-rules/repo-rulesets-for-branch-link'
import { RepoRulesMetadataFailureList } from '../repository-rules/repo-rules-failure-list'
import { formatCommitMessage } from '../../lib/format-commit-message'
import { useRepoRulesLogic } from '../../lib/helpers/repo-rules'
import { isDotCom } from '../../lib/endpoint-capabilities'
import { WorkingDirectoryFileChange } from '../../models/status'
import {
  enableCommitMessageGeneration,
  enableHooksEnvironment,
} from '../../lib/feature-flag'
import { AriaLiveContainer } from '../accessibility/aria-live-container'
import { HookProgress } from '../../lib/git'
import { assertNever } from '../../lib/fatal-error'

const addAuthorIcon: OcticonSymbolVariant = {
  w: 18,
  h: 13,
  p: [
    'M14 6V4.25a.75.75 0 0 1 1.5 0V6h1.75a.75.75 0 1 1 0 1.5H15.5v1.75a.75.75 0 0 ' +
      '1-1.5 0V7.5h-1.75a.75.75 0 1 1 0-1.5H14zM8.5 4a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 ' +
      '0zm.063 3.064a3.995 3.995 0 0 0 1.2-4.429A3.996 3.996 0 0 0 8.298.725a4.01 4.01 0 0 ' +
      '0-6.064 1.91 3.987 3.987 0 0 0 1.2 4.43A5.988 5.988 0 0 0 0 12.2a.748.748 0 0 0 ' +
      '.716.766.751.751 0 0 0 .784-.697 4.49 4.49 0 0 1 1.39-3.04 4.51 4.51 0 0 1 6.218 ' +
      '0 4.49 4.49 0 0 1 1.39 3.04.748.748 0 0 0 .786.73.75.75 0 0 0 .714-.8 5.989 5.989 0 0 0-3.435-5.136z',
  ],
}

interface ICreateCommitOptions {
  warnUnknownAuthors: boolean
  warnFilesNotVisible: boolean
}

interface ICommitMessageProps {
  readonly onCreateCommit: (context: ICommitContext) => Promise<boolean>
  readonly branch: string | null
  readonly commitAuthor: CommitIdentity | null
  readonly anyFilesSelected: boolean
  readonly filesToBeCommittedCount?: number
  /** Whether the user can see all the files to commit in the changes list. They
   * may not be able to if the list is filtered */
  readonly showPromptForCommittingFileHiddenByFilter?: boolean
  readonly isShowingModal: boolean
  readonly isShowingFoldout: boolean

  /**
   * Whether it's possible to select files for commit, affects messaging
   * when commit button is disabled
   */
  readonly anyFilesAvailable: boolean
  readonly filesSelected: ReadonlyArray<WorkingDirectoryFileChange>
  readonly focusCommitMessage: boolean
  readonly commitMessage: ICommitMessage | null
  readonly repository: Repository
  readonly repositoryAccount: Account | null
  readonly autocompletionProviders: ReadonlyArray<IAutocompletionProvider<any>>
  readonly isCommitting?: boolean
  readonly hookProgress: HookProgress | null
  readonly onShowCommitProgress: (() => void) | undefined
  readonly isGeneratingCommitMessage?: boolean
  readonly shouldShowGenerateCommitMessageCallOut?: boolean
  readonly commitToAmend: Commit | null
  readonly placeholder: string
  readonly prepopulateCommitSummary: boolean
  readonly showBranchProtected: boolean
  readonly repoRulesInfo: RepoRulesInfo
  readonly aheadBehind: IAheadBehind | null
  readonly showNoWriteAccess: boolean

  /**
   * Whether or not to show a field for adding co-authors to
   * a commit (currently only supported for GH/GHE repositories)
   */
  readonly showCoAuthoredBy: boolean

  /**
   * Whether or not to show a input labels (Default: false)
   */
  readonly showInputLabels?: boolean

  /**
   * A list of authors (name, email pairs) which have been
   * entered into the co-authors input box in the commit form
   * and which _may_ be used in the subsequent commit to add
   * Co-Authored-By commit message trailers depending on whether
   * the user has chosen to do so.
   */
  readonly coAuthors: ReadonlyArray<Author>

  /** Whether this component should show its onboarding tutorial nudge arrow */
  readonly shouldNudge?: boolean

  readonly commitSpellcheckEnabled: boolean

  readonly showCommitLengthWarning: boolean

  /** Optional text to override default commit button text */
  readonly commitButtonText?: string

  readonly mostRecentLocalCommit: Commit | null

  /** Whether or not to remember the coauthors in the changes state */
  readonly onCoAuthorsUpdated: (coAuthors: ReadonlyArray<Author>) => void
  readonly onShowCoAuthoredByChanged: (showCoAuthoredBy: boolean) => void
  readonly onConfirmCommitWithUnknownCoAuthors: (
    coAuthors: ReadonlyArray<UnknownAuthor>,
    onCommitAnyway: () => void
  ) => void

  /**
   * Called when the component unmounts to give callers the ability
   * to persist the commit message (i.e. when switching between changes
   * and history view).
   */
  readonly onPersistCommitMessage?: (message: ICommitMessage) => void

  readonly onGenerateCommitMessage?: (
    filesSelected: ReadonlyArray<WorkingDirectoryFileChange>,
    mustOverrideExistingMessage: boolean
  ) => void

  /**
   * Called when the component has given the commit message focus due to
   * `focusCommitMessage` being set. Used to reset the `focusCommitMessage`
   * prop.
   */
  readonly onCommitMessageFocusSet: () => void

  /**
   * Called when the user email in Git config has been updated to refresh
   * the repository state.
   */
  readonly onRefreshAuthor: () => void

  readonly onShowPopup: (popup: Popup) => void
  readonly onShowFoldout: (foldout: Foldout) => void
  readonly onCommitSpellcheckEnabledChanged: (enabled: boolean) => void
  readonly onStopAmending: () => void
  readonly onShowCreateForkDialog: () => void
  readonly onFilesToCommitNotVisible?: (onCommitAnyway: () => {}) => void
  readonly onSuccessfulCommitCreated?: () => void
  readonly accounts: ReadonlyArray<Account>

  /** Optional to add an id to a message that should be provided as an aria
   * description of the submit button */
  readonly submitButtonAriaDescribedBy?: string

  /**
   * Whether there are any hooks in the repository that could be
   * skipped during commit with the --no-verify flag
   */
  readonly hasCommitHooks: boolean

  /**
   * Whether or not to skip blocking commit hooks when creating commits
   * by means of passing the `--no-verify` flag to git commit
   */
  readonly skipCommitHooks: boolean

  /**
   * Whether or not to add a `Signed-off-by` trailer to commit messages
   * by means of passing the `--signoff` flag to git commit
   */
  readonly signOffCommits: boolean

  /**
   * Whether or not to allow creating a commit without any file changes
   * by means of passing the `--allow-empty` flag to git commit.
   * This option resets to false after each commit.
   */
  readonly allowEmptyCommit: boolean

  /**
   * Whether or not to show the "Allow empty commit" option in the commit
   * options context menu. Should be false when the CommitMessage component
   * is used in contexts where empty commits are not applicable, such as the
   * squash commit dialog.
   */
  readonly showAllowEmptyCommitOption?: boolean

  /** Callback to set commit options for the given repository */
  readonly onUpdateCommitOptions: (
    repository: Repository,
    options: Partial<CommitOptions>
  ) => void
}

interface ICommitMessageState {
  readonly commitMessage: ICommitMessage

  readonly commitMessageAutocompletionProviders: ReadonlyArray<
    IAutocompletionProvider<any>
  >
  readonly coAuthorAutocompletionProvider: CoAuthorAutocompletionProvider | null

  /**
   * Whether or not the description text area has more text that's
   * obscured by the action bar. Note that this will always be
   * false when there's no action bar.
   */
  readonly descriptionObscured: boolean

  readonly isCommittingStatusMessage: string

  readonly repoRulesEnabled: boolean

  readonly isRuleFailurePopoverOpen: boolean

  readonly repoRuleCommitMessageFailures: RepoRulesMetadataFailures
  readonly repoRuleCommitAuthorFailures: RepoRulesMetadataFailures
  readonly repoRuleBranchNameFailures: RepoRulesMetadataFailures
}

function findCommitMessageAutoCompleteProvider(
  providers: ReadonlyArray<IAutocompletionProvider<any>>
): ReadonlyArray<IAutocompletionProvider<any>> {
  return providers.filter(
    provider => !(provider instanceof CoAuthorAutocompletionProvider)
  )
}

function findCoAuthorAutoCompleteProvider(
  providers: ReadonlyArray<IAutocompletionProvider<any>>
): CoAuthorAutocompletionProvider | null {
  for (const provider of providers) {
    if (provider instanceof CoAuthorAutocompletionProvider) {
      return provider
    }
  }

  return null
}

export class CommitMessage extends React.Component<
  ICommitMessageProps,
  ICommitMessageState
> {
  private descriptionComponent: AutocompletingTextArea | null = null

  private wrapperRef = React.createRef<HTMLDivElement>()
  private summaryGroupRef = React.createRef<HTMLDivElement>()
  private summaryTextInput: HTMLInputElement | null = null

  private descriptionTextArea: HTMLTextAreaElement | null = null
  private descriptionTextAreaScrollDebounceId: number | null = null

  private coAuthorInputRef = React.createRef<AuthorInput>()

  private readonly COMMIT_MSG_ERROR_BTN_ID = 'commit-message-failure-hint'

  public constructor(props: ICommitMessageProps) {
    super(props)
    const { commitMessage } = this.props

    this.state = {
      commitMessage: commitMessage ?? DefaultCommitMessage,
      commitMessageAutocompletionProviders:
        findCommitMessageAutoCompleteProvider(props.autocompletionProviders),
      coAuthorAutocompletionProvider: findCoAuthorAutoCompleteProvider(
        props.autocompletionProviders
      ),
      descriptionObscured: false,
      isCommittingStatusMessage: '',
      repoRulesEnabled: false,
      isRuleFailurePopoverOpen: false,
      repoRuleCommitMessageFailures: new RepoRulesMetadataFailures(),
      repoRuleCommitAuthorFailures: new RepoRulesMetadataFailures(),
      repoRuleBranchNameFailures: new RepoRulesMetadataFailures(),
    }
  }

  // Persist our current commit message if the caller wants to
  public componentWillUnmount() {
    const { props, state } = this
    props.onPersistCommitMessage?.(state.commitMessage)
    window.removeEventListener('keydown', this.onKeyDown)
  }

  public async componentDidMount() {
    window.addEventListener('keydown', this.onKeyDown)
    await this.updateRepoRuleFailures(undefined, undefined, true)
  }

  /**
   * Special case for the summary/description being reset (empty) after a commit
   * and the commit state changing thereafter, needing a sync with incoming props.
   * We prefer the current UI state values if the user updated them manually.
   *
   * NOTE: although using the lifecycle method is generally an anti-pattern, we
   * (and the React docs) believe it to be the right answer for this situation, see:
   * https://reactjs.org/docs/react-component.html#unsafe_componentwillreceiveprops
   */
  public componentWillReceiveProps(nextProps: ICommitMessageProps) {
    const { commitMessage } = nextProps

    if (!commitMessage || commitMessage === this.props.commitMessage) {
      return
    }

    if (commitMessage.timestamp > this.state.commitMessage.timestamp) {
      this.setState({
        commitMessage,
      })
    }
  }

  public async componentDidUpdate(
    prevProps: ICommitMessageProps,
    prevState: ICommitMessageState
  ) {
    if (
      this.props.autocompletionProviders !== prevProps.autocompletionProviders
    ) {
      this.setState({
        commitMessageAutocompletionProviders:
          findCommitMessageAutoCompleteProvider(
            this.props.autocompletionProviders
          ),
        coAuthorAutocompletionProvider: findCoAuthorAutoCompleteProvider(
          this.props.autocompletionProviders
        ),
      })
    }

    if (
      this.props.focusCommitMessage &&
      this.props.focusCommitMessage !== prevProps.focusCommitMessage
    ) {
      this.focusSummary()
    } else if (
      prevProps.showCoAuthoredBy === false &&
      this.isCoAuthorInputVisible &&
      // The co-author input could be also shown when switching between repos,
      // but in that case we don't want to give the focus to the input.
      prevProps.repository.id === this.props.repository.id &&
      !!prevProps.commitToAmend === !!this.props.commitToAmend
    ) {
      this.coAuthorInputRef.current?.focus()
    }

    if (
      prevProps.isCommitting !== this.props.isCommitting &&
      this.props.isCommitting &&
      this.state.isCommittingStatusMessage === ''
    ) {
      this.setState({ isCommittingStatusMessage: this.getButtonTitle() })
    }

    if (
      prevProps.mostRecentLocalCommit?.sha !==
        this.props.mostRecentLocalCommit?.sha &&
      this.props.mostRecentLocalCommit !== null
    ) {
      this.setState({
        isCommittingStatusMessage: `Committed Just now - ${this.props.mostRecentLocalCommit.summary} (Sha: ${this.props.mostRecentLocalCommit.shortSha})`,
      })
    }

    await this.updateRepoRuleFailures(prevProps, prevState)
  }

  private async updateRepoRuleFailures(
    prevProps?: ICommitMessageProps,
    prevState?: ICommitMessageState,
    forceUpdate: boolean = false
  ) {
    let repoRulesEnabled = this.state.repoRulesEnabled
    if (
      forceUpdate ||
      prevProps?.repository !== this.props.repository ||
      prevProps?.repositoryAccount !== this.props.repositoryAccount
    ) {
      repoRulesEnabled = useRepoRulesLogic(
        this.props.repositoryAccount,
        this.props.repository
      )
      this.setState({ repoRulesEnabled })
    }

    if (!repoRulesEnabled) {
      return
    }

    await this.updateRepoRulesCommitMessageFailures(
      prevProps,
      prevState,
      forceUpdate
    )
    this.updateRepoRulesCommitAuthorFailures(prevProps, forceUpdate)
    this.updateRepoRulesBranchNameFailures(prevProps, forceUpdate)
  }

  private async updateRepoRulesCommitMessageFailures(
    prevProps?: ICommitMessageProps,
    prevState?: ICommitMessageState,
    forceUpdate?: boolean
  ) {
    if (
      forceUpdate ||
      prevState?.commitMessage.summary !== this.state.commitMessage.summary ||
      prevState?.commitMessage.description !==
        this.state.commitMessage.description ||
      prevProps?.coAuthors !== this.props.coAuthors ||
      prevProps?.commitToAmend !== this.props.commitToAmend ||
      prevProps?.repository !== this.props.repository ||
      prevProps?.repoRulesInfo.commitMessagePatterns !==
        this.props.repoRulesInfo.commitMessagePatterns
    ) {
      let summary = this.state.commitMessage.summary
      if (!summary && !this.state.commitMessage.description) {
        summary = this.summaryOrPlaceholder
      }

      const context: ICommitContext = {
        summary,
        description: this.state.commitMessage.description,
        trailers: this.getCoAuthorTrailers(),
        amend: this.props.commitToAmend !== null,
        messageGeneratedByCopilot:
          this.state.commitMessage.generatedByCopilot ?? false,
      }

      const msg = await formatCommitMessage(this.props.repository, context)
      const failures =
        this.props.repoRulesInfo.commitMessagePatterns.getFailedRules(msg)

      this.setState({ repoRuleCommitMessageFailures: failures })
    }
  }

  private updateRepoRulesCommitAuthorFailures(
    prevProps?: ICommitMessageProps,
    forceUpdate?: boolean
  ) {
    if (
      forceUpdate ||
      prevProps?.commitAuthor?.email !== this.props.commitAuthor?.email ||
      prevProps?.repoRulesInfo.commitAuthorEmailPatterns !==
        this.props.repoRulesInfo.commitAuthorEmailPatterns
    ) {
      const email = this.props.commitAuthor?.email
      let failures: RepoRulesMetadataFailures

      if (!email) {
        failures = new RepoRulesMetadataFailures()
      } else {
        failures =
          this.props.repoRulesInfo.commitAuthorEmailPatterns.getFailedRules(
            email
          )
      }

      this.setState({ repoRuleCommitAuthorFailures: failures })
    }
  }

  private updateRepoRulesBranchNameFailures(
    prevProps?: ICommitMessageProps,
    forceUpdate?: boolean
  ) {
    if (
      forceUpdate ||
      prevProps?.branch !== this.props.branch ||
      prevProps?.repoRulesInfo.branchNamePatterns !==
        this.props.repoRulesInfo.branchNamePatterns
    ) {
      const branch = this.props.branch
      let failures: RepoRulesMetadataFailures

      if (!branch) {
        failures = new RepoRulesMetadataFailures()
      } else {
        failures =
          this.props.repoRulesInfo.branchNamePatterns.getFailedRules(branch)
      }

      this.setState({ repoRuleBranchNameFailures: failures })
    }
  }

  private clearCommitMessage() {
    this.setState({ commitMessage: DefaultCommitMessage })
  }

  private focusSummary() {
    if (this.summaryTextInput !== null) {
      this.summaryTextInput.focus()
      this.props.onCommitMessageFocusSet()
    }
  }

  private onSummaryChanged = (summary: string) => {
    this.setState({
      commitMessage: {
        ...this.state.commitMessage,
        summary,
        // Since this method is called when the user types, we can assume
        // that the commit message was not generated by Copilot (anymore).
        generatedByCopilot: false,
        timestamp: Date.now(),
      },
    })
  }

  private onDescriptionChanged = (description: string) => {
    this.setState({
      commitMessage: {
        ...this.state.commitMessage,
        description,
        // Since this method is called when the user types, we can assume
        // that the commit message was not generated by Copilot (anymore).
        generatedByCopilot: false,
        timestamp: Date.now(),
      },
    })
  }

  private onSubmit = () => {
    this.createCommit()
  }

  private getCoAuthorTrailers() {
    const { coAuthors } = this.props
    const token = 'Co-Authored-By'
    return this.isCoAuthorInputEnabled
      ? coAuthors
          .filter(isKnownAuthor)
          .map(a => ({ token, value: `${a.name} <${a.email}>` }))
      : []
  }

  private get summaryOrPlaceholder() {
    return this.props.prepopulateCommitSummary &&
      !this.state.commitMessage.summary
      ? this.props.placeholder
      : this.state.commitMessage.summary
  }

  private async createCommit(options?: ICreateCommitOptions) {
    const { description } = this.state.commitMessage

    if (!this.canCommit() && !this.canAmend()) {
      return
    }

    if (options?.warnUnknownAuthors !== false) {
      const unknownAuthors = this.props.coAuthors.filter(
        (author): author is UnknownAuthor => !isKnownAuthor(author)
      )

      if (unknownAuthors.length > 0) {
        this.props.onConfirmCommitWithUnknownCoAuthors(unknownAuthors, () =>
          this.createCommit({
            warnUnknownAuthors: false,
            warnFilesNotVisible: options?.warnFilesNotVisible === true,
          })
        )
        return
      }
    }

    const trailers = this.getCoAuthorTrailers()

    const commitContext: ICommitContext = {
      summary: this.summaryOrPlaceholder,
      description,
      trailers,
      amend: this.props.commitToAmend !== null,
      messageGeneratedByCopilot:
        this.state.commitMessage.generatedByCopilot ?? false,
    }

    if (
      options?.warnFilesNotVisible !== false &&
      this.props.showPromptForCommittingFileHiddenByFilter === true &&
      this.props.onFilesToCommitNotVisible
    ) {
      this.props.onFilesToCommitNotVisible(() =>
        this.createCommit({
          warnUnknownAuthors: options?.warnUnknownAuthors === true,
          warnFilesNotVisible: false,
        })
      )
      return
    }

    const timer = startTimer('create commit', this.props.repository)
    const commitCreated = await this.props.onCreateCommit(commitContext)
    timer.done()

    if (commitCreated) {
      this.props.onSuccessfulCommitCreated?.()
      this.clearCommitMessage()
    }
  }

  private canCommit(): boolean {
    return (
      (((this.props.anyFilesSelected === true ||
        this.props.allowEmptyCommit === true) &&
        this.state.commitMessage.summary.length > 0) ||
        this.props.prepopulateCommitSummary) &&
      !this.hasRepoRuleFailure()
    )
  }

  private canAmend(): boolean {
    return (
      this.props.commitToAmend !== null &&
      (this.state.commitMessage.summary.length > 0 ||
        this.props.prepopulateCommitSummary) &&
      !this.hasRepoRuleFailure()
    )
  }

  /**
   * Whether the user will be prevented from pushing this commit due to a repo rule failure.
   */
  private hasRepoRuleFailure(): boolean {
    const { aheadBehind, repoRulesInfo } = this.props

    if (!this.state.repoRulesEnabled) {
      return false
    }

    return (
      repoRulesInfo.basicCommitWarning === true ||
      repoRulesInfo.signedCommitsRequired === true ||
      repoRulesInfo.pullRequestRequired === true ||
      this.state.repoRuleCommitMessageFailures.status === 'fail' ||
      this.state.repoRuleCommitAuthorFailures.status === 'fail' ||
      (aheadBehind === null &&
        (repoRulesInfo.creationRestricted === true ||
          this.state.repoRuleBranchNameFailures.status === 'fail'))
    )
  }

  private canExcecuteCommitShortcut(event: KeyboardEvent) {
    // Once upon a time the CommitMessage component was only ever used in the
    // changes view so it was safe to bind to the keyDown event of the Window in
    // order to allow users to hit CmdOrCtrl+Enter to commit from pretty much
    // anywhere in the app as long as the changes view was active and we weren't
    // showing a modal or foldout.
    //
    // Now that the CommitMessage component is used in other places, such as in
    // the squash dialog we still want the CmdOrCtrl+Enter shortcut to work
    // so we'll allow the shortcut even if a dialog is open as long as it's
    // coming from within the component itself.
    return (
      (event.target instanceof Node &&
        this.wrapperRef.current?.contains(event.target)) ||
      (!this.props.isShowingFoldout && !this.props.isShowingModal)
    )
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return
    }

    const isShortcutKey = __DARWIN__ ? event.metaKey : event.ctrlKey
    if (
      isShortcutKey &&
      event.key === 'Enter' &&
      (this.canCommit() || this.canAmend()) &&
      this.canExcecuteCommitShortcut(event)
    ) {
      this.createCommit()
      event.preventDefault()
    }
  }

  private renderAvatar() {
    const { commitAuthor, repository } = this.props
    const { gitHubRepository } = repository
    const avatarUser: IAvatarUser | undefined =
      commitAuthor !== null
        ? getAvatarUserFromAuthor(commitAuthor, gitHubRepository)
        : undefined

    const repositoryAccount = this.props.repositoryAccount
    const accountEmails =
      repositoryAccount?.emails.filter(e => e.verified).map(e => e.email) ?? []

    if (repositoryAccount && isDotCom(repositoryAccount.endpoint)) {
      const { id, login, endpoint } = repositoryAccount
      const stealthEmail = getStealthEmailForUser(id, login, endpoint)

      if (
        !accountEmails
          .map(x => x.toLowerCase())
          .includes(stealthEmail.toLowerCase())
      ) {
        accountEmails.push(stealthEmail)
      }
    }

    const email = commitAuthor?.email

    let warningType: CommitMessageAvatarWarningType = 'none'
    if (email !== undefined) {
      if (
        this.state.repoRulesEnabled &&
        this.state.repoRuleCommitAuthorFailures.status !== 'pass'
      ) {
        warningType = 'disallowedEmail'
      } else if (
        repositoryAccount !== null &&
        repositoryAccount !== undefined &&
        isAttributableEmailFor(repositoryAccount, email) === false
      ) {
        warningType = 'misattribution'
      }
    }

    return (
      <CommitMessageAvatar
        user={avatarUser}
        email={commitAuthor?.email}
        isEnterpriseAccount={
          repositoryAccount !== null && isEnterpriseAccount(repositoryAccount)
        }
        warningType={warningType}
        emailRuleFailures={this.state.repoRuleCommitAuthorFailures}
        branch={this.props.branch}
        accountEmails={accountEmails}
        preferredAccountEmail={
          repositoryAccount !== null && repositoryAccount !== undefined
            ? lookupPreferredEmail(repositoryAccount)
            : ''
        }
        onUpdateEmail={this.onUpdateUserEmail}
        onOpenRepositorySettings={this.onOpenRepositorySettings}
        onOpenGitSettings={this.onOpenGitSettings}
        repository={repository}
        accounts={this.props.accounts}
      />
    )
  }

  private onUpdateUserEmail = async (email: string) => {
    await setGlobalConfigValue('user.email', email)
    this.props.onRefreshAuthor()
  }

  private onOpenRepositorySettings = () => {
    this.props.onShowPopup({
      type: PopupType.RepositorySettings,
      repository: this.props.repository,
      initialSelectedTab: RepositorySettingsTab.GitConfig,
    })
  }

  private onOpenGitSettings = () => {
    this.props.onShowPopup({
      type: PopupType.Preferences,
      initialSelectedTab: PreferencesTab.Git,
    })
  }

  private get isCoAuthorInputEnabled() {
    return this.props.repository.gitHubRepository !== null
  }

  private get isCoAuthorInputVisible() {
    return this.props.showCoAuthoredBy && this.isCoAuthorInputEnabled
  }

  private onCoAuthorsUpdated = (coAuthors: ReadonlyArray<Author>) =>
    this.props.onCoAuthorsUpdated(coAuthors)

  private renderCoAuthorInput() {
    if (!this.isCoAuthorInputVisible) {
      return null
    }

    const autocompletionProvider = this.state.coAuthorAutocompletionProvider

    if (!autocompletionProvider) {
      return null
    }

    return (
      <AuthorInput
        ref={this.coAuthorInputRef}
        onAuthorsUpdated={this.onCoAuthorsUpdated}
        authors={this.props.coAuthors}
        autoCompleteProvider={autocompletionProvider}
        readOnly={this.props.isCommitting === true}
      />
    )
  }

  private onToggleCoAuthors = () => {
    this.props.onShowCoAuthoredByChanged(!this.props.showCoAuthoredBy)
  }

  private get toggleCoAuthorsText(): string {
    return this.props.showCoAuthoredBy
      ? __DARWIN__
        ? 'Remove Co-Authors'
        : 'Remove co-authors'
      : __DARWIN__
      ? 'Add Co-Authors'
      : 'Add co-authors'
  }

  private getAddRemoveCoAuthorsMenuItem(): IMenuItem {
    return {
      label: this.toggleCoAuthorsText,
      action: this.onToggleCoAuthors,
      enabled:
        this.props.repository.gitHubRepository !== null &&
        this.props.isCommitting !== true,
    }
  }

  private getGenerateCommitMessageMenuItem(): IMenuItem | null {
    const {
      accounts,
      onGenerateCommitMessage,
      filesSelected,
      isCommitting,
      isGeneratingCommitMessage,
      commitToAmend,
    } = this.props

    if (
      !accounts.some(enableCommitMessageGeneration) ||
      onGenerateCommitMessage === undefined
    ) {
      return null
    }

    const noFilesSelected = filesSelected.length === 0
    const noChangesAvailable = !commitToAmend && noFilesSelected

    return {
      label: __DARWIN__
        ? 'Generate Commit Message with Copilot'
        : 'Generate commit message with Copilot',
      action: () => {
        const { commitMessage } = this.state
        onGenerateCommitMessage(
          filesSelected,
          !!commitMessage.summary || !!commitMessage.description
        )
      },
      enabled:
        isCommitting !== true &&
        !isGeneratingCommitMessage &&
        !noChangesAvailable,
    }
  }

  private onContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLInputElement
    ) {
      return
    }

    const items: IMenuItem[] = [this.getAddRemoveCoAuthorsMenuItem()]

    const generateMenuItem = this.getGenerateCommitMessageMenuItem()
    if (generateMenuItem) {
      items.push(generateMenuItem)
    }

    showContextualMenu(items)
  }

  private onAutocompletingInputContextMenu = () => {
    const items: IMenuItem[] = [this.getAddRemoveCoAuthorsMenuItem()]

    const generateMenuItem = this.getGenerateCommitMessageMenuItem()
    if (generateMenuItem) {
      items.push(generateMenuItem)
    }

    items.push(
      { type: 'separator' },
      { role: 'editMenu' },
      { type: 'separator' }
    )

    items.push(
      this.getCommitSpellcheckEnabilityMenuItem(
        this.props.commitSpellcheckEnabled
      )
    )

    showContextualMenu(items, true)
  }

  private getCommitSpellcheckEnabilityMenuItem(isEnabled: boolean): IMenuItem {
    const enableLabel = __DARWIN__
      ? 'Enable Commit Spellcheck'
      : 'Enable commit spellcheck'
    const disableLabel = __DARWIN__
      ? 'Disable Commit Spellcheck'
      : 'Disable commit spellcheck'
    return {
      label: isEnabled ? disableLabel : enableLabel,
      action: () => this.props.onCommitSpellcheckEnabledChanged(!isEnabled),
    }
  }

  private onCopilotButtonClick = async (
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    e.preventDefault()
    const { commitMessage } = this.state

    this.props.onGenerateCommitMessage?.(
      this.props.filesSelected,
      !!commitMessage.summary || !!commitMessage.description
    )
  }

  private onCoAuthorToggleButtonClick = async (
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    e.preventDefault()

    this.onToggleCoAuthors()
  }

  private renderCopilotButton() {
    if (!this.isCopilotButtonEnabled) {
      return null
    }

    const {
      filesSelected,
      isCommitting,
      isGeneratingCommitMessage,
      commitToAmend,
      shouldShowGenerateCommitMessageCallOut,
    } = this.props

    const noFilesSelected = filesSelected.length === 0
    const noChangesAvailable = !commitToAmend && noFilesSelected

    const ariaLabel = isGeneratingCommitMessage
      ? 'Generating commit details…'
      : 'Generate commit message with Copilot' +
        (noChangesAvailable
          ? '. Files must be selected to generate a commit message.'
          : '')

    return (
      <>
        {this.isCoAuthorInputEnabled && <div className="separator" />}
        <Button
          className="copilot-button"
          onClick={this.onCopilotButtonClick}
          ariaLabel={ariaLabel}
          tooltip={ariaLabel}
          disabled={
            isCommitting === true ||
            isGeneratingCommitMessage ||
            noChangesAvailable
          }
        >
          <AriaLiveContainer
            message={
              isGeneratingCommitMessage ? 'Generating commit details…' : ''
            }
          />
          <Octicon symbol={octicons.copilot} />
          {shouldShowGenerateCommitMessageCallOut && (
            <span className="call-to-action-bubble">New</span>
          )}
        </Button>
      </>
    )
  }

  private renderCommitOptionsButton() {
    const ariaLabel = 'Configure commit options'

    return (
      <>
        {(this.isCoAuthorInputEnabled || this.isCopilotButtonEnabled) && (
          <div className="separator" />
        )}
        <Button
          className={classNames('commit-options-button', {
            'default-options':
              !this.props.skipCommitHooks &&
              !this.props.signOffCommits &&
              !this.props.allowEmptyCommit,
          })}
          onClick={this.onCommitOptionsButtonClick}
          ariaLabel={ariaLabel}
          tooltip={ariaLabel}
        >
          <Octicon symbol={octicons.gear} />
        </Button>
      </>
    )
  }

  private onCommitOptionsButtonClick = (
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    e.preventDefault()

    const items: IMenuItem[] = []

    if (enableHooksEnvironment() && this.props.hasCommitHooks) {
      items.push({
        type: 'checkbox',
        checked: this.props.skipCommitHooks,
        label: __DARWIN__ ? 'Bypass Commit Hooks' : 'Bypass Commit hooks',
        action: () => {
          this.props.onUpdateCommitOptions(this.props.repository, {
            skipCommitHooks: !this.props.skipCommitHooks,
          })
        },
      })
    }

    items.push({
      type: 'checkbox',
      checked: this.props.signOffCommits,
      label: __DARWIN__
        ? 'Add Signed-off-by Trailer'
        : 'Add Signed-off-by trailer',
      action: () => {
        this.props.onUpdateCommitOptions(this.props.repository, {
          signOffCommits: !this.props.signOffCommits,
        })
      },
    })

    if (this.props.showAllowEmptyCommitOption) {
      items.push({
        type: 'checkbox',
        checked: this.props.allowEmptyCommit,
        label: __DARWIN__ ? 'Allow Empty Commit' : 'Allow empty commit',
        action: () => {
          this.props.onUpdateCommitOptions(this.props.repository, {
            allowEmptyCommit: !this.props.allowEmptyCommit,
          })
        },
      })
    }

    showContextualMenu(items)
  }

  private renderCoAuthorToggleButton() {
    if (this.props.repository.gitHubRepository === null) {
      return null
    }

    return (
      <Button
        className="co-authors-toggle"
        onClick={this.onCoAuthorToggleButtonClick}
        ariaLabel={this.toggleCoAuthorsText}
        tooltip={this.toggleCoAuthorsText}
        disabled={
          this.props.isCommitting === true ||
          this.props.isGeneratingCommitMessage
        }
      >
        <Octicon symbol={addAuthorIcon} />
      </Button>
    )
  }

  private onDescriptionFieldRef = (
    component: AutocompletingTextArea | null
  ) => {
    this.descriptionComponent = component
  }

  private onDescriptionTextAreaScroll = () => {
    this.descriptionTextAreaScrollDebounceId = null

    const elem = this.descriptionTextArea
    const descriptionObscured =
      elem !== null && elem.scrollTop + elem.offsetHeight < elem.scrollHeight

    if (this.state.descriptionObscured !== descriptionObscured) {
      this.setState({ descriptionObscured })
    }
  }

  private onDescriptionTextAreaRef = (elem: HTMLTextAreaElement | null) => {
    if (elem) {
      const checkDescriptionScrollState = () => {
        if (this.descriptionTextAreaScrollDebounceId !== null) {
          cancelAnimationFrame(this.descriptionTextAreaScrollDebounceId)
          this.descriptionTextAreaScrollDebounceId = null
        }
        this.descriptionTextAreaScrollDebounceId = requestAnimationFrame(
          this.onDescriptionTextAreaScroll
        )
      }
      elem.addEventListener('input', checkDescriptionScrollState)
      elem.addEventListener('scroll', checkDescriptionScrollState)
    }

    this.descriptionTextArea = elem
  }

  private onSummaryInputRef = (elem: HTMLInputElement | null) => {
    this.summaryTextInput = elem
  }

  private onFocusContainerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) {
      // Our description text area is styled to look like it's a big textarea
      // with buttons towards the bottom but it's not. It's a textarea inside of
      // a focus container (div) which is styled to look like a text area.
      // To maintain that illusion we need to focus the description text area
      // when the user clicks on the focus container but we don't want to
      // do that if the user clicked on one of the buttons in the action bar
      return
    }

    if (this.descriptionComponent) {
      this.descriptionComponent.focus()
    }
  }

  /**
   * Whether the Copilot button should be available
   */
  private get isCopilotButtonEnabled() {
    const { accounts, onGenerateCommitMessage } = this.props
    return (
      accounts.some(enableCommitMessageGeneration) &&
      onGenerateCommitMessage !== undefined
    )
  }

  private renderActionBar() {
    const { isCommitting, isGeneratingCommitMessage } = this.props

    const className = classNames('action-bar', {
      disabled: isCommitting === true || isGeneratingCommitMessage === true,
    })

    return (
      <div className={className}>
        {this.renderCoAuthorToggleButton()}
        {this.renderCopilotButton()}
        {this.renderCommitOptionsButton()}
      </div>
    )
  }

  private renderAmendCommitNotice() {
    const { commitToAmend } = this.props

    if (commitToAmend !== null) {
      return (
        <CommitWarning icon={CommitWarningIcon.Information}>
          Your changes will modify your <strong>most recent commit</strong>.{' '}
          <LinkButton onClick={this.props.onStopAmending}>
            Stop amending
          </LinkButton>{' '}
          to make these changes as a new commit.
        </CommitWarning>
      )
    } else {
      return null
    }
  }

  private renderBranchProtectionsRepoRulesCommitWarning() {
    const {
      showNoWriteAccess,
      showBranchProtected,
      repoRulesInfo,
      aheadBehind,
      repository,
      branch,
    } = this.props

    const { repoRuleBranchNameFailures, repoRulesEnabled } = this.state

    // if one of these is not bypassable, then that failure message needs to be shown rather than
    // just displaying the first one in the if statement below
    type WarningToDisplay = 'publish' | 'commitSigning' | 'basic' | null
    const ruleEnforcementStatuses = new Map<
      Exclude<WarningToDisplay, null>,
      RepoRuleEnforced
    >()

    let repoRuleWarningToDisplay: WarningToDisplay = null

    if (repoRulesEnabled) {
      // has the current branch has been published?
      if (aheadBehind === null && branch !== null) {
        if (
          repoRulesInfo.creationRestricted === true ||
          repoRuleBranchNameFailures.status === 'fail'
        ) {
          ruleEnforcementStatuses.set('publish', true)
        } else if (
          repoRulesInfo.creationRestricted === 'bypass' ||
          repoRuleBranchNameFailures.status === 'bypass'
        ) {
          ruleEnforcementStatuses.set('publish', 'bypass')
        } else {
          ruleEnforcementStatuses.set('publish', false)
        }
      }

      ruleEnforcementStatuses.set(
        'commitSigning',
        repoRulesInfo.signedCommitsRequired
      )
      ruleEnforcementStatuses.set('basic', repoRulesInfo.basicCommitWarning)

      // grab the first error to display
      for (const status of ruleEnforcementStatuses) {
        if (status[1] === true) {
          repoRuleWarningToDisplay = status[0]
          break
        }
      }

      // if none errored, display the first bypassed
      if (repoRuleWarningToDisplay === null) {
        for (const status of ruleEnforcementStatuses) {
          if (status[1] === 'bypass') {
            repoRuleWarningToDisplay = status[0]
            break
          }
        }
      }
    }

    if (showNoWriteAccess) {
      return (
        <CommitWarning icon={CommitWarningIcon.Warning}>
          You don't have write access to <strong>{repository.name}</strong>.
          Want to{' '}
          <LinkButton onClick={this.props.onShowCreateForkDialog}>
            create a fork
          </LinkButton>
          ?
        </CommitWarning>
      )
    } else if (showBranchProtected) {
      if (branch === null) {
        // If the branch is null that means we haven't loaded the tip yet or
        // we're on a detached head. We shouldn't ever end up here with
        // showBranchProtected being true without a branch but who knows
        // what fun and exciting edge cases the future might hold
        return null
      }

      return (
        <CommitWarning icon={CommitWarningIcon.Warning}>
          <strong>{branch}</strong> is a protected branch. Want to{' '}
          <LinkButton onClick={this.onSwitchBranch}>switch branches</LinkButton>
          ?
        </CommitWarning>
      )
    } else if (repoRuleWarningToDisplay === 'publish') {
      const canBypass = ruleEnforcementStatuses.get('publish') === 'bypass'

      return (
        <CommitWarning
          icon={canBypass ? CommitWarningIcon.Warning : CommitWarningIcon.Error}
        >
          The branch name <strong>{branch}</strong> fails{' '}
          <RepoRulesetsForBranchLink
            repository={repository.gitHubRepository}
            branch={branch}
          >
            one or more rules
          </RepoRulesetsForBranchLink>{' '}
          that {canBypass ? 'would' : 'will'} prevent it from being published
          {canBypass && ', but you can bypass them. Proceed with caution!'}
          {!canBypass && (
            <>
              . Want to{' '}
              <LinkButton onClick={this.onSwitchBranch}>
                switch branches
              </LinkButton>
              ?
            </>
          )}
        </CommitWarning>
      )
    } else if (repoRuleWarningToDisplay === 'commitSigning') {
      const canBypass = repoRulesInfo.signedCommitsRequired === 'bypass'

      return (
        <CommitWarning
          icon={canBypass ? CommitWarningIcon.Warning : CommitWarningIcon.Error}
        >
          <RepoRulesetsForBranchLink
            repository={repository.gitHubRepository}
            branch={branch}
          >
            One or more rules
          </RepoRulesetsForBranchLink>{' '}
          apply to the branch <strong>{branch}</strong> that require signed
          commits
          {canBypass && ', but you can bypass them. Proceed with caution!'}
          {!canBypass && '.'}{' '}
          <LinkButton uri="https://docs.github.com/authentication/managing-commit-signature-verification/signing-commits">
            Learn more about commit signing.
          </LinkButton>
        </CommitWarning>
      )
    } else if (repoRuleWarningToDisplay === 'basic') {
      const canBypass = repoRulesInfo.basicCommitWarning === 'bypass'

      return (
        <CommitWarning
          icon={canBypass ? CommitWarningIcon.Warning : CommitWarningIcon.Error}
        >
          <RepoRulesetsForBranchLink
            repository={repository.gitHubRepository}
            branch={branch}
          >
            One or more rules
          </RepoRulesetsForBranchLink>{' '}
          apply to the branch <strong>{branch}</strong> that{' '}
          {canBypass ? 'would' : 'will'} prevent pushing
          {canBypass && ', but you can bypass them. Proceed with caution!'}
          {!canBypass && (
            <>
              . Want to{' '}
              <LinkButton onClick={this.onSwitchBranch}>
                switch branches
              </LinkButton>
              ?
            </>
          )}
        </CommitWarning>
      )
    } else {
      return null
    }
  }

  private renderRuleFailurePopover() {
    const { branch, repository } = this.props

    // the failure status is checked here separately from whether the popover is open. if the
    // user has it open but rules pass as they're typing, then keep the popover logic open
    // but just don't render it. as they keep typing, if the message fails again, then the
    // popover will open back up.
    if (
      !branch ||
      !repository.gitHubRepository ||
      !this.state.repoRulesEnabled ||
      this.state.repoRuleCommitMessageFailures.status === 'pass'
    ) {
      return
    }

    const header = __DARWIN__
      ? 'Commit Message Rule Failures'
      : 'Commit message rule failures'
    return (
      <Popover
        anchor={this.summaryTextInput}
        anchorPosition={PopoverAnchorPosition.Right}
        decoration={PopoverDecoration.Balloon}
        minHeight={200}
        ariaLabelledby="commit-message-rule-failure-popover-header"
        onClickOutside={this.closeRuleFailurePopover}
      >
        <h3 id="commit-message-rule-failure-popover-header">{header}</h3>

        <RepoRulesMetadataFailureList
          repository={repository.gitHubRepository}
          branch={branch}
          failures={this.state.repoRuleCommitMessageFailures}
          leadingText="This commit message"
        />
      </Popover>
    )
  }

  private toggleRuleFailurePopover = () => {
    this.setState({
      isRuleFailurePopoverOpen: !this.state.isRuleFailurePopoverOpen,
    })
  }

  private closeRuleFailurePopover = () => {
    this.setState({ isRuleFailurePopoverOpen: false })
  }

  private onSwitchBranch = () => {
    this.props.onShowFoldout({ type: FoldoutType.Branch })
  }

  private getButtonVerb() {
    const { isCommitting, commitToAmend } = this.props

    const amendVerb = isCommitting ? 'Amending' : 'Amend'
    const commitVerb = isCommitting ? 'Committing' : 'Commit'
    const isAmending = commitToAmend !== null

    return isAmending ? amendVerb : commitVerb
  }

  private getCommittingButtonText() {
    const { branch } = this.props
    const verb = this.getButtonVerb()

    if (branch === null) {
      return verb
    }

    /** N.B. For screen reader users, this string literal is important! This was
     * moved into a string literal because when it was JSX it was interpreted
     * as three separate strings "Verb" and "Count" and "to" and even tho
     * visually it was correctly adding spacings, for screen reader users it was
     * not and putting them all to together as one word. */
    const action = `${verb} ${this.getFilesToBeCommittedButtonText()}to `

    return (
      <>
        {action}
        <strong>{branch}</strong>
      </>
    )
  }

  private getFilesToBeCommittedButtonText() {
    const { filesToBeCommittedCount } = this.props

    if (
      filesToBeCommittedCount === undefined ||
      filesToBeCommittedCount === 0
    ) {
      return ''
    }

    const pluralizedFile = filesToBeCommittedCount > 1 ? 'files' : 'file'

    return `${filesToBeCommittedCount} ${pluralizedFile} `
  }

  private getCommittingButtonTitle() {
    const { branch } = this.props
    const verb = this.getButtonVerb()

    if (branch === null) {
      return verb
    }

    return `${verb} to ${branch}`
  }

  private getButtonText() {
    const { commitToAmend, commitButtonText } = this.props

    if (commitButtonText) {
      return commitButtonText
    }

    const isAmending = commitToAmend !== null
    return isAmending ? this.getButtonTitle() : this.getCommittingButtonText()
  }

  private getButtonTitle(): string {
    const { commitToAmend, commitButtonText } = this.props

    if (commitButtonText) {
      return commitButtonText
    }

    const isAmending = commitToAmend !== null
    return isAmending
      ? `${this.getButtonVerb()} last commit`
      : this.getCommittingButtonTitle()
  }

  private getButtonTooltip(buttonEnabled: boolean) {
    if (buttonEnabled) {
      return this.getButtonTitle()
    }

    const isSummaryBlank = isEmptyOrWhitespace(this.summaryOrPlaceholder)
    if (isSummaryBlank) {
      return `A commit summary is required to commit`
    } else if (
      !this.props.anyFilesSelected &&
      this.props.anyFilesAvailable &&
      !this.props.allowEmptyCommit
    ) {
      return `Select one or more files to commit`
    } else if (this.props.isCommitting) {
      return `Committing changes…`
    }

    return undefined
  }

  private renderSubmitButton() {
    const { isCommitting, isGeneratingCommitMessage } = this.props
    const isSummaryBlank = isEmptyOrWhitespace(this.summaryOrPlaceholder)
    const buttonEnabled =
      (this.canCommit() || this.canAmend()) &&
      !isCommitting &&
      !isSummaryBlank &&
      !isGeneratingCommitMessage
    const loading =
      isCommitting || isGeneratingCommitMessage ? <Loading /> : undefined
    const generatingCommitDetailsMessage = isGeneratingCommitMessage
      ? 'Generating commit details…'
      : null
    const tooltip =
      generatingCommitDetailsMessage ?? this.getButtonTooltip(buttonEnabled)
    const commitButton = generatingCommitDetailsMessage ?? this.getButtonText()

    return (
      <Button
        type="submit"
        className="commit-button"
        onClick={this.onSubmit}
        disabled={!buttonEnabled}
        tooltip={tooltip}
        tooltipDismissable={false}
        onlyShowTooltipWhenOverflowed={buttonEnabled}
        ariaDescribedBy={this.props.submitButtonAriaDescribedBy}
      >
        <>
          {loading}
          {commitButton}
        </>
      </Button>
    )
  }

  private renderSummaryLengthHint(): JSX.Element | null {
    return (
      <ToggledtippedContent
        delay={0}
        tooltip={
          <>
            <div className="title">
              Great commit summaries contain fewer than 50 characters
            </div>
            <div className="description">
              Place extra information in the description field.
            </div>
          </>
        }
        ariaLiveMessage={
          'Great commit summaries contain fewer than 50 characters. Place extra information in the description field.'
        }
        direction={TooltipDirection.NORTH}
        className="length-hint"
        tooltipClassName="length-hint-tooltip"
        ariaLabel="Open Summary Length Info"
      >
        <Octicon symbol={octicons.lightBulb} />
      </ToggledtippedContent>
    )
  }

  private renderRepoRuleCommitMessageFailureHint(): JSX.Element | null {
    // enableRepoRules FF is checked before this method

    if (this.state.repoRuleCommitMessageFailures.status === 'pass') {
      return null
    }

    const canBypass =
      this.state.repoRuleCommitMessageFailures.status === 'bypass'

    let ariaLabelPrefix: string
    let bypassMessage = ''
    if (canBypass) {
      ariaLabelPrefix = 'Warning'
      bypassMessage = ', but you can bypass them'
    } else {
      ariaLabelPrefix = 'Error'
    }

    return (
      <button
        id="commit-message-failure-hint"
        className="commit-message-failure-hint button-component"
        aria-label={`${ariaLabelPrefix}: Commit message fails repository rules${bypassMessage}. View details.`}
        aria-haspopup="dialog"
        aria-expanded={this.state.isRuleFailurePopoverOpen}
        onClick={this.toggleRuleFailurePopover}
      >
        <Octicon
          symbol={canBypass ? octicons.alert : octicons.stop}
          className={canBypass ? 'warning-icon' : 'error-icon'}
        />
      </button>
    )
  }

  private renderCommitProgress() {
    const { isCommitting, hookProgress, onShowCommitProgress } = this.props
    if (!isCommitting || !hookProgress) {
      return null
    }

    const { status, hookName } = hookProgress

    const text =
      hookName === 'pre-auto-gc' && status === 'finished'
        ? 'Optimizing repository…'
        : status === 'started'
        ? `${hookName} hook running…`
        : status === 'finished'
        ? `${hookName} hook finished`
        : status === 'failed'
        ? `${hookName} hook failed`
        : assertNever(status, `Unknown hook status: ${status}`)

    const cn = classNames('commit-progress', {
      'with-button': onShowCommitProgress !== undefined,
    })
    return (
      <div className={cn}>
        <div className="description">{text}</div>
        {onShowCommitProgress && (
          <Button tooltip="Show commit progress" onClick={onShowCommitProgress}>
            <Octicon symbol={octicons.terminal} />
          </Button>
        )}
      </div>
    )
  }

  public render() {
    const className = classNames('commit-message-component', {
      'with-action-bar': true,
      'with-co-authors': this.isCoAuthorInputVisible,
    })

    const descriptionClassName = classNames('description-field', {
      'with-overflow': this.state.descriptionObscured,
    })

    const showRepoRuleCommitMessageFailureHint =
      this.state.repoRulesEnabled &&
      this.state.repoRuleCommitMessageFailures.status !== 'pass'

    const showSummaryLengthHint =
      this.props.showCommitLengthWarning &&
      !showRepoRuleCommitMessageFailureHint &&
      this.state.commitMessage.summary.length > IdealSummaryLength

    const summaryClassName = classNames('summary', {
      'with-trailing-icon':
        showRepoRuleCommitMessageFailureHint || showSummaryLengthHint,
    })
    const summaryInputClassName = classNames('summary-field', 'nudge-arrow', {
      'nudge-arrow-left': this.props.shouldNudge === true,
    })

    const ariaDescribedBy = showRepoRuleCommitMessageFailureHint
      ? this.COMMIT_MSG_ERROR_BTN_ID
      : undefined

    const {
      placeholder,
      isCommitting,
      isGeneratingCommitMessage,
      commitSpellcheckEnabled,
    } = this.props

    return (
      <div
        role="group"
        aria-label="Create commit"
        className={className}
        onContextMenu={this.onContextMenu}
        ref={this.wrapperRef}
      >
        <div className={summaryClassName} ref={this.summaryGroupRef}>
          {this.renderAvatar()}

          <AutocompletingInput
            required={true}
            label={this.props.showInputLabels === true ? 'Summary' : undefined}
            screenReaderLabel="Commit summary"
            className={summaryInputClassName}
            placeholder={placeholder}
            value={this.state.commitMessage.summary}
            onValueChanged={this.onSummaryChanged}
            onElementRef={this.onSummaryInputRef}
            autocompletionProviders={
              this.state.commitMessageAutocompletionProviders
            }
            aria-describedby={ariaDescribedBy}
            onContextMenu={this.onAutocompletingInputContextMenu}
            readOnly={
              isCommitting === true || isGeneratingCommitMessage === true
            }
            spellcheck={commitSpellcheckEnabled}
          />
          {showRepoRuleCommitMessageFailureHint &&
            this.renderRepoRuleCommitMessageFailureHint()}
          {showSummaryLengthHint && this.renderSummaryLengthHint()}
        </div>

        {this.state.isRuleFailurePopoverOpen && this.renderRuleFailurePopover()}

        {this.props.showInputLabels === true && (
          <label htmlFor="commit-message-description">Description</label>
        )}
        <FocusContainer
          className="description-focus-container"
          onClick={this.onFocusContainerClick}
        >
          <AutocompletingTextArea
            inputId="commit-message-description"
            className={descriptionClassName}
            screenReaderLabel={
              this.props.showInputLabels !== true
                ? 'Commit description'
                : undefined
            }
            placeholder="Description"
            value={this.state.commitMessage.description || ''}
            onValueChanged={this.onDescriptionChanged}
            autocompletionProviders={
              this.state.commitMessageAutocompletionProviders
            }
            aria-describedby={ariaDescribedBy}
            ref={this.onDescriptionFieldRef}
            onElementRef={this.onDescriptionTextAreaRef}
            onContextMenu={this.onAutocompletingInputContextMenu}
            readOnly={
              isCommitting === true || isGeneratingCommitMessage === true
            }
            spellcheck={commitSpellcheckEnabled}
          />
          {this.renderActionBar()}
        </FocusContainer>

        {this.renderCoAuthorInput()}

        {this.renderAmendCommitNotice()}
        {this.renderBranchProtectionsRepoRulesCommitWarning()}

        {this.renderSubmitButton()}
        {this.renderCommitProgress()}
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {this.state.isCommittingStatusMessage}
        </span>
      </div>
    )
  }
}
