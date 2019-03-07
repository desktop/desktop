import * as React from 'react'
import {
  isConflictWithMarkers,
  isManualConflict,
  ConflictedFileStatus,
  ConflictsWithMarkers,
  ManualConflict,
} from '../../../models/status'
import { join } from 'path'
import { Repository } from '../../../models/repository'
import { Dispatcher } from '../../dispatcher'
import { showContextualMenu } from '../../main-process-proxy'
import { Octicon, OcticonSymbol } from '../../octicons'
import { PathText } from '../path-text'
import {
  ManualConflictResolutionKind,
  ManualConflictResolution,
} from '../../../models/manual-conflict-resolution'
import {
  OpenWithDefaultProgramLabel,
  RevealInFileManagerLabel,
} from '../context-menu'
import { openFile } from '../open-file'
import { shell } from 'electron'
import { Button } from '../button'
import { IMenuItem } from '../../../lib/menu-item'
import { LinkButton } from '../link-button'
import {
  hasUnresolvedConflicts,
  getUnmergedStatusEntryDescription,
  getLabelForManualResolutionOption,
} from '../../../lib/status'

/**
 * Renders an unmerged file status and associated buttons for the merge conflicts modal
 * (An "unmerged file" can be conflicted _and_ resolved or _just_ conflicted)
 */
