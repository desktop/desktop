import * as React from 'react'
import {
  IBranchesState,
  IConstrainedValue,
  IPullRequestState,
  PullRequestSectionTab,
} from '../../lib/app-state'
import { Repository } from '../../models/repository'
import { TipState } from '../../models/tip'
import { Dispatcher } from '../dispatcher'
import { UiView } from '../ui-view'
import { PullRequestCompareBar } from './pull-request-compare-bar'
import { PullRequestTabs } from './pull-request-tabs'
import { CommittedFileChange } from '../../models/status'
import { FileDiffViewer } from '../file-diff-viewer/file-diff-viewer'
import { openFile } from '../lib/open-file'
import * as Path from 'path'
import { ImageDiffType } from '../../models/diff'

interface IPullRequestViewProps {
  readonly branchesState: IBranchesState
  readonly pullRequestState: IPullRequestState

  readonly commitSummaryWidth: IConstrainedValue

  readonly dispatcher: Dispatcher
  readonly repository: Repository

  readonly selectedDiffType: ImageDiffType
  readonly showSideBySideDiff: boolean
  readonly hideWhitespaceInDiff: boolean
  readonly externalEditorLabel?: string

  readonly onOpenBinaryFile: (fullPath: string) => void
  readonly onChangeImageDiffType: (type: ImageDiffType) => void
  readonly onOpenInExternalEditor: (path: string) => void
}

export class PullRequestView extends React.Component<IPullRequestViewProps> {
  private onCreatePullRequest = () => {
    console.log('create')
  }

  private onCancelPullRequest = () => {
    console.log('dismiss')
  }

  private onPullRequestTabChange = (tab: PullRequestSectionTab) => {
    this.props.dispatcher.updatePullRequestSection(this.props.repository, tab)
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

  private onOpenFile = (path: string) => {
    const fullPath = Path.join(this.props.repository.path, path)
    openFile(fullPath, this.props.dispatcher)
  }

  private onHideWhitespaceInDiffChanged = (
    selectedFile: CommittedFileChange | null
  ) => {
    return (hideWhitespaceInDiff: boolean) => {
      this.props.dispatcher.onHideWhitespaceInHistoryDiffChanged(
        hideWhitespaceInDiff,
        this.props.repository,
        selectedFile as CommittedFileChange
      )
    }
  }

  private renderFilesChanged = () => {
    const { pullRequestState, repository } = this.props
    const { changedFiles } = pullRequestState
    if (changedFiles === null) {
      return
    }
    const {
      changesetData: { files },
      selectedFile,
      diff,
    } = changedFiles

    return (
      <FileDiffViewer
        diff={diff}
        diffWidth={this.props.commitSummaryWidth}
        externalEditorLabel={this.props.externalEditorLabel}
        files={files}
        hideWhitespaceInDiff={this.props.hideWhitespaceInDiff}
        selectedDiffType={this.props.selectedDiffType}
        showSideBySideDiff={this.props.showSideBySideDiff}
        selectedFile={selectedFile}
        repository={repository}
        onChangeImageDiffType={this.props.onChangeImageDiffType}
        onDiffResize={this.onCommitSummaryResize}
        onDiffSizeReset={this.onCommitSummaryReset}
        onFileSelected={this.onFileSelected}
        onHideWhitespaceInDiffChanged={this.onHideWhitespaceInDiffChanged(
          selectedFile
        )}
        onOpenBinaryFile={this.props.onOpenBinaryFile}
        onOpenInExternalEditor={this.props.onOpenInExternalEditor}
        onOpenWithDefaultProgram={this.onOpenFile}
      />
    )
  }

  private renderSelectedTab = (selectedSection: PullRequestSectionTab) => {
    if (selectedSection === PullRequestSectionTab.FileChanged) {
      return this.renderFilesChanged()
    }

    return <>{this.props.pullRequestState.commitSHAs?.join(', ')}</>
  }

  public render() {
    const { branchesState, pullRequestState } = this.props
    const { tip, allBranches } = branchesState
    const { mergeBaseBranch, selectedSection, changedFiles, commitSHAs } =
      pullRequestState

    if (tip.kind !== TipState.Valid) {
      return null
    }

    const currentBranch = tip.branch

    return (
      <UiView id="pull-request-view">
        <PullRequestCompareBar
          branches={allBranches}
          currentBranch={currentBranch}
          mergeBaseBranch={mergeBaseBranch}
          onCreatePullRequest={this.onCreatePullRequest}
          onCancelPullRequest={this.onCancelPullRequest}
        />
        <PullRequestTabs
          commitsCount={commitSHAs !== null ? commitSHAs.length : 0}
          filesChangedCount={
            changedFiles !== null ? changedFiles.changesetData.files.length : 0
          }
          selectedSection={selectedSection}
          onTabClicked={this.onPullRequestTabChange}
        />
        {this.renderSelectedTab(selectedSection)}
      </UiView>
    )
  }
}
