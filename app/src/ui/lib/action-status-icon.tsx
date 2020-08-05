import * as React from 'react'
import classNames from 'classnames'
import { ComputedAction } from '../../models/computed-action'
import { assertNever } from '../../lib/fatal-error'

import { Octicon, OcticonSymbol } from '../octicons'

interface IActionStatusIconProps {
  /** The status to display to the user */
  readonly status: { kind: ComputedAction } | null

  /** A required class name prefix for the Octicon component */
  readonly classNamePrefix: string

  /** The classname for the underlying element. */
  readonly className?: string
}

/**
 * A component used to render a visual indication of a `ComputedAction` state.
 *
 * In essence this is a small wrapper around an `Octicon` which determines which
 * icon to use based on the `ComputedAction`. A computed action is essentially
 * the current state of a merge or a rebase operation and this component is used
 * in the header of merge or rebase conflict dialogs to augment the textual
 * representation of the current merge or rebase progress.
 */
export class ActionStatusIcon extends React.Component<IActionStatusIconProps> {
  public render() {
    const { status, classNamePrefix } = this.props
    if (status === null) {
      return null
    }

    const { kind } = status

    const className = `${classNamePrefix}-icon-container`

    return (
      <div className={className}>
        <Octicon
          className={classNames(
            classNamePrefix,
            `${classNamePrefix}-${kind}`,
            this.props.className
          )}
          symbol={getSymbolForState(kind)}
        />
      </div>
    )
  }
}

function getSymbolForState(status: ComputedAction): OcticonSymbol {
  switch (status) {
    case ComputedAction.Loading:
      return OcticonSymbol.dotFill
    case ComputedAction.Conflicts:
      return OcticonSymbol.alert
    case ComputedAction.Invalid:
      return OcticonSymbol.x
    case ComputedAction.Clean:
      return OcticonSymbol.check
    default:
      return assertNever(status, `Unknown state: ${JSON.stringify(status)}`)
  }
}
