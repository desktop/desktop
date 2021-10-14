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
import { HighlightText } from '../lib/highlight-text'
import * as OcticonSymbol from '../octicons/octicons.generated'
import moment from 'moment'
import { PopupType } from '../../models/popup'
import { RepositoryWithGitHubRepository } from '../../models/repository'
import { IIssue } from '../../lib/databases'
import { Ref } from '../lib/ref'
import { encodePathAsUrl } from '../../lib/path'

const BlankSlateImage = encodePathAsUrl(
  __dirname,
  'static/empty-no-pull-requests.svg'
)

interface IIssueListItem extends IFilterListItem {
  readonly issue: IIssue
}

export const RowHeight = 47

interface IIssueListProps {
  readonly dispatcher: Dispatcher
  readonly repository: RepositoryWithGitHubRepository

  /** The open issues in the repository. */
  readonly openIssues: ReadonlyArray<IIssue>

  /** Are we currently loading issues */
  readonly isLoadingIssues: boolean

  /** Called when the user wants to dismiss the foldout. */
  readonly onDismiss: () => void
}

interface IIssueListState {
  readonly filterText: string
  readonly selectedItem: IIssueListItem | null
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
      selectedItem: null,
    }
  }

  public render() {
    const { openIssues } = this.props
    const groups = this.createListItems(openIssues)
    return (
      <div className="issue-list-container">
        <FilterList<IIssueListItem>
          className="issue-list"
          rowHeight={RowHeight}
          groups={groups}
          selectedItem={this.state.selectedItem}
          renderItem={this.renderIssue}
          filterText={this.state.filterText}
          onFilterTextChanged={this.onFilterTextChanged}
          invalidationProps={[
            this.props.openIssues,
            this.props.isLoadingIssues,
          ]}
          onItemClick={this.onItemClick}
          renderGroupHeader={this.renderListHeader}
          renderNoItems={this.renderNoItems}
          renderPostFilter={this.renderPostFilter}
        />
      </div>
    )
  }

  private renderNoItems = () => {
    let title = (
      <div>
        <div className="title">You're all set!</div>
        <div className="no-prs">
          No open issues in{' '}
          <Ref>{this.props.repository.gitHubRepository.fullName}</Ref>
        </div>
      </div>
    )

    if (this.state.filterText.length > 0) {
      title = <div className="title">Sorry, I can't find that issue!</div>
    }

    if (this.props.isLoadingIssues) {
      title = (
        <div className="title">
          Hang tight
          <div className="call-to-action">Loading issues as fast as I can!</div>
        </div>
      )
    }

    return (
      <div className="no-pull-requests">
        <img src={BlankSlateImage} className="blankslate-image" />
        {title}
      </div>
    )
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
    })
  }

  private renderListHeader = (identifier: string) => {
    if (identifier === 'assigned-issues') {
      return <div className="filter-list-group-header">Your Issues</div>
    }
    return (
      <div className="filter-list-group-header">
        Issues in {this.props.repository.gitHubRepository.fullName}
      </div>
    )
  }

  private onRefreshIssues = async () => {
    this.props.dispatcher.refreshIssues(this.props.repository)
  }

  private renderPostFilter = () => {
    return (
      <Button
        disabled={this.props.isLoadingIssues}
        onClick={this.onRefreshIssues}
        tooltip="Refresh the list of issues"
      >
        <Octicon
          symbol={syncClockwise}
          className={this.props.isLoadingIssues ? 'spin' : undefined}
        />
      </Button>
    )
  }

  private onFilterTextChanged = (text: string) => {
    this.setState({ filterText: text })
  }

  private createListItems(
    issues: ReadonlyArray<IIssue>
  ): ReadonlyArray<IFilterListGroup<IIssueListItem>> {
    const sortedIssues = [...issues].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    const assigned = sortedIssues
      .filter(i => i.assignees.includes('tidy-dev'))
      .map(issue => ({
        text: [issue.title, getIssueSubtitle(issue)],
        id: issue.number.toString(),
        issue,
      }))

    const notAssigned = sortedIssues
      .filter(i => !assigned.map(i => i.issue.number).includes(i.number))
      .map(issue => ({
        text: [issue.title, getIssueSubtitle(issue)],
        id: issue.number.toString(),
        issue,
      }))

    return [
      {
        identifier: 'assigned-issues',
        items: assigned,
      },
      {
        identifier: 'not-assigned-issues',
        items: notAssigned,
      },
    ]
  }
}

export function getIssueSubtitle(issue: IIssue) {
  const timeAgo = moment(issue.created_at).fromNow()
  return `#${issue.number} opened ${timeAgo} by ${issue.author}`
}
