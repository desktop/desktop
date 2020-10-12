import * as React from 'react'

import { CommittedFileChange } from '../../models/status'
import { mapStatus } from '../../lib/status'
import { PathLabel } from '../lib/path-label'
import { Octicon, iconForStatus } from '../octicons'

interface ICommittedFileItemProps {
  readonly availableWidth: number
  readonly file: CommittedFileChange
  readonly onContextMenu?: (
    file: CommittedFileChange,
    event: React.MouseEvent<HTMLDivElement>
  ) => void
}

export class CommittedFileItem extends React.Component<
  ICommittedFileItemProps
> {
  private onContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (this.props.onContextMenu !== undefined) {
      this.props.onContextMenu(this.props.file, event)
    }
  }

  public render() {
    const { file } = this.props
    const status = file.status
    const fileStatus = mapStatus(status)

    const listItemPadding = 10 * 2
    const statusWidth = 16
    const filePathPadding = 5
    const availablePathWidth =
      this.props.availableWidth -
      listItemPadding -
      filePathPadding -
      statusWidth

    return (
      <div className="file" onContextMenu={this.onContextMenu}>
        <PathLabel
          path={file.path}
          status={file.status}
          availableWidth={availablePathWidth}
        />

        <Octicon
          symbol={iconForStatus(status)}
          className={'status status-' + fileStatus.toLowerCase()}
          title={fileStatus}
        />
      </div>
    )
  }
}
