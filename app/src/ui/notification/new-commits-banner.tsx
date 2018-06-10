import * as React from 'react'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'
import { Ref } from '../lib/ref'

interface NewCommitsBannerProps {
  readonly numCommits: number
  readonly ref: string
}

export class NewCommitsBanner extends React.Component<
  NewCommitsBannerProps,
  {}
> {
  public render() {
    return (
      <div className="notification-banner">
        <p>
          Your branch is <strong>{this.props.numCommits} commits</strong> behind{' '}
          <Ref>{this.props.ref}</Ref>
        </p>

        <ButtonGroup>
          <Button type="submit" onClick={this.noOp}>
            Compare
          </Button>

          <Button onClick={this.noOp}>Merge...</Button>
        </ButtonGroup>
      </div>
    )
  }

  private noOp = () => {}
}
