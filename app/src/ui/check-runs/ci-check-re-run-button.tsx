import * as React from 'react'
import { APICheckConclusion } from '../../lib/api'
import { IRefCheck } from '../../lib/ci-checks/ci-checks'
import { IMenuItem, showContextualMenu } from '../../lib/menu-item'
import { Button } from '../lib/button'
import { Octicon, syncClockwise } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface ICICheckReRunButtonProps {
  readonly disabled: boolean
  readonly checkRuns: ReadonlyArray<IRefCheck>
  readonly canReRunFailed: boolean
  readonly onRerunChecks: (failedOnly: boolean) => void
}

export class CICheckReRunButton extends React.PureComponent<ICICheckReRunButtonProps> {
  private get failedChecksExist() {
    return this.props.checkRuns.some(
      cr => cr.conclusion === APICheckConclusion.Failure
    )
  }

  private onRerunChecks = () => {
    if (!this.props.canReRunFailed || !this.failedChecksExist) {
      this.props.onRerunChecks(false)
      return
    }

    const items: IMenuItem[] = [
      {
        label: __DARWIN__ ? 'Re-run Failed Checks' : 'Re-run failed checks',
        action: () => this.props.onRerunChecks(true),
      },
      {
        label: __DARWIN__ ? 'Re-run All Checks' : 'Re-run all checks',
        action: () => this.props.onRerunChecks(false),
      },
    ]

    showContextualMenu(items)
  }

  public render() {
    const text =
      this.props.canReRunFailed && this.failedChecksExist ? (
        <>
          Re-run <Octicon symbol={octicons.triangleDown} />
        </>
      ) : (
        'Re-run Checks'
      )
    return (
      <Button onClick={this.onRerunChecks} disabled={this.props.disabled}>
        <Octicon symbol={syncClockwise} /> {text}
      </Button>
    )
  }
}
