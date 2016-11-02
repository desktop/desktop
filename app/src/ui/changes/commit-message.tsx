import * as React from 'react'
import {
  AutocompletingTextArea,
  AutocompletingInput,
  IAutocompletionProvider,
} from '../autocompletion'
import { CommitIdentity } from '../../models/commit-identity'
import { ICommitMessage } from '../../lib/app-state'

interface ICommitMessageProps {
  readonly onCreateCommit: (summary: string, description: string) => void
  readonly branch: string | null
  readonly commitAuthor: CommitIdentity | null
  readonly avatarURL: string
  readonly anyFilesSelected: boolean

  readonly contextualCommitMessage: ICommitMessage | null

  readonly autocompletionProviders: ReadonlyArray<IAutocompletionProvider<any>>
}

interface ICommitMessageState {
  readonly summary: string
  readonly description: string
}

export class CommitMessage extends React.Component<ICommitMessageProps, ICommitMessageState> {

  public constructor(props: ICommitMessageProps) {
    super(props)

    const contextualCommitMessage = props.contextualCommitMessage
    if (contextualCommitMessage) {
      this.state = contextualCommitMessage
    } else {
      this.state = {
        summary: '',
        description: '',
      }
    }
  }

  public componentWillReceiveProps(nextProps: ICommitMessageProps) {
    const contextualCommitMessage = nextProps.contextualCommitMessage
    if (contextualCommitMessage && !this.state.summary.length && !this.state.description.length) {
      this.setState(contextualCommitMessage)
    }
  }

  private handleSummaryChange(event: React.FormEvent<HTMLInputElement>) {
    this.setState({
      summary: event.currentTarget.value,
      description: this.state.description,
    })
  }

  private handleDescriptionChange(event: React.FormEvent<HTMLTextAreaElement>) {
    this.setState({
      summary: this.state.summary,
      description: event.currentTarget.value,
    })
  }

  private handleSubmit(event: React.MouseEvent<HTMLButtonElement>) {
    this.createCommit()
    event.preventDefault()
  }

  private createCommit() {
    this.props.onCreateCommit(this.state.summary, this.state.description)
    this.setState({
      summary: '',
      description: '',
    })
  }

  private onKeyDown(event: React.KeyboardEvent<Element>) {
    const isShortcutKey = __DARWIN__ ? event.metaKey : event.ctrlKey
    if (isShortcutKey && event.key === 'Enter') {
      this.createCommit()
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
    const buttonEnabled = this.props.anyFilesSelected && this.state.summary.length

    return (
      <form id='commit-message' onSubmit={event => event.stopPropagation()}>
        <div className='summary'>
          {this.renderAvatar()}

          <AutocompletingInput className='summary-field'
            placeholder='Summary'
            value={this.state.summary}
            onChange={event => this.handleSummaryChange(event)}
            onKeyDown={event => this.onKeyDown(event)}
            autocompletionProviders={this.props.autocompletionProviders}/>
        </div>

        <AutocompletingTextArea className='description-field'
          placeholder='Description'
          value={this.state.description}
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
