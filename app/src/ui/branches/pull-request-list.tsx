import * as React from 'react'
import moment from 'moment'
import {
  FilterList,
  IFilterListGroup,
  IFilterListItem,
  SelectionSource,
} from '../lib/filter-list'
import { PullRequestListItem } from './pull-request-list-item'
import { PullRequest } from '../../models/pull-request'
import { NoPullRequests } from './no-pull-requests'
import { IMatches } from '../../lib/fuzzy-find'
import { Dispatcher } from '../dispatcher'
import {
  RepositoryWithGitHubRepository,
  getNonForkGitHubRepository,
} from '../../models/repository'
import { Button } from '../lib/button'
import { Octicon, syncClockwise } from '../octicons'
import { FoldoutType } from '../../lib/app-state'
import { startTimer } from '../lib/timing'

interface IPullRequestListItem extends IFilterListItem {
  readonly id: string
  readonly text: ReadonlyArray<string>
  readonly pullRequest: PullRequest
}

export const RowHeight = 47

interface IPullRequestListProps {
  /** The pull requests to display. */
  readonly pullRequests: ReadonlyArray<PullRequest>

  /** The currently selected pull request */
  readonly selectedPullRequest: PullRequest | null

  /** Is the default branch currently checked out? */
  readonly isOnDefaultBranch: boolean

  /** Called when the user wants to dismiss the foldout. */
  readonly onDismiss: () => void

  /** Called when the user opts to create a branch */
  readonly onCreateBranch: () => void

  /** Callback fired when user selects a new pull request */
  readonly onSelectionChanged: (
    pullRequest: PullRequest | null,
    source: SelectionSource
  ) => void

