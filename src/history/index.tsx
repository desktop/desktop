import * as React from 'react'
import CommitList from './commit-list'
import CommitSummary from './commit-summary'
import FileDiff from '../file-diff'

export default class History extends React.Component<void, void> {
  public render() {
    return (
      <div id='history'>
        <CommitList/>
        <CommitSummary/>
        <FileDiff/>
      </div>
    )
  }
}
