import * as React from 'react'
import classNames from 'classnames'
import {
  AutocompletingTextArea,
  AutocompletingInput,
  IAutocompletionProvider,
  UserAutocompletionProvider,
} from '../autocompletion'
import { CommitIdentity } from '../../models/commit-identity'
import { ICommitMessage } from '../../models/commit-message'
import { Dispatcher } from '../dispatcher'
import {
  Repository,
  isRepositoryWithGitHubRepository,
} from '../../models/repository'
import { Button } from '../lib/button'
import { Loading } from '../lib/loading'
import { AuthorInput } from '../lib/author-input'
import { FocusContainer } from '../lib/focus-container'
import { Octicon, OcticonSymbol } from '../octicons'
import { IAuthor } from '../../models/author'
import { IMenuItem } from '../../lib/menu-item'
import { ICommitContext } from '../../models/commit'
import { startTimer } from '../lib/timing'
import { PermissionsCommitWarning } from './permissions-commit-warning'
import { LinkButton } from '../lib/link-button'
import { FoldoutType } from '../../lib/app-state'
import { IAvatarUser, getAvatarUserFromAuthor } from '../../models/avatar'
import { showContextualMenu } from '../main-process-proxy'
import { Account } from '../../models/account'
import { CommitMessageAvatar } from './commit-message-avatar'
import { getDotComAPIEndpoint } from '../../lib/api'
import { lookupPreferredEmail } from '../../lib/email'
import { setGlobalConfigValue } from '../../lib/git/config'
import { PopupType } from '../../models/popup'
import { RepositorySettingsTab } from '../repository-settings/repository-settings'
import { isAccountEmail } from '../../lib/is-account-email'

const addAuthorIcon = new OcticonSymbol(
  18,
  13,
  'M14 6V4.25a.75.75 0 0 1 1.5 0V6h1.75a.75.75 0 1 1 0 1.5H15.5v1.75a.75.75 0 0 ' +
    '1-1.5 0V7.5h-1.75a.75.75 0 1 1 0-1.5H14zM8.5 4a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 ' +
    '0zm.063 3.064a3.995 3.995 0 0 0 1.2-4.429A3.996 3.996 0 0 0 8.298.725a4.01 4.01 0 0 ' +
    '0-6.064 1.91 3.987 3.987 0 0 0 1.2 4.43A5.988 5.988 0 0 0 0 12.2a.748.748 0 0 0 ' +
    '.716.766.751.751 0 0 0 .784-.697 4.49 4.49 0 0 1 1.39-3.04 4.51 4.51 0 0 1 6.218 ' +
    '0 4.49 4.49 0 0 1 1.39 3.04.748.748 0 0 0 .786.73.75.75 0 0 0 .714-.8 5.989 5.989 0 0 0-3.435-5.136z'
)

interface ICommitMessageProps {
  readonly onCreateCommit: (context: ICommitContext) => Promise<boolean>
  readonly branch: string | null
  readonly commitAuthor: CommitIdentity | null
  readonly anyFilesSelected?: boolean
  readonly focusCommitMessage: boolean
  readonly commitMessage: ICommitMessage | null
  readonly repository: Repository
  readonly repositoryAccount?: Account | null
  readonly dispatcher: Dispatcher
  readonly autocompletionProviders: ReadonlyArray<IAutocompletionProvider<any>>
  readonly isCommitting?: boolean
  readonly placeholder: string
  readonly prepopulateCommitSummary: boolean
  readonly showBranchProtected: boolean
  readonly showNoWriteAccess: boolean

  /**
   * Whether or not to show a field for adding co-authors to
   * a commit (currently only supported for GH/GHE repositories)
   */
  readonly showCoAuthoredBy: boolean

  /**
   * A list of authors (name, email pairs) which have been
   * entered into the co-authors input box in the commit form
   * and which _may_ be used in the subsequent commit to add
   * Co-Authored-By commit message trailers depending on whether
   * the user has chosen to do so.
   */
  readonly coAuthors: ReadonlyArray<IAuthor>

  /** Whether this component should show its onboarding tutorial nudge arrow */
  readonly shouldNudge?: boolean

  readonly commitSpellcheckEnabled: boolean

  /** Optional text to override default commit button text */
  readonly commitButtonText?: string
}

interface ICommitMessageState {
  readonly summary: string
  readonly description: string | null

  readonly userAutocompletionProvider: UserAutocompletionProvider | null

