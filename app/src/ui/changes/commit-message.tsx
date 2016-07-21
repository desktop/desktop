import * as React from 'react'

interface ICommitMessageProps {
  onCreateCommit: (title: string) => void
}

interface ICommitMessageState {
  title: string
}

export class CommitMessage extends React.Component<ICommitMessageProps, ICommitMessageState> {

  public constructor(props: ICommitMessageProps) {
    super(props)

    this.state = {
      title: ''
    }
  }

  /** TODO: commit description field */
  /** TODO: disable submit when no files selected */

  private handleTitleChange(event: any) {
    this.setState({title: event.target.value})
  }

  private handleSubmit(event: any) {
    this.props.onCreateCommit(this.state.title)
    this.setState({title: ''})
    event.preventDefault()
  }

  public render() {
    return (
      <form className='commit-form' onSubmit={event => event.stopPropagation()}>
        <input type='text'
               placeholder='Commit Title...'
               value={this.state.title}
               onChange={event => this.handleTitleChange(event) } />
        <input type='submit' value='Commit' onClick={event => this.handleSubmit(event)} />
      </form>
    )
  }
}
