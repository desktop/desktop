import * as React from 'react'
import {
  AutocompletingTextArea,
  AutocompletingInput,
  IAutocompletionProvider,
} from '../autocompletion'
import { CommitIdentity } from '../../models/commit-identity'
import { ICommitMessage } from '../../lib/app-state'
import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'

interface ICommitMessageProps {
  readonly onCreateCommit: (summary: string, description: string) => void
  readonly branch: string | null
  readonly commitAuthor: CommitIdentity | null
  readonly avatarURL: string
  readonly anyFilesSelected: boolean
  readonly commitMessage: ICommitMessage | null
  readonly contextualCommitMessage: ICommitMessage | null
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly autocompletionProviders: ReadonlyArray<IAutocompletionProvider<any>>
}

export class CommitMessage extends React.Component<ICommitMessageProps, void> {

  private getCurrentCommitMessage(): ICommitMessage {
    return this.props.commitMessage
      || this.props.contextualCommitMessage
      || { summary: '', description: '' }
  }

  private handleSummaryChange(event: React.FormEvent<HTMLInputElement>) {
    const currentMessage = this.getCurrentCommitMessage()
    const newMessage = {
      summary: event.currentTarget.value,
      description: currentMessage.description,
    }
    this.props.dispatcher.setCommitMessage(this.props.repository, newMessage)
  }

  private handleDescriptionChange(event: React.FormEvent<HTMLTextAreaElement>) {
    const currentMessage = this.getCurrentCommitMessage()
    const newMessage = {
      summary: currentMessage.summary,
      description: event.currentTarget.value,
    }
    this.props.dispatcher.setCommitMessage(this.props.repository, newMessage)
  }

  private handleSubmit(event: React.MouseEvent<HTMLButtonElement>) {
    this.createCommit()
    event.preventDefault()
  }

  private createCommit() {
    if (!this.canCommit) { return }
    const msg = this.getCurrentCommitMessage()
    this.props.onCreateCommit(msg.summary, msg.description)
    this.props.dispatcher.setCommitMessage(this.props.repository, null)
  }

  private canCommit(): boolean {
    const msg = this.getCurrentCommitMessage()
    return this.props.anyFilesSelected && msg.summary.length > 0
  }

  private onKeyDown(event: React.KeyboardEvent<Element>) {
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

    // We're wrapping the avatar in a div because electron won't
    // show a tooltip for img elements for some reason. If we can
    // remove it in the future I'd be delighted.
    return (
      <div className='avatar' title={avatarTitle}>
        <img src={this.props.avatarURL} alt={avatarTitle} />
      </div>
    )
  }

  public render() {
    const branchName = this.props.branch ? this.props.branch : 'master'
    const buttonEnabled = this.canCommit()
    const msg = this.getCurrentCommitMessage()

    return (
      <form id='commit-message' onSubmit={event => event.stopPropagation()}>
        <div className='summary'>
          {this.renderAvatar()}

          <AutocompletingInput className='summary-field'
            placeholder='Summary'
            value={msg.summary}
            onChange={event => this.handleSummaryChange(event)}
            onKeyDown={event => this.onKeyDown(event)}
            autocompletionProviders={this.props.autocompletionProviders}/>
        </div>

        <AutocompletingTextArea className='description-field'
          placeholder='Description'
          value={msg.description}
          onChange={event => this.handleDescriptionChange(event)}
          onKeyDown={event => this.onKeyDown(event)}
          autocompletionProviders={this.props.autocompletionProviders}/>

        <button className='commit-button' onClick={event => this.handleSubmit(event)} disabled={!buttonEnabled}>
          <div>Commit to <strong>{branchName}</strong></div>
        </button>
      </form>
    )
  }
}
