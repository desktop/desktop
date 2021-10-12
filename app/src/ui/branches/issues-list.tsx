import * as React from 'react'
import {
  FilterList,
  IFilterListGroup,
  IFilterListItem,
} from '../lib/filter-list'
import { IMatches } from '../../lib/fuzzy-find'
import { Dispatcher } from '../dispatcher'
import { Button } from '../lib/button'
import { Octicon, syncClockwise } from '../octicons'
import { GitHubRepository } from '../../models/github-repository'
import { IAPIIssue } from '../../lib/api'
import { HighlightText } from '../lib/highlight-text'
import * as OcticonSymbol from '../octicons/octicons.generated'
import moment from 'moment'
import { PopupType } from '../../models/popup'

interface IIssueListItem extends IFilterListItem {
  readonly issue: IAPIIssue
}

export const RowHeight = 47

interface IIssueListProps {
  /** Called when the user wants to dismiss the foldout. */
  readonly onDismiss: () => void
  readonly dispatcher: Dispatcher
  readonly repository: GitHubRepository
}

interface IIssueListState {
  readonly filterText: string
  readonly selectedItem: IIssueListItem | null
  readonly isLoadingIssues: boolean
  readonly issues: ReadonlyArray<IAPIIssue>
}

/** The list of open issues. */
export class IssueList extends React.Component<
  IIssueListProps,
  IIssueListState
> {
  public constructor(props: IIssueListProps) {
    super(props)

    this.state = {
      filterText: '',
      issues: [],
      selectedItem: null,
      isLoadingIssues: true,
    }
  }

  public componentDidMount() {
    this.onRefreshIssues()
  }

  public render() {
    if (this.state.isLoadingIssues) {
      return <div> Loading up these issues for you!</div>
    }

    const groups = this.createListItems(this.state.issues)

    return (
      <FilterList<IIssueListItem>
        className="pull-request-list"
        rowHeight={RowHeight}
        groups={[groups]}
        selectedItem={this.state.selectedItem}
        renderItem={this.renderIssue}
        filterText={this.state.filterText}
        onFilterTextChanged={this.onFilterTextChanged}
        invalidationProps={[]}
        onItemClick={this.onItemClick}
        renderGroupHeader={this.renderListHeader}
        renderNoItems={this.renderNoItems}
        renderPostFilter={this.renderPostFilter}
      />
    )
  }

  private renderNoItems = () => {
    return <div> Sorry.. No Issues for that!</div>
  }

  private renderIssue = (item: IIssueListItem, matches: IMatches) => {
    const { title } = item.issue

    return (
      <div className="pull-request-item">
        <div style={{ color: 'green' }}>
          <Octicon className="icon" symbol={OcticonSymbol.issueOpened} />
        </div>
        <div className="info">
          <div className="title" title={title}>
            <HighlightText text={title || ''} highlight={matches.title} />
          </div>
          <div className="subtitle" title={item.text[1]}>
            <HighlightText
              text={item.text[1] || ''}
              highlight={matches.subtitle}
            />
          </div>
        </div>
      </div>
    )
  }

  private onItemClick = (item: IIssueListItem) => {
    this.props.dispatcher.showPopup({
      type: PopupType.Issue,
      issue: item.issue,
      onSubmit: () => {
        console.log('Lets get started!')
      },
    })
  }

  private renderListHeader = () => {
    return (
      <div className="filter-list-group-header">
        Issues in {this.props.repository.fullName}
      </div>
    )
  }

  private onRefreshIssues = async () => {
    this.setState({ isLoadingIssues: true })

    const issues = await this.props.dispatcher.getOpenIssues(
      this.props.repository
    )
    this.setState({ issues, isLoadingIssues: false })
  }

  private renderPostFilter = () => {
    return (
      <Button
        disabled={this.state.isLoadingIssues}
        onClick={this.onRefreshIssues}
        tooltip="Refresh the list of issues"
      >
        <Octicon
          symbol={syncClockwise}
          className={this.state.isLoadingIssues ? 'spin' : undefined}
        />
      </Button>
    )
  }

  private onFilterTextChanged = (text: string) => {
    this.setState({ filterText: text })
  }

  private createListItems(
    issues: ReadonlyArray<IAPIIssue>
  ): IFilterListGroup<IIssueListItem> {
    const items = issues.map(issue => ({
      text: [issue.title, getIssueSubtitle(issue)],
      id: issue.number.toString(),
      issue,
    }))

    return {
      identifier: 'issues',
      items,
    }
  }
}

export function getIssueSubtitle(issue: IAPIIssue) {
  const timeAgo = moment(issue.created_at).fromNow()
  return `#${issue.number} opened ${timeAgo} by ${issue.user.login}`
}
