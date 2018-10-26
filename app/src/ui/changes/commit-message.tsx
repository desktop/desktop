import * as React from 'react'
import * as classNames from 'classnames'
import {
  AutocompletingTextArea,
  AutocompletingInput,
  IAutocompletionProvider,
  UserAutocompletionProvider,
} from '../autocompletion'
import { CommitIdentity } from '../../models/commit-identity'
import { ICommitMessage } from '../../models/commit-message'
import { PopupType } from '../../models/popup'
import { Dispatcher } from '../../lib/dispatcher'
import { IGitHubUser } from '../../lib/databases/github-user-database'
import { Repository } from '../../models/repository'
import { Button } from '../lib/button'
import { Avatar } from '../lib/avatar'
import { Loading } from '../lib/loading'
import { structuralEquals } from '../../lib/equality'
import { generateGravatarUrl } from '../../lib/gravatar'
import { AuthorInput } from '../lib/author-input'
import { FocusContainer } from '../lib/focus-container'
import { showContextualMenu } from '../main-process-proxy'
import { Octicon, OcticonSymbol } from '../octicons'
import { ITrailer } from '../../lib/git/interpret-trailers'
import { IAuthor } from '../../models/author'
import { IMenuItem } from '../../lib/menu-item'
import { isUsingLFS } from '../../lib/git/lfs'

const addAuthorIcon = new OcticonSymbol(
  12,
  7,
  'M9.875 2.125H12v1.75H9.875V6h-1.75V3.875H6v-1.75h2.125V0h1.75v2.125zM6 ' +
    '6.5a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5V6c0-1.316 2-2 2-2s.114-.204 ' +
    '0-.5c-.42-.31-.472-.795-.5-2C1.587.293 2.434 0 3 0s1.413.293 1.5 1.5c-.028 ' +
    '1.205-.08 1.69-.5 2-.114.295 0 .5 0 .5s2 .684 2 2v.5z'
)

interface ICommitMessageProps {
  readonly onCreateCommit: (
    summary: string,
    description: string | null,
    trailers?: ReadonlyArray<ITrailer>
  ) => Promise<boolean>
  readonly branch: string | null
  readonly commitAuthor: CommitIdentity | null
  readonly gitHubUser: IGitHubUser | null
  readonly anyFilesSelected: boolean
  readonly commitMessage: ICommitMessage | null
  readonly contextualCommitMessage: ICommitMessage | null
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly autocompletionProviders: ReadonlyArray<IAutocompletionProvider<any>>
  readonly isCommitting: boolean
  readonly placeholder: string
  readonly singleFileCommit: boolean

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
  readonly getNamesOfSelectedOversizedFiles: () => string[]
}

interface ICommitMessageState {
  readonly summary: string
  readonly description: string | null

  /** The last contextual commit message we've received. */
  readonly lastContextualCommitMessage: ICommitMessage | null

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

  private descriptionTextArea: HTMLTextAreaElement | null = null
  private descriptionTextAreaScrollDebounceId: number | null = null

  public constructor(props: ICommitMessageProps) {
    super(props)

    this.state = {
      summary: '',
      description: '',
      lastContextualCommitMessage: null,
      userAutocompletionProvider: findUserAutoCompleteProvider(
        props.autocompletionProviders
      ),
      descriptionObscured: false,
    }
  }

  public componentWillMount() {
    this.receiveProps(this.props, true)
  }

  public componentWillUnmount() {
    // We're unmounting, likely due to the user switching to the history tab.
    // Let's persist our commit message in the dispatcher.
    this.props.dispatcher.setCommitMessage(this.props.repository, this.state)
  }

  public componentWillReceiveProps(nextProps: ICommitMessageProps) {
    this.receiveProps(nextProps, false)
  }

