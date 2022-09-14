import * as React from 'react'
import { IDiff } from '../../models/diff'

interface IPullRequestDiffProps {
  readonly diff: IDiff | null
}

/**
 * A component for viewing the file diff for a pull request.
 */
export class PullRequestDiff extends React.Component<
  IPullRequestDiffProps,
  {}
> {
  private renderDiff() {
    return 'Diff'
  }

  public render() {
    return <div className="pull-request-diff-viewer">{this.renderDiff()}</div>
  }
}
