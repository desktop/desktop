import * as React from 'react'

interface CommitFormProps {

}

interface CommitFormState {

}

/** set commit details and craft a new commit */
export default class CommitForm extends React.Component<CommitFormProps, CommitFormState> {

  public render() {
    return (
      <form className='commit-form'>
        <input type='text' placeholder='Commit Title...' />
        <input type='submit' value='Commit' />
      </form>
    )
  }
}
