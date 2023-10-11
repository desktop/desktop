import * as React from 'react'

import { CommittedFileChange } from '../../models/status'
import { mapStatus } from '../../lib/status'
import { PathLabel } from '../lib/path-label'
import { Octicon, iconForStatus } from '../octicons'
import { TooltippedContent } from '../lib/tooltipped-content'
import { TooltipDirection } from '../lib/tooltip'

interface ICommittedFileItemProps {
  readonly availableWidth: number
  readonly file: CommittedFileChange
  readonly focused: boolean
}

export class CommittedFileItem extends React.Component<ICommittedFileItemProps> {
  public render() {
    const { file, focused } = this.props
    const { status } = file
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
      <div className="file">
        <PathLabel
          path={file.path}
          status={file.status}
          availableWidth={availablePathWidth}
          ariaHidden={true}
        />
        <TooltippedContent
          ancestorFocused={focused}
          openOnFocus={true}
          tooltip={fileStatus}
          direction={TooltipDirection.NORTH}
        >
          <Octicon
            symbol={iconForStatus(status)}
            className={'status status-' + fileStatus.toLowerCase()}
          />
        </TooltippedContent>
      </div>
    )
  }
}
