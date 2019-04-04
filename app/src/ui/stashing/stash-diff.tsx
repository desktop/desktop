import * as React from 'react'
import { IStashEntry } from '../../lib/git/stash'
import { Diff } from '../diff'
import { ImageDiffType } from '../../models/diff'
import { FileList } from '../history/file-list'
import { UiView } from '../ui-view'
import { Dispatcher } from '../dispatcher'
import { FileChange } from '../../models/status'
import { Repository } from '../../models/repository'
import { openFile } from '../lib/open-file'
import { join } from 'path'

export const renderStashDiff: React.SFC<{
  stashEntry: IStashEntry
  files: ReadonlyArray<FileChange>
  availableWidth: number
  onOpenItem: (path: string) => void
  externalEditorLabel?: string
  onOpenInExternalEditor: (path: string) => void
  repository: Repository
  dispatcher: Dispatcher
}> = props => {
  return (
    <UiView id="repository" onKeyDown={this.onKeyDown}>
      <FileList
        files={props.files}
        onSelectedFileChanged={() => {}}
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
    </UiView>
  )
}

const makeOnOpenItem = (
  repository: Repository,
  dispatcher: Dispatcher
): (path: string) => void => {
  return (path: string) => openFile(join(repository.path, path), dispatcher)
}