  private receiveProps(nextProps: ICommitMessageProps, initializing: boolean) {
    // If we're switching away from one repository to another we'll persist
    // our commit message in the dispatcher.
    if (nextProps.repository.id !== this.props.repository.id) {
      this.props.dispatcher.setCommitMessage(this.props.repository, this.state)
    }

    if (
      nextProps.autocompletionProviders !== this.props.autocompletionProviders
    ) {
      this.setState({
        userAutocompletionProvider: findUserAutoCompleteProvider(
          nextProps.autocompletionProviders
        ),
      })
    }

    // This is rather gnarly. We want to persist the commit message (summary,
    // and description) in the dispatcher on a per-repository level (git-store).
    //
    // Our dispatcher is asynchronous and only emits and update on animation
    // frames. This is a great thing for performance but it gets real messy
    // when you throw text boxes into the mix. If we went for a traditional
    // approach of persisting the textbox values in the dispatcher and updating
    // the virtual dom when we get new props there's an interim state which
    // means that the browser can't keep track of the cursor for us, see:
    //
    //   http://stackoverflow.com/a/28922465
    //
    // So in order to work around that we keep the text values in the component
    // state. Whenever they get updated we submit the update to the dispatcher
    // but we disregard the message that flows to us on the subsequent animation
    // frame unless we have switched repositories.
    //
    // Then there's the case when we're being mounted (think switching between
    // history and changes tabs. In that case we have to rely on what's in the
    // dispatcher since we don't have any state of our own.

    const nextContextualCommitMessage = nextProps.contextualCommitMessage
    const lastContextualCommitMessage = this.state.lastContextualCommitMessage
    // If the contextual commit message changed, we'll use it as our commit
    // message.
    if (
      nextContextualCommitMessage &&
      (!lastContextualCommitMessage ||
        !structuralEquals(
          nextContextualCommitMessage,
          lastContextualCommitMessage
        ))
    ) {
      this.setState({
        summary: nextContextualCommitMessage.summary,
        description: nextContextualCommitMessage.description,
        lastContextualCommitMessage: nextContextualCommitMessage,
      })
    } else if (
      initializing ||
      this.props.repository.id !== nextProps.repository.id
    ) {
      // We're either initializing (ie being mounted) or someone has switched
      // repositories. If we receive a message we'll take it
      if (nextProps.commitMessage) {
        // Don't update dispatcher here, we're receiving it, could cause never-
        // ending loop.
        this.setState({
          summary: nextProps.commitMessage.summary,
          description: nextProps.commitMessage.description,
          lastContextualCommitMessage: nextContextualCommitMessage,
        })
      } else {
        // No message, assume clean slate
        this.setState({
          summary: '',
          description: null,
          lastContextualCommitMessage: nextContextualCommitMessage,
        })
      }
    } else {
      this.setState({
        lastContextualCommitMessage: nextContextualCommitMessage,
      })
    }
  }

  private clearCommitMessage() {
    this.setState({ summary: '', description: null })
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

    const lfsSupported = await this.checkForLFS()

    if (lfsSupported === false) {
      const overSizedFiles = await this.checkForLargeFiles()

      if (overSizedFiles.length !== 0) {
        const finalSummary =
          this.props.singleFileCommit && !this.state.summary
            ? this.props.placeholder
            : summary
        const trailers = this.getCoAuthorTrailers()

        this.props.dispatcher.showPopup({
          type: PopupType.OversizedFiles,
          dispatcher: this.props.dispatcher,
          fileList: overSizedFiles,
          commitSummary: finalSummary,
          commitDescription: description,
          repository: this.props.repository,
          trailers: trailers,
        })

        return
      }
    }

    const trailers = this.getCoAuthorTrailers()

    const commitCreated = await this.props.onCreateCommit(
      // allow single file commit without summary
      this.props.singleFileCommit && !this.state.summary
        ? this.props.placeholder
        : summary,
      description,
      trailers
    )

    if (commitCreated) {
      this.clearCommitMessage()
    }
  }

