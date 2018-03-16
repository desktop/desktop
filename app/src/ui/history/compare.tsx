import * as React from 'react'
import { IGitHubUser } from '../../lib/databases'
import { Commit } from '../../models/commit'
import { CompareType, IRepositoryState } from '../../lib/app-state'
import { CommitList } from './commit-list'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Dispatcher } from '../../lib/dispatcher'
import { ThrottledScheduler } from '../lib/throttled-scheduler'
import { Button } from '../lib/button'
import { BranchList } from '../branches'
import { TextBox } from '../lib/text-box'
import { TipState } from '../../models/tip'

interface ICompareSidebarProps {
  readonly repository: Repository
  readonly repositoryState: IRepositoryState
  readonly gitHubUsers: Map<string, IGitHubUser>
  readonly emoji: Map<string, string>
  readonly commitLookup: Map<string, Commit>
  readonly localCommitSHAs: ReadonlyArray<string>
  readonly dispatcher: Dispatcher
  readonly onRevertCommit: (commit: Commit) => void
  readonly onViewCommitOnGitHub: (sha: string) => void
}

interface ICompareSidebarState {
  readonly selectedBranch: Branch | null
  readonly compareType: CompareType
  readonly filterText: string
  readonly showFilterList: boolean
}

/** If we're within this many rows from the bottom, load the next history batch. */
const CloseToBottomThreshold = 10

export class CompareSidebar extends React.Component<
  ICompareSidebarProps,
  ICompareSidebarState
