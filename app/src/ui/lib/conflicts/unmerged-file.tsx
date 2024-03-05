import * as React from 'react'
import {
  isConflictWithMarkers,
  isManualConflict,
  ConflictedFileStatus,
  ConflictsWithMarkers,
  ManualConflict,
  GitStatusEntry,
} from '../../../models/status'
import { join } from 'path'
import { Repository } from '../../../models/repository'
import { Dispatcher } from '../../dispatcher'
import { showContextualMenu } from '../../../lib/menu-item'
import { Octicon } from '../../octicons'
import * as octicons from '../../octicons/octicons.generated'
import { PathText } from '../path-text'
import { ManualConflictResolution } from '../../../models/manual-conflict-resolution'
import {
  OpenWithDefaultProgramLabel,
  RevealInFileManagerLabel,
} from '../context-menu'
import { openFile } from '../open-file'
import { Button } from '../button'
import { IMenuItem } from '../../../lib/menu-item'
import {
  hasUnresolvedConflicts,
  getUnmergedStatusEntryDescription,
  getLabelForManualResolutionOption,
} from '../../../lib/status'
import { revealInFileManager } from '../../../lib/app-shell'

const defaultConflictsResolvedMessage = 'No conflicts remaining'

/**
 * Renders an unmerged file status and associated buttons for the merge conflicts modal
 * (An "unmerged file" can be conflicted _and_ resolved or _just_ conflicted)
 */
