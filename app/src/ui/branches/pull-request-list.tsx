import * as React from 'react'
import {
  FilterList,
  IFilterListGroup,
  IFilterListItem,
} from '../lib/filter-list'
import { PullRequestListItem } from './pull-request-list-item'
import { PullRequest } from '../../models/pull-request'

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

  /**
   * The pull request associated with the current branch. This is used to
   * pre-select the currently checked out PR in the list of pull requests.
   */
  readonly currentPullRequest: PullRequest | null

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

/** The list of open pull requests. */
export class PullRequestList extends React.Component<
  IPullRequestListProps,
  IPullRequestListState
> {
  public constructor(props: IPullRequestListProps) {
    super(props)

    const group = createListItems(props.pullRequests)
    const pullRequest = props.currentPullRequest
    const selectedItem = pullRequest
      ? findItemForPullRequest(group, pullRequest)
      : null

    this.state = {
      groupedItems: [group],
      filterText: '',
      selectedItem,
    }
  }

  public componentWillReceiveProps(nextProps: IPullRequestListProps) {
    if (nextProps.pullRequests === this.props.pullRequests) {
      return
    }

    const group = createListItems(nextProps.pullRequests)
    const currentlySelectedItem = this.state.selectedItem
    const selectedItem = currentlySelectedItem
      ? findItemForPullRequest(group, currentlySelectedItem.pullRequest)
      : null

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

  private renderPullRequest = (item: IPullRequestListItem) => {
    const pr = item.pullRequest
    return (
      <PullRequestListItem
        title={pr.title}
        number={pr.number}
        created={pr.created}
        author={pr.author}
        status={pr.status}
      />
    )
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onItemClick = (selectedItem: IPullRequestListItem) => {
    const pr = selectedItem.pullRequest
    this.props.onPullRequestClicked(pr)
  }

  private onSelectionChanged = (selectedItem: IPullRequestListItem | null) => {
    this.setState({ selectedItem })
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
  return group.items.find(i => i.pullRequest.id === pullRequest.id) || null
}
