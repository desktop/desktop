import * as React from 'react'
import { IStashEntry } from '../../lib/git/stash'
import { FileList } from '../history/file-list'
import { Dispatcher } from '../dispatcher'
import { FileChange } from '../../models/status'
import { Repository } from '../../models/repository'
import { openFile } from '../lib/open-file'
import { join } from 'path'

export const renderStashDiff: React.SFC<{
  stashEntry: IStashEntry
  availableWidth: number
  externalEditorLabel?: string
  onOpenInExternalEditor: (path: string) => void
  repository: Repository
  dispatcher: Dispatcher
}> = props => {
  const placeholderFn = () => {
    console.log('hi')
  }
  const files = Array.isArray(props.stashEntry.files)
    ? props.stashEntry.files
    : new Array<FileChange>()
  return (
    <section id="stash-diff-viewer">
      <FileList
        files={files}
        onSelectedFileChanged={placeholderFn}
        selectedFile={null}
        availableWidth={props.availableWidth}
        onOpenItem={makeOnOpenItem(props.repository, props.dispatcher)}
        externalEditorLabel={props.externalEditorLabel}
        onOpenInExternalEditor={props.onOpenInExternalEditor}
        repository={props.repository}
      />
      {/* <Diff
        repository={props.repository}
        readOnly={true}
        file={props.files[0]}
        diff={props.diff}
        dispatcher={props.dispatcher}
        imageDiffType={ImageDiffType.OnionSkin}
      /> */}
    </section>
  )
}

const makeOnOpenItem = (
  repository: Repository,
  dispatcher: Dispatcher
): (path: string) => void => {
  return (path: string) => openFile(join(repository.path, path), dispatcher)
}
