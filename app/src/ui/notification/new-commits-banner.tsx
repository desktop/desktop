import * as React from 'react'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'
import { Ref } from '../lib/ref'
import { Octicon, OcticonSymbol } from '../octicons'
import { Branch } from '../../models/branch'

interface INewCommitsBannerProps {
  /**
   * The number of commits behind `branch`
   */
  readonly commitsBehind: number

  /**
   * The target branch that will accept commits
   * from the current branch
   */
  readonly baseBranch: Branch
  readonly onCompareClick: (branch: Branch) => void
  readonly onMergeClick: (branch: Branch) => void
}

/**
 * Banner used to notify user that there branch is _commitsBehind_
 * commits behind `branch`
 */
export class NewCommitsBanner extends React.Component<
  INewCommitsBannerProps,
  {}
> {
  public render() {
    return (
      <div className="notification-banner diverge-banner">
        <div className="notification-banner-content">
          <p>
            Your branch is <strong>{this.props.commitsBehind} commits</strong>{' '}
            behind <Ref>{this.props.baseBranch.name}</Ref>
          </p>

          <a className="close" aria-label="Dismiss banner">
            <Octicon symbol={OcticonSymbol.x} />
          </a>
        </div>

        <ButtonGroup>
          <Button type="submit" onClick={this.onCompareClicked}>
            Compare
          </Button>

          <Button onClick={this.onMergeClicked}>Merge...</Button>
        </ButtonGroup>
      </div>
    )
  }

  private onMergeClicked = (event: React.MouseEvent<any>) => {
    this.props.onMergeClick(this.props.baseBranch)
  }

  private onCompareClicked = (event: React.MouseEvent<any>) => {
    this.props.onCompareClick(this.props.baseBranch)
  }
}
