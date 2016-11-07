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
  readonly onCreateCommit: (message: ICommitMessage) => void
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

interface ICommitMessageState {
  readonly summary: string | null
  readonly description: string | null
}

export class CommitMessage extends React.Component<ICommitMessageProps, ICommitMessageState> {

  public constructor(props: ICommitMessageProps) {
    super(props)
    this.state = { summary: null, description: null }
  }

  public componentWillReceiveProps(nextProps: ICommitMessageProps) {
    if (!this.state.summary && !this.state.description) { return }

    const msg = this.props.commitMessage
      || this.props.contextualCommitMessage
      || { summary: null, description: null }

    this.setState({
      summary: msg.summary,
      description: msg.description,
    })
  }

  private updateMessage(summary: string | null, description: string | null) {
    const newState = {
      summary: summary || this.state.summary,
      description: description || this.state.description,
    }

    this.props.dispatcher.setCommitMessage(this.props.repository, newState as ICommitMessage)
    this.setState(newState)
  }

  private handleSummaryChange(event: React.FormEvent<HTMLInputElement>) {
    this.updateMessage(event.currentTarget.value, this.state.description)
  }

  private handleDescriptionChange(event: React.FormEvent<HTMLTextAreaElement>) {
    this.updateMessage(this.state.summary, event.currentTarget.value)
  }

  private handleSubmit(event: React.MouseEvent<HTMLButtonElement>) {
    this.createCommit()
    event.preventDefault()
  }

  private createCommit() {
    if (!this.canCommit) { return }

    this.props.onCreateCommit({
      // We know that summary is non-null thanks to canCommit
      summary: this.state.summary!,
      description: this.state.description,
    })

    this.props.dispatcher.setCommitMessage(this.props.repository, null)
  }

  private canCommit(): boolean {
    return this.props.anyFilesSelected
      && this.state.summary !== null
      && this.state.summary.length > 0
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

    return (
      <form id='commit-message' onSubmit={event => event.stopPropagation()}>
        <div className='summary'>
          {this.renderAvatar()}

          <AutocompletingInput className='summary-field'
            placeholder='Summary'
            value={this.state.summary || ''}
            onChange={event => this.handleSummaryChange(event)}
            onKeyDown={event => this.onKeyDown(event)}
            autocompletionProviders={this.props.autocompletionProviders}/>
        </div>

        <AutocompletingTextArea className='description-field'
          placeholder='Description'
          value={this.state.description || ''}
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
