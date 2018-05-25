import * as React from 'react'
import { Repository as Repo } from '../models/repository'
import { Commit } from '../models/commit'
import { TipState } from '../models/tip'
import { UiView } from './ui-view'
import { Changes, ChangesSidebar } from './changes'
import { NoChanges } from './changes/no-changes'
import { MultipleSelection } from './changes/multiple-selection'
import { History, HistorySidebar, CompareSidebar } from './history'
import { Resizable } from './resizable'
import { TabBar } from './tab-bar'
import {
  IRepositoryState,
  RepositorySectionTab,
  ImageDiffType,
  RepositorySection,
} from '../lib/app-state'
import { Dispatcher } from '../lib/dispatcher'
import { IssuesStore, GitHubUserStore } from '../lib/stores'
import { assertNever } from '../lib/fatal-error'
import { Octicon, OcticonSymbol } from './octicons'
import { Account } from '../models/account'
import { enableCompareSidebar } from '../lib/feature-flag'
import { FocusContainer } from './lib/focus-container'

/** The widest the sidebar can be with the minimum window size. */
const MaxSidebarWidth = 495

interface IRepositoryViewProps {
  readonly repository: Repo
  readonly state: IRepositoryState
  readonly dispatcher: Dispatcher
  readonly emoji: Map<string, string>
  readonly sidebarWidth: number
  readonly commitSummaryWidth: number
  readonly issuesStore: IssuesStore
  readonly gitHubUserStore: GitHubUserStore
  readonly onViewCommitOnGitHub: (SHA: string) => void
  readonly imageDiffType: ImageDiffType
  readonly askForConfirmationOnDiscardChanges: boolean
  readonly accounts: ReadonlyArray<Account>

  /** The name of the currently selected external editor */
  readonly externalEditorLabel?: string

  /**
   * Callback to open a selected file using the configured external editor
   *
   * @param fullPath The full path to the file on disk
   */

  readonly onOpenInExternalEditor: (fullPath: string) => void

  readonly hasDiverged: boolean
}

interface IRepositoryViewState {
  readonly sidebarHasFocusWithin: boolean
}

const enum Tab {
  Changes = 0,
  History = 1,
}

export class RepositoryView extends React.Component<
  IRepositoryViewProps,
  IRepositoryViewState
