import * as React from 'react'
import { FilterList, IFilterListItem } from '../lib/filter-list'
import { Octicon, OcticonSymbol } from '../octicons'

const RowHeight = 45

const FacadeCount = 6

/**
 * TS can't parse generic specialization in JSX, so we have to alias it here
 * with the generic type. See https://github.com/Microsoft/TypeScript/issues/6395.
 */
const PullRequestsLoadingList: new () => FilterList<
  IFilterListItem
> = FilterList as any

/** The placeholder for when pull requests are still loading. */
export class PullRequestsLoading extends React.Component<{}, {}> {
  public render() {
    const items: Array<IFilterListItem> = []
    for (let i = 0; i < FacadeCount; i++) {
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
    return (
      <div className="pull-request-loading-item">
        <Octicon className="icon" symbol={OcticonSymbol.gitPullRequest} />

        <div className="info">
          <div className="title" />
          <div className="subtitle" />
        </div>

        <Octicon className="status" symbol={OcticonSymbol.primitiveDot} />
      </div>
    )
  }
}
