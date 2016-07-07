import * as React from 'react'

import {FileStatus} from './models/status'

interface ChangedFileProps {
  path: string,
  status: FileStatus
}

interface ChangedFileState {

}

export default class ChangedFile extends React.Component<ChangedFileProps, ChangedFileState> {

  private static mapStatus(status: FileStatus): string {
    if (status === FileStatus.New) { return 'New' }
    if (status === FileStatus.Modified) { return 'Modified' }
    if (status === FileStatus.Deleted) { return 'Deleted' }
    return 'Unknown'
  }

  public constructor(props: ChangedFileProps) {
    super(props)
  }

  public render() {
    return (
        <li><em>{this.props.path}</em> - {ChangedFile.mapStatus(this.props.status)}</li>
    )
  }
}