  /**
   * Whether or not the description text area has more text that's
   * obscured by the action bar. Note that this will always be
   * false when there's no action bar.
   */
  readonly descriptionObscured: boolean
}

function findUserAutoCompleteProvider(
  providers: ReadonlyArray<IAutocompletionProvider<any>>
): UserAutocompletionProvider | null {
  for (const provider of providers) {
    if (provider instanceof UserAutocompletionProvider) {
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

  private summaryTextInput: HTMLInputElement | null = null

  private descriptionTextArea: HTMLTextAreaElement | null = null
  private descriptionTextAreaScrollDebounceId: number | null = null

  private coAuthorInputRef = React.createRef<AuthorInput>()

  public constructor(props: ICommitMessageProps) {
    super(props)
    const { commitMessage } = this.props

    this.state = {
      summary: commitMessage ? commitMessage.summary : '',
      description: commitMessage ? commitMessage.description : null,
      userAutocompletionProvider: findUserAutoCompleteProvider(
        props.autocompletionProviders
      ),
      descriptionObscured: false,
    }
  }

  public componentWillUnmount() {
    // We're unmounting, likely due to the user switching to the history tab.
    // Let's persist our commit message in the dispatcher.
    this.props.dispatcher.setCommitMessage(this.props.repository, {
      summary: this.state.summary,
      description: this.state.description,
    })
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

    if (this.state.summary === '' && !this.state.description) {
      this.setState({
        summary: commitMessage.summary,
        description: commitMessage.description,
      })
    }
  }

  public componentDidUpdate(prevProps: ICommitMessageProps) {
    if (
      this.props.autocompletionProviders !== prevProps.autocompletionProviders
    ) {
      this.setState({
        userAutocompletionProvider: findUserAutoCompleteProvider(
          this.props.autocompletionProviders
        ),
      })
    }

    if (this.props.focusCommitMessage) {
      this.focusSummary()
    } else if (
      prevProps.showCoAuthoredBy === false &&
      this.isCoAuthorInputVisible &&
      // The co-author input could be also shown when switching between repos,
      // but in that case we don't want to give the focus to the input.
      prevProps.repository.id === this.props.repository.id
    ) {
      this.coAuthorInputRef.current?.focus()
    }
  }

  private clearCommitMessage() {
    this.setState({ summary: '', description: null })
  }

  private focusSummary() {
    if (this.summaryTextInput !== null) {
      this.summaryTextInput.focus()
      this.props.dispatcher.setCommitMessageFocus(false)
    }
  }

  private onSummaryChanged = (summary: string) => {
    this.setState({ summary })
  }

  private onDescriptionChanged = (description: string) => {
    this.setState({ description })
  }

  private onSubmit = () => {
    this.createCommit()
  }

  private getCoAuthorTrailers() {
    if (!this.isCoAuthorInputEnabled) {
      return []
    }

    return this.props.coAuthors.map(a => ({
      token: 'Co-Authored-By',
      value: `${a.name} <${a.email}>`,
    }))
  }

  private async createCommit() {
    const { summary, description } = this.state

    if (!this.canCommit()) {
      return
    }

    const trailers = this.getCoAuthorTrailers()

    const summaryOrPlaceholder =
      this.props.prepopulateCommitSummary && !this.state.summary
        ? this.props.placeholder
        : summary

    const commitContext = {
      summary: summaryOrPlaceholder,
      description,
      trailers,
    }

    const timer = startTimer('create commit', this.props.repository)
    const commitCreated = await this.props.onCreateCommit(commitContext)
    timer.done()

    if (commitCreated) {
      this.clearCommitMessage()
    }
  }

  private canCommit(): boolean {
    return (
      (this.props.anyFilesSelected === true && this.state.summary.length > 0) ||
      this.props.prepopulateCommitSummary
    )
  }

  private onKeyDown = (event: React.KeyboardEvent<Element>) => {
    if (event.defaultPrevented) {
      return
    }

    const isShortcutKey = __DARWIN__ ? event.metaKey : event.ctrlKey
    if (isShortcutKey && event.key === 'Enter' && this.canCommit()) {
      this.createCommit()
      event.preventDefault()
    }
  }

  private renderAvatar() {
    const { commitAuthor, repository } = this.props
    const { gitHubRepository } = repository
    const avatarTitle = commitAuthor
      ? `Committing as ${commitAuthor.name} <${commitAuthor.email}>`
      : undefined
    const avatarUser: IAvatarUser | undefined =
      commitAuthor !== null
        ? getAvatarUserFromAuthor(commitAuthor, gitHubRepository)
        : undefined

    const repositoryAccount = this.props.repositoryAccount
    const accountEmails = repositoryAccount?.emails.map(e => e.email) ?? []
    const email = commitAuthor?.email

    const warningBadgeVisible =
      email !== undefined &&
      repositoryAccount !== null &&
      repositoryAccount !== undefined &&
      isAccountEmail(accountEmails, email) === false

    return (
      <CommitMessageAvatar
        user={avatarUser}
        title={avatarTitle}
        email={commitAuthor?.email}
        isEnterpriseAccount={
          repositoryAccount?.endpoint !== getDotComAPIEndpoint()
        }
        warningBadgeVisible={warningBadgeVisible}
        accountEmails={accountEmails}
        preferredAccountEmail={
          repositoryAccount !== null && repositoryAccount !== undefined
            ? lookupPreferredEmail(repositoryAccount)
            : ''
        }
        onUpdateEmail={this.onUpdateUserEmail}
        onOpenRepositorySettings={this.onOpenRepositorySettings}
      />
    )
  }

  private onUpdateUserEmail = async (email: string) => {
    await setGlobalConfigValue('user.email', email)
    this.props.dispatcher.refreshAuthor(this.props.repository)
  }

  private onOpenRepositorySettings = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.RepositorySettings,
      repository: this.props.repository,
      initialSelectedTab: RepositorySettingsTab.GitConfig,
    })
  }

  private get isCoAuthorInputEnabled() {
    return this.props.repository.gitHubRepository !== null
  }

  private get isCoAuthorInputVisible() {
    return this.props.showCoAuthoredBy && this.isCoAuthorInputEnabled
  }

  private onCoAuthorsUpdated = (coAuthors: ReadonlyArray<IAuthor>) => {
    this.props.dispatcher.setCoAuthors(this.props.repository, coAuthors)
  }

  private renderCoAuthorInput() {
    if (!this.isCoAuthorInputVisible) {
      return null
    }

    const autocompletionProvider = this.state.userAutocompletionProvider

    if (!autocompletionProvider) {
      return null
    }

    return (
      <AuthorInput
        ref={this.coAuthorInputRef}
        onAuthorsUpdated={this.onCoAuthorsUpdated}
        authors={this.props.coAuthors}
        autoCompleteProvider={autocompletionProvider}
        disabled={this.props.isCommitting === true}
      />
    )
  }

  private onToggleCoAuthors = () => {
    this.props.dispatcher.setShowCoAuthoredBy(
      this.props.repository,
      !this.props.showCoAuthoredBy
    )
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

  private onContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLInputElement
    ) {
      return
    }

    showContextualMenu([this.getAddRemoveCoAuthorsMenuItem()])
  }

  private onAutocompletingInputContextMenu = () => {
    const items: IMenuItem[] = [
      this.getAddRemoveCoAuthorsMenuItem(),
      { type: 'separator' },
      { role: 'editMenu' },
      { type: 'separator' },
    ]

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
      action: () =>
        this.props.dispatcher.setCommitSpellcheckEnabled(!isEnabled),
    }
  }

  private onCoAuthorToggleButtonClick = (
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    e.preventDefault()
    this.onToggleCoAuthors()
  }

  private renderCoAuthorToggleButton() {
    if (this.props.repository.gitHubRepository === null) {
      return null
    }

    return (
      <button
        className="co-authors-toggle"
        onClick={this.onCoAuthorToggleButtonClick}
        tabIndex={-1}
        aria-label={this.toggleCoAuthorsText}
        disabled={this.props.isCommitting === true}
      >
        <Octicon symbol={addAuthorIcon} />
      </button>
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
    if (this.descriptionComponent) {
      this.descriptionComponent.focus()
    }
  }

  /**
   * Whether or not there's anything to render in the action bar
   */
  private get isActionBarEnabled() {
    return this.isCoAuthorInputEnabled
  }

  private renderActionBar() {
    if (!this.isCoAuthorInputEnabled) {
      return null
    }

    const className = classNames('action-bar', {
      disabled: this.props.isCommitting === true,
    })

    return <div className={className}>{this.renderCoAuthorToggleButton()}</div>
  }

  private renderPermissionsCommitWarning() {
    const {
      showBranchProtected,
      showNoWriteAccess,
      repository,
      branch,
    } = this.props

    if (showNoWriteAccess) {
      return (
        <PermissionsCommitWarning>
          You don't have write access to <strong>{repository.name}</strong>.
          Want to{' '}
          <LinkButton onClick={this.onMakeFork}>create a fork</LinkButton>?
        </PermissionsCommitWarning>
      )
    } else if (showBranchProtected) {
      if (branch === null) {
        // If the branch is null that means we haven't loaded the tip yet or
        // we're on a detached head. We shouldn't ever end up here with
        // showBranchProtected being true without a branch but who knows
        // what fun and exiting edge cases the future might hold
        return null
      }

      return (
        <PermissionsCommitWarning>
          <strong>{branch}</strong> is a protected branch. Want to{' '}
          <LinkButton onClick={this.onSwitchBranch}>switch branches</LinkButton>
          ?
        </PermissionsCommitWarning>
      )
    } else {
      return null
    }
  }

  private onSwitchBranch = () => {
    this.props.dispatcher.showFoldout({
      type: FoldoutType.Branch,
    })
  }

  private onMakeFork = () => {
    if (isRepositoryWithGitHubRepository(this.props.repository)) {
      this.props.dispatcher.showCreateForkDialog(this.props.repository)
    }
  }

  private renderSubmitButton() {
    const { isCommitting } = this.props
    const isSummaryWhiteSpace = this.state.summary.match(/^\s+$/g)
    const buttonEnabled =
      this.canCommit() && isCommitting !== true && !isSummaryWhiteSpace

    return (
      <Button
        type="submit"
        className="commit-button"
        onClick={this.onSubmit}
        disabled={!buttonEnabled}
      >
        {this.renderButtonContents()}
      </Button>
    )
  }

  private renderButtonContents(): JSX.Element {
    const { isCommitting, branch: branchName, commitButtonText } = this.props

    const loading = isCommitting === true ? <Loading /> : undefined
    const commitVerb = loading ? 'Committing' : 'Commit'
    const commitTitle =
      branchName !== null ? `${commitVerb} to ${branchName}` : commitVerb
    const defaultContents =
      branchName !== null ? (
        <>
          {commitVerb} to <strong>{branchName}</strong>
        </>
      ) : (
        commitVerb
      )

    const commitButton = commitButtonText ? commitButtonText : defaultContents

    return (
      <>
        {loading}
        <span title={commitTitle}>{commitButton}</span>
      </>
    )
  }

  public render() {
    const className = classNames({
      'with-action-bar': this.isActionBarEnabled,
      'with-co-authors': this.isCoAuthorInputVisible,
    })

    const descriptionClassName = classNames('description-field', {
      'with-overflow': this.state.descriptionObscured,
    })

    const summaryInputClassName = classNames('summary-field', 'nudge-arrow', {
      'nudge-arrow-left': this.props.shouldNudge === true,
    })

    return (
      <div
        id="commit-message"
        role="group"
        aria-label="Create commit"
        className={className}
        onContextMenu={this.onContextMenu}
        onKeyDown={this.onKeyDown}
      >
        <div className="summary">
          {this.renderAvatar()}

          <AutocompletingInput
            isRequired={true}
            className={summaryInputClassName}
            placeholder={this.props.placeholder}
            value={this.state.summary}
            onValueChanged={this.onSummaryChanged}
            onElementRef={this.onSummaryInputRef}
            autocompletionProviders={this.props.autocompletionProviders}
            onContextMenu={this.onAutocompletingInputContextMenu}
            disabled={this.props.isCommitting === true}
            spellcheck={this.props.commitSpellcheckEnabled}
          />
        </div>

        <FocusContainer
          className="description-focus-container"
          onClick={this.onFocusContainerClick}
        >
          <AutocompletingTextArea
            className={descriptionClassName}
            placeholder="Description"
            value={this.state.description || ''}
            onValueChanged={this.onDescriptionChanged}
            autocompletionProviders={this.props.autocompletionProviders}
            ref={this.onDescriptionFieldRef}
            onElementRef={this.onDescriptionTextAreaRef}
            onContextMenu={this.onAutocompletingInputContextMenu}
            disabled={this.props.isCommitting === true}
            spellcheck={this.props.commitSpellcheckEnabled}
          />
          {this.renderActionBar()}
        </FocusContainer>

        {this.renderCoAuthorInput()}

        {this.renderPermissionsCommitWarning()}

        {this.renderSubmitButton()}
      </div>
    )
  }
}
