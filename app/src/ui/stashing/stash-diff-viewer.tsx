import * as React from 'react'
import { IStashEntry, StashedChangesLoadStates } from '../../models/stash-entry'
import { FileList } from '../history/file-list'
import { Dispatcher } from '../dispatcher'
import { CommittedFileChange } from '../../models/status'
import { Repository } from '../../models/repository'
import { Diff } from '../diff'
import { IDiff, ImageDiffType } from '../../models/diff'
import { Resizable } from '../resizable'
import { StashDiffHeader } from './stash-diff-header'

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
        <StashDiffHeader
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
