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
import { SelectedCommits } from '../history'
import { Resizable } from '../resizable'
import { CommitList } from '../history/commit-list'
import { Commit } from '../../models/commit'
import { ThrottledScheduler } from '../lib/throttled-scheduler'

interface IPullRequestViewProps {
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

  readonly onOpenBinaryFile: (fullPath: string) => void
  readonly onChangeImageDiffType: (type: ImageDiffType) => void
  readonly onOpenInExternalEditor: (path: string) => void
  readonly onViewCommitOnGitHub: (SHA: string, filePath?: string) => void

  readonly commitLookup: Map<string, Commit>
  readonly emoji: Map<string, string>
  readonly imageDiffType: ImageDiffType
}

export class PullRequestView extends React.Component<IPullRequestViewProps> {
  private readonly loadChangedFilesScheduler = new ThrottledScheduler(200)

  private onCreatePullRequest = () => {
    this.props.dispatcher.createPullRequest(this.props.repository)
    // TODO: create pr from preview pr stat?
    this.props.dispatcher.recordCreatePullRequest()
  }

  private onCancelPullRequest = () => {
    this.props.dispatcher.clearPullRequestPreview(this.props.repository)
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

  private handleSidebarWidthReset = () => {
    this.props.dispatcher.resetSidebarWidth()
  }

  private handleSidebarResize = (width: number) => {
    this.props.dispatcher.setSidebarWidth(width)
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

  private onCommitsSelected = (
    commits: ReadonlyArray<Commit>,
    isContiguous: boolean
  ) => {
    this.props.dispatcher.changePullRequestCommitSelection(
      this.props.repository,
      commits.map(c => c.sha),
      isContiguous
    )

    this.loadChangedFilesScheduler.queue(() => {
      this.props.dispatcher.loadPullRequestChangedFilesForCurrentSelection(
        this.props.repository
      )
    })
  }

  private renderCommits = () => {
    const { commitSHAs, commitSelection } = this.props.pullRequestState

    if (commitSHAs == null) {
      return
    }

    const { shas, shasInDiff, isContiguous, changesetData, file, diff } =
      commitSelection

    const selectedCommits = []
    for (const sha of shas) {
      const commit = this.props.commitLookup.get(sha)
      if (commit !== undefined) {
        selectedCommits.push(commit)
      }
    }

    return (
      <div className="pr-commits-tab-view">
        <div>
          <Resizable
            id="repository-sidebar"
            width={this.props.sidebarWidth.value}
            maximumWidth={this.props.sidebarWidth.max}
            minimumWidth={this.props.sidebarWidth.min}
            onReset={this.handleSidebarWidthReset}
            onResize={this.handleSidebarResize}
          >
            <CommitList
              gitHubRepository={this.props.repository.gitHubRepository}
              isLocalRepository={false}
              commitLookup={this.props.commitLookup}
              commitSHAs={commitSHAs}
              selectedSHAs={shas}
              localCommitSHAs={[]}
              emoji={this.props.emoji}
              onCommitsSelected={this.onCommitsSelected}
              emptyListMessage={'No commits'}
            />
          </Resizable>
        </div>
        <SelectedCommits
          repository={this.props.repository}
          isLocalRepository={false}
          dispatcher={this.props.dispatcher}
          selectedCommits={selectedCommits}
          shasInDiff={shasInDiff}
          isContiguous={isContiguous}
          localCommitSHAs={shas}
          changesetData={changesetData}
          selectedFile={file}
          currentDiff={diff}
          emoji={this.props.emoji}
          commitSummaryWidth={this.props.commitSummaryWidth}
          selectedDiffType={this.props.imageDiffType}
          externalEditorLabel={this.props.externalEditorLabel}
          onOpenInExternalEditor={this.props.onOpenInExternalEditor}
          onViewCommitOnGitHub={this.props.onViewCommitOnGitHub}
          hideWhitespaceInDiff={this.props.hideWhitespaceInDiff}
          showSideBySideDiff={this.props.showSideBySideDiff}
          onOpenBinaryFile={this.props.onOpenBinaryFile}
          onChangeImageDiffType={this.props.onChangeImageDiffType}
          onDiffOptionsOpened={this.onDiffOptionsOpened}
          showDragOverlay={false}
        />
      </div>
    )
  }

  private onDiffOptionsOpened = () => {
    this.props.dispatcher.recordDiffOptionsViewed()
  }

  private renderSelectedTab = (selectedSection: PullRequestSectionTab) => {
    if (selectedSection === PullRequestSectionTab.FileChanged) {
      return this.renderFilesChanged()
    }

    return this.renderCommits()
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
        <div className="tab-content">
          {this.renderSelectedTab(selectedSection)}
        </div>
      </UiView>
    )
  }
}
