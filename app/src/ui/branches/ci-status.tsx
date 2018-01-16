import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { APIRefState } from '../../lib/api'
import { assertNever } from '../../lib/fatal-error'
import * as classNames from 'classnames'
import { PullRequestStatus } from '../../models/pull-request'

interface ICIStatusProps {
  /** The classname for the underlying element. */
  readonly className?: string

  /** The status to display. */
  readonly status: PullRequestStatus
}

/** The little CI status indicator. */
export class CIStatus extends React.Component<ICIStatusProps, {}> {
  public render() {
    const status = this.props.status
    const ciTitle = generateStatusHistory(status)
    const state = status.state

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

function generateStatusHistory(prStatus: PullRequestStatus): string {
  const statusCount = prStatus.statuses.length || 0

  if (statusCount === 0) {
    return prStatus.state.toUpperCase()
  } else {
    const successCount = prStatus.statuses.filter(x => x.state === 'success')
      .length

    return `${successCount}/${statusCount} checks OK`
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
