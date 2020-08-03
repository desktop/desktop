import * as React from 'react'

import { PathLabel } from '../lib/path-label'
import { Octicon, iconForStatus } from '../octicons'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { mapStatus } from '../../lib/status'
import { WorkingDirectoryFileChange } from '../../models/status'

interface IChangedFileProps {
  readonly file: WorkingDirectoryFileChange
  readonly include: boolean | null
  readonly availableWidth: number
  readonly disableSelection: boolean
  readonly onIncludeChanged: (path: string, include: boolean) => void

  /** Callback called when user right-clicks on an item */
  readonly onContextMenu: (
    file: WorkingDirectoryFileChange,
    event: React.MouseEvent<HTMLDivElement>
  ) => void
}

/** a changed file in the working directory for a given repository */
export class ChangedFile extends React.Component<IChangedFileProps, {}> {
  private handleCheckboxChange = (event: React.FormEvent<HTMLInputElement>) => {
    const include = event.currentTarget.checked
    this.props.onIncludeChanged(this.props.file.path, include)
  }

  private get checkboxValue(): CheckboxValue {
    if (this.props.include === true) {
      return CheckboxValue.On
    } else if (this.props.include === false) {
      return CheckboxValue.Off
    } else {
      return CheckboxValue.Mixed
    }
  }

  public render() {
    const { status, path } = this.props.file
    const fileStatus = mapStatus(status)

    const listItemPadding = 10 * 2
    const checkboxWidth = 20
    const statusWidth = 16
    const filePadding = 5

    const availablePathWidth =
      this.props.availableWidth -
      listItemPadding -
      checkboxWidth -
      filePadding -
      statusWidth

    return (
      <div className="file" onContextMenu={this.onContextMenu}>
        <Checkbox
          // The checkbox doesn't need to be tab reachable since we emulate
          // checkbox behavior on the list item itself, ie hitting space bar
          // while focused on a row will toggle selection.
          tabIndex={-1}
          value={this.checkboxValue}
          onChange={this.handleCheckboxChange}
          disabled={this.props.disableSelection}
        />

        <PathLabel
          path={path}
          status={status}
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

  private onContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    this.props.onContextMenu(this.props.file, event)
  }
}
