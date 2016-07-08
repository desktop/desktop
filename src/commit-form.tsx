import * as React from 'react'

interface CommitFormProps {
  onCreateCommit: (title: string) => void
}

interface CommitFormState {
  title: string
}

/** set commit details and craft a new commit */
export default class CommitForm extends React.Component<CommitFormProps, CommitFormState> {

  /** TODO: commit description form */
  /** TODO: disable submit when no files selected */

  private handleTitleChange(event: any) {
    this.setState({title: event.target.value})
  }

  private handleSubmit(event: any) {
    this.props.onCreateCommit(this.state.title)
    event.preventDefault()
    this.setState({title: ''})
  }

  public render() {
    return (
      <form className='commit-form' onSubmit={event => this.handleSubmit(event)}>
        <input type='text' placeholder='Commit Title...' onChange={event => this.handleTitleChange(event) } />
        <input type='submit' value='Commit' />
      </form>
    )
  }
}
