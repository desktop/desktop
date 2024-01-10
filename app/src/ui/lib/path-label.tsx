import * as React from 'react'

import { AppFileStatus, AppFileStatusKind } from '../../models/status'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { PathText } from './path-text'

interface IPathLabelProps {
  /** the current path of the file */
  readonly path: string
  /** the type of change applied to the file */
  readonly status: AppFileStatus

  readonly availableWidth?: number

  /** aria hidden value */
  readonly ariaHidden?: boolean
}

/** The pixel width reserved to give the resize arrow padding on either side. */
const ResizeArrowPadding = 10

/**
 * Render the path details for a given file.
 *
 * For renames, this will render the old path as well as the current path.
 * For other scenarios, only the current path is rendered.
 *
 */
export class PathLabel extends React.Component<IPathLabelProps, {}> {
  public render() {
    const props: React.HTMLProps<HTMLLabelElement> = {
      className: 'path-label-component',
    }

    const { status } = this.props

    const availableWidth = this.props.availableWidth
    if (
      status.kind === AppFileStatusKind.Renamed ||
      status.kind === AppFileStatusKind.Copied
    ) {
      const segmentWidth = availableWidth
        ? availableWidth / 2 - ResizeArrowPadding
        : undefined
      return (
        <span {...props} aria-hidden={this.props.ariaHidden}>
          <PathText path={status.oldPath} availableWidth={segmentWidth} />
          <Octicon className="rename-arrow" symbol={OcticonSymbol.arrowRight} />
          <PathText path={this.props.path} availableWidth={segmentWidth} />
        </span>
      )
    } else {
      return (
        <span {...props} aria-hidden={this.props.ariaHidden}>
          <PathText path={this.props.path} availableWidth={availableWidth} />
        </span>
      )
    }
  }
}
