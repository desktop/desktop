import * as React from 'react'
import Octicon, * as OcticonSymbol from '@githubprimer/octicons-react'
import { assertNever } from '../../lib/fatal-error'
import * as classNames from 'classnames'
import { MergeResultStatus } from '../../lib/app-state'
import { MergeResultKind } from '../../models/merge'

interface IMergeStatusIconProps {
  /** The classname for the underlying element. */
  readonly className?: string

  /** The status to display. */
  readonly status: MergeResultStatus | null
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
          icon={getSymbolForState(state)}
        />
      </div>
    )
  }
}

function getSymbolForState(status: MergeResultKind): Icon {
  switch (status) {
    case MergeResultKind.Loading:
      return OcticonSymbol.primitiveDot
    case MergeResultKind.Conflicts:
      return OcticonSymbol.Alert
    case MergeResultKind.Invalid:
      return OcticonSymbol.X
    case MergeResultKind.Clean:
      return OcticonSymbol.check
  }

  return assertNever(status, `Unknown state: ${JSON.stringify(status)}`)
}
