import * as React from 'react'
import CommitList from './commit-list'
import CommitSummary from './commit-summary'
import FileDiff from '../file-diff'
import Repository from '../../models/repository'

interface IHistoryProps {
  repository: Repository
}

export default class History extends React.Component<IHistoryProps, void> {
  public render() {
    return (
      <div id='history'>
        <CommitList {...this.props}/>
        <CommitSummary/>
        <FileDiff/>
      </div>
    )
  }
}
