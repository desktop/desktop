import * as React from 'react'
import { Editor } from 'codemirror'

import { assertNever } from '../../lib/fatal-error'
import { encodePathAsUrl } from '../../lib/path'

import { Dispatcher } from '../../lib/dispatcher/dispatcher'

import { Repository } from '../../models/repository'
import {
  CommittedFileChange,
  WorkingDirectoryFileChange,
  AppFileStatusKind,
} from '../../models/status'
import {
  DiffSelection,
  DiffType,
  IDiff,
  IImageDiff,
  ITextDiff,
  ILargeTextDiff,
  ImageDiffType,
} from '../../models/diff'

import { Button } from '../lib/button'

import {
  NewImageDiff,
  ModifiedImageDiff,
  DeletedImageDiff,
} from './image-diffs'
import { BinaryFile } from './binary-file'
import { diffLineForIndex } from './diff-explorer'
import { DiffLineGutter } from './diff-line-gutter'
import { DiffSyntaxMode } from './diff-syntax-mode'

import { ISelectionStrategy } from './selection/selection-strategy'
import { TextDiff } from './text-diff'

// image used when no diff is displayed
const NoDiffImage = encodePathAsUrl(__dirname, 'static/ufo-alert.svg')

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

interface IDiffState {
  readonly forceShowLargeDiff: boolean
}

/** A component which renders a diff for a file. */
export class Diff extends React.Component<IDiffProps, IDiffState> {
  private codeMirror: Editor | null = null

  /**
   * Maintain the current state of the user interacting with the diff gutter
   */
  private selection: ISelectionStrategy | null = null

  /**
   *  a local cache of gutter elements, keyed by the row in the diff
   */
  private cachedGutterElements = new Map<number, DiffLineGutter>()

  public constructor(props: IDiffProps) {
    super(props)

    this.state = {
      forceShowLargeDiff: false,
    }
  }

  public componentWillReceiveProps(nextProps: IDiffProps) {
    const codeMirror = this.codeMirror

    if (
      codeMirror &&
      nextProps.diff.kind === DiffType.Text &&
      (this.props.diff.kind !== DiffType.Text ||
        this.props.diff.text !== nextProps.diff.text)
    ) {
      codeMirror.setOption('mode', { name: DiffSyntaxMode.ModeName })
    }

    // HACK: This entire section is a hack. Whenever we receive
    // props we update all currently visible gutter elements with
    // the selection state from the file.
    if (nextProps.file instanceof WorkingDirectoryFileChange) {
      const selection = nextProps.file.selection
      const oldSelection =
        this.props.file instanceof WorkingDirectoryFileChange
          ? this.props.file.selection
          : null

      // Nothing has changed
      if (oldSelection === selection) {
        return
      }

      const diff = nextProps.diff
      this.cachedGutterElements.forEach((element, index) => {
        if (!element) {
          console.error('expected DOM element for diff gutter not found')
          return
        }

        if (diff.kind === DiffType.Text) {
          const line = diffLineForIndex(diff.hunks, index)
          const isIncludable = line ? line.isIncludeableLine() : false
          const isSelected = selection.isSelected(index) && isIncludable
          element.setSelected(isSelected)
        }
      })
    }
  }

  public render() {
    const diff = this.props.diff

    switch (diff.kind) {
      case DiffType.Text:
        return this.renderText(diff)
      case DiffType.Binary:
        return this.renderBinaryFile()
      case DiffType.Image:
        return this.renderImage(diff)
      case DiffType.LargeText: {
        return this.state.forceShowLargeDiff
          ? this.renderLargeText(diff)
          : this.renderLargeTextDiff()
      }
      case DiffType.Unrenderable:
        return this.renderUnrenderableDiff()
      default:
        return assertNever(diff, `Unsupported diff type: ${diff}`)
    }
  }

  /**
   * Helper event listener, registered when starting a selection by
   * clicking anywhere on or near the gutter. Immediately removes itself
   * from the mouseup event on the document element and ends any current
   * selection.
   *
   * TODO: Once Electron upgrades to Chrome 55 we can drop this in favor
   * of the 'once' option in addEventListener, see
   * https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener
   */
  private onDocumentMouseUp = (ev: MouseEvent) => {
    ev.preventDefault()
    document.removeEventListener('mouseup', this.onDocumentMouseUp)
    this.endSelection()
  }

  /**
   * complete the selection gesture and apply the change to the diff
   */
  private endSelection = () => {
    if (!this.props.onIncludeChanged || !this.selection) {
      return
    }

    this.props.onIncludeChanged(this.selection.done())

    // operation is completed, clean this up
    this.selection = null
  }

  private onChangeImageDiffType = (type: ImageDiffType) => {
    this.props.dispatcher.changeImageDiffType(type)
  }

  private renderImage(imageDiff: IImageDiff) {
    if (imageDiff.current && imageDiff.previous) {
      return (
        <ModifiedImageDiff
          onChangeDiffType={this.onChangeImageDiffType}
          diffType={this.props.imageDiffType}
          current={imageDiff.current}
          previous={imageDiff.previous}
        />
      )
    }

    if (
      imageDiff.current &&
      (this.props.file.status.kind === AppFileStatusKind.New ||
        this.props.file.status.kind === AppFileStatusKind.Untracked)
    ) {
      return <NewImageDiff current={imageDiff.current} />
    }

    if (
      imageDiff.previous &&
      this.props.file.status.kind === AppFileStatusKind.Deleted
    ) {
      return <DeletedImageDiff previous={imageDiff.previous} />
    }

    return null
  }

  private renderLargeTextDiff() {
    return (
      <div className="panel empty large-diff">
        <img src={NoDiffImage} className="blankslate-image" />
        <p>
          The diff is too large to be displayed by default.
          <br />
          You can try to show it anyways, but performance may be negatively
          impacted.
        </p>
        <Button onClick={this.showLargeDiff}>
          {__DARWIN__ ? 'Show Diff' : 'Show diff'}
        </Button>
      </div>
    )
  }

  private renderUnrenderableDiff() {
    return (
      <div className="panel empty large-diff">
        <img src={NoDiffImage} />
        <p>The diff is too large to be displayed.</p>
      </div>
    )
  }

  private renderLargeText(diff: ILargeTextDiff) {
    // guaranteed to be set since this function won't be called if text or hunks are null
    const textDiff: ITextDiff = {
      text: diff.text,
      hunks: diff.hunks,
      kind: DiffType.Text,
      lineEndingsChange: diff.lineEndingsChange,
    }

    return this.renderTextDiff(textDiff)
  }

  private renderText(diff: ITextDiff) {
    if (diff.hunks.length === 0) {
      if (
        this.props.file.status.kind === AppFileStatusKind.New ||
        this.props.file.status.kind === AppFileStatusKind.Untracked
      ) {
        return <div className="panel empty">The file is empty</div>
      }

      if (this.props.file.status.kind === AppFileStatusKind.Renamed) {
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
        file={this.props.file}
        readOnly={this.props.readOnly}
        onIncludeChanged={this.props.onIncludeChanged}
        text={diff.text}
        hunks={diff.hunks}
      />
    )
  }

  private showLargeDiff = () => {
    this.setState({ forceShowLargeDiff: true })
  }
}
