import * as React from 'react'
import { enableReRunFailedAndSingleCheckJobs } from '../../lib/feature-flag'
import { IMenuItem, showContextualMenu } from '../../lib/menu-item'
import { Button } from '../lib/button'
import { Octicon, syncClockwise } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'

interface ICICheckReRunButtonProps {
  readonly disabled: boolean
  readonly onRerunChecks: (failedOnly: boolean) => void
}

export class CICheckReRunButton extends React.PureComponent<ICICheckReRunButtonProps> {
  private onRerunChecks = () => {
    if (!enableReRunFailedAndSingleCheckJobs()) {
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
    const text = enableReRunFailedAndSingleCheckJobs() ? (
      <>
        Re-run <Octicon symbol={OcticonSymbol.triangleDown} />
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
