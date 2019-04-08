import * as React from 'react'
import { IStashEntry } from '../../lib/git/stash'
import { FileList } from '../history/file-list'
import { Dispatcher } from '../dispatcher'
import { FileChange, CommittedFileChange } from '../../models/status'
import { Repository } from '../../models/repository'
import { openFile } from '../lib/open-file'
import { join } from 'path'
import { Diff } from '../diff'
import { IDiff, ImageDiffType } from '../../models/diff'

export const renderStashDiff: React.SFC<{
  stashEntry: IStashEntry
  selectedStashedFile: CommittedFileChange | null
  stashedFileDiff: IDiff | null
  imageDiffType: ImageDiffType
  availableWidth: number
  externalEditorLabel?: string
  onOpenInExternalEditor: (path: string) => void
  repository: Repository
  dispatcher: Dispatcher
}> = props => {
  const placeholderFn = (file: FileChange) => {
    props.dispatcher.changeStashedFileSelection(
      props.repository,
      file as CommittedFileChange
    )
  }
  const files = Array.isArray(props.stashEntry.files)
    ? props.stashEntry.files
    : new Array<FileChange>()
  return (
    <section id="stash-diff-viewer">
      <FileList
        files={files}
        onSelectedFileChanged={placeholderFn}
        selectedFile={props.selectedStashedFile}
        availableWidth={props.availableWidth}
        onOpenItem={makeOnOpenItem(props.repository, props.dispatcher)}
        externalEditorLabel={props.externalEditorLabel}
        onOpenInExternalEditor={props.onOpenInExternalEditor}
        repository={props.repository}
      />
      {props.selectedStashedFile && props.stashedFileDiff && (
        <Diff
          repository={props.repository}
          readOnly={true}
          file={props.selectedStashedFile}
          diff={props.stashedFileDiff}
          dispatcher={props.dispatcher}
          imageDiffType={props.imageDiffType}
        />
      )}
    </section>
  )
}

const makeOnOpenItem = (repository: Repository, dispatcher: Dispatcher) => {
  return (path: string) => openFile(join(repository.path, path), dispatcher)
}
