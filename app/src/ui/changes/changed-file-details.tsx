import * as React from 'react'
import { PathLabel } from '../lib/path-label'
import { FileStatus, mapStatus, iconForStatus } from '../../models/status'
import { Octicon } from '../octicons'

interface IChangedFileDetailsProps {
  readonly path: string
  readonly oldPath?: string
  readonly status: FileStatus
}

/** Displays information about a file */
export class ChangedFileDetails extends React.Component<IChangedFileDetailsProps, void> {
  public render() {

    const status = this.props.status
    const fileStatus = mapStatus(status)

    return (
      <div className='header'>
        <PathLabel
          path={this.props.path}
          oldPath={this.props.oldPath}
          status={this.props.status} />
        <Octicon symbol={iconForStatus(status)}
            className={'status status-' + fileStatus.toLowerCase()}
            title={fileStatus} />
      </div>
    )
  }
}
