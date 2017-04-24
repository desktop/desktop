import * as React from 'react'
import * as Path from 'path'

import { FileStatus, mapStatus, iconForStatus } from '../../models/status'
import { PathLabel } from '../lib/path-label'
import { Octicon } from '../octicons'
import { showContextualMenu, IMenuItem } from '../main-process-proxy'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

const GitIgnoreFileName = '.gitignore'

interface IChangedFileProps {
  readonly path: string
  readonly status: FileStatus
  readonly oldPath?: string
  readonly include: boolean | null
  readonly onIncludeChanged: (path: string, include: boolean) => void
  readonly onDiscardChanges: (path: string) => void
  readonly onDiscardAllChanges: () => void
  readonly availableWidth: number
  readonly onIgnore: (pattern: string) => void
}

/** a changed file in the working directory for a given repository */
export class ChangedFile extends React.Component<IChangedFileProps, void> {

  private handleCheckboxChange = (event: React.FormEvent<HTMLInputElement>) => {
    const include = event.currentTarget.checked
    this.props.onIncludeChanged(this.props.path, include)
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
    const status = this.props.status
    const fileStatus = mapStatus(status)

    const listItemPadding = 10 * 2
    const checkboxWidth = 20
    const statusWidth = 16
    const filePadding = 5

    const availablePathWidth = this.props.availableWidth - listItemPadding - checkboxWidth - filePadding - statusWidth

    return (
      <div className='file' onContextMenu={this.onContextMenu}>

        <Checkbox
          // The checkbox doesn't need to be tab reachable since we emulate
          // checkbox behavior on the list item itself, ie hitting space bar
          // while focused on a row will toggle selection.
          tabIndex={-1}
          value={this.checkboxValue}
          onChange={this.handleCheckboxChange}/>

        <PathLabel
          path={this.props.path}
          oldPath={this.props.oldPath}
          status={this.props.status}
          availableWidth={availablePathWidth}
        />

        <Octicon symbol={iconForStatus(status)}
                 className={'status status-' + fileStatus.toLowerCase()}
                 title={fileStatus} />
      </div>
    )
  }

  private onContextMenu = (event: React.MouseEvent<any>) => {
    event.preventDefault()

    const extension = Path.extname(this.props.path)
    const fileName = Path.basename(this.props.path)
    const items: IMenuItem[] = [
      {
        label: __DARWIN__ ? 'Discard Changes…' : 'Discard changes…',
        action: () => this.props.onDiscardChanges(this.props.path),
      },
      {
        label: __DARWIN__ ? 'Discard All Changes…' : 'Discard all changes…',
        action: () => this.props.onDiscardAllChanges(),
      },
      { type: 'separator' },
      {
        label: 'Ignore',
        action: () => this.props.onIgnore(this.props.path),
        enabled: fileName !== GitIgnoreFileName,
      },
    ]

    if (extension.length) {
      items.push({
        label: __DARWIN__ ? `Ignore All ${extension} Files` : `Ignore all ${extension} files`,
        action: () => this.props.onIgnore(`*${extension}`),
        enabled: fileName !== GitIgnoreFileName,
      })
    }

    showContextualMenu(items)
  }
}
