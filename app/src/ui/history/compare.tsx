import * as React from 'react'
import { IGitHubUser } from '../../lib/databases'
import { Commit } from '../../models/commit'
import { CompareType, IRepositoryState, FoldoutType } from '../../lib/app-state'
import { CommitList } from './commit-list'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Dispatcher } from '../../lib/dispatcher'
import { ThrottledScheduler } from '../lib/throttled-scheduler'
import { Button } from '../lib/button'

import { BranchList } from '../branches'
import { TextBox } from '../lib/text-box'

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

  public render() {
    const { showFilterList } = this.state
    const defaultBranch = this.props.repositoryState.branchesState.defaultBranch

    return (
      <div id="compare-view">
        {this.renderSelectList()}
        <TextBox
          type="search"
          placeholder={(defaultBranch && defaultBranch.name) || 'master'}
          onFocus={this.onTextBoxFocused}
          onBlur={this.onTextBoxBlurred}
          value={this.state.filterText}
          onValueChanged={this.onTextBoxValueChanged}
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
    const repositoryState = this.props.repositoryState
    const branchesState = repositoryState.branchesState

    return (
      <BranchList
        defaultBranch={branchesState.defaultBranch}
        currentBranch={this.state.selectedBranch}
        allBranches={branchesState.allBranches}
        recentBranches={branchesState.recentBranches}
        onItemClick={this.onBranchItemClick}
        filterText={this.state.filterText}
        onFilterTextChanged={this.onBranchFilterTextChanged}
        selectedBranch={this.state.selectedBranch}
        onSelectionChanged={this.onBranchSelectionChanged}
        canCreateNewBranch={true}
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
    const branch = this.props.repositoryState.compareState.branch
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

  private renderSelectList() {
    const options = new Array<JSX.Element>()
    const currentBranch = this.props.repositoryState.compareState.branch
    const branchesState = this.props.repositoryState.branchesState
    const allBranches = currentBranch
      ? branchesState.allBranches.filter(b => b.name !== currentBranch.name)
      : branchesState.allBranches

    options.push(
      <option value={-1} key={-1}>
        None
      </option>
    )

    let selectedIndex = -1
    for (const [index, branch] of allBranches.entries()) {
      const selectedBranch = this.state.selectedBranch

      if (selectedBranch !== null && selectedBranch.name === branch.name) {
        selectedIndex = index
      }

      options.push(
        <option value={index} key={branch.name}>
          {branch.name}
        </option>
      )
    }

    return (
      <select value={selectedIndex.toString()} onChange={this.onBranchChanged}>
        {options}
      </select>
    )
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

  private onBranchChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    // options are 0-indexed, option.value is -1-indexed
    const index = parseInt(event.currentTarget.value, 10) + 1
    const branchName =
      index > 0 ? event.currentTarget.options[index].text : null
    const allBranches = this.props.repositoryState.branchesState.allBranches
    const branch =
      allBranches.find(branch => branch.name === branchName) || null
    const compareType =
      branch === null
        ? CompareType.Default
        : this.state.compareType === CompareType.Default
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
    })
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

  private onBranchSelectionChanged = (selectedBranch: Branch | null) => {
    this.setState({ selectedBranch })
  }

  private onBranchFilterTextChanged = (text: string) => {
    this.setState({ filterText: text })
  }

  private onBranchItemClick = (branch: Branch) => {
    this.props.dispatcher.closeFoldout(FoldoutType.Branch)

    const currentBranch = this.state.selectedBranch

    if (currentBranch == null || currentBranch.name !== branch.name) {
      this.props.dispatcher.checkoutBranch(this.props.repository, branch)
    }
  }

  private onTextBoxFocused = () => {
    this.setState({ showFilterList: true })
  }

  private onTextBoxBlurred = () => {
    this.setState({ showFilterList: false })
  }

  private onTextBoxValueChanged = (value: string) => {
    this.setState({ filterText: value })
  }
}
