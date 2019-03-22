import * as React from 'react'
import * as moment from 'moment'
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

  /** The name of the repository. */
  readonly repositoryName: string

  /** Is the default branch currently checked out? */
  readonly isOnDefaultBranch: boolean

  /** The current filter text to render */
  readonly filterText: string

  /** Called when the user clicks on a pull request. */
  readonly onItemClick: (pullRequest: PullRequest) => void

  /** Called when the user wants to dismiss the foldout. */
  readonly onDismiss: () => void

  /** Callback to fire when the filter text is changed */
  readonly onFilterTextChanged: (filterText: string) => void

  /** Called when the user opts to create a branch */
  readonly onCreateBranch: () => void

  /** Called when the user opts to create a pull request */
  readonly onCreatePullRequest: () => void

  /** Called to render content after the filter. */
  readonly renderPostFilter?: () => JSX.Element | null

  /** Callback fired when user selects a new pull request */
  readonly onSelectionChanged?: (
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
}

interface IPullRequestListState {
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
        filterText={this.props.filterText}
        onFilterTextChanged={this.props.onFilterTextChanged}
        invalidationProps={this.props.pullRequests}
        onItemClick={this.onItemClick}
        onSelectionChanged={this.onSelectionChanged}
        onFilterKeyDown={this.props.onFilterKeyDown}
        renderNoItems={this.renderNoItems}
        renderPostFilter={this.props.renderPostFilter}
      />
    )
  }

  private renderNoItems = () => {
    return (
      <NoPullRequests
        isSearch={this.props.filterText.length > 0}
        repositoryName={this.props.repositoryName}
        isOnDefaultBranch={this.props.isOnDefaultBranch}
        onCreateBranch={this.props.onCreateBranch}
        onCreatePullRequest={this.props.onCreatePullRequest}
      />
    )
  }

  private renderPullRequest = (
    item: IPullRequestListItem,
    matches: IMatches
  ) => {
    const pr = item.pullRequest
    // TODO!
    const status = null

    return (
      <PullRequestListItem
        title={pr.title}
        number={pr.pullRequestNumber}
        created={pr.created}
        author={pr.author}
        status={status}
        matches={matches}
      />
    )
  }

  private onItemClick = (item: IPullRequestListItem) => {
    if (this.props.onItemClick) {
      this.props.onItemClick(item.pullRequest)
    }
  }

  private onSelectionChanged = (
    selectedItem: IPullRequestListItem | null,
    source: SelectionSource
  ) => {
    if (this.props.onSelectionChanged) {
      this.props.onSelectionChanged(
        selectedItem != null ? selectedItem.pullRequest : null,
        source
      )
    }
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
