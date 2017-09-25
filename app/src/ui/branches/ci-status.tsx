import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { APIRefState } from '../../lib/api'
import { assertNever } from '../../lib/fatal-error'
import * as classNames from 'classnames'

interface ICIStatusProps {
  readonly className?: string

  readonly status: APIRefState
}

export class CIStatus extends React.Component<ICIStatusProps, {}> {
  public render() {
    const status = this.props.status
    const ciTitle = `Commit status: ${status}`
    return (
      <Octicon
        className={classNames(
          'ci-status',
          `ci-status-${status}`,
          this.props.className
        )}
        symbol={getSymbolForStatus(status)}
        title={ciTitle}
      />
    )
  }
}

function getSymbolForStatus(status: APIRefState): OcticonSymbol {
  switch (status) {
    case 'pending':
      return OcticonSymbol.primitiveDot
    case 'failure':
      return OcticonSymbol.x
    case 'success':
      return OcticonSymbol.check
  }

  return assertNever(status, `Unknown status: ${status}`)
}
