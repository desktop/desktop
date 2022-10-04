import * as React from 'react'
import { MergeTreeResult } from '../../models/merge'

interface IPullRequestMergeStatusProps {
  /** The result of merging the pull request branch into the base branch */
  readonly mergeStatus: MergeTreeResult | null
}

/** The component to display message about the result of merging the pull
 * request. */
export class PullRequestMergeStatus extends React.Component<IPullRequestMergeStatusProps> {
  public render() {
    return <div className="pull-request-merge-status">Merge Status</div>
  }
}
