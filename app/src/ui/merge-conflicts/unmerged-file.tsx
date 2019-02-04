import * as React from 'react'
import {
  isConflictWithMarkers,
  isManualConflict,
  ConflictedFileStatus,
  ConflictsWithMarkers,
} from '../../models/status'
import { join } from 'path'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { showContextualMenu } from '../main-process-proxy'
import { Octicon, OcticonSymbol } from '../octicons'
import { PathText } from '../lib/path-text'
import { ManualConflictResolutionKind } from '../../models/manual-conflict-resolution'
import {
  OpenWithDefaultProgramLabel,
  RevealInFileManagerLabel,
} from '../lib/context-menu'
import { openFile } from '../lib/open-file'
import { shell } from 'electron'
import { Button } from '../lib/button'
import { IMenuItem } from '../../lib/menu-item'

export const renderUnmergedFile: React.SFC<{
  readonly repository: Repository
  readonly path: string
  readonly status: ConflictedFileStatus
  readonly resolvedExternalEditor: string | null
  readonly openFileInExternalEditor: (path: string) => void
  readonly dispatcher: Dispatcher
}> = props => {
  if (isConflictWithMarkers(props.status)) {
    return renderConflictedFileWithConflictMarkers({
      path: props.path,
      status: props.status,
      resolvedExternalEditor: props.resolvedExternalEditor,
      onOpenEditorClick: () =>
        props.openFileInExternalEditor(join(props.repository.path, props.path)),
      repository: props.repository,
      dispatcher: props.dispatcher,
    })
  }
  if (isManualConflict(props.status)) {
    return renderManualConflictedFile({
      path: props.path,
      repository: props.repository,
      dispatcher: props.dispatcher,
    })
  }
  return renderResolvedFile(props.path)
}

function renderResolvedFile(path: string): JSX.Element {
  return (
    <li className="unmerged-file-status-resolved">
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

const renderManualConflictedFile: React.SFC<{
  readonly path: string
  readonly repository: Repository
  readonly dispatcher: Dispatcher
}> = props => {
  const message = 'Manual conflict'
  const onDropdownClick = makeManualConflictDropdownClickHandler(
    props.path,
    props.repository,
    props.dispatcher
  )

  const content = (
    <>
      <div className="column-left">
        <PathText path={props.path} availableWidth={200} />
        <div className="file-conflicts-status">{message}</div>
      </div>
      <div className="action-buttons">
        <Button className="small-button button-group-item">Resolve</Button>
        <Button
          onClick={onDropdownClick}
          className="small-button button-group-item arrow-menu"
        >
          <Octicon symbol={OcticonSymbol.triangleDown} />
        </Button>
      </div>
    </>
  )

  return renderConflictedFileWrapper(props.path, content)
}

function renderConflictedFileWrapper(
  path: string,
  content: JSX.Element
): JSX.Element {
  return (
    <li key={path} className="unmerged-file-status-conflicts">
      <Octicon symbol={OcticonSymbol.fileCode} className="file-octicon" />
      {content}
    </li>
  )
}

const renderConflictedFileWithConflictMarkers: React.SFC<{
  readonly path: string
  readonly status: ConflictsWithMarkers
  readonly resolvedExternalEditor: string | null
  readonly onOpenEditorClick: () => void
  readonly repository: Repository
  readonly dispatcher: Dispatcher
}> = props => {
  const humanReadableConflicts = calculateConflicts(
    props.status.conflictMarkerCount
  )
  const message =
    humanReadableConflicts === 1
      ? `1 conflict`
      : `${humanReadableConflicts} conflicts`

  const disabled = props.resolvedExternalEditor === null
  const tooltip = editorButtonTooltip(props.resolvedExternalEditor)
  const onDropdownClick = makeMarkerConflictDropdownClickHandler(
    props.path,
    props.repository.path,
    props.dispatcher
  )

  const content = (
    <>
      <div className="column-left">
        <PathText path={props.path} availableWidth={200} />
        <div className="file-conflicts-status">{message}</div>
      </div>
      <div className="action-buttons">
        <Button
          onClick={props.onOpenEditorClick}
          disabled={disabled}
          tooltip={tooltip}
          className="small-button button-group-item"
        >
          {editorButtonString(props.resolvedExternalEditor)}
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
  return renderConflictedFileWrapper(props.path, content)
}

const makeManualConflictDropdownClickHandler = (
  relativeFilePath: string,
  repository: Repository,
  dispatcher: Dispatcher
) => {
  return () => {
    const absoluteFilePath = join(repository.path, relativeFilePath)
    const items: IMenuItem[] = [
      {
        label: 'Use our version',
        action: () =>
          dispatcher.updateManualConflictResolution(
            repository,
            absoluteFilePath,
            ManualConflictResolutionKind.ours
          ),
      },
      {
        label: 'Use their version',
        action: () =>
          dispatcher.updateManualConflictResolution(
            repository,
            absoluteFilePath,
            ManualConflictResolutionKind.theirs
          ),
      },
    ]
    showContextualMenu(items)
  }
}

const makeMarkerConflictDropdownClickHandler = (
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
