import * as React from 'react'

import { FileStatus } from '../../models/status'
import { Octicon, OcticonSymbol } from '../octicons'
import { showContextualMenu } from '../main-process-proxy'

interface IChangedFileProps {
  path: string
  status: FileStatus
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
    return 'Unknown'
  }

  private handleChange(event: React.FormEvent<any>) {
    const include = (event.target as any).checked
    this.props.onIncludeChanged(include)
  }

  public render() {
    const includeFile = this.props.include
    const fileStatus = ChangedFile.mapStatus(this.props.status)

    return (
      <div className='changed-file' onContextMenu={e => this.onContextMenu(e)}>
        <input
          type='checkbox'
          // The checkboxes doesn't need to be tab reachable since we emulate
          // checkbox behavior on the list item itself, ie hitting space bar
          // while focused on a row will toggle selection.
          tabIndex={-1}
          checked={includeFile == null ? undefined : includeFile}
          onChange={event => this.handleChange(event)}
          ref={function(input) {
            if (input != null) {
              input.indeterminate = (includeFile === null)
            }
          }}/>

        <label className='path' title={this.props.path}>
          {this.props.path}
        </label>

        <div className={'status status-' + fileStatus.toLowerCase()} title={fileStatus}>
          <Octicon symbol={iconForStatus(this.props.status)} />
        </div>
      </div>
    )
  }

  private onContextMenu(event: React.MouseEvent<any>) {
    event.preventDefault()

    if (process.platform !== 'win32') {
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

  return OcticonSymbol.diffModified
}