  /**
   * Called when a key down happens in the filter field. Users have a chance to
   * respond or cancel the default behavior by calling `preventDefault`.
   */
  readonly onFilterKeyDown?: (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => void

  readonly dispatcher: Dispatcher
  readonly repository: RepositoryWithGitHubRepository

  /** Are we currently loading pull requests? */
  readonly isLoadingPullRequests: boolean
}

interface IPullRequestListState {
  readonly filterText: string
  readonly groupedItems: ReadonlyArray<IFilterListGroup<IPullRequestListItem>>
  readonly selectedItem: IPullRequestListItem | null
}

function resolveSelectedItem(
  group: IFilterListGroup<IPullRequestListItem>,
  props: IPullRequestListProps,
  currentlySelectedItem: IPullRequestListItem | null
): IPullRequestListItem | null {
  let selectedItem: IPullRequestListItem | null = null

  if (props.selectedPullRequest != null) {
    selectedItem = findItemForPullRequest(group, props.selectedPullRequest)
  }

  if (selectedItem == null && currentlySelectedItem != null) {
    selectedItem = findItemForPullRequest(
      group,
      currentlySelectedItem.pullRequest
    )
  }

  return selectedItem
}

/** The list of open pull requests. */
export class PullRequestList extends React.Component<
  IPullRequestListProps,
  IPullRequestListState
> {
  public constructor(props: IPullRequestListProps) {
    super(props)

    const group = createListItems(props.pullRequests)
    const selectedItem = resolveSelectedItem(group, props, null)

    this.state = {
      filterText: '',
      groupedItems: [group],
      selectedItem,
    }
  }

  public componentWillReceiveProps(nextProps: IPullRequestListProps) {
    const group = createListItems(nextProps.pullRequests)
    const selectedItem = resolveSelectedItem(
      group,
      nextProps,
      this.state.selectedItem
    )
    this.setState({ groupedItems: [group], selectedItem })
  }

  public render() {
    return (
      <FilterList<IPullRequestListItem>
        className="pull-request-list"
        rowHeight={RowHeight}
        groups={this.state.groupedItems}
        selectedItem={this.state.selectedItem}
        renderItem={this.renderPullRequest}
        filterText={this.state.filterText}
        onFilterTextChanged={this.onFilterTextChanged}
        invalidationProps={this.props.pullRequests}
        onItemClick={this.onItemClick}
        onSelectionChanged={this.onSelectionChanged}
        onFilterKeyDown={this.props.onFilterKeyDown}
        renderGroupHeader={this.renderListHeader}
        renderNoItems={this.renderNoItems}
        renderPostFilter={this.renderPostFilter}
      />
    )
  }

  private renderNoItems = () => {
    return (
      <NoPullRequests
        isSearch={this.state.filterText.length > 0}
        isLoadingPullRequests={this.props.isLoadingPullRequests}
        repositoryName={this.getRepositoryName()}
        isOnDefaultBranch={this.props.isOnDefaultBranch}
        onCreateBranch={this.props.onCreateBranch}
        onCreatePullRequest={this.onCreatePullRequest}
      />
    )
  }

  private renderPullRequest = (
    item: IPullRequestListItem,
    matches: IMatches
  ) => {
    const pr = item.pullRequest

    return (
      <PullRequestListItem
        title={pr.title}
        number={pr.pullRequestNumber}
        created={pr.created}
        author={pr.author}
        draft={pr.draft}
        matches={matches}
        dispatcher={this.props.dispatcher}
        repository={pr.base.gitHubRepository}
      />
    )
  }

  private onItemClick = (
    item: IPullRequestListItem,
    source: SelectionSource
  ) => {
    const pullRequest = item.pullRequest

    this.props.dispatcher.closeFoldout(FoldoutType.Branch)
    const timer = startTimer(
      'checkout pull request from list',
      this.props.repository
    )
    this.props.dispatcher
      .checkoutPullRequest(this.props.repository, pullRequest)
      .then(() => timer.done())

    this.props.onSelectionChanged(pullRequest, source)
  }

  private onSelectionChanged = (
    selectedItem: IPullRequestListItem | null,
    source: SelectionSource
  ) => {
    this.props.onSelectionChanged(
      selectedItem != null ? selectedItem.pullRequest : null,
      source
    )
  }

  private getRepositoryName(): string {
    return getNonForkGitHubRepository(this.props.repository).fullName
  }

  private renderListHeader = () => {
    return (
      <div className="filter-list-group-header">
        Pull requests in {this.getRepositoryName()}
      </div>
    )
  }

  private onRefreshPullRequests = () => {
    this.props.dispatcher.refreshPullRequests(this.props.repository)
  }

  private renderPostFilter = () => {
    return (
      <Button
        disabled={this.props.isLoadingPullRequests}
        onClick={this.onRefreshPullRequests}
        tooltip="Refresh the list of pull requests"
      >
        <Octicon
          symbol={syncClockwise}
          className={this.props.isLoadingPullRequests ? 'spin' : undefined}
        />
      </Button>
    )
  }

  private onFilterTextChanged = (text: string) => {
    this.setState({ filterText: text })
  }

  private onCreatePullRequest = () => {
    this.props.dispatcher.closeFoldout(FoldoutType.Branch)
    this.props.dispatcher.createPullRequest(this.props.repository)
  }
}

function getSubtitle(pr: PullRequest) {
  const timeAgo = moment(pr.created).fromNow()
  return `#${pr.pullRequestNumber} opened ${timeAgo} by ${pr.author}`
}

function createListItems(
  pullRequests: ReadonlyArray<PullRequest>
): IFilterListGroup<IPullRequestListItem> {
  const items = pullRequests.map(pr => ({
    text: [pr.title, getSubtitle(pr)],
    id: pr.pullRequestNumber.toString(),
    pullRequest: pr,
  }))

  return {
    identifier: 'pull-requests',
    items,
  }
}

function findItemForPullRequest(
  group: IFilterListGroup<IPullRequestListItem>,
  pullRequest: PullRequest
): IPullRequestListItem | null {
  return (
    group.items.find(
      i => i.pullRequest.pullRequestNumber === pullRequest.pullRequestNumber
    ) || null
  )
}
