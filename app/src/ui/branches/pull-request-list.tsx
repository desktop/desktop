import * as React from 'react'
import { IPullRequest } from '../../models/pull-request'
import { FilterList, IFilterListGroup } from '../lib/filter-list'
import {
  IPullRequestListItem,
  PullRequestListItem,
} from './pull-request-list-item'

/**
 * TS can't parse generic specialization in JSX, so we have to alias it here
 * with the generic type. See https://github.com/Microsoft/TypeScript/issues/6395.
 */
const PullRequestFilterList: new () => FilterList<
  IPullRequestListItem
> = FilterList as any

const RowHeight = 45

interface IPullRequestListProps {
  readonly pullRequests: ReadonlyArray<IPullRequest>
}

interface IPullRequestListState {
  readonly groupedItems: ReadonlyArray<IFilterListGroup<IPullRequestListItem>>
  readonly filterText: string
  readonly selectedItem: IPullRequestListItem | null
}

export class PullRequestList extends React.Component<
  IPullRequestListProps,
  IPullRequestListState
> {
  public constructor(props: IPullRequestListProps) {
    super(props)

    this.state = {
      groupedItems: [createListItems(props.pullRequests)],
      filterText: '',
      selectedItem: null,
    }
  }

  public componentWillReceiveProps(nextProps: IPullRequestListProps) {
    if (nextProps.pullRequests === this.props.pullRequests) {
      return
    }

    this.setState({ groupedItems: [createListItems(nextProps.pullRequests)] })
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
        author={pr.user.login}
        status={pr.state}
      />
    )
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onItemClick = (selectedItem: IPullRequestListItem) => {
    console.log(selectedItem)
  }
}

function createListItems(
  pullRequests: ReadonlyArray<IPullRequest>
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
