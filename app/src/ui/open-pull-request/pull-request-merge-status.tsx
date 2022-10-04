import * as React from 'react'
import { MergeResult } from '../../lib/git'

interface IPullRequestMergeStatusProps {
  /** The result of merging the pull request branch into the base branch */
  readonly mergeStatus: MergeResult
}

/** The component to display message about the result of merging the pull
 * request. */
export class PullRequestMergeStatus extends React.Component<IPullRequestMergeStatusProps> {
  public render() {
    return <div>Merge Status</div>
  }
}
