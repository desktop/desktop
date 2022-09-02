import * as React from 'react'
import * as Path from 'path'
import {
  IBranchesState,
  IPullRequestState,
  IConstrainedValue,
  RepositorySectionTab,
} from '../../lib/app-state'
import { Commit } from '../../models/commit'
import { ImageDiffType } from '../../models/diff'
import { Repository } from '../../models/repository'
import { Dialog, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Dispatcher } from '../dispatcher'
import { FileDiffViewer } from '../file-diff-viewer/file-diff-viewer'
import { openFile } from '../lib/open-file'
import { Select } from '../lib/select'
import { CommittedFileChange } from '../../models/status'
import { DiffOptions } from '../diff/diff-options'
import { TooltippedContent } from '../lib/tooltipped-content'

interface IOpenPullRequestDialogProps {
  readonly branchesState: IBranchesState
  readonly pullRequestState: IPullRequestState

  readonly commitSummaryWidth: IConstrainedValue
  readonly sidebarWidth: IConstrainedValue

  readonly dispatcher: Dispatcher
  readonly repository: Repository

  readonly selectedDiffType: ImageDiffType
  readonly showSideBySideDiff: boolean
  readonly hideWhitespaceInDiff: boolean
  readonly externalEditorLabel?: string

  readonly onOpenInExternalEditor: (fullPath: string) => void
  readonly onViewCommitOnGitHub: (SHA: string, filePath?: string) => void

  readonly commitLookup: Map<string, Commit>
  readonly emoji: Map<string, string>
  readonly imageDiffType: ImageDiffType

  /** Called to dismiss the dialog */
  readonly onDismissed: () => void
}

/** The component for viewing the diff of a pull request. */
export class OpenPullRequestDialog extends React.Component<IOpenPullRequestDialogProps> {
  private onCreatePullRequest = () => {
    this.props.dispatcher.createPullRequest(this.props.repository)
    // TODO: create pr from dialog pr stat?
    this.props.dispatcher.recordCreatePullRequest()
  }

  private renderControls() {
    const { pullRequestState } = this.props
    const { changedFiles } = pullRequestState
    if (changedFiles === null) {
      return
    }
    const { selectedFile } = changedFiles

    return (
      <div className="pull-request-dialog-controls">
        {this.renderComparisonDropdown()}
        {this.renderCommitDropdown()}
        <div className="spacer"></div>
        {this.renderLinesChanged()}
        <div>
          <DiffOptions
            sourceTab={RepositorySectionTab.History}
            hideWhitespaceChanges={this.props.hideWhitespaceInDiff}
            onHideWhitespaceChangesChanged={this.onHideWhitespaceInDiffChanged(
              selectedFile
            )}
            showSideBySideDiff={this.props.showSideBySideDiff}
            onShowSideBySideDiffChanged={this.onShowSideBySideDiffChanged}
            onDiffOptionsOpened={this.onDiffOptionsOpened}
          />
        </div>
      </div>
    )
  }

  private renderLinesChanged() {
    const { pullRequestState } = this.props
    const { changedFiles } = pullRequestState
    if (changedFiles === null) {
      return
    }
    const { changesetData } = changedFiles
    const { linesAdded, linesDeleted } = changesetData
    if (linesAdded + linesDeleted === 0) {
      return null
    }

    const linesAddedPlural = linesAdded === 1 ? 'line' : 'lines'
    const linesDeletedPlural = linesDeleted === 1 ? 'line' : 'lines'
    const linesAddedTitle = `${linesAdded} ${linesAddedPlural} added`
    const linesDeletedTitle = `${linesDeleted} ${linesDeletedPlural} deleted`

    return (
      <>
        <TooltippedContent
          tagName="span"
          className="without-truncation lines-added"
          tooltip={linesAddedTitle}
        >
          +{linesAdded}
        </TooltippedContent>
        <TooltippedContent
          tagName="span"
          className="without-truncation lines-deleted"
          tooltip={linesDeletedTitle}
        >
          -{linesDeleted}
        </TooltippedContent>
      </>
    )
  }

  private renderComparisonDropdown() {
    const { allBranches } = this.props.branchesState
    const { mergeBaseBranch } = this.props.pullRequestState
    return (
      <Select label={'Comparison Branch:'} defaultValue={mergeBaseBranch.name}>
        {allBranches.map(branch => (
          <option key={branch.name} value={branch.name}>
            {branch.name}
          </option>
        ))}
      </Select>
    )
  }

