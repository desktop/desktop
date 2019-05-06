import * as React from 'react'
import { IStashEntry, StashedChangesLoadStates } from '../../models/stash-entry'
import { FileList } from '../history/file-list'
import { Dispatcher } from '../dispatcher'
import { CommittedFileChange } from '../../models/status'
import { Repository } from '../../models/repository'
import { Diff } from '../diff'
import { IDiff, ImageDiffType } from '../../models/diff'
import { Resizable } from '../resizable'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { PopupType } from '../../models/popup'
import { Octicon, OcticonSymbol } from '../octicons'

interface IStashDiffViewerProps {
  /** The stash in question. */
  readonly stashEntry: IStashEntry

  /** Currently selected file in the list */
  readonly selectedStashedFile: CommittedFileChange | null

  /** Diff to be displayed */
  readonly stashedFileDiff: IDiff | null
  readonly imageDiffType: ImageDiffType

  /** width to use for the files list pane */
  readonly fileListWidth: number
  readonly repository: Repository
  readonly dispatcher: Dispatcher

  /** Are there any uncommitted changes */
  readonly isWorkingTreeClean: boolean
}

/**
 * Component to display a selected stash's file list and diffs
 *
 * _(Like viewing a selected commit in history but for a stash)_
 */
export class StashDiffViewer extends React.PureComponent<
  IStashDiffViewerProps
> {
  private onSelectedFileChanged = (file: CommittedFileChange) =>
    this.props.dispatcher.selectStashedFile(this.props.repository, file)

  private onResize = (width: number) =>
    this.props.dispatcher.setStashedFilesWidth(width)

  private onReset = () => this.props.dispatcher.resetStashedFilesWidth()

  public render() {
    const {
      stashEntry,
      selectedStashedFile,
      stashedFileDiff,
      repository,
      dispatcher,
      imageDiffType,
      isWorkingTreeClean,
      fileListWidth,
    } = this.props
    const files =
      stashEntry.files.kind === StashedChangesLoadStates.Loaded
        ? stashEntry.files.files
        : new Array<CommittedFileChange>()

    const diffComponent =
      selectedStashedFile !== null && stashedFileDiff !== null ? (
        <Diff
          repository={repository}
          readOnly={true}
          file={selectedStashedFile}
          diff={stashedFileDiff}
          dispatcher={dispatcher}
          imageDiffType={imageDiffType}
        />
      ) : null

    return (
      <section id="stash-diff-viewer">
        <Header
          stashEntry={stashEntry}
          repository={repository}
          dispatcher={dispatcher}
          isWorkingTreeClean={isWorkingTreeClean}
        />
        <div className="commit-details">
          <Resizable
            width={this.props.fileListWidth}
            onResize={this.onResize}
            onReset={this.onReset}
          >
            <FileList
              files={files}
              onSelectedFileChanged={this.onSelectedFileChanged}
              selectedFile={selectedStashedFile}
              availableWidth={fileListWidth}
            />
          </Resizable>
          {diffComponent}
        </div>
      </section>
    )
  }
}

const Header: React.SFC<{
  stashEntry: IStashEntry
  repository: Repository
  dispatcher: Dispatcher
  isWorkingTreeClean: boolean
}> = props => {
  const { dispatcher, repository, stashEntry, isWorkingTreeClean } = props

  const onDiscardClick = () => {
    props.dispatcher.showPopup({
      type: PopupType.ConfirmDiscardStash,
      repository: props.repository,
      stash: props.stashEntry,
    })
  }
  const onRestoreClick = () => {
    dispatcher.popStash(repository, stashEntry)
  }

  const restoreMessage = isWorkingTreeClean ? (
    <span className="text">
      <strong>Restore</strong> will move your stashed files to the Changes list.
    </span>
  ) : (
    <>
      <Octicon symbol={OcticonSymbol.alert} />
      <span className="text">
        Unable to restore stash when changes are present on your branch.
      </span>
    </>
  )

  // we pass `false` to `ButtonGroup` below because it assumes
  // the "submit" button performs the destructive action.
  // In this case the destructive action is performed by the
  // non-submit button so we _lie_ to the props to get
  // the correct button ordering
  return (
    <div className="header">
      <h3>Stashed changes</h3>
      <div className="row">
        <ButtonGroup destructive={false}>
          <Button
            disabled={!isWorkingTreeClean}
            onClick={onRestoreClick}
            type="submit"
          >
            Restore
          </Button>
          <Button onClick={onDiscardClick}>Discard</Button>
        </ButtonGroup>
        <div className="explanatory-text">{restoreMessage}</div>
      </div>
    </div>
  )
}
