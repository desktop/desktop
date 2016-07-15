import * as React from 'react'

import {FileStatus} from '../../models/status'

interface ChangedFileProps {
  path: string,
  status: FileStatus,
  include: boolean,
  onIncludedChange: (include: boolean) => void
}

/** a changed file in the working directory for a given repository */
export class ChangedFile extends React.Component<ChangedFileProps, void> {

  private static mapStatus(status: FileStatus): string {
    if (status === FileStatus.New) { return 'New' }
    if (status === FileStatus.Modified) { return 'Modified' }
    if (status === FileStatus.Deleted) { return 'Deleted' }
    return 'Unknown'
  }

  public constructor(props: ChangedFileProps) {
    super(props)
  }

  private handleChange(event: React.FormEvent) {
    const include = (event.target as any).checked
    this.props.onIncludedChange(include)
  }

  public render() {
    return (
        <li>
          <input
            type='checkbox'
            checked={this.props.include}
            onChange={event => this.handleChange(event)}
          />
        <strong>{this.props.path}</strong> - {ChangedFile.mapStatus(this.props.status)}</li>
    )
  }
}
