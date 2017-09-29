import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { IAPIRefStatus, APIRefState } from '../../lib/api'
import { assertNever } from '../../lib/fatal-error'
import * as classNames from 'classnames'

interface ICIStatusProps {
  /** The classname for the underlying element. */
  readonly className?: string

  /** The status to display. */
  readonly status: IAPIRefStatus
}

/** The little CI status indicator. */
export class CIStatus extends React.Component<ICIStatusProps, {}> {
  public render() {
    const status = this.props.status
    const state = status.state
    const ciTitle = `Commit status: ${state}`
    return (
      <Octicon
        className={classNames(
          'ci-status',
          `ci-status-${state}`,
          this.props.className
        )}
        symbol={getSymbolForState(state)}
        title={ciTitle}
      />
    )
  }
}

function getSymbolForState(state: APIRefState): OcticonSymbol {
  switch (state) {
    case 'pending':
      return OcticonSymbol.primitiveDot
    case 'failure':
      return OcticonSymbol.x
    case 'success':
      return OcticonSymbol.check
  }

  return assertNever(state, `Unknown state: ${state}`)
}
