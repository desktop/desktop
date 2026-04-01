import * as React from 'react'
import { DiffHeader } from '../diff/diff-header'
import {
  DiffSelection,
  DiffType,
  IDiff,
  ImageDiffType,
  ITextDiff,
} from '../../models/diff'
import { WorkingDirectoryFileChange } from '../../models/status'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { SeamlessDiffSwitcher } from '../diff/seamless-diff-switcher'
import { PopupType } from '../../models/popup'
import { clamp } from '../../lib/clamp'
import { Emoji } from '../../lib/emoji'
import { isMarkdownPreviewablePath } from '../../lib/is-markdown-preview-path'
import { Resizable } from '../resizable/resizable'
import { ChangesMarkdownPreview } from './changes-markdown-preview'

const MarkdownPreviewMinPaneWidthPx = 200
const MarkdownPreviewDefaultDiffPaneWidthPx = 400

interface IChangesProps {
  readonly repository: Repository
  readonly file: WorkingDirectoryFileChange
  readonly diff: IDiff | null
  readonly dispatcher: Dispatcher
  readonly imageDiffType: ImageDiffType

  /** Whether a commit is in progress */
  readonly isCommitting: boolean
  readonly hideWhitespaceInDiff: boolean

  /**
   * Called when the user requests to open a binary file in an the
   * system-assigned application for said file type.
   */
  readonly onOpenBinaryFile: (fullPath: string) => void

  /** Called when the user requests to open a submodule. */
  readonly onOpenSubmodule: (fullPath: string) => void

  /**
   * Called when the user is viewing an image diff and requests
   * to change the diff presentation mode.
   */
  readonly onChangeImageDiffType: (type: ImageDiffType) => void

  /**
   * Whether we should show a confirmation dialog when the user
   * discards changes
   */
  readonly askForConfirmationOnDiscardChanges: boolean

  /**
   * Whether we should display side by side diffs.
   */
  readonly showSideBySideDiff: boolean

  /** Whether or not to show the diff check marks indicating inclusion in a commit */
  readonly showDiffCheckMarks: boolean

  /** Called when the user opens the diff options popover */
  readonly onDiffOptionsOpened: () => void

  /** Emoji shortcodes for `SandboxedMarkdown` in the preview pane. */
  readonly emoji: Map<string, Emoji>

  /** Underline links in rendered Markdown (matches Preferences → Accessibility). */
  readonly underlineLinks: boolean
}

interface IChangesState {
  readonly markdownPreviewVisible: boolean
  readonly markdownDiffPaneWidth: number
}

export class Changes extends React.Component<IChangesProps, IChangesState> {
  private splitContainerRef = React.createRef<HTMLDivElement>()
  private markdownSplitInitialWidthApplied = false

  public constructor(props: IChangesProps) {
    super(props)
    this.state = {
      markdownPreviewVisible: false,
      markdownDiffPaneWidth: MarkdownPreviewDefaultDiffPaneWidthPx,
    }
  }

  public componentDidUpdate(
    prevProps: IChangesProps,
    prevState: IChangesState
  ) {
    if (
      prevProps.file.path !== this.props.file.path ||
      prevProps.file.id !== this.props.file.id
    ) {
      this.setState({ markdownPreviewVisible: false })
      this.markdownSplitInitialWidthApplied = false
    }

    if (
      !prevState.markdownPreviewVisible &&
      this.state.markdownPreviewVisible
    ) {
      this.applyInitialMarkdownSplitWidthIfNeeded()
    }
  }

  /**
   * Whether or not it's currently possible to change the line selection
   * of a diff. Changing selection is not possible while a commit is in
   * progress or if the user has opted to hide whitespace changes.
   */
  private get lineSelectionDisabled() {
    return this.props.isCommitting || this.props.hideWhitespaceInDiff
  }

  private onDiffLineIncludeChanged = (selection: DiffSelection) => {
    if (!this.lineSelectionDisabled) {
      const { repository, file } = this.props
      this.props.dispatcher.changeFileLineSelection(repository, file, selection)
    }
  }

  private onDiscardChanges = (
    diff: ITextDiff,
    diffSelection: DiffSelection
  ) => {
    if (this.lineSelectionDisabled) {
      return
    }

    if (this.props.askForConfirmationOnDiscardChanges) {
      this.props.dispatcher.showPopup({
        type: PopupType.ConfirmDiscardSelection,
        repository: this.props.repository,
        file: this.props.file,
        diff,
        selection: diffSelection,
      })
    } else {
      this.props.dispatcher.discardChangesFromSelection(
        this.props.repository,
        this.props.file.path,
        diff,
        diffSelection
      )
    }
  }

