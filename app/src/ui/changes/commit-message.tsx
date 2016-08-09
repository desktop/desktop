import * as React from 'react'

interface ICommitMessageProps {
  readonly onCreateCommit: (summary: string, description: string) => void
  readonly branch: string | null
  readonly avatarURL: string
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
      summary: event.target.value,
      description: this.state.description,
    })
  }

  private handleDescriptionChange(event: React.FormEvent<HTMLTextAreaElement>) {
    this.setState({
      summary: this.state.summary,
      description: event.target.value,
    })
  }

  private handleSubmit(event: any) {
    this.props.onCreateCommit(this.state.summary, this.state.description)
    this.setState({
      summary: '',
      description: '',
    })
    event.preventDefault()
  }

  public render() {
    const branchName = this.props.branch ? this.props.branch : 'master'
    return (
      <form id='commit-message' onSubmit={event => event.stopPropagation()}>
        <div className='summary'>
          <img className='avatar' src={this.props.avatarURL}/>

          <input className='summary-field'
                 type='text'
                 placeholder='Summary'
                 value={this.state.summary}
                 onChange={event => this.handleSummaryChange(event)}/>
        </div>

        <textarea className='summary-description'
                  placeholder='Description'
                  value={this.state.description}
                  onChange={event => this.handleDescriptionChange(event)}/>

        <button className='commit-button' onClick={event => this.handleSubmit(event)}>
          Commit to <strong>{branchName}</strong>
        </button>
      </form>
    )
  }
}
