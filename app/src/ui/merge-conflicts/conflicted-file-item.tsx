import * as React from 'react'
import { OcticonSymbol, Octicon } from '../octicons'
import { PathText } from '../lib/path-text'
import { Choice } from '../../models/conflicts'
import { Button } from '../lib/button'
import { showContextualMenu } from '../main-process-proxy'
import { LinkButton } from '../lib/link-button'
import {
  WorkingDirectoryFileChange,
  ConflictedFileStatus,
  GitStatusEntry,
} from '../../models/status'
import { assertNever } from '../../lib/fatal-error'

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

type UnmergedStatusEntry =
  | GitStatusEntry.Added
  | GitStatusEntry.UpdatedButUnmerged
  | GitStatusEntry.Deleted

function getLabelForOption(
  entry: UnmergedStatusEntry,
  branch?: string
): string {
  const suffix = branch ? ` from ${branch}` : ''

  switch (entry) {
    case GitStatusEntry.Added:
      return `Use the added file${suffix}`
    case GitStatusEntry.UpdatedButUnmerged:
      return `Use the modified file${suffix}`
    case GitStatusEntry.Deleted:
      return `Use the deleted file${suffix}`
    default:
      return assertNever(entry, 'Unknown status entry to format')
  }
}

interface IConflictedFileItemProps {
  readonly file: WorkingDirectoryFileChange
  readonly status: ConflictedFileStatus
  readonly choice: Choice | null
  readonly ourBranch: string
  readonly theirBranch?: string
  readonly resolvedExternalEditor: string | null
  readonly onOpenFileInEditor: (path: string) => void
  readonly onResolveManualConflict: (path: string, choice: Choice) => void
  readonly onUndo: (path: string) => void
}

export class ConflictedFileItem extends React.Component<
  IConflictedFileItemProps,
  {}
> {
  private onOpenInEditor = () => {
    this.props.onOpenFileInEditor(this.props.file.path)
  }

  private onShowContextMenu = () => {
    const { us, them } = this.props.status.entry

    const themLabel = getLabelForOption(them, this.props.theirBranch)
    const usLabel = getLabelForOption(us, this.props.ourBranch)

    const options = [
      {
        label: themLabel,
        action: () => {
          this.props.onResolveManualConflict(this.props.file.path, 'theirs')
        },
      },
      {
        label: usLabel,
        action: () => {
          this.props.onResolveManualConflict(this.props.file.path, 'ours')
        },
      },
    ]

    showContextualMenu(options)
  }

  private undoChoice = () => {
    this.props.onUndo(this.props.file.path)
  }

  private renderTextConflicts(conflictMarkerCount: number): JSX.Element {
    const humanReadableConflicts = calculateConflicts(conflictMarkerCount)
    const message =
      humanReadableConflicts === 1
        ? `1 conflict`
        : `${humanReadableConflicts} conflicts`

    const disabled = this.props.resolvedExternalEditor === null

    const tooltip = editorButtonTooltip(this.props.resolvedExternalEditor)

    return (
      <>
        <div className="column-left">
          <PathText path={this.props.file.path} availableWidth={200} />
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
  }

  private renderUnresolvedManualConflict(): JSX.Element {
    return (
      <>
        <div className="column-left">
          <PathText path={this.props.file.path} availableWidth={200} />
          <div className="file-conflicts-status">
            Choose a version of the file
          </div>
        </div>
        <Button
          onClick={this.onShowContextMenu}
          tooltip="Choose an option to resolve this conflict"
        >
          Resolve
        </Button>
      </>
    )
  }

  private renderResolvedManualConflict = (choice: Choice) => {
    const { us, them } = this.props.status.entry
    const message =
      choice === 'theirs'
        ? getLabelForOption(them, this.props.theirBranch)
        : getLabelForOption(us, this.props.ourBranch)

    return (
      <>
        <div className="column-left">
          <PathText path={this.props.file.path} availableWidth={200} />
          <div className="file-conflicts-status">
            {message} <LinkButton onClick={this.undoChoice}>Undo</LinkButton>
          </div>
        </div>
        <div className="green-circle">
          <Octicon symbol={OcticonSymbol.check} />
        </div>
      </>
    )
  }

  public render() {
    const { status } = this.props

    let resolved = false
    let content: JSX.Element

    if (status.lookForConflictMarkers && status.conflictMarkerCount > 0) {
      content = this.renderTextConflicts(status.conflictMarkerCount)
    } else if (this.props.choice != null) {
      resolved = true
      content = this.renderResolvedManualConflict(this.props.choice)
    } else {
      content = this.renderUnresolvedManualConflict()
    }

    const className = resolved
      ? 'unmerged-file-status-resolved'
      : 'unmerged-file-status-conflicts'

    return (
      <li className={className} key={this.props.file.id}>
        <Octicon symbol={OcticonSymbol.fileCode} className="file-octicon" />
        {content}
      </li>
    )
  }
}
