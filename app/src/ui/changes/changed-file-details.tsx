import * as React from 'react'
import { PathLabel } from '../lib/path-label'
import { AppFileStatus } from '../../models/status'
import { IDiff, DiffType } from '../../models/diff'
import { Octicon, OcticonSymbol, iconForStatus } from '../octicons'
import { mapStatus } from '../../lib/status'

interface IChangedFileDetailsProps {
  readonly path: string
  readonly status: AppFileStatus
  readonly diff: IDiff | null
}

/** Displays information about a file */
export class ChangedFileDetails extends React.Component<
  IChangedFileDetailsProps,
  {}
> {
  public render() {
    const status = this.props.status
    const fileStatus = mapStatus(status)

    return (
      <div className="header">
        <PathLabel path={this.props.path} status={this.props.status} />
        {this.renderDecorator()}

        <Octicon
          symbol={iconForStatus(status)}
          className={'status status-' + fileStatus.toLowerCase()}
          title={fileStatus}
        />
      </div>
    )
  }

  private renderDecorator() {
    const diff = this.props.diff

    if (diff === null) {
      return null
    }

    if (diff.kind === DiffType.Text && diff.lineEndingsChange) {
      const message = `Warning: line endings will be changed from '${
        diff.lineEndingsChange.from
      }' to '${diff.lineEndingsChange.to}'.`
      return (
        <Octicon
          symbol={OcticonSymbol.alert}
          className={'line-endings'}
          title={message}
        />
      )
    } else {
      return null
    }
  }
}
