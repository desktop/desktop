import * as React from 'react'
import * as Path from 'path'
import { AppFileStatusKind, CommittedFileChange } from '../../../models/status'
import { IDiff, ImageDiffType } from '../../../models/diff'
import { WorkingDirectoryFileChange } from '../../../models/status'
import { IFileResolution } from '../../../lib/copilot-conflict-resolution'
import { ManualConflictResolution } from '../../../models/manual-conflict-resolution'
import { FileList } from '../../history/file-list'
import { SeamlessDiffSwitcher } from '../../diff/seamless-diff-switcher'
import { DiffOptions } from '../../diff/diff-options'
import { Repository } from '../../../models/repository'
import { Dispatcher } from '../../dispatcher'
import { openFile } from '../../lib/open-file'
import { getResolutionDiff } from '../../../lib/git'
import { Button } from '../../lib/button'
import { Octicon } from '../../octicons'
import * as octicons from '../../octicons/octicons.generated'
import {
  CopilotFileResolutionChoice,
  getResolutionChoiceForFile,
  resolutionChoices,
} from './copilot-resolution-helpers'

interface ICopilotConflictsChangesProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly conflictedFiles: ReadonlyArray<WorkingDirectoryFileChange>
  readonly copilotResolutions: ReadonlyArray<IFileResolution> | null
  readonly manualResolutions: Map<string, ManualConflictResolution>
  readonly ourBranch: string | undefined
  readonly theirBranch: string | undefined
  readonly onResolutionDropdownClick: (path: string) => void
}

interface ICopilotConflictsChangesState {
  readonly selectedFile: CommittedFileChange | null
  readonly diff: IDiff | null
  readonly noResolution: boolean
  readonly showSideBySideDiff: boolean
  readonly hideWhitespaceInDiff: boolean
  readonly imageDiffType: ImageDiffType
  readonly isSubheaderExpanded: boolean
  readonly isSubheaderOverflowed: boolean
}

/**
 * The Changes tab in the Copilot conflicts dialog, showing a file list
 * alongside a diff preview of Copilot's conflict resolutions.
 *
 * Uses the same FileList + Diff pattern as PullRequestFilesChanged.
 */
export class CopilotConflictsChanges extends React.Component<
  ICopilotConflictsChangesProps,
  ICopilotConflictsChangesState