export const renderUnmergedFile: React.SFC<{
  /** repository this file is in (for pathing and git operations) */
  readonly repository: Repository
  /** file path relative to repository */
  readonly path: string
  /** this file must have a conflicted status (but that doesn't mean its not resolved) */
  readonly status: ConflictedFileStatus
  /** manual resolution choice for the file at `path`
   *  (optional. only applies to manual merge conflicts)
   */
  readonly manualResolution?: ManualConflictResolution
  /** branch we were on before starting merge */
  readonly ourBranch: string
  /* `undefined` when we didn't know the branch at the beginning of the merge conflict resolution flow */
  readonly theirBranch?: string
  /** name of the resolved external editor */
  readonly resolvedExternalEditor: string | null
  readonly openFileInExternalEditor: (path: string) => void
  readonly dispatcher: Dispatcher
}> = props => {
  if (
    isConflictWithMarkers(props.status) &&
    hasUnresolvedConflicts(props.status, props.manualResolution)
  ) {
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
  if (isManualConflict(props.status) && props.manualResolution === undefined) {
    return renderManualConflictedFile({
      path: props.path,
      status: props.status,
      repository: props.repository,
      dispatcher: props.dispatcher,
      ourBranch: props.ourBranch,
      theirBranch: props.theirBranch,
    })
  }
  return renderResolvedFile({
    path: props.path,
    status: props.status,
    repository: props.repository,
    dispatcher: props.dispatcher,
    manualResolution: props.manualResolution,
    branch: getBranchForResolution(
      props.manualResolution,
      props.ourBranch,
      props.theirBranch
    ),
  })
}

/** renders the status of a resolved file (of a manual or markered conflict) and associated buttons for the merge conflicts modal */
const renderResolvedFile: React.SFC<{
  readonly repository: Repository
  readonly path: string
  readonly status: ConflictedFileStatus
  readonly manualResolution?: ManualConflictResolution
  readonly branch?: string
  readonly dispatcher: Dispatcher
}> = props => {
  return (
    <li key={props.path} className="unmerged-file-status-resolved">
      <Octicon symbol={OcticonSymbol.fileCode} className="file-octicon" />
      <div className="column-left">
        <PathText path={props.path} availableWidth={200} />
        {renderResolvedFileStatusSummary({
          path: props.path,
          status: props.status,
          branch: props.branch,
          manualResolution: props.manualResolution,
          repository: props.repository,
          dispatcher: props.dispatcher,
        })}
      </div>
      <div className="green-circle">
        <Octicon symbol={OcticonSymbol.check} />
      </div>
    </li>
  )
}

/** renders the status of a manually conflicted file and associated buttons for the merge conflicts modal */
const renderManualConflictedFile: React.SFC<{
  readonly path: string
  readonly status: ManualConflict
  readonly repository: Repository
  readonly ourBranch: string
  readonly theirBranch?: string
  readonly dispatcher: Dispatcher
}> = props => {
  const onDropdownClick = makeManualConflictDropdownClickHandler(
    props.path,
    props.status,
    props.repository,
    props.dispatcher,
    props.ourBranch,
    props.theirBranch
  )

  const content = (
    <>
      <div className="column-left">
        <PathText path={props.path} availableWidth={200} />
        <div className="file-conflicts-status">{manualConflictString}</div>
      </div>
      <div className="action-buttons">
        <Button
          className="small-button button-group-item resolve-arrow-menu"
          onClick={onDropdownClick}
        >
          Resolve
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

/** makes a click handling function for manual conflict resolution options */
const makeManualConflictDropdownClickHandler = (
  relativeFilePath: string,
  status: ManualConflict,
  repository: Repository,
  dispatcher: Dispatcher,
  ourBranch: string,
  theirBranch?: string
) => {
  return () => {
    const items: IMenuItem[] = [
      {
        label: getLabelForManualResolutionOption(status.entry.us, ourBranch),
        action: () =>
          dispatcher.updateManualConflictResolution(
            repository,
            relativeFilePath,
            ManualConflictResolutionKind.ours
          ),
      },
      {
        label: getLabelForManualResolutionOption(
          status.entry.them,
          theirBranch
        ),
        action: () =>
          dispatcher.updateManualConflictResolution(
            repository,
            relativeFilePath,
            ManualConflictResolutionKind.theirs
          ),
      },
    ]
    showContextualMenu(items)
  }
}

/** makes a click handling function for undoing a manual conflict resolution */
const makeUndoManualResolutionClickHandler = (
  relativeFilePath: string,
  repository: Repository,
  dispatcher: Dispatcher
) => {
  return () =>
    dispatcher.updateManualConflictResolution(
      repository,
      relativeFilePath,
      null
    )
}

/** makes a click handling function for marker conflict actions */
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

function resolvedFileStatusString(
  status: ConflictedFileStatus,
  manualResolution?: ManualConflictResolution,
  branch?: string
): string {
  if (manualResolution === ManualConflictResolutionKind.ours) {
    return getUnmergedStatusEntryDescription(status.entry.us, branch)
  }
  if (manualResolution === ManualConflictResolutionKind.theirs) {
    return getUnmergedStatusEntryDescription(status.entry.them, branch)
  }
  return 'No conflicts remaining'
}

const renderResolvedFileStatusSummary: React.SFC<{
  path: string
  status: ConflictedFileStatus
  repository: Repository
  dispatcher: Dispatcher
  manualResolution?: ManualConflictResolution
  branch?: string
}> = props => {
  const statusString = resolvedFileStatusString(
    props.status,
    props.manualResolution,
    props.branch
  )
  if (props.manualResolution === undefined) {
    return <div className="file-conflicts-status">{statusString}</div>
  }

  return (
    <div className="file-conflicts-status">
      {statusString}
      &nbsp;
      <LinkButton
        onClick={makeUndoManualResolutionClickHandler(
          props.path,
          props.repository,
          props.dispatcher
        )}
      >
        Undo
      </LinkButton>
    </div>
  )
}

/** returns the name of the branch that corresponds to the chosen manual resolution */
function getBranchForResolution(
  manualResolution: ManualConflictResolution | undefined,
  ourBranch: string,
  theirBranch?: string
): string | undefined {
  if (manualResolution === ManualConflictResolutionKind.ours) {
    return ourBranch
  }
  if (manualResolution === ManualConflictResolutionKind.theirs) {
    return theirBranch
  }
  return undefined
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

const manualConflictString = 'Manual conflict'
