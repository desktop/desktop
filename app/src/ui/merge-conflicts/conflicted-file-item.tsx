import * as React from 'react'
import { OcticonSymbol, Octicon } from '../octicons'
import { PathText } from '../lib/path-text'
import { ConflictedFileStatus } from '../../models/status'
import { Button } from '../lib/button'

/**
 * Calculates the number of merge conclicts in a file from the number of markers
 * divides by three and rounds up since each conflict is indicated by three separate markers
 * (`<<<<<`, `>>>>>`, and `=====`)
 * @param conflictMarkers number of conflict markers in a file
 */
function calculateConflicts(conflictMarkers: number) {
  return Math.ceil(conflictMarkers / 3)
}

function editorButtonString(editorName: string | null): string {
  const defaultEditorString = 'editor'
  return `Open in ${editorName || defaultEditorString}`
}

function editorButtonTooltip(editorName: string | null): string | undefined {
  if (editorName !== null) {
    // no need to render a tooltip if we have a known editor
    return
  }

  if (__DARWIN__) {
    return `No editor configured in Preferences > Advanced`
  } else {
    return `No editor configured in Options > Advanced`
  }
}

interface IConflictedFileItemProps {
  readonly path: string
  readonly status: ConflictedFileStatus
  readonly resolvedExternalEditor: string | null
  readonly onOpenFileInEditor: (path: string) => void
}

export class ConflictedFileItem extends React.Component<
  IConflictedFileItemProps,
  {}
> {
  private onOpenInEditor = () => {
    this.props.onOpenFileInEditor(this.props.path)
  }

  public render() {
    const { path, status, resolvedExternalEditor } = this.props

    let content = null
    if (status.lookForConflictMarkers && status.conflictMarkerCount > 0) {
      const humanReadableConflicts = calculateConflicts(
        status.conflictMarkerCount
      )
      const message =
        humanReadableConflicts === 1
          ? `1 conflict`
          : `${humanReadableConflicts} conflicts`

      const disabled = resolvedExternalEditor === null

      const tooltip = editorButtonTooltip(resolvedExternalEditor)

      content = (
        <>
          <div className="column-left">
            <PathText path={path} availableWidth={200} />
            <div className="file-conflicts-status">{message}</div>
          </div>
          <Button
            onClick={this.onOpenInEditor}
            disabled={disabled}
            tooltip={tooltip}
          >
            {editorButtonString(this.props.resolvedExternalEditor)}
          </Button>
        </>
      )
    } else {
      content = (
        <div>
          <PathText path={path} availableWidth={400} />
          <div className="command-line-hint">
            Use command line to resolve this file
          </div>
        </div>
      )
    }

    return content !== null ? (
      <li className="unmerged-file-status-conflicts">
        <Octicon symbol={OcticonSymbol.fileCode} className="file-octicon" />
        {content}
      </li>
    ) : null
  }
}
