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
   * The base branch that is ahead
   */
  readonly branch: Branch
  readonly onCompareClicked: () => void
  readonly onMergeClicked: () => void
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
            behind <Ref>{this.props.branch.name}</Ref>
          </p>

          <a className="close" aria-label="Dismiss banner">
            <Octicon symbol={OcticonSymbol.x} />
          </a>
        </div>

        <ButtonGroup>
          <Button type="submit" onClick={this.props.onCompareClicked}>
            Compare
          </Button>

          <Button onClick={this.props.onMergeClicked}>Merge...</Button>
        </ButtonGroup>
      </div>
    )
  }
}
