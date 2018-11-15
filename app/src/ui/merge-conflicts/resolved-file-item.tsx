import * as React from 'react'
import { OcticonSymbol, Octicon } from '../octicons'
import { PathText } from '../lib/path-text'
import { WorkingDirectoryFileChange } from '../../models/status'

interface IResolvedFileItemProps {
  readonly file: WorkingDirectoryFileChange
}

export class ResolvedFileItem extends React.Component<
  IResolvedFileItemProps,
  {}
> {
  public render() {
    return (
      <li className="unmerged-file-status-resolved" key={this.props.file.id}>
        <Octicon symbol={OcticonSymbol.fileCode} className="file-octicon" />
        <div className="column-left">
          <PathText path={this.props.file.path} availableWidth={200} />
          <div className="file-conflicts-status">No conflicts remaining</div>
        </div>
        <div className="green-circle">
          <Octicon symbol={OcticonSymbol.check} />
        </div>
      </li>
    )
  }
}