> {
  private textbox: TextBox | null = null
  private readonly loadChangedFilesScheduler = new ThrottledScheduler(200)

  public constructor(props: ICompareSidebarProps) {
    super(props)

    this.state = {
      selectedBranch: null,
      filterText: '',
      showFilterList: false,
      compareType: CompareType.Default,
    }
  }

  public componentWillMount() {
    this.props.dispatcher.loadCompareState(
      this.props.repository,
      this.state.selectedBranch,
      CompareType.Default
    )
  }

  public componentWillUnmount() {
    this.textbox = null
  }

  public componentDidMount() {
    if (this.textbox !== null && this.state.showFilterList) {
      if (this.state.showFilterList) {
        this.textbox.focus()
      }
    }
  }

  public render() {
    const { showFilterList, selectedBranch } = this.state
    const placeholderText =
      selectedBranch === null
        ? __DARWIN__ ? 'Select Branch' : 'Select branch'
        : undefined

    return (
      <div id="compare-view">
        <TextBox
          type="search"
          ref={this.onTextBoxRef}
          placeholder={placeholderText}
          onFocus={this.onTextBoxFocused}
          onBlur={this.onTextBoxBlurred}
          value={this.state.filterText}
          onValueChanged={this.onBranchFilterTextChanged}
        />
        {showFilterList ? this.renderFilterList() : this.renderCommits()}
      </div>
    )
  }

  private renderCommits() {
    const { compareType, selectedBranch } = this.state
    const compareState = this.props.repositoryState.compareState

    return (
      <div>
        {selectedBranch ? this.renderRadioButtons() : null}
        <CommitList
          gitHubRepository={this.props.repository.gitHubRepository}
          commitLookup={this.props.commitLookup}
          commitSHAs={compareState.commitSHAs}
          selectedSHA={compareState.selection.sha}
          gitHubUsers={this.props.gitHubUsers}
          localCommitSHAs={this.props.localCommitSHAs}
          emoji={this.props.emoji}
          onViewCommitOnGitHub={this.props.onViewCommitOnGitHub}
          onRevertCommit={this.props.onRevertCommit}
          onCommitSelected={this.onCommitSelected}
          onScroll={this.onScroll}
        />
        {selectedBranch && compareType === CompareType.Ahead
          ? this.renderMergeCTA()
          : null}
      </div>
    )
  }

  private renderFilterList() {
    const {
      branches,
      recentBranches,
      defaultBranch,
      currentBranch,
    } = this.branchState

    return (
      <BranchList
        defaultBranch={defaultBranch}
        currentBranch={currentBranch}
        allBranches={branches}
        recentBranches={recentBranches}
        filterText={this.state.filterText}
        textbox={this.textbox!}
        selectedBranch={this.state.selectedBranch}
        canCreateNewBranch={false}
        onSelectionChanged={this.onSelectionChanged}
        onFilterTextChanged={this.onBranchFilterTextChanged}
        onItemClick={this.onItemClicked}
      />
    )
  }

  private renderMergeCTAMessage() {
    const count = this.props.repositoryState.compareState.behind

    if (count === 0) {
      return null
    }

    const pluralized = count > 1 ? 'commits' : 'commit'

    return (
      <div>
        <p>{`This will merge ${count} ${pluralized}`}</p>
        <br />
        <p>
          from <strong>{this.state.selectedBranch!.name}</strong>
        </p>
      </div>
    )
  }

  private renderMergeCTA() {
    const tip = this.props.repositoryState.branchesState.tip
    if (tip.kind !== TipState.Valid) {
      return null
    }

    const branch = tip.branch
    return (
      <div>
        <Button type="submit" disabled={true} onClick={this.onMergeClicked}>
          Merge into {branch!.name}
        </Button>
        {this.renderMergeCTAMessage()}
      </div>
    )
  }

  private renderRadioButtons() {
    const compareType = this.state.compareType
    const compareState = this.props.repositoryState.compareState

    return (
      <div>
        <input
          id="compare-behind"
          type="radio"
          name="ahead-behind"
          value={CompareType.Behind}
          checked={compareType === CompareType.Behind}
          onChange={this.onRadioButtonChanged}
        />
        <label htmlFor="compare-behind">
          {`Behind (${compareState.behind})`}
        </label>
        <input
          id="compare-ahead"
          type="radio"
          name="ahead-behind"
          value={CompareType.Ahead}
          checked={compareType === CompareType.Ahead}
          onChange={this.onRadioButtonChanged}
        />
        <label htmlFor="compare-ahead">{`Ahead (${compareState.ahead})`}</label>
      </div>
    )
  }

  private get branchState() {
    const branchesState = this.props.repositoryState.branchesState
    const tip = branchesState.tip
    const currentBranch = tip.kind === TipState.Valid ? tip.branch : null
    const branches = currentBranch
      ? branchesState.allBranches.filter(b => b.name !== currentBranch.name)
      : branchesState.allBranches
    const recentBranches = currentBranch
      ? branchesState.recentBranches.filter(b => b.name !== currentBranch.name)
      : branchesState.recentBranches

    return {
      currentBranch,
      branches,
      recentBranches,
      defaultBranch: branchesState.defaultBranch,
    }
  }

  private onRadioButtonChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const compareType = event.currentTarget.value as CompareType

    this.props.dispatcher.loadCompareState(
      this.props.repository,
      this.state.selectedBranch,
      compareType
    )

    this.setState({ compareType })
  }

  private onCommitSelected = (commit: Commit) => {
    this.props.dispatcher.changeHistoryCommitSelection(
      this.props.repository,
      commit.sha
    )

    this.loadChangedFilesScheduler.queue(() => {
      this.props.dispatcher.loadChangedFilesForCurrentSelection(
        this.props.repository
      )
    })
  }

  private onScroll = (start: number, end: number) => {
    const commits = this.props.repositoryState.compareState.commitSHAs

    if (commits.length - end <= CloseToBottomThreshold) {
      this.props.dispatcher.loadNextHistoryBatch(this.props.repository)
    }
  }

  private onMergeClicked = (event: React.MouseEvent<any>) => {
    const branch = this.state.selectedBranch

    if (branch !== null) {
      this.props.dispatcher.mergeBranch(this.props.repository, branch.name)
    }
  }

  private onBranchFilterTextChanged = (text: string) => {
    this.setState({ filterText: text })
  }

  private onSelectionChanged = (branch: Branch | null) => {
    const { branches } = this.branchState
    const compareType =
      this.state.compareType === CompareType.Default
        ? CompareType.Behind
        : CompareType.Ahead

    let selectedBranch: Branch | null = this.state.selectedBranch
    if (branch !== null) {
      const b = branches.find(b => b.name === branch.name) || null
      if (b) {
        selectedBranch = b
      }
    }

    this.props.dispatcher.loadCompareState(
      this.props.repository,
      selectedBranch,
      compareType
    )

    this.setState({
      selectedBranch,
    })
  }

  private onItemClicked = (branch: Branch) => {
    const compareType =
      this.state.compareType === CompareType.Default
        ? CompareType.Behind
        : CompareType.Ahead

    this.props.dispatcher.loadCompareState(
      this.props.repository,
      branch,
      compareType
    )
    this.setState({
      compareType,
      selectedBranch: branch,
      filterText: branch.name,
    })
  }

  private onTextBoxFocused = () => {
    this.setState({ showFilterList: true })
  }

  private onTextBoxBlurred = () => {
    this.setState({ showFilterList: false })
  }

  private onTextBoxRef = (textbox: TextBox) => {
    this.textbox = textbox
  }
}
