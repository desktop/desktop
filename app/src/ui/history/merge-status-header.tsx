import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { assertNever } from '../../lib/fatal-error'
import * as classNames from 'classnames'
import { MergeResultStatus } from '../../lib/app-state'

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
    const state = status === null ? 'loading' : status.kind

    // TODO: mocks have a horizontal line wrapping this icon. I have no idea
    // how to quickly insert this, or align it correctly, so this is me hoping
    // someone with those mad skills can jump in here to help out

    return (
      <Octicon
        className={classNames(
          'merge-status',
          `merge-status-${state}`,
          this.props.className
        )}
        symbol={getSymbolForState(state)}
      />
    )
  }
}

function getSymbolForState(
  status: 'loading' | 'conflicts' | 'clean'
): OcticonSymbol {
  switch (status) {
    case 'loading':
      return OcticonSymbol.primitiveDot
    case 'conflicts':
      return OcticonSymbol.alert
    case 'clean':
      return OcticonSymbol.check
  }

  return assertNever(status, `Unknown state: ${JSON.stringify(status)}`)
}
