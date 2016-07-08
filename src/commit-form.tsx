import * as React from 'react'

interface CommitFormProps {
  onCreateCommit: (title: string) => void
}

interface CommitFormState {
  title: string
}

/** set commit details and craft a new commit */
export default class CommitForm extends React.Component<CommitFormProps, CommitFormState> {

  public constructor(props: CommitFormProps) {
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
      <form className='commit-form'>
        <input type='text'
               placeholder='Commit Title...'
               value={this.state.title}
               onChange={event => this.handleTitleChange(event) } />
        <input type='button' value='Commit' onClick={event => this.handleSubmit(event)} />
      </form>
    )
  }
}
