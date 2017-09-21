import * as React from 'react'
import { IPullRequest } from '../../models/pull-request'
import {
  FilterList,
  IFilterListItem,
  IFilterListGroup,
} from '../lib/filter-list'

interface IPullRequestListItem extends IFilterListItem {
  readonly id: string
  readonly text: string
  readonly pullRequest: IPullRequest
}

/**
 * TS can't parse generic specialization in JSX, so we have to alias it here
 * with the generic type. See https://github.com/Microsoft/TypeScript/issues/6395.
 */
const PullRequestFilterList: new () => FilterList<
  IPullRequestListItem
> = FilterList as any

const RowHeight = 30

interface IPullRequestListProps {
  readonly pullRequests: ReadonlyArray<IPullRequest>
}

interface IPullRequestListState {
  readonly groupedItems: ReadonlyArray<IFilterListGroup<IPullRequestListItem>>
  readonly filterText: string
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
        selectedItem={null}
        renderItem={this.renderPullRequest}
        filterText={this.state.filterText}
        onFilterTextChanged={this.onFilterTextChanged}
        invalidationProps={this.props.pullRequests}
      />
    )
  }

  private renderPullRequest = (pullRequestItem: IPullRequestListItem) => {
    return <div>{pullRequestItem.pullRequest.title}</div>
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
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
