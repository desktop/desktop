import * as React from 'react'
import { PathLabel } from '../lib/path-label'
import { AppFileStatus } from '../../models/status'
import { IDiff, DiffType } from '../../models/diff'
import { Octicon, OcticonSymbol, iconForStatus } from '../octicons'
import { mapStatus } from '../../lib/status'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

interface IChangedFileDetailsProps {
  readonly path: string
  readonly status: AppFileStatus
  readonly diff: IDiff | null

  /** Whether we should display side by side diffs. */
  readonly showSideBySideDiff: boolean

  /** Called when the user changes the side by side diffs setting. */
  readonly onShowSideBySideDiffChanged: (checked: boolean) => void
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

        <Checkbox
          label="Split View"
          value={
            this.props.showSideBySideDiff ? CheckboxValue.On : CheckboxValue.Off
          }
          onChange={this.onShowSideBySideDiffChanged}
        />

        <Octicon
          symbol={iconForStatus(status)}
          className={'status status-' + fileStatus.toLowerCase()}
          title={fileStatus}
        />
      </div>
    )
  }

  private onShowSideBySideDiffChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onShowSideBySideDiffChanged(event.currentTarget.checked)
  }

  private renderDecorator() {
    const diff = this.props.diff

    if (diff === null) {
      return null
    }

    if (diff.kind === DiffType.Text && diff.lineEndingsChange) {
      const message = `Warning: line endings will be changed from '${diff.lineEndingsChange.from}' to '${diff.lineEndingsChange.to}'.`
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
