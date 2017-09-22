import * as React from 'react'
import { FilterList, IFilterListItem } from '../lib/filter-list'

const RowHeight = 45

/**
 * TS can't parse generic specialization in JSX, so we have to alias it here
 * with the generic type. See https://github.com/Microsoft/TypeScript/issues/6395.
 */
const PullRequestsLoadingList: new () => FilterList<
  IFilterListItem
> = FilterList as any

export class PullRequestsLoading extends React.Component<{}, {}> {
  public render() {
    const items: Array<IFilterListItem> = []
    for (let i = 0; i < 5; i++) {
      items.push({
        text: '',
        id: i.toString(),
      })
    }

    const groups = [
      {
        identifier: '',
        items,
      },
    ]

    return (
      <PullRequestsLoadingList
        className="pull-request-list"
        rowHeight={RowHeight}
        groups={groups}
        selectedItem={null}
        renderItem={this.renderItem}
        invalidationProps={groups}
        filterDisabled={true}
      />
    )
  }

  private renderItem = (item: IFilterListItem) => {
    return <div>hi</div>
  }
}
