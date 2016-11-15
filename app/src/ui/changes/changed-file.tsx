import * as React from 'react'

import { FileStatus, mapStatus, iconForStatus } from '../../models/status'
import { renderPath } from '../lib/path-label'
import { Octicon } from '../octicons'
import { showContextualMenu } from '../main-process-proxy'
import { Checkbox, CheckboxValue } from './checkbox'

interface IChangedFileProps {
  path: string
  status: FileStatus
  oldPath?: string
  include: boolean | null
  onIncludeChanged: (include: boolean) => void
  onDiscardChanges: () => void
}

/** a changed file in the working directory for a given repository */
export class ChangedFile extends React.Component<IChangedFileProps, void> {

  private handleChange(event: React.FormEvent<HTMLInputElement>) {
    const include = event.currentTarget.checked
    this.props.onIncludeChanged(include)
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

    return (
      <div className='file' onContextMenu={e => this.onContextMenu(e)}>

        <Checkbox
          // The checkbox doesn't need to be tab reachable since we emulate
          // checkbox behavior on the list item itself, ie hitting space bar
          // while focused on a row will toggle selection.
          tabIndex={-1}
          value={this.checkboxValue}
          onChange={event => this.handleChange(event)}/>

        {renderPath(this.props)}

        <div className="status">
            <Octicon symbol={iconForStatus(status)}
                     className={'status-' + fileStatus.toLowerCase()}
                     title={fileStatus} />
        </div>
      </div>
    )
  }

  private onContextMenu(event: React.MouseEvent<any>) {
    event.preventDefault()

    if (!__WIN32__) {
      const item = {
        label: 'Discard Changes',
        action: () => this.props.onDiscardChanges(),
      }
      showContextualMenu([ item ])
    }
  }
}
