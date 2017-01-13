import * as React from 'react'
import {
  AutocompletingTextArea,
  AutocompletingInput,
  IAutocompletionProvider,
} from '../autocompletion'
import { CommitIdentity } from '../../models/commit-identity'
import { ICommitMessage } from '../../lib/app-state'
import { Dispatcher } from '../../lib/dispatcher'
import { IGitHubUser } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'
import { Button } from '../lib/button'
import { Avatar } from '../lib/avatar'


interface ICommitMessageProps {
  readonly onCreateCommit: (message: ICommitMessage) => Promise<boolean>
  readonly branch: string | null
  readonly commitAuthor: CommitIdentity | null
  readonly gitHubUser: IGitHubUser | null
  readonly anyFilesSelected: boolean
  readonly commitMessage: ICommitMessage | null
  readonly contextualCommitMessage: ICommitMessage | null
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly autocompletionProviders: ReadonlyArray<IAutocompletionProvider<any>>
}

interface ICommitMessageState {
  readonly summary: string
  readonly description: string | null
}

export class CommitMessage extends React.Component<ICommitMessageProps, ICommitMessageState> {

  public componentWillMount() {
    this.receiveProps(this.props, true)
  }

  public componentWillReceiveProps(nextProps: ICommitMessageProps) {
    this.receiveProps(nextProps, false)
  }

  private receiveProps(nextProps: ICommitMessageProps, initializing: boolean) {
    // This is rather gnarly. We want to persist the commit message (summary,
    // and description) in the dispatcher on a per-repository level (git-store).
    //
    // Our dispatcher is asynchronous and only emits and update on animation
    // frames. This is a great thing for performance but it gets real messy
    // when you throw textboxes into the mix. If we went for a traditional
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

    // If we receive a contextual commit message we'll take that and disregard
    // anything currently in the textboxes (this might not be what we want).
    if (nextProps.contextualCommitMessage) {
      this.updateState(nextProps.contextualCommitMessage)
      // Once we receive the contextual commit message we can clear it. We don't
      // want to keep receiving it.
      this.props.dispatcher.clearContextualCommitMessage(this.props.repository)
    } else if (initializing || this.props.repository.id !== nextProps.repository.id) {
      // We're either initializing (ie being mounted) or someone has switched
      // repositories. If we receieve a message we'll take it
      if (nextProps.commitMessage) {
        // Don't update dispatcher here, we're receiving it, could cause never-
        // ending loop.
        this.setState({
          summary: nextProps.commitMessage.summary,
          description: nextProps.commitMessage.description,
        })
      } else {
        // No message, assume clean slate
        this.setState({ summary: '', description: null })
      }
    }
  }

  private clearCommitMessage() {
    this.setState({ summary: '', description: null })
    this.props.dispatcher.setCommitMessage(this.props.repository, null)
  }

  private updateState = (state: ICommitMessageState | ICommitMessage) => {
    const newMessage = state.summary
      ? { summary: state.summary, description: state.description }
      : null

    this.props.dispatcher.setCommitMessage(this.props.repository, newMessage)
    this.setState(state)
  }

  private handleSummaryChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.updateState({
      summary: event.currentTarget.value,
      description: this.state.description,
    })
  }

  private handleDescriptionChange = (event: React.FormEvent<HTMLTextAreaElement>) => {
    this.updateState({
      summary: this.state.summary,
      description: event.currentTarget.value,
    })
  }

  private handleSubmit = () => {
    this.createCommit()
  }

  private async createCommit() {
    if (!this.canCommit) { return }

    const success = await this.props.onCreateCommit({
      // We know that summary is non-null thanks to canCommit
      summary: this.state.summary!,
      description: this.state.description,
    })

    if (success) {
      this.clearCommitMessage()
    }
  }

  private canCommit(): boolean {
    return this.props.anyFilesSelected
      && this.state.summary !== null
      && this.state.summary.length > 0
  }

  private onKeyDown = (event: React.KeyboardEvent<Element>) => {
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
      : null

    // We're wrapping the avatar in a div because electron won't
    // show a tooltip for img elements for some reason. If we can
    // remove it in the future I'd be delighted.
    return (
      <Avatar gitHubUser={this.props.gitHubUser} title={avatarTitle}/>
    )
  }

  public render() {
    const branchName = this.props.branch ? this.props.branch : 'master'
    const buttonEnabled = this.canCommit()

    return (
      <div id='commit-message'>
        <div className='summary'>
          {this.renderAvatar()}

          <AutocompletingInput className='summary-field'
            placeholder='Summary'
            value={this.state.summary}
            onChange={this.handleSummaryChange}
            onKeyDown={this.onKeyDown}
            autocompletionProviders={this.props.autocompletionProviders}/>
        </div>

        <AutocompletingTextArea className='description-field'
          placeholder='Description'
          value={this.state.description || ''}
          onChange={this.handleDescriptionChange}
          onKeyDown={this.onKeyDown}
          autocompletionProviders={this.props.autocompletionProviders}/>

        <Button type='submit' className='commit-button' onClick={this.handleSubmit} disabled={!buttonEnabled}>
          <div>Commit to <strong>{branchName}</strong></div>
        </Button>
      </div>
    )
  }
}
