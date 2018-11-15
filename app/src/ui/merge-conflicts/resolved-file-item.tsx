import * as React from 'react'
import { OcticonSymbol, Octicon } from '../octicons'
import { PathText } from '../lib/path-text'

interface IResolvedFileItemProps {
  readonly path: string
}

export class ResolvedFileItem extends React.Component<
  IResolvedFileItemProps,
  {}
> {
  public render() {
    return (
      <li className="unmerged-file-status-resolved">
        <Octicon symbol={OcticonSymbol.fileCode} className="file-octicon" />
        <div className="column-left">
          <PathText path={this.props.path} availableWidth={200} />
          <div className="file-conflicts-status">No conflicts remaining</div>
        </div>
        <div className="green-circle">
          <Octicon symbol={OcticonSymbol.check} />
        </div>
      </li>
    )
  }
}
