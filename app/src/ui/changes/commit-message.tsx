import * as React from 'react'
import { AutocompletingTextArea, AutocompletingInput } from '../autocompletion'

interface ICommitMessageProps {
  readonly onCreateCommit: (summary: string, description: string) => void
  readonly branch: string | null
  readonly avatarURL: string
  readonly emoji: Map<string, string>
  readonly anyFilesSelected: boolean
}

interface ICommitMessageState {
  readonly summary: string
  readonly description: string
}

export class CommitMessage extends React.Component<ICommitMessageProps, ICommitMessageState> {

  public constructor(props: ICommitMessageProps) {
    super(props)

    this.state = {
      summary: '',
      description: '',
    }
  }

  /** TODO: disable submit when no files selected */

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

  public render() {
    const branchName = this.props.branch ? this.props.branch : 'master'
    const disableButton = !this.props.anyFilesSelected

    return (
      <form id='commit-message' onSubmit={event => event.stopPropagation()}>
        <div className='summary'>
          <img className='avatar' src={this.props.avatarURL}/>

          <AutocompletingInput className='summary-field'
            placeholder='Summary'
            value={this.state.summary}
            onChange={event => this.handleSummaryChange(event)}
            onKeyDown={event => this.onKeyDown(event)}
            emoji={this.props.emoji}/>
        </div>

        <AutocompletingTextArea className='description-field'
          placeholder='Description'
          value={this.state.description}
          onChange={event => this.handleDescriptionChange(event)}
          onKeyDown={event => this.onKeyDown(event)}
          emoji={this.props.emoji}/>

        <button className='commit-button' onClick={event => this.handleSubmit(event)} disabled={disableButton}>
          <div>Commit to <strong>{branchName}</strong></div>
        </button>
      </form>
    )
  }
}
