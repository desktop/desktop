import * as React from 'react'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'
import { Ref } from '../lib/ref'
import { Octicon, OcticonSymbol } from '../octicons'
import { Branch } from '../../models/branch'
import { Dispatcher } from '../../lib/dispatcher';

interface INewCommitsBannerProps {
  readonly numCommits: number
  readonly branch: Branch
  readonly dispatcher: Dispatcher
}

export class NewCommitsBanner extends React.Component<
  INewCommitsBannerProps,
  {}
> {
  private onCloseButtonClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    this.props.dispatcher.setDivergingBannerVisible(false)
  }

  public render() {
    return (
      <div className="notification-banner diverge-banner">
        <div className="notification-banner-content">
          <p>
            Your branch is <strong>{this.props.numCommits} commits</strong>{' '}
            behind <Ref>{this.props.branch.name}</Ref>
          </p>

          <a className="close" onClick={this.onCloseButtonClick} aria-label="Dismiss banner">
            <Octicon symbol={OcticonSymbol.x} />
          </a>
        </div>

        <ButtonGroup>
          <Button className="small-button" type="submit" onClick={this.noOp}>
            Merge...
          </Button>

          <Button className="small-button" onClick={this.noOp}>
            Compare
          </Button>
        </ButtonGroup>
      </div>
    )
  }

  private noOp = () => {}
}