  public render() {
    const { diff, file } = this.props
    const showMarkdownToggle =
      diff !== null &&
      diff.kind === DiffType.Text &&
      isMarkdownPreviewablePath(file.path)
    const { markdownPreviewVisible } = this.state
    const showMarkdownSplit = markdownPreviewVisible && showMarkdownToggle

    const diffSwitcher = (
      <SeamlessDiffSwitcher
        repository={this.props.repository}
        imageDiffType={this.props.imageDiffType}
        file={this.props.file}
        readOnly={false}
        onIncludeChanged={this.onDiffLineIncludeChanged}
        onDiscardChanges={this.onDiscardChanges}
        diff={this.props.diff}
        hideWhitespaceInDiff={this.props.hideWhitespaceInDiff}
        showSideBySideDiff={this.props.showSideBySideDiff}
        showDiffCheckMarks={this.props.showDiffCheckMarks}
        askForConfirmationOnDiscardChanges={
          this.props.askForConfirmationOnDiscardChanges
        }
        onOpenBinaryFile={this.props.onOpenBinaryFile}
        onOpenSubmodule={this.props.onOpenSubmodule}
        onChangeImageDiffType={this.props.onChangeImageDiffType}
        onHideWhitespaceInDiffChanged={this.onHideWhitespaceInDiffChanged}
      />
    )

    return (
      <div className="diff-container">
        <DiffHeader
          path={this.props.file.path}
          status={this.props.file.status}
          diff={this.props.diff}
          showSideBySideDiff={this.props.showSideBySideDiff}
          onShowSideBySideDiffChanged={this.onShowSideBySideDiffChanged}
          hideWhitespaceInDiff={this.props.hideWhitespaceInDiff}
          onHideWhitespaceInDiffChanged={this.onHideWhitespaceInDiffChanged}
          onDiffOptionsOpened={this.props.onDiffOptionsOpened}
          showMarkdownPreviewToggle={showMarkdownToggle}
          markdownPreviewActive={markdownPreviewVisible}
          onMarkdownPreviewToggle={
            showMarkdownToggle ? this.onMarkdownPreviewToggle : undefined
          }
        />

        {showMarkdownSplit
          ? this.renderDiffWithMarkdownPreview(diffSwitcher)
          : diffSwitcher}
      </div>
    )
  }

  private renderDiffWithMarkdownPreview(diffSwitcher: JSX.Element) {
    const splitBounds = this.getMarkdownDiffPaneBounds()
    const diffPaneWidth = clamp(
      this.state.markdownDiffPaneWidth,
      splitBounds.min,
      splitBounds.max
    )

    return (
      <div ref={this.splitContainerRef} className="changes-diff-and-markdown">
        <Resizable
          id="changes-markdown-diff-split"
          width={diffPaneWidth}
          minimumWidth={splitBounds.min}
          maximumWidth={splitBounds.max}
          onResize={this.onMarkdownDiffPaneResize}
          onReset={this.onMarkdownDiffPaneReset}
          description="Changes diff"
        >
          <div className="changes-diff-pane">{diffSwitcher}</div>
        </Resizable>
        <div className="changes-markdown-pane">
          <ChangesMarkdownPreview
            repository={this.props.repository}
            file={this.props.file}
            emoji={this.props.emoji}
            underlineLinks={this.props.underlineLinks}
            dispatcher={this.props.dispatcher}
          />
        </div>
      </div>
    )
  }

  private onMarkdownPreviewToggle = () => {
    this.setState(prev => ({
      markdownPreviewVisible: !prev.markdownPreviewVisible,
    }))
  }

  private getMarkdownDiffPaneBounds() {
    const total =
      this.splitContainerRef.current?.clientWidth ??
      MarkdownPreviewDefaultDiffPaneWidthPx * 2
    const min = MarkdownPreviewMinPaneWidthPx
    const max = Math.max(min, total - MarkdownPreviewMinPaneWidthPx)
    return { min, max }
  }

  private applyInitialMarkdownSplitWidthIfNeeded() {
    if (this.markdownSplitInitialWidthApplied) {
      return
    }

    requestAnimationFrame(() => {
      const el = this.splitContainerRef.current
      if (el === null) {
        return
      }

      const { min, max } = this.getMarkdownDiffPaneBounds()
      const half = Math.floor(el.clientWidth / 2)
      this.setState({
        markdownDiffPaneWidth: clamp(half, min, max),
      })
      this.markdownSplitInitialWidthApplied = true
    })
  }

  private onMarkdownDiffPaneResize = (markdownDiffPaneWidth: number) => {
    this.setState({ markdownDiffPaneWidth })
  }

  private onMarkdownDiffPaneReset = () => {
    const el = this.splitContainerRef.current
    const { min, max } = this.getMarkdownDiffPaneBounds()
    const half = el
      ? Math.floor(el.clientWidth / 2)
      : MarkdownPreviewDefaultDiffPaneWidthPx
    this.setState({
      markdownDiffPaneWidth: clamp(half, min, max),
    })
  }

  private onShowSideBySideDiffChanged = (showSideBySideDiff: boolean) => {
    this.props.dispatcher.onShowSideBySideDiffChanged(showSideBySideDiff)
  }

  private onHideWhitespaceInDiffChanged = (hideWhitespaceInDiff: boolean) => {
    return this.props.dispatcher.onHideWhitespaceInChangesDiffChanged(
      hideWhitespaceInDiff,
      this.props.repository
    )
  }
}
