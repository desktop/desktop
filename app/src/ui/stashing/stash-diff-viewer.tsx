/* tslint:disable:button-group-order */

import * as React from 'react'
import { IStashEntry, StashedChangesLoadStates } from '../../models/stash-entry'
import { FileList } from '../history/file-list'
import { Dispatcher } from '../dispatcher'
import { CommittedFileChange } from '../../models/status'
import { Repository } from '../../models/repository'
import { openFile } from '../lib/open-file'
import { join } from 'path'
import { Diff } from '../diff'
import { IDiff, ImageDiffType } from '../../models/diff'
import { Resizable } from '../resizable'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'

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
  readonly externalEditorLabel?: string
  readonly onOpenInExternalEditor: (path: string) => void
  readonly repository: Repository
  readonly dispatcher: Dispatcher
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

  private onOpenItem = (path: string) =>
    openFile(join(this.props.repository.path, path), this.props.dispatcher)

  private onResize = (width: number) =>
    this.props.dispatcher.setStashedFilesWidth(width)

  private onReset = () => this.props.dispatcher.resetStashedFilesWidth()

  public render() {
    const files =
      this.props.stashEntry.files.kind === StashedChangesLoadStates.Loaded
        ? this.props.stashEntry.files.files
        : new Array<CommittedFileChange>()

    const diffComponent =
      this.props.selectedStashedFile !== null &&
      this.props.stashedFileDiff !== null ? (
        <Diff
          repository={this.props.repository}
          readOnly={true}
          file={this.props.selectedStashedFile}
          diff={this.props.stashedFileDiff}
          dispatcher={this.props.dispatcher}
          imageDiffType={this.props.imageDiffType}
        />
      ) : null

    return (
      <section id="stash-diff-viewer">
        <Header
          stashEntry={this.props.stashEntry}
          repository={this.props.repository}
          dispatcher={this.props.dispatcher}
        />
        <div className="content">
          <Resizable
            width={this.props.fileListWidth}
            onResize={this.onResize}
            onReset={this.onReset}
          >
            <FileList
              files={files}
              onSelectedFileChanged={this.onSelectedFileChanged}
              selectedFile={this.props.selectedStashedFile}
              availableWidth={this.props.fileListWidth}
              onOpenItem={this.onOpenItem}
              externalEditorLabel={this.props.externalEditorLabel}
              onOpenInExternalEditor={this.props.onOpenInExternalEditor}
              repository={this.props.repository}
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
}> = props => {
  const onClearClick = () => {
    props.dispatcher.dropStash(props.repository, props.stashEntry)
  }
  const onSubmitClick = () => {
    props.dispatcher.popStash(props.repository, props.stashEntry)
  }
  return (
    <div className="header">
      <h3>Stashed changes</h3>
      <ButtonGroup>
        <Button onClick={onClearClick}>Clear</Button>
        <Button onClick={onSubmitClick} type="submit">
          Restore
        </Button>
      </ButtonGroup>
    </div>
  )
}
