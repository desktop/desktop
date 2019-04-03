import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { assertNever } from '../../lib/fatal-error'
import * as classNames from 'classnames'
import { MergeResult } from '../../models/merge'
import { ComputedAction } from '../../models/computed-action'

interface IMergeStatusIconProps {
  /** The classname for the underlying element. */
  readonly className?: string

  /** The status to display. */
  readonly status: MergeResult | null
}

/** The little CI status indicator. */
export class MergeStatusHeader extends React.Component<
  IMergeStatusIconProps,
  {}
> {
  public render() {
    const { status } = this.props
    if (status === null) {
      return null
    }

    const state = status.kind

    return (
      <div className="merge-status-icon-container">
        <Octicon
          className={classNames(
            'merge-status',
            `merge-status-${state}`,
            this.props.className
          )}
          symbol={getSymbolForState(state)}
        />
      </div>
    )
  }
}

function getSymbolForState(status: ComputedAction): OcticonSymbol {
  switch (status) {
    case ComputedAction.Loading:
      return OcticonSymbol.primitiveDot
    case ComputedAction.Conflicts:
      return OcticonSymbol.alert
    case ComputedAction.Invalid:
      return OcticonSymbol.x
    case ComputedAction.Clean:
      return OcticonSymbol.check
  }

  return assertNever(status, `Unknown state: ${JSON.stringify(status)}`)
}
