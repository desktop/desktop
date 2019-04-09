/* tslint:disable:button-group-order */

import * as React from 'react'
import { IStashEntry } from '../../models/stash-entry'
import { FileList } from '../history/file-list'
import { Dispatcher } from '../dispatcher'
import { FileChange, CommittedFileChange } from '../../models/status'
import { Repository } from '../../models/repository'
import { openFile } from '../lib/open-file'
import { join } from 'path'
import { Diff } from '../diff'
import { IDiff, ImageDiffType } from '../../models/diff'
import { Resizable } from '../resizable'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'

export const StashDiffViewer: React.SFC<{
  stashEntry: IStashEntry
  selectedStashedFile: CommittedFileChange | null
  stashedFileDiff: IDiff | null
  imageDiffType: ImageDiffType
  width: number
  externalEditorLabel?: string
  onOpenInExternalEditor: (path: string) => void
  repository: Repository
  dispatcher: Dispatcher
}> = props => {
  const files = Array.isArray(props.stashEntry.files)
    ? props.stashEntry.files
    : new Array<FileChange>()

  const diffComponent =
    props.selectedStashedFile && props.stashedFileDiff ? (
      <Diff
        repository={props.repository}
        readOnly={true}
        file={props.selectedStashedFile}
        diff={props.stashedFileDiff}
        dispatcher={props.dispatcher}
        imageDiffType={props.imageDiffType}
      />
    ) : null

  return (
    <section id="stash-diff-viewer">
      <Header
        stashEntry={props.stashEntry}
        repository={props.repository}
        dispatcher={props.dispatcher}
      />
      <Resizable
        width={props.width}
        maximumWidth={500}
        onResize={props.dispatcher.setStashedFilesWidth}
        onReset={props.dispatcher.resetStashedFilesWidth}
      >
        <FileList
          files={files}
          onSelectedFileChanged={makeHandleSelectedFileChanged(
            props.repository,
            props.dispatcher
          )}
          selectedFile={props.selectedStashedFile}
          availableWidth={props.width}
          onOpenItem={makeOnOpenItem(props.repository, props.dispatcher)}
          externalEditorLabel={props.externalEditorLabel}
          onOpenInExternalEditor={props.onOpenInExternalEditor}
          repository={props.repository}
        />
      </Resizable>
      {diffComponent}
    </section>
  )
}

const makeHandleSelectedFileChanged = (
  repository: Repository,
  dispatcher: Dispatcher
) => {
  return (file: FileChange) =>
    dispatcher.changeStashedFileSelection(
      repository,
      file as CommittedFileChange
    )
}

const makeOnOpenItem = (repository: Repository, dispatcher: Dispatcher) => {
  return (path: string) => openFile(join(repository.path, path), dispatcher)
}

const Header: React.SFC<{
  stashEntry: IStashEntry
  repository: Repository
  dispatcher: Dispatcher
}> = () => {
  return (
    <header>
      <h1>Stashed changes</h1>
      <ButtonGroup>
        <Button>Clear</Button>
        <Button type="submit">Restore</Button>
      </ButtonGroup>
    </header>
  )
}
