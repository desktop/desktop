import * as React from 'react'
import {
  FilterList,
  IFilterListGroup,
  IFilterListItem,
  SelectionSource,
} from '../lib/filter-list'
import { PullRequestListItem } from './pull-request-list-item'
import { PullRequest, PullRequestStatus } from '../../models/pull-request'

interface IPullRequestListItem extends IFilterListItem {
  readonly id: string
  readonly text: string
  readonly pullRequest: PullRequest
}

/**
 * TS can't parse generic specialization in JSX, so we have to alias it here
 * with the generic type. See https://github.com/Microsoft/TypeScript/issues/6395.
 */
const PullRequestFilterList: new () => FilterList<
  IPullRequestListItem
> = FilterList as any

export const RowHeight = 47

interface IPullRequestListProps {
  /** The pull requests to display. */
  readonly pullRequests: ReadonlyArray<PullRequest>

  /** Called when the user clicks on a pull request. */
  readonly onItemClick: (pullRequest: PullRequest) => void

  /** Called when the user wants to dismiss the foldout. */
  readonly onDismiss: () => void

  readonly selectedPullRequest: PullRequest | null

  readonly onSelectionChanged?: (
    pullRequest: PullRequest | null,
    source: SelectionSource
  ) => void
}

interface IPullRequestListState {
  readonly groupedItems: ReadonlyArray<IFilterListGroup<IPullRequestListItem>>
  readonly filterText: string
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
      filterText: '',
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
      <PullRequestFilterList
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
        onFilterKeyDown={this.onFilterKeyDown}
      />
    )
  }

  private renderPullRequest = (
    item: IPullRequestListItem,
    matches: ReadonlyArray<number>
  ) => {
    const pr = item.pullRequest
    const refStatuses = pr.status != null ? pr.status.statuses : []
    const status =
      pr.status != null
        ? new PullRequestStatus(
            pr.number,
            pr.status.state,
            pr.status.totalCount,
            pr.status.sha,
            refStatuses
          )
        : null

    return (
      <PullRequestListItem
        title={pr.title}
        number={pr.number}
        created={pr.created}
        author={pr.author}
        status={status}
        matches={matches}
      />
    )
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
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

  private onFilterKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (this.state.filterText.length === 0) {
        this.props.onDismiss()
        event.preventDefault()
      }
    }
  }
}

function createListItems(
  pullRequests: ReadonlyArray<PullRequest>
): IFilterListGroup<IPullRequestListItem> {
  const items = pullRequests.map(pr => ({
    text: pr.title,
    id: pr.number.toString(),
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
    group.items.find(i => i.pullRequest.number === pullRequest.number) || null
  )
}
