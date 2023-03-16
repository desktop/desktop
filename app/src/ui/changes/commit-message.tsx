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
import { Repository } from '../../models/repository'
import { Button } from '../lib/button'
import { Loading } from '../lib/loading'
import { AuthorInput } from '../lib/author-input'
import { FocusContainer } from '../lib/focus-container'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { IAuthor } from '../../models/author'
import { IMenuItem } from '../../lib/menu-item'
import { Commit, ICommitContext } from '../../models/commit'
import { startTimer } from '../lib/timing'
import { CommitWarning, CommitWarningIcon } from './commit-warning'
import { LinkButton } from '../lib/link-button'
import { Foldout, FoldoutType } from '../../lib/app-state'
import { IAvatarUser, getAvatarUserFromAuthor } from '../../models/avatar'
import { showContextualMenu } from '../../lib/menu-item'
import { Account } from '../../models/account'
import { CommitMessageAvatar } from './commit-message-avatar'
import { getDotComAPIEndpoint } from '../../lib/api'
import { isAttributableEmailFor, lookupPreferredEmail } from '../../lib/email'
import { setGlobalConfigValue } from '../../lib/git/config'
import { Popup, PopupType } from '../../models/popup'
import { RepositorySettingsTab } from '../repository-settings/repository-settings'
import { IdealSummaryLength } from '../../lib/wrap-rich-text-commit-message'
import { isEmptyOrWhitespace } from '../../lib/is-empty-or-whitespace'
import { TooltippedContent } from '../lib/tooltipped-content'
import { TooltipDirection } from '../lib/tooltip'
import { pick } from '../../lib/pick'

const addAuthorIcon = {
  w: 18,
  h: 13,
  d:
    'M14 6V4.25a.75.75 0 0 1 1.5 0V6h1.75a.75.75 0 1 1 0 1.5H15.5v1.75a.75.75 0 0 ' +
    '1-1.5 0V7.5h-1.75a.75.75 0 1 1 0-1.5H14zM8.5 4a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 ' +
    '0zm.063 3.064a3.995 3.995 0 0 0 1.2-4.429A3.996 3.996 0 0 0 8.298.725a4.01 4.01 0 0 ' +
    '0-6.064 1.91 3.987 3.987 0 0 0 1.2 4.43A5.988 5.988 0 0 0 0 12.2a.748.748 0 0 0 ' +
    '.716.766.751.751 0 0 0 .784-.697 4.49 4.49 0 0 1 1.39-3.04 4.51 4.51 0 0 1 6.218 ' +
    '0 4.49 4.49 0 0 1 1.39 3.04.748.748 0 0 0 .786.73.75.75 0 0 0 .714-.8 5.989 5.989 0 0 0-3.435-5.136z',
}

interface ICommitMessageProps {
  readonly onCreateCommit: (context: ICommitContext) => Promise<boolean>
  readonly branch: string | null
  readonly commitAuthor: CommitIdentity | null
  readonly anyFilesSelected: boolean
  readonly isShowingModal: boolean
  readonly isShowingFoldout: boolean

  /**
   * Whether it's possible to select files for commit, affects messaging
   * when commit button is disabled
   */
  readonly anyFilesAvailable: boolean
  readonly focusCommitMessage: boolean
  readonly commitMessage: ICommitMessage | null
  readonly repository: Repository
  readonly repositoryAccount: Account | null
  readonly autocompletionProviders: ReadonlyArray<IAutocompletionProvider<any>>
  readonly isCommitting?: boolean
  readonly commitToAmend: Commit | null
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

  /** Whether or not to remember the coauthors in the changes state */
  readonly onCoAuthorsUpdated: (coAuthors: ReadonlyArray<IAuthor>) => void
  readonly onShowCoAuthoredByChanged: (showCoAuthoredBy: boolean) => void

  /**
   * Called when the component unmounts to give callers the ability
   * to persist the commit message (i.e. when switching between changes
   * and history view).
   */
  readonly onPersistCommitMessage?: (message: ICommitMessage) => void

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

  // Persist our current commit message if the caller wants to
  public componentWillUnmount() {
    const { props, state } = this
    props.onPersistCommitMessage?.(pick(state, 'summary', 'description'))
    window.removeEventListener('keydown', this.onKeyDown)
  }

  public componentDidMount() {
    window.addEventListener('keydown', this.onKeyDown)
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

    // If we switch from not amending to amending, we want to populate the
    // textfields with the commit message from the commit.
    if (this.props.commitToAmend === null && nextProps.commitToAmend !== null) {
      this.fillWithCommitMessage({
        summary: nextProps.commitToAmend.summary,
        description: nextProps.commitToAmend.body,
      })
    } else if (
      this.props.commitToAmend !== null &&
      nextProps.commitToAmend === null &&
      commitMessage !== null
    ) {
      this.fillWithCommitMessage(commitMessage)
    }

    if (!commitMessage || commitMessage === this.props.commitMessage) {
      return
    }

    if (this.state.summary === '' && !this.state.description) {
      this.fillWithCommitMessage(commitMessage)
    }
  }

  private fillWithCommitMessage(commitMessage: ICommitMessage) {
    this.setState({
      summary: commitMessage.summary,
      description: commitMessage.description,
    })
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
      this.props.onCommitMessageFocusSet()
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
    const { coAuthors } = this.props
    const token = 'Co-Authored-By'
    return this.isCoAuthorInputEnabled
      ? coAuthors.map(a => ({ token, value: `${a.name} <${a.email}>` }))
      : []
  }

  private get summaryOrPlaceholder() {
    return this.props.prepopulateCommitSummary && !this.state.summary
      ? this.props.placeholder
      : this.state.summary
  }

