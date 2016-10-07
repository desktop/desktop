import * as React from 'react'

import { FileStatus } from '../../models/status'
import { Octicon, OcticonSymbol } from '../octicons'
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

  private static mapStatus(status: FileStatus): string {
    if (status === FileStatus.New) { return 'New' }
    if (status === FileStatus.Modified) { return 'Modified' }
    if (status === FileStatus.Deleted) { return 'Deleted' }
    if (status === FileStatus.Renamed) { return 'Renamed' }
    return 'Unknown'
  }

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

  public renderPathLabel() {
    if (this.props.status === FileStatus.Renamed && this.props.oldPath) {
      return (
        <label className='path' title={this.props.path}>
          {this.props.oldPath} <Octicon symbol={OcticonSymbol.arrowRight} /> {this.props.path}
        </label>
      )
    } else {
      return (
        <label className='path' title={this.props.path}>
          {this.props.path}
        </label>
      )
    }
  }

  public render() {
    const fileStatus = ChangedFile.mapStatus(this.props.status)

    return (
      <div className='changed-file' onContextMenu={e => this.onContextMenu(e)}>

        <Checkbox
          // The checkbox doesn't need to be tab reachable since we emulate
          // checkbox behavior on the list item itself, ie hitting space bar
          // while focused on a row will toggle selection.
          tabIndex={-1}
          value={this.checkboxValue}
          onChange={event => this.handleChange(event)}/>

        {this.renderPathLabel()}

        <div className={'status status-' + fileStatus.toLowerCase()} title={fileStatus}>
          <Octicon symbol={iconForStatus(this.props.status)} />
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

function iconForStatus(status: FileStatus): OcticonSymbol {
  if (status === FileStatus.New) { return OcticonSymbol.diffAdded }
  if (status === FileStatus.Modified) { return OcticonSymbol.diffModified }
  if (status === FileStatus.Deleted) { return OcticonSymbol.diffRemoved }
  if (status === FileStatus.Renamed) { return OcticonSymbol.diffRenamed }

  return OcticonSymbol.diffModified
}
