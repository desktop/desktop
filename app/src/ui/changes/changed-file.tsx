import * as React from 'react'

import { FileStatus } from '../../models/status'
import { Octicon, OcticonSymbol } from '../octicons'

interface IChangedFileProps {
  path: string,
  status: FileStatus,
  include: boolean,
  onIncludeChanged: (include: boolean) => void
}

/** a changed file in the working directory for a given repository */
export class ChangedFile extends React.Component<IChangedFileProps, void> {

  private static mapStatus(status: FileStatus): string {
    if (status === FileStatus.New) { return 'New' }
    if (status === FileStatus.Modified) { return 'Modified' }
    if (status === FileStatus.Deleted) { return 'Deleted' }
    return 'Unknown'
  }

  private handleChange(event: React.FormEvent) {
    const include = (event.target as any).checked
    this.props.onIncludeChanged(include)
  }

  private static iconForStatus(status: FileStatus): OcticonSymbol {
    if (status === FileStatus.New) { return OcticonSymbol.diffAdded }
    if (status === FileStatus.Modified) { return OcticonSymbol.diffModified }
    if (status === FileStatus.Deleted) { return OcticonSymbol.diffRemoved }

    return OcticonSymbol.diffModified
  }

  public render() {
    return (
      <div className='changed-file'>
          <input
            type='checkbox'
            checked={this.props.include}
            onChange={event => this.handleChange(event)}
          />
        <span className='path'>{this.props.path}</span>
        <span className='status' title={ChangedFile.mapStatus(this.props.status)}>
          <Octicon symbol={ChangedFile.iconForStatus(this.props.status)} />
        </span>
      </div>
    )
  }
}