  private canCommit(): boolean {
    return (
      (this.props.anyFilesSelected && this.state.summary.length > 0) ||
      this.props.singleFileCommit
    )
  }

  private async checkForLargeFiles() {
    return await this.props.getNamesOfSelectedOversizedFiles()
  }

  private async checkForLFS() {
    try {
      return await isUsingLFS(this.props.repository)
    } catch (err) {
      return false
    }
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
    const commitAuthor = this.props.commitAuthor
    const avatarTitle = commitAuthor
      ? `Committing as ${commitAuthor.name} <${commitAuthor.email}>`
      : undefined
    let avatarUser = undefined

    if (commitAuthor) {
      const avatarURL = this.props.gitHubUser
        ? this.props.gitHubUser.avatarURL
        : generateGravatarUrl(commitAuthor.email)

      avatarUser = {
        email: commitAuthor.email,
        name: commitAuthor.name,
        avatarURL,
      }
    }

    return <Avatar user={avatarUser} title={avatarTitle} />
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
        onAuthorsUpdated={this.onCoAuthorsUpdated}
        authors={this.props.coAuthors}
        autoCompleteProvider={autocompletionProvider}
        disabled={this.props.isCommitting}
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
        !this.props.isCommitting,
    }
  }

  private onContextMenu = (event: React.MouseEvent<any>) => {
    if (event.defaultPrevented) {
      return
    }

    event.preventDefault()

    const items: IMenuItem[] = [this.getAddRemoveCoAuthorsMenuItem()]
    showContextualMenu(items)
  }

  private onAutocompletingInputContextMenu = (event: React.MouseEvent<any>) => {
    event.preventDefault()

    const items: IMenuItem[] = [
      this.getAddRemoveCoAuthorsMenuItem(),
      { type: 'separator' },
      { role: 'editMenu' },
    ]

    showContextualMenu(items)
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
        disabled={this.props.isCommitting}
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
      elem.addEventListener('scroll', () => {
        if (this.descriptionTextAreaScrollDebounceId !== null) {
          cancelAnimationFrame(this.descriptionTextAreaScrollDebounceId)
          this.descriptionTextAreaScrollDebounceId = null
        }
        this.descriptionTextAreaScrollDebounceId = requestAnimationFrame(
          this.onDescriptionTextAreaScroll
        )
      })
    }

    this.descriptionTextArea = elem
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
      disabled: this.props.isCommitting,
    })

    return <div className={className}>{this.renderCoAuthorToggleButton()}</div>
  }

  public render() {
    const branchName = this.props.branch ? this.props.branch : 'master'

    const isSummaryWhiteSpace = this.state.summary.match(/^\s+$/g)
    const buttonEnabled =
      this.canCommit() && !this.props.isCommitting && !isSummaryWhiteSpace

    const loading = this.props.isCommitting ? <Loading /> : undefined
    const className = classNames({
      'with-action-bar': this.isActionBarEnabled,
      'with-co-authors': this.isCoAuthorInputVisible,
    })

    const descriptionClassName = classNames('description-field', {
      'with-overflow': this.state.descriptionObscured,
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
            className="summary-field"
            placeholder={this.props.placeholder}
            value={this.state.summary}
            onValueChanged={this.onSummaryChanged}
            autocompletionProviders={this.props.autocompletionProviders}
            onContextMenu={this.onAutocompletingInputContextMenu}
            disabled={this.props.isCommitting}
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
            disabled={this.props.isCommitting}
          />
          {this.renderActionBar()}
        </FocusContainer>

        {this.renderCoAuthorInput()}

        <Button
          type="submit"
          className="commit-button"
          onClick={this.onSubmit}
          disabled={!buttonEnabled}
        >
          {loading}
          <span title={`Commit to ${branchName}`}>
            {loading ? 'Committing' : 'Commit'} to <strong>{branchName}</strong>
          </span>
        </Button>
      </div>
    )
  }
}
