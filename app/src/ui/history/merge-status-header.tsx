import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { assertNever } from '../../lib/fatal-error'
import * as classNames from 'classnames'
import { MergeResult } from '../../models/merge'
import { ComputedActionKind } from '../../models/action'

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

function getSymbolForState(status: ComputedActionKind): OcticonSymbol {
  switch (status) {
    case ComputedActionKind.Loading:
      return OcticonSymbol.primitiveDot
    case ComputedActionKind.Conflicts:
      return OcticonSymbol.alert
    case ComputedActionKind.Invalid:
      return OcticonSymbol.x
    case ComputedActionKind.Clean:
      return OcticonSymbol.check
  }

  return assertNever(status, `Unknown state: ${JSON.stringify(status)}`)
}