  private async createCommit() {
    const { description } = this.state

    if (!this.canCommit() && !this.canAmend()) {
      return
    }

    const trailers = this.getCoAuthorTrailers()

    const commitContext = {
      summary: this.summaryOrPlaceholder,
      description,
      trailers,
      amend: this.props.commitToAmend !== null,
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

  private canAmend(): boolean {
    return (
      this.props.commitToAmend !== null &&
      (this.state.summary.length > 0 || this.props.prepopulateCommitSummary)
    )
  }

  private canExcecuteCommitShortcut(): boolean {
    return !this.props.isShowingFoldout && !this.props.isShowingModal
  }

  private onKeyDown = (event: React.KeyboardEvent<Element> | KeyboardEvent) => {
    if (event.defaultPrevented) {
      return
    }

    const isShortcutKey = __DARWIN__ ? event.metaKey : event.ctrlKey
    if (
      isShortcutKey &&
      event.key === 'Enter' &&
      (this.canCommit() || this.canAmend()) &&
      this.canExcecuteCommitShortcut()
    ) {
      this.createCommit()
      event.preventDefault()
    }
  }

  private renderAvatar() {
    const { commitAuthor, repository } = this.props
    const { gitHubRepository } = repository
    const avatarTitle = commitAuthor ? (
      <>
        Committing as <strong>{commitAuthor.name}</strong> {commitAuthor.email}
      </>
    ) : undefined
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
      isAttributableEmailFor(repositoryAccount, email) === false

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
    this.props.onRefreshAuthor()
  }

  private onOpenRepositorySettings = () => {
    this.props.onShowPopup({
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

  private onCoAuthorsUpdated = (coAuthors: ReadonlyArray<IAuthor>) =>
    this.props.onCoAuthorsUpdated(coAuthors)

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
      action: () => this.props.onCommitSpellcheckEnabledChanged(!isEnabled),
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
      commitToAmend,
      showBranchProtected,
      showNoWriteAccess,
      repository,
      branch,
    } = this.props

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
    } else if (showNoWriteAccess) {
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
        // what fun and exiting edge cases the future might hold
        return null
      }

      return (
        <CommitWarning icon={CommitWarningIcon.Warning}>
          <strong>{branch}</strong> is a protected branch. Want to{' '}
          <LinkButton onClick={this.onSwitchBranch}>switch branches</LinkButton>
          ?
        </CommitWarning>
      )
    } else {
      return null
    }
  }

  private onSwitchBranch = () => {
    this.props.onShowFoldout({ type: FoldoutType.Branch })
  }

  private renderSubmitButton() {
    const { isCommitting, branch, commitButtonText } = this.props
    const isSummaryBlank = isEmptyOrWhitespace(this.summaryOrPlaceholder)
    const buttonEnabled =
      (this.canCommit() || this.canAmend()) && !isCommitting && !isSummaryBlank

    const loading = isCommitting ? <Loading /> : undefined

    const isAmending = this.props.commitToAmend !== null

    const amendVerb = isCommitting ? 'Amending' : 'Amend'
    const commitVerb = isCommitting ? 'Committing' : 'Commit'

    const amendTitle = `${amendVerb} last commit`
    const commitTitle =
      branch !== null ? `${commitVerb} to ${branch}` : commitVerb

    let tooltip: string | undefined = undefined

    if (buttonEnabled) {
      tooltip = isAmending ? amendTitle : commitTitle
    } else {
      if (isSummaryBlank) {
        tooltip = `A commit summary is required to commit`
      } else if (!this.props.anyFilesSelected && this.props.anyFilesAvailable) {
        tooltip = `Select one or more files to commit`
      } else if (isCommitting) {
        tooltip = `Committing changes…`
      }
    }

    const defaultCommitContents =
      branch !== null ? (
        <>
          {commitVerb} to <strong>{branch}</strong>
        </>
      ) : (
        commitVerb
      )

    const defaultAmendContents = <>{amendVerb} last commit</>

    const defaultContents = isAmending
      ? defaultAmendContents
      : defaultCommitContents

    const commitButton = commitButtonText ? commitButtonText : defaultContents

    return (
      <Button
        type="submit"
        className="commit-button"
        onClick={this.onSubmit}
        disabled={!buttonEnabled}
        tooltip={tooltip}
        onlyShowTooltipWhenOverflowed={buttonEnabled}
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
      <TooltippedContent
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
        direction={TooltipDirection.NORTH}
        className="length-hint"
        tooltipClassName="length-hint-tooltip"
      >
        <Octicon symbol={OcticonSymbol.lightBulb} />
      </TooltippedContent>
    )
  }

  public render() {
    const className = classNames('commit-message-component', {
      'with-action-bar': this.isActionBarEnabled,
      'with-co-authors': this.isCoAuthorInputVisible,
    })

    const descriptionClassName = classNames('description-field', {
      'with-overflow': this.state.descriptionObscured,
    })

    const showSummaryLengthHint = this.state.summary.length > IdealSummaryLength
    const summaryClassName = classNames('summary', {
      'with-length-hint': showSummaryLengthHint,
    })
    const summaryInputClassName = classNames('summary-field', 'nudge-arrow', {
      'nudge-arrow-left': this.props.shouldNudge === true,
    })

    return (
      // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
      <div
        role="group"
        aria-label="Create commit"
        className={className}
        onContextMenu={this.onContextMenu}
        onKeyDown={this.onKeyDown}
      >
        <div className={summaryClassName}>
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
          {showSummaryLengthHint && this.renderSummaryLengthHint()}
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
