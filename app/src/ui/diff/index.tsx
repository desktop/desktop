import * as React from 'react'
import { ImageDiff } from './image-diffs'
import { BinaryFile } from './binary-file'
import { TextDiff } from './text-diff'

import { Repository } from '../../models/repository'
import { encodePathAsUrl } from '../../lib/path'
import { ImageDiffType } from '../../lib/app-state'
import {
  CommittedFileChange,
  WorkingDirectoryFileChange,
  AppFileStatus,
} from '../../models/status'
import {
  DiffSelection,
  DiffType,
  IDiff,
  IVisualTextDiffData,
  ITextDiff,
} from '../../models/diff'
import { Dispatcher } from '../../lib/dispatcher/dispatcher'

type ChangedFile = WorkingDirectoryFileChange | CommittedFileChange

/** The props for the Diff component. */
interface IDiffProps {
  readonly repository: Repository

  /**
   * Whether the diff is readonly, e.g., displaying a historical diff, or the
   * diff's lines can be selected, e.g., displaying a change in the working
   * directory.
   */
  readonly readOnly: boolean

  /** The file whose diff should be displayed. */
  readonly file: ChangedFile

  /** Called when the includedness of lines or a range of lines has changed. */
  readonly onIncludeChanged?: (diffSelection: DiffSelection) => void

  /** The diff that should be rendered */
  readonly diff: IDiff

  /** propagate errors up to the main application */
  readonly dispatcher: Dispatcher

  /** The type of image diff to display. */
  readonly imageDiffType: ImageDiffType
}

/** A component which renders a diff for a file. */
export class Diff extends React.Component<IDiffProps, {}> {
  private onChangeImageDiffType = (type: ImageDiffType) => {
    this.props.dispatcher.changeImageDiffType(type)
  }

  private renderImage(diff: IVisualTextDiffData) {
    return (
      <ImageDiff
        repository={this.props.repository}
        readOnly={this.props.readOnly}
        file={this.props.file}
        current={diff.current!}
        previous={diff.previous!}
        text={diff.text}
        hunks={diff.hunks}
        onIncludeChanged={this.props.onIncludeChanged}
        onChangeImageDiffType={this.onChangeImageDiffType}
        imageDiffType={this.props.imageDiffType}
      />
    )
  }

  private renderBinaryFile() {
    return (
      <BinaryFile
        path={this.props.file.path}
        repository={this.props.repository}
        dispatcher={this.props.dispatcher}
      />
    )
  }

  private renderTextDiff(diff: ITextDiff) {
    return (
      <TextDiff
        repository={this.props.repository}
        readOnly={this.props.readOnly}
        file={this.props.file}
        text={diff.text}
        hunks={diff.hunks}
        onIncludeChanged={this.props.onIncludeChanged}
      />
    )
  }

  public render() {
    const diff = this.props.diff

    if (diff.kind === DiffType.Image || diff.kind === DiffType.VisualText) {
      return this.renderImage(diff)
    }

    if (diff.kind === DiffType.Binary) {
      return this.renderBinaryFile()
    }

    if (diff.kind === DiffType.TooLarge) {
      const BlankSlateImage = encodePathAsUrl(
        __dirname,
        'static/empty-no-file-selected.svg'
      )
      const diffSizeMB = Math.round(diff.length / (1024 * 1024))
      return (
        <div className="panel empty">
          <img src={BlankSlateImage} className="blankslate-image" />
          The diff returned by Git is {diffSizeMB}MB ({diff.length} bytes),
          which is larger than what can be displayed in GitHub Desktop.
        </div>
      )
    }

    if (diff.kind === DiffType.Text) {
      if (diff.hunks.length === 0) {
        if (this.props.file.status === AppFileStatus.New) {
          return <div className="panel empty">The file is empty</div>
        }

        if (this.props.file.status === AppFileStatus.Renamed) {
          return (
            <div className="panel renamed">
              The file was renamed but not changed
            </div>
          )
        }

        return <div className="panel empty">No content changes found</div>
      }

      return this.renderTextDiff(diff)
    }

    return null
  }
}
