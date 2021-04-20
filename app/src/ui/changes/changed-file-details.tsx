import * as React from 'react'
import { PathLabel } from '../lib/path-label'
import { AppFileStatus } from '../../models/status'
import { IDiff, DiffType } from '../../models/diff'
import { Octicon, OcticonSymbol, iconForStatus } from '../octicons'
import { mapStatus } from '../../lib/status'
import { DiffOptions } from '../diff/diff-options'
import { RepositorySectionTab } from '../../lib/app-state'

interface IChangedFileDetailsProps {
  readonly path: string
  readonly status: AppFileStatus
  readonly diff: IDiff | null

  /** Whether we should display side by side diffs. */
  readonly showSideBySideDiff: boolean

  /** Called when the user changes the side by side diffs setting. */
  readonly onShowSideBySideDiffChanged: (checked: boolean) => void

  /** Whether we should hide whitespace in diffs. */
  readonly hideWhitespaceInDiff: boolean

  /** Called when the user changes the hide whitespace in diffs setting. */
  readonly onHideWhitespaceInDiffChanged: (checked: boolean) => Promise<void>

  /** Called when the user opens the diff options popover */
  readonly onDiffOptionsOpened: () => void
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

        <DiffOptions
          sourceTab={RepositorySectionTab.Changes}
          onHideWhitespaceChangesChanged={
            this.props.onHideWhitespaceInDiffChanged
          }
          hideWhitespaceChanges={this.props.hideWhitespaceInDiff}
          onShowSideBySideDiffChanged={this.props.onShowSideBySideDiffChanged}
          showSideBySideDiff={this.props.showSideBySideDiff}
          onDiffOptionsOpened={this.props.onDiffOptionsOpened}
        />

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