export const renderUnmergedFile: React.FunctionComponent<{
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
  /**
   * Current branch associated with the conflicted state for this file:
   *
   *  - for a merge, this is the tip of the repository
   *  - for a rebase, this is the base branch that commits are being applied on top
   *  - for a cherry pick, this is the source branch that the commits come from
   *
   * If the rebase or cherry pick is started outside Desktop, the details about
   * this branch may not be known - the rendered component will handle this
   * fine.
   */
  readonly ourBranch?: string
  /**
   * The other branch associated with the conflicted state for this file:
   *
   *  - for a merge, this is be the branch being merged into the tip of the repository
   *  - for a rebase, this is the target branch that is having it's history rewritten
   *  - for a cherrypick, this is the target branch that the commits are being
   *    applied to.
   *
   * If the merge is started outside Desktop, the details about this branch may
   * not be known - the rendered component will handle this fine.
   */
  readonly theirBranch?: string
  /** name of the resolved external editor */
  readonly resolvedExternalEditor: string | null
  readonly openFileInExternalEditor: (path: string) => void
  readonly dispatcher: Dispatcher
  readonly isFileResolutionOptionsMenuOpen: boolean
  readonly setIsFileResolutionOptionsMenuOpen: (
    isFileResolutionOptionsMenuOpen: boolean
  ) => void
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
      ourBranch: props.ourBranch,
      theirBranch: props.theirBranch,
      isFileResolutionOptionsMenuOpen: props.isFileResolutionOptionsMenuOpen,
      setIsFileResolutionOptionsMenuOpen:
        props.setIsFileResolutionOptionsMenuOpen,
    })
  }
  if (
    isManualConflict(props.status) &&
    hasUnresolvedConflicts(props.status, props.manualResolution)
  ) {
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
const renderResolvedFile: React.FunctionComponent<{
  readonly repository: Repository
  readonly path: string
  readonly status: ConflictedFileStatus
  readonly manualResolution?: ManualConflictResolution
  readonly branch?: string
  readonly dispatcher: Dispatcher
}> = props => {
  const fileStatusSummary = getResolvedFileStatusSummary(
    props.status,
    props.manualResolution,
    props.branch
  )
  return (
    <li key={props.path} className="unmerged-file-status-resolved">
      <Octicon symbol={octicons.fileCode} className="file-octicon" />
      <div className="column-left" id={props.path}>
        <PathText path={props.path} />
        <div className="file-conflicts-status">{fileStatusSummary}</div>
      </div>
      {fileStatusSummary === defaultConflictsResolvedMessage ? null : (
        <Button
          className="undo-button"
          onClick={makeUndoManualResolutionClickHandler(
            props.path,
            props.repository,
            props.dispatcher
          )}
          ariaDescribedBy={props.path}
        >
          Undo
        </Button>
      )}
      <div className="green-circle">
        <Octicon symbol={octicons.check} />
      </div>
    </li>
  )
}

/** renders the status of a manually conflicted file and associated buttons for the merge conflicts modal */
const renderManualConflictedFile: React.FunctionComponent<{
  readonly path: string
  readonly status: ManualConflict
  readonly repository: Repository
  readonly ourBranch?: string
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
  const { ourBranch, theirBranch } = props
  const { entry } = props.status

  let conflictTypeString = manualConflictString

  if ([entry.us, entry.them].includes(GitStatusEntry.Deleted)) {
    let targetBranch = 'target branch'
    if (entry.us === GitStatusEntry.Deleted && ourBranch !== undefined) {
      targetBranch = ourBranch
    }

    if (entry.them === GitStatusEntry.Deleted && theirBranch !== undefined) {
      targetBranch = theirBranch
    }
    conflictTypeString = `File does not exist on ${targetBranch}.`
  }

  const content = (
    <>
      <div className="column-left">
        <PathText path={props.path} />
        <div className="file-conflicts-status">{conflictTypeString}</div>
      </div>
      <div className="action-buttons">
        <Button
          className="small-button button-group-item resolve-arrow-menu"
          onClick={onDropdownClick}
        >
          Resolve
          <Octicon symbol={octicons.triangleDown} />
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
      <Octicon symbol={octicons.fileCode} className="file-octicon" />
      {content}
    </li>
  )
}

const renderConflictedFileWithConflictMarkers: React.FunctionComponent<{
  readonly path: string
  readonly status: ConflictsWithMarkers
  readonly resolvedExternalEditor: string | null
  readonly onOpenEditorClick: () => void
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly ourBranch?: string
  readonly theirBranch?: string
  readonly isFileResolutionOptionsMenuOpen: boolean
  readonly setIsFileResolutionOptionsMenuOpen: (
    isFileResolutionOptionsMenuOpen: boolean
  ) => void
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
    props.repository,
    props.dispatcher,
    props.status,
    props.ourBranch,
    props.theirBranch,
    props.setIsFileResolutionOptionsMenuOpen
  )

  const content = (
    <>
      <div className="column-left">
        <PathText path={props.path} />
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
          ariaLabel="File resolution options"
          ariaHaspopup="menu"
          ariaExpanded={props.isFileResolutionOptionsMenuOpen}
        >
          <Octicon symbol={octicons.triangleDown} />
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
  ourBranch?: string,
  theirBranch?: string
) => {
  return () => {
    showContextualMenu(
      getManualResolutionMenuItems(
        relativeFilePath,
        repository,
        dispatcher,
        status,
        ourBranch,
        theirBranch
      )
    )
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
  repository: Repository,
  dispatcher: Dispatcher,
  status: ConflictsWithMarkers,
  ourBranch: string | undefined,
  theirBranch: string | undefined,
  setIsFileResolutionOptionsMenuOpen: (
    isFileResolutionOptionsMenuOpen: boolean
  ) => void
) => {
  return () => {
    const absoluteFilePath = join(repository.path, relativeFilePath)
    const items: IMenuItem[] = [
      {
        label: OpenWithDefaultProgramLabel,
        action: () => openFile(absoluteFilePath, dispatcher),
      },
      {
        label: RevealInFileManagerLabel,
        action: () => revealInFileManager(repository, relativeFilePath),
      },
      {
        type: 'separator',
      },
      ...getManualResolutionMenuItems(
        relativeFilePath,
        repository,
        dispatcher,
        status,
        ourBranch,
        theirBranch
      ),
    ]
    setIsFileResolutionOptionsMenuOpen(true)
    showContextualMenu(items).then(() => {
      setIsFileResolutionOptionsMenuOpen(false)
    })
  }
}

function getManualResolutionMenuItems(
  relativeFilePath: string,
  repository: Repository,
  dispatcher: Dispatcher,
  status: ConflictedFileStatus,
  ourBranch?: string,
  theirBranch?: string
): ReadonlyArray<IMenuItem> {
  return [
    {
      label: getLabelForManualResolutionOption(status.entry.us, ourBranch),
      action: () =>
        dispatcher.updateManualConflictResolution(
          repository,
          relativeFilePath,
          ManualConflictResolution.ours
        ),
    },

    {
      label: getLabelForManualResolutionOption(status.entry.them, theirBranch),
      action: () =>
        dispatcher.updateManualConflictResolution(
          repository,
          relativeFilePath,
          ManualConflictResolution.theirs
        ),
    },
  ]
}

function resolvedFileStatusString(
  status: ConflictedFileStatus,
  manualResolution?: ManualConflictResolution,
  branch?: string
): string {
  if (manualResolution === ManualConflictResolution.ours) {
    return getUnmergedStatusEntryDescription(status.entry.us, branch)
  }
  if (manualResolution === ManualConflictResolution.theirs) {
    return getUnmergedStatusEntryDescription(status.entry.them, branch)
  }
  return defaultConflictsResolvedMessage
}

const getResolvedFileStatusSummary = (
  status: ConflictedFileStatus,
  manualResolution?: ManualConflictResolution,
  branch?: string
) => {
  const noConflictMarkers =
    isConflictWithMarkers(status) && status.conflictMarkerCount === 0

  return noConflictMarkers
    ? defaultConflictsResolvedMessage
    : resolvedFileStatusString(status, manualResolution, branch)
}

/** returns the name of the branch that corresponds to the chosen manual resolution */
function getBranchForResolution(
  manualResolution: ManualConflictResolution | undefined,
  ourBranch?: string,
  theirBranch?: string
): string | undefined {
  if (manualResolution === ManualConflictResolution.ours) {
    return ourBranch
  }
  if (manualResolution === ManualConflictResolution.theirs) {
    return theirBranch
  }
  return undefined
}

/**
 * Calculates the number of merge conflicts in a file from the number of markers
 * divides by three and rounds up since each conflict is indicated by three separate markers
 * (`<<<<<`, `>>>>>`, and `=====`)
 *
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
