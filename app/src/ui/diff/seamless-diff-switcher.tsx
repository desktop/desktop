import * as React from 'react'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'

import { Diff } from './index'
import {
  WorkingDirectoryFileChange,
  CommittedFileChange,
} from '../../models/status'
import { DiffSelection, IDiff, ImageDiffType } from '../../models/diff'

type ChangedFile = WorkingDirectoryFileChange | CommittedFileChange

/** The props for the Diff component. */
interface ISeamlessDiffSwitcherProps {
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
  readonly diff: IDiff | null

  /** propagate errors up to the main application */
  readonly dispatcher: Dispatcher

  /** The type of image diff to display. */
  readonly imageDiffType: ImageDiffType

  /** Hiding whitespace in diff. */
  readonly hideWhitespaceInDiff: boolean
}

interface ISeamlessDiffSwitcherState {
  readonly isLoadingDiff: boolean
  readonly diff: IDiff | null
  readonly file: ChangedFile
}

/** represents the default view for a file that we cannot render a diff for */
export class SeamlessDiffSwitcher extends React.Component<
  ISeamlessDiffSwitcherProps,
  ISeamlessDiffSwitcherState
> {
  public static getDerivedStateFromProps(
    props: ISeamlessDiffSwitcherProps,
    state: ISeamlessDiffSwitcherState
  ): Partial<ISeamlessDiffSwitcherState> {
    const isLoadingDiff = props.diff === null
    return {
      file: isLoadingDiff ? state.file : props.file,
      diff: isLoadingDiff ? state.diff : props.diff,
      isLoadingDiff,
    }
  }

  public constructor(props: ISeamlessDiffSwitcherProps) {
    super(props)

    this.state = {
      isLoadingDiff: props.diff === null,
      diff: props.diff,
      file: props.file,
    }
  }

  private noop = () => {}

  public render() {
    const { isLoadingDiff, diff, file } = this.state

    if (diff === null) {
      return null
    }

    return (
      <Diff
        repository={this.props.repository}
        imageDiffType={this.props.imageDiffType}
        file={file}
        diff={diff}
        readOnly={this.props.readOnly}
        dispatcher={this.props.dispatcher}
        hideWhitespaceInDiff={this.props.hideWhitespaceInDiff}
        onIncludeChanged={
          isLoadingDiff ? this.noop : this.props.onIncludeChanged
        }
      />
    )
  }
}
