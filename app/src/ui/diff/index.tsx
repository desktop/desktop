import * as React from 'react'

import { NewImageDiff } from './new-image-diff'
import { ModifiedImageDiff } from './modified-image-diff'
import { DeletedImageDiff } from './deleted-image-diff'
import { BinaryFile } from './binary-file'
import { SubmoduleDiff } from './submodule-diff'
import { TextDiff } from './text/index'

import { Repository } from '../../models/repository'

import { FileChange, FileStatus } from '../../models/status'
import { DiffSelection, IDiff, IImageDiff, ITextDiff, ISubmoduleDiff } from '../../models/diff'
import { Dispatcher } from '../../lib/dispatcher/dispatcher'

if (__DARWIN__) {
  // This has to be required to support the `simple` scrollbar style.
  require('codemirror/addon/scroll/simplescrollbars')
}

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
  readonly file: FileChange

  /** Called when the includedness of lines or hunks has changed. */
  readonly onIncludeChanged?: (diffSelection: DiffSelection) => void

  /** The diff that should be rendered */
  readonly diff: IDiff

  /** propagate errors up to the main application */
  readonly dispatcher: Dispatcher
}

/** A component which renders a diff for a file. */
export class Diff extends React.Component<IDiffProps, void> {

  private renderImage(imageDiff: IImageDiff) {
    if (imageDiff.current && imageDiff.previous) {
      return <ModifiedImageDiff
                current={imageDiff.current}
                previous={imageDiff.previous} />
    }

    if (imageDiff.current && this.props.file.status === FileStatus.New) {
      return <NewImageDiff current={imageDiff.current} />
    }

    if (imageDiff.previous && this.props.file.status === FileStatus.Deleted) {
      return <DeletedImageDiff previous={imageDiff.previous} />
    }

    return null
  }

  private renderBinaryFile() {
    return <BinaryFile path={this.props.file.path}
                    repository={this.props.repository}
                    dispatcher={this.props.dispatcher} />
  }

  private renderSubmoduleDiff(diff: ISubmoduleDiff) {
    return <SubmoduleDiff name={diff.name}
                          type={diff.type}
                          from={diff.from}
                          to={diff.to}
                          changes={diff.changes}  />
  }

  private renderTextDiff(diff: ITextDiff) {
    return <TextDiff diff={diff}
                     file={this.props.file}
                     readOnly={this.props.readOnly}
                     onIncludeChanged={this.props.onIncludeChanged} />
  }

  public render() {
    const diff = this.props.diff

    if (diff.kind === 'image') {
      return this.renderImage(diff)
    }

    if (diff.kind === 'binary') {
      return this.renderBinaryFile()
    }

    if (diff.kind === 'text') {
      return this.renderTextDiff(diff)
    }

    if (diff.kind === 'submodule') {
      return this.renderSubmoduleDiff(diff)
    }

    return null
  }
}
