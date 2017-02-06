import * as React from 'react'

import { FileStatus } from '../../models/status'
import { Octicon, OcticonSymbol } from '../octicons'
import { PathText } from './path-text'

interface IPathLabelProps {
  /** the current path of the file */
  readonly path: string,
  /** the previous path of the file, if applicable */
  readonly oldPath?: string,
  /** the type of change applied to the file */
  readonly status: FileStatus

  readonly availableWidth: number
}

/**
 * Render the path details for a given file.
 *
 * For renames, this will render the old path as well as the current path.
 * For other scenarios, only the current path is rendered.
 *
 */
export class PathLabel extends React.Component<IPathLabelProps, void> {
  public render() {

    const props: React.HTMLProps<HTMLLabelElement> = {
      className: 'path',
    }

    const status = this.props.status
    const renderBothPaths = status === FileStatus.Renamed || status === FileStatus.Copied

    if (renderBothPaths && this.props.oldPath) {
      return (
        <label {...props}>
          {this.props.oldPath} <Octicon symbol={OcticonSymbol.arrowRight} /> {this.props.path}
        </label>
      )
    } else {
      return <label {...props}><PathText path={this.props.path} availableWidth={this.props.availableWidth} /></label>
    }
  }
}