> {
  private diffRequestId = 0
  private mounted = false
  private subheaderRef: HTMLDivElement | null = null

  public constructor(props: ICopilotConflictsChangesProps) {
    super(props)

    const files = this.getCommittedFiles()
    this.state = {
      selectedFile: files.length > 0 ? files[0] : null,
      diff: null,
      noResolution: false,
      showSideBySideDiff: false,
      hideWhitespaceInDiff: false,
      imageDiffType: ImageDiffType.TwoUp,
      isSubheaderExpanded: false,
      isSubheaderOverflowed: false,
    }
  }

  public componentDidMount() {
    this.mounted = true
    if (this.state.selectedFile !== null) {
      this.loadDiffForFile(this.state.selectedFile)
    }
    this.updateSubheaderOverflow()
  }

  public componentWillUnmount() {
    this.mounted = false
  }

  public componentDidUpdate(
    prevProps: ICopilotConflictsChangesProps,
    prevState: ICopilotConflictsChangesState
  ) {
    const { selectedFile, hideWhitespaceInDiff } = this.state

    const prevSelectedPath = prevState.selectedFile?.path
    const currentPath = selectedFile?.path

    const prevChoice =
      prevSelectedPath !== undefined
        ? prevProps.manualResolutions.get(prevSelectedPath)
        : undefined
    const nextChoice =
      currentPath !== undefined
        ? this.props.manualResolutions.get(currentPath)
        : undefined
    const selectedResolutionChanged = prevChoice !== nextChoice

    if (
      selectedFile !== prevState.selectedFile ||
      hideWhitespaceInDiff !== prevState.hideWhitespaceInDiff ||
      this.props.copilotResolutions !== prevProps.copilotResolutions ||
      selectedResolutionChanged
    ) {
      if (selectedFile !== null) {
        this.loadDiffForFile(selectedFile)
      } else {
        this.setState({ diff: null })
      }
    }

    if (
      selectedFile !== prevState.selectedFile ||
      selectedResolutionChanged ||
      this.props.copilotResolutions !== prevProps.copilotResolutions
    ) {
      this.updateSubheaderOverflow()
    }
  }

  /**
   * Convert WorkingDirectoryFileChange to CommittedFileChange for use
   * with the standard FileList component.
   */
  private getCommittedFiles(): ReadonlyArray<CommittedFileChange> {
    return this.props.conflictedFiles.map(
      f =>
        new CommittedFileChange(
          f.path,
          { kind: AppFileStatusKind.Modified },
          'HEAD',
          'HEAD^'
        )
    )
  }

  private async loadDiffForFile(file: CommittedFileChange) {
    const requestId = ++this.diffRequestId
    const choice = getResolutionChoiceForFile(
      file.path,
      this.props.manualResolutions
    )

    if (choice === 'ours' || choice === 'theirs') {
      this.setState({ diff: null, noResolution: false })
      try {
        const diff = await getResolutionDiff(
          this.props.repository,
          file.path,
          { stage: choice },
          this.state.hideWhitespaceInDiff
        )

        if (this.mounted && requestId === this.diffRequestId) {
          this.setState({ diff })
        }
      } catch (e) {
        log.error('Failed to compute resolution diff', e)
        if (this.mounted && requestId === this.diffRequestId) {
          this.setState({ diff: null })
        }
      }
      return
    }

    const resolution = this.props.copilotResolutions?.find(
      r => r.path === file.path
    )

    if (resolution === undefined) {
      this.setState({ diff: null, noResolution: true })
      return
    }

    this.setState({ diff: null, noResolution: false })

    try {
      const diff = await getResolutionDiff(
        this.props.repository,
        file.path,
        { content: resolution.resolvedContent },
        this.state.hideWhitespaceInDiff
      )

      if (this.mounted && requestId === this.diffRequestId) {
        this.setState({ diff })
      }
    } catch (e) {
      log.error('Failed to compute resolution diff', e)
      if (this.mounted && requestId === this.diffRequestId) {
        this.setState({ diff: null })
      }
    }
  }

  private onSelectedFileChanged = (file: CommittedFileChange) => {
    this.setState({ selectedFile: file, isSubheaderExpanded: false })
  }

  private onShowSideBySideDiffChanged = (showSideBySideDiff: boolean) => {
    this.setState({ showSideBySideDiff })
  }

  private onHideWhitespaceInDiffChanged = (hideWhitespaceInDiff: boolean) => {
    this.setState({ hideWhitespaceInDiff })
  }

  private onDiffOptionsOpened = () => {
    this.props.dispatcher.incrementMetric('diffOptionsViewedCount')
  }

  private onOpenBinaryFile = (fullPath: string) => {
    openFile(fullPath, this.props.dispatcher)
  }

  private onChangeImageDiffType = (imageDiffType: ImageDiffType) => {
    this.setState({ imageDiffType })
  }

  private onRowDoubleClick = (row: number) => {
    const file = this.getCommittedFiles()[row]
    if (file !== undefined) {
      const fullPath = Path.join(this.props.repository.path, file.path)
      openFile(fullPath, this.props.dispatcher)
    }
  }

  private onDropdownClick = () => {
    const { selectedFile } = this.state
    if (selectedFile !== null) {
      this.props.onResolutionDropdownClick(selectedFile.path)
    }
  }

  private onToggleSubheaderExpanded = () => {
    this.setState(
      prev => ({ isSubheaderExpanded: !prev.isSubheaderExpanded }),
      () => {
        if (!this.state.isSubheaderExpanded) {
          requestAnimationFrame(() => this.updateSubheaderOverflow())
        }
      }
    )
  }

  private onSubheaderRef = (ref: HTMLDivElement | null) => {
    this.subheaderRef = ref
  }

  private updateSubheaderOverflow() {
    if (this.state.isSubheaderExpanded) {
      if (this.state.isSubheaderOverflowed) {
        this.setState({ isSubheaderOverflowed: false })
      }
      return
    }

    const el = this.subheaderRef
    if (el) {
      this.setState({
        isSubheaderOverflowed: el.scrollHeight > el.offsetHeight,
      })
    } else if (this.state.isSubheaderOverflowed) {
      this.setState({ isSubheaderOverflowed: false })
    }
  }

  private getSubheaderText(
    choice: CopilotFileResolutionChoice,
    path: string
  ): string | undefined {
    if (choice === 'ours') {
      return `Using changes from ${this.props.ourBranch ?? 'current branch'}`
    }
    if (choice === 'theirs') {
      return `Using changes from ${this.props.theirBranch ?? 'incoming branch'}`
    }
    const resolution = this.props.copilotResolutions?.find(r => r.path === path)
    if (resolution === undefined) {
      return 'No Copilot resolution available'
    }
    return resolution.reasoning ?? "Using Copilot's merged resolution"
  }

  public render() {
    const files = this.getCommittedFiles()
    const {
      selectedFile,
      diff,
      noResolution,
      showSideBySideDiff,
      hideWhitespaceInDiff,
    } = this.state

    const choice =
      selectedFile !== null
        ? getResolutionChoiceForFile(
            selectedFile.path,
            this.props.manualResolutions
          )
        : 'copilot'
    const { label: choiceLabel, icon: choiceIcon } = resolutionChoices[choice]
    const subheaderText =
      selectedFile !== null
        ? this.getSubheaderText(choice, selectedFile.path)
        : undefined

    return (
      <div className="copilot-changes-tab">
        <div className="copilot-changes-header">
          <span className="copilot-changes-file-count">
            {files.length} files changed
          </span>
          <DiffOptions
            isInteractiveDiff={false}
            hideWhitespaceChanges={hideWhitespaceInDiff}
            onHideWhitespaceChangesChanged={this.onHideWhitespaceInDiffChanged}
            showSideBySideDiff={showSideBySideDiff}
            onShowSideBySideDiffChanged={this.onShowSideBySideDiffChanged}
            onDiffOptionsOpened={this.onDiffOptionsOpened}
          />
        </div>
        <div className="copilot-changes-content">
          <div className="copilot-changes-file-list">
            <FileList
              files={files}
              onSelectedFileChanged={this.onSelectedFileChanged}
              selectedFile={selectedFile}
              availableWidth={200}
              onRowDoubleClick={this.onRowDoubleClick}
            />
          </div>
          <div className="copilot-changes-diff-area">
            {selectedFile !== null && subheaderText !== undefined && (
              <div className="copilot-changes-diff-header">
                <div
                  ref={this.onSubheaderRef}
                  id="copilot-changes-diff-description"
                  className={
                    this.state.isSubheaderExpanded
                      ? 'copilot-changes-diff-subheader expanded'
                      : 'copilot-changes-diff-subheader'
                  }
                >
                  {subheaderText}
                </div>
                <div className="copilot-changes-diff-header-actions">
                  {(this.state.isSubheaderOverflowed ||
                    this.state.isSubheaderExpanded) && (
                    <Button
                      className="copilot-changes-diff-subheader-toggle"
                      onClick={this.onToggleSubheaderExpanded}
                      tooltip={
                        this.state.isSubheaderExpanded ? 'Collapse' : 'Expand'
                      }
                      ariaExpanded={this.state.isSubheaderExpanded}
                      ariaLabel={
                        this.state.isSubheaderExpanded
                          ? 'Collapse description'
                          : 'Expand description'
                      }
                      ariaControls="copilot-changes-diff-description"
                    >
                      <Octicon
                        symbol={
                          this.state.isSubheaderExpanded
                            ? octicons.fold
                            : octicons.unfold
                        }
                      />
                    </Button>
                  )}
                  <Button
                    className="copilot-resolution-dropdown"
                    onClick={this.onDropdownClick}
                    ariaLabel="Change resolution choice"
                  >
                    <Octicon symbol={choiceIcon} />
                    {choiceLabel}
                    <Octicon symbol={octicons.triangleDown} />
                  </Button>
                </div>
              </div>
            )}
            {selectedFile !== null && !noResolution && (
              <SeamlessDiffSwitcher
                repository={this.props.repository}
                readOnly={true}
                file={selectedFile}
                diff={diff}
                imageDiffType={this.state.imageDiffType}
                hideWhitespaceInDiff={hideWhitespaceInDiff}
                showSideBySideDiff={showSideBySideDiff}
                showDiffCheckMarks={false}
                onOpenBinaryFile={this.onOpenBinaryFile}
                onChangeImageDiffType={this.onChangeImageDiffType}
                onHideWhitespaceInDiffChanged={
                  this.onHideWhitespaceInDiffChanged
                }
              />
            )}
            {selectedFile !== null && noResolution && (
              <div className="copilot-changes-no-diff">
                No Copilot resolution available for this file.
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }
}