  private renderCommitDropdown() {
    const { commitSHAs } = this.props.pullRequestState
    if (commitSHAs === null) {
      return null
    }

    const commits = []
    for (const sha of commitSHAs) {
      const commit = this.props.commitLookup.get(sha)
      if (commit) {
        commits.push(commit)
      }
    }

    return (
      <Select label={'Showing Changes from:'} defaultValue={'all-commits'}>
        <option key={'all-commits'} value={'all-commits'}>
          all commits
        </option>
        {commits.map(commit => (
          <option key={commit.sha} value={commit.sha}>
            {commit.summary}
          </option>
        ))}
      </Select>
    )
  }

  private onCommitSummaryReset = () => {
    this.props.dispatcher.resetCommitSummaryWidth()
  }

  private onCommitSummaryResize = (width: number) => {
    this.props.dispatcher.setCommitSummaryWidth(width)
  }
  private onFileSelected = (file: CommittedFileChange) => {
    this.props.dispatcher.changePullRequestFileSelection(
      this.props.repository,
      file
    )
  }

  private onShowSideBySideDiffChanged = (showSideBySideDiff: boolean) => {
    this.props.dispatcher.onShowSideBySideDiffChanged(showSideBySideDiff)
  }

  private onOpenFile = (path: string) => {
    const fullPath = Path.join(this.props.repository.path, path)
    this.onOpenBinaryFile(fullPath)
  }

  private onOpenBinaryFile = (fullPath: string) => {
    openFile(fullPath, this.props.dispatcher)
  }

  private onHideWhitespaceInDiffChanged = (
    selectedFile: CommittedFileChange | null
  ) => {
    return (hideWhitespaceInDiff: boolean) => {
      return this.props.dispatcher.onHideWhitespaceInHistoryDiffChanged(
        hideWhitespaceInDiff,
        this.props.repository,
        selectedFile as CommittedFileChange
      )
    }
  }

  private onDiffOptionsOpened = () => {
    this.props.dispatcher.recordDiffOptionsViewed()
  }

  private onChangeImageDiffType = (imageDiffType: ImageDiffType) => {
    this.props.dispatcher.changeImageDiffType(imageDiffType)
  }

  private renderDiff() {
    const { pullRequestState, repository } = this.props
    const { changedFiles } = pullRequestState
    if (changedFiles === null) {
      return
    }
    const { changesetData, selectedFile, diff } = changedFiles

    return (
      <FileDiffViewer
        diff={diff}
        byFile={false}
        diffWidth={this.props.commitSummaryWidth}
        externalEditorLabel={this.props.externalEditorLabel}
        changesetData={changesetData}
        hideWhitespaceInDiff={this.props.hideWhitespaceInDiff}
        selectedDiffType={this.props.selectedDiffType}
        showSideBySideDiff={this.props.showSideBySideDiff}
        selectedFile={selectedFile}
        repository={repository}
        onChangeImageDiffType={this.onChangeImageDiffType}
        onDiffResize={this.onCommitSummaryResize}
        onDiffSizeReset={this.onCommitSummaryReset}
        onFileSelected={this.onFileSelected}
        onHideWhitespaceInDiffChanged={this.onHideWhitespaceInDiffChanged(
          selectedFile
        )}
        onShowSideBySideDiffChanged={this.onShowSideBySideDiffChanged}
        onDiffOptionsOpened={this.onDiffOptionsOpened}
        onOpenBinaryFile={this.onOpenBinaryFile}
        onOpenInExternalEditor={this.props.onOpenInExternalEditor}
        onOpenWithDefaultProgram={this.onOpenFile}
      />
    )
  }

  private renderFooter() {
    return (
      <DialogFooter>
        <OkCancelButtonGroup
          okButtonText="Create Pull Request"
          okButtonTitle="Create pull request on GitHub."
          cancelButtonText="Nevermind"
        />
      </DialogFooter>
    )
  }

  public render() {
    return (
      <Dialog
        className="create-pull-request"
        title={__DARWIN__ ? 'Open a Pull Request' : 'Open a pull request'}
        onSubmit={this.onCreatePullRequest}
        onDismissed={this.props.onDismissed}
      >
        <div className="content">
          {this.renderControls()}
          {this.renderDiff()}
        </div>

        {this.renderFooter()}
      </Dialog>
    )
  }
}
