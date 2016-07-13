import * as React from 'react'
import CommitMessage from './commit-message'

export default class ChangesList extends React.Component<void, void> {
  public render() {
    return (
      <div id='changes-list'>
        <div>Changes list goes here</div>
        <CommitMessage/>
      </div>
    )
  }
}
