import { join } from 'path'
import * as React from 'react'

import { openFile } from '../lib/open-file'
import { showContextualMenu } from '../main-process-proxy'
import { hasUnresolvedConflicts } from '../../lib/status'
import { IMenuItem } from '../../lib/menu-item'
import { shell } from '../../lib/app-shell'
import { Repository } from '../../models/repository'
import {
  AppFileStatusKind,
  ConflictedFileStatus,
  isConflictWithMarkers,
  WorkingDirectoryFileChange,
} from '../../models/status'
import { Dispatcher } from '../dispatcher'
import { Button } from '../lib/button'
import { PathText } from '../lib/path-text'
import { Octicon, OcticonSymbol } from '../octicons'
import {
  OpenWithDefaultProgramLabel,
  RevealInFileManagerLabel,
} from '../lib/context-menu'

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

interface IConflictedFilesListProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly files: ReadonlyArray<WorkingDirectoryFileChange>
  readonly openFileInExternalEditor: (path: string) => void
  readonly resolvedExternalEditor: string | null
}

export class ConflictedFilesList extends React.Component<
  IConflictedFilesListProps,
  {}
> {
  private makeDropdownClickHandler = (
    relativeFilePath: string,
    repositoryFilePath: string,
    dispatcher: Dispatcher
  ) => {
    return () => {
      const absoluteFilePath = join(repositoryFilePath, relativeFilePath)
      const items: IMenuItem[] = [
        {
          label: OpenWithDefaultProgramLabel,
          action: () => openFile(absoluteFilePath, dispatcher),
        },
        {
          label: RevealInFileManagerLabel,
          action: () => shell.showItemInFolder(absoluteFilePath),
        },
      ]
      showContextualMenu(items)
    }
  }

  private renderResolvedFile(path: string): JSX.Element {
    return (
      <li key={path} className="unmerged-file-status-resolved">
        <Octicon symbol={OcticonSymbol.fileCode} className="file-octicon" />
        <div className="column-left">
          <PathText path={path} availableWidth={200} />
          <div className="file-conflicts-status">No conflicts remaining</div>
        </div>
        <div className="green-circle">
          <Octicon symbol={OcticonSymbol.check} />
        </div>
      </li>
    )
  }

  private renderConflictedFile(
    path: string,
    status: ConflictedFileStatus,
    onOpenEditorClick: () => void
  ): JSX.Element | null {
    let content = null
    if (isConflictWithMarkers(status)) {
      const humanReadableConflicts = calculateConflicts(
        status.conflictMarkerCount
      )
      const message =
        humanReadableConflicts === 1
          ? `1 conflict`
          : `${humanReadableConflicts} conflicts`

      const disabled = this.props.resolvedExternalEditor === null

      const tooltip = editorButtonTooltip(this.props.resolvedExternalEditor)

      const onDropdownClick = this.makeDropdownClickHandler(
        path,
        this.props.repository.path,
        this.props.dispatcher
      )

      content = (
        <>
          <div className="column-left">
            <PathText path={path} availableWidth={200} />
            <div className="file-conflicts-status">{message}</div>
          </div>
          <div className="action-buttons">
            <Button
              onClick={onOpenEditorClick}
              disabled={disabled}
              tooltip={tooltip}
              className="small-button button-group-item"
            >
              {editorButtonString(this.props.resolvedExternalEditor)}
            </Button>
            <Button
              onClick={onDropdownClick}
              className="small-button button-group-item arrow-menu"
            >
              <Octicon symbol={OcticonSymbol.triangleDown} />
            </Button>
          </div>
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
      <li key={path} className="unmerged-file-status-conflicts">
        <Octicon symbol={OcticonSymbol.fileCode} className="file-octicon" />
        {content}
      </li>
    ) : null
  }

  private renderRow = (file: WorkingDirectoryFileChange) => {
    const { status } = file
    switch (status.kind) {
      case AppFileStatusKind.Conflicted:
        if (!hasUnresolvedConflicts(status)) {
          return this.renderResolvedFile(file.path)
        }

        return this.renderConflictedFile(file.path, status, () =>
          this.props.openFileInExternalEditor(
            join(this.props.repository.path, file.path)
          )
        )
      default:
        return null
    }
  }

  public render() {
    if (this.props.files.length === 0) {
      return (
        <div className="all-conflicts-resolved">
          <div className="green-circle">
            <Octicon symbol={OcticonSymbol.check} />
          </div>
          <div className="message">All conflicts resolved</div>
        </div>
      )
    }

    return (
      <ul className="unmerged-file-statuses">
        {this.props.files.map(f => this.renderRow(f))}
      </ul>
    )
  }
}
