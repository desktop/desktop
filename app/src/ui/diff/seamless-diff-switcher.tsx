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
  readonly props: ISeamlessDiffSwitcherProps
}

function noop() {}

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
      props: isLoadingDiff ? state.props : props,
      isLoadingDiff,
    }
  }

  public constructor(props: ISeamlessDiffSwitcherProps) {
    super(props)

    this.state = {
      isLoadingDiff: props.diff === null,
      props: props,
    }
  }

  public render() {
    const { isLoadingDiff } = this.state
    const {
      repository,
      imageDiffType,
      readOnly,
      dispatcher,
      hideWhitespaceInDiff,
      onIncludeChanged,
      diff,
      file,
    } = this.state.props

    if (diff === null) {
      return null
    }

    return (
      <Diff
        repository={repository}
        imageDiffType={imageDiffType}
        file={file}
        diff={diff}
        readOnly={readOnly}
        dispatcher={dispatcher}
        hideWhitespaceInDiff={hideWhitespaceInDiff}
        onIncludeChanged={isLoadingDiff ? noop : onIncludeChanged}
      />
    )
  }
}