> {
  public constructor(props: IRepositoryViewProps) {
    super(props)

    this.state = {
      sidebarHasFocusWithin: false,
    }
  }

  private renderTabs(): JSX.Element {
    const hasChanges =
      this.props.state.changesState.workingDirectory.files.length > 0
    const selectedTab =
      this.props.state.selectedSection.selectedTab ===
      RepositorySectionTab.Changes
        ? Tab.Changes
        : Tab.History

    return (
      <TabBar selectedIndex={selectedTab} onTabClicked={this.onTabClicked}>
        <span className="with-indicator">
          <span>Changes</span>
          {hasChanges ? (
            <Octicon
              className="indicator"
              symbol={OcticonSymbol.primitiveDot}
            />
          ) : null}
        </span>

        <span className="with-indicator">
          <span>History</span>

          {this.props.hasDiverged ? (
            <Octicon
              className="indicator"
              symbol={OcticonSymbol.primitiveDot}
            />
          ) : null}
        </span>
      </TabBar>
    )
  }

  private renderChangesSidebar(): JSX.Element {
    const tip = this.props.state.branchesState.tip
    const branch = tip.kind === TipState.Valid ? tip.branch : null

    const localCommitSHAs = this.props.state.localCommitSHAs
    const mostRecentLocalCommitSHA =
      localCommitSHAs.length > 0 ? localCommitSHAs[0] : null
    const mostRecentLocalCommit =
      (mostRecentLocalCommitSHA
        ? this.props.state.commitLookup.get(mostRecentLocalCommitSHA)
        : null) || null

    // -1 Because of right hand side border
    const availableWidth = this.props.sidebarWidth - 1

    return (
      <ChangesSidebar
        repository={this.props.repository}
        dispatcher={this.props.dispatcher}
        changes={this.props.state.changesState}
        branch={branch ? branch.name : null}
        commitAuthor={this.props.state.commitAuthor}
        gitHubUsers={this.props.state.gitHubUsers}
        emoji={this.props.emoji}
        mostRecentLocalCommit={mostRecentLocalCommit}
        issuesStore={this.props.issuesStore}
        availableWidth={availableWidth}
        gitHubUserStore={this.props.gitHubUserStore}
        isCommitting={this.props.state.isCommitting}
        isPushPullFetchInProgress={this.props.state.isPushPullFetchInProgress}
        askForConfirmationOnDiscardChanges={
          this.props.askForConfirmationOnDiscardChanges
        }
        accounts={this.props.accounts}
        externalEditorLabel={this.props.externalEditorLabel}
        onOpenInExternalEditor={this.props.onOpenInExternalEditor}
      />
    )
  }

  private renderHistorySidebar(): JSX.Element {
    return (
      <HistorySidebar
        repository={this.props.repository}
        dispatcher={this.props.dispatcher}
        history={this.props.state.historyState}
        gitHubUsers={this.props.state.gitHubUsers}
        emoji={this.props.emoji}
        commitLookup={this.props.state.commitLookup}
        localCommitSHAs={this.props.state.localCommitSHAs}
        onRevertCommit={this.onRevertCommit}
        onViewCommitOnGitHub={this.props.onViewCommitOnGitHub}
      />
    )
  }

  private renderCompareSidebar(): JSX.Element {
    const tip = this.props.state.branchesState.tip
    const currentBranch = tip.kind === TipState.Valid ? tip.branch : null
    const selectedSection = this.props.state.selectedSection
    const shouldShowBranchesList =
      selectedSection.selectedTab === RepositorySectionTab.History
        ? selectedSection.shouldShowBranchesList || false
        : false

    return (
      <CompareSidebar
        repository={this.props.repository}
        compareState={this.props.state.compareState}
        currentBranch={currentBranch}
        gitHubUsers={this.props.state.gitHubUsers}
        emoji={this.props.emoji}
        commitLookup={this.props.state.commitLookup}
        localCommitSHAs={this.props.state.localCommitSHAs}
        dispatcher={this.props.dispatcher}
        onRevertCommit={this.onRevertCommit}
        onViewCommitOnGitHub={this.props.onViewCommitOnGitHub}
        sidebarHasFocusWithin={this.state.sidebarHasFocusWithin}
        shouldShowBranchesList={shouldShowBranchesList}
      />
    )
  }

  private renderSidebarContents(): JSX.Element {
    const selectedSection = this.props.state.selectedSection

    if (selectedSection.selectedTab === RepositorySectionTab.Changes) {
      return this.renderChangesSidebar()
    } else if (selectedSection.selectedTab === RepositorySectionTab.History) {
      return enableCompareSidebar()
        ? this.renderCompareSidebar()
        : this.renderHistorySidebar()
    } else {
      return assertNever(selectedSection, 'Unknown repository section')
    }
  }

  private handleSidebarWidthReset = () => {
    this.props.dispatcher.resetSidebarWidth()
  }

  private handleSidebarResize = (width: number) => {
    this.props.dispatcher.setSidebarWidth(width)
  }

  private renderSidebar(): JSX.Element {
    return (
      <FocusContainer onFocusWithinChanged={this.onSidebarFocusWithinChanged}>
        <Resizable
          id="repository-sidebar"
          width={this.props.sidebarWidth}
          onReset={this.handleSidebarWidthReset}
          onResize={this.handleSidebarResize}
          maximumWidth={MaxSidebarWidth}
        >
          {this.renderTabs()}
          {this.renderSidebarContents()}
        </Resizable>
      </FocusContainer>
    )
  }

  private onSidebarFocusWithinChanged = (sidebarHasFocusWithin: boolean) => {
    // this lets us know that focus is somewhere within the sidebar
    this.setState({ sidebarHasFocusWithin })
  }

  private renderContent(): JSX.Element | null {
    const selectedSection = this.props.state.selectedSection

    if (selectedSection.selectedTab === RepositorySectionTab.Changes) {
      const changesState = this.props.state.changesState
      const selectedFileIDs = changesState.selectedFileIDs

      if (selectedFileIDs.length > 1) {
        return <MultipleSelection count={selectedFileIDs.length} />
      }

      if (
        changesState.workingDirectory.files.length === 0 ||
        selectedFileIDs.length === 0 ||
        changesState.diff === null
      ) {
        return <NoChanges repository={this.props.repository} />
      } else {
        const workingDirectory = changesState.workingDirectory
        const selectedFile = workingDirectory.findFileWithID(selectedFileIDs[0])

        if (!selectedFile) {
          return null
        }

        return (
          <Changes
            repository={this.props.repository}
            dispatcher={this.props.dispatcher}
            file={selectedFile}
            diff={changesState.diff}
            imageDiffType={this.props.imageDiffType}
          />
        )
      }
    } else if (selectedSection.selectedTab === RepositorySectionTab.History) {
      return (
        <History
          repository={this.props.repository}
          dispatcher={this.props.dispatcher}
          history={this.props.state.historyState}
          emoji={this.props.emoji}
          commits={this.props.state.commitLookup}
          commitSummaryWidth={this.props.commitSummaryWidth}
          gitHubUsers={this.props.state.gitHubUsers}
          imageDiffType={this.props.imageDiffType}
          externalEditorLabel={this.props.externalEditorLabel}
          onOpenInExternalEditor={this.props.onOpenInExternalEditor}
        />
      )
    } else {
      return assertNever(selectedSection, 'Unknown repository section')
    }
  }

  public render() {
    return (
      <UiView id="repository" onKeyDown={this.onKeyDown}>
        {this.renderSidebar()}
        {this.renderContent()}
      </UiView>
    )
  }

  private onRevertCommit = (commit: Commit) => {
    this.props.dispatcher.revertCommit(this.props.repository, commit)
  }

  private onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Toggle tab selection on Ctrl+Tab. Note that we don't care
    // about the shift key here, we can get away with that as long
    // as there's only two tabs.
    if (e.ctrlKey && e.key === 'Tab') {
      const section: RepositorySection =
        this.props.state.selectedSection.selectedTab ===
        RepositorySectionTab.History
          ? { selectedTab: RepositorySectionTab.Changes }
          : {
              selectedTab: RepositorySectionTab.History,
              shouldShowBranchesList: false,
            }

      this.props.dispatcher.changeRepositorySection(
        this.props.repository,
        section
      )
      e.preventDefault()
    }
  }

  private onTabClicked = (tab: Tab) => {
    const section: RepositorySection =
      tab === Tab.History
        ? {
            selectedTab: RepositorySectionTab.History,
            shouldShowBranchesList: false,
          }
        : { selectedTab: RepositorySectionTab.Changes }

    this.props.dispatcher.changeRepositorySection(
      this.props.repository,
      section
    )
  }
}
