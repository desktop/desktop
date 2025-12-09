import * as React from 'react'
import { IAPIIssueWithMetadata } from '../../lib/api'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import classNames from 'classnames'

interface IIssueListPanelProps {
  /** All issues to display */
  readonly issues: ReadonlyArray<IAPIIssueWithMetadata>

  /** Whether issues are currently loading from the API */
  readonly isLoading: boolean

  /** Current state filter */
  readonly stateFilter: 'open' | 'closed' | 'all'

  /** Whether the add issue button should be enabled */
  readonly canCreateIssues: boolean

  /** Called when the refresh button is clicked */
  readonly onRefresh: () => void

  /** Called when an issue is clicked */
  readonly onIssueClick: (issue: IAPIIssueWithMetadata) => void

  /** Called when an issue should be opened in the browser */
  readonly onOpenInBrowser: (issue: IAPIIssueWithMetadata) => void

  /** Called when state filter changes */
  readonly onStateFilterChange: (state: 'open' | 'closed' | 'all') => void

  /** Called when the add issue button is clicked */
  readonly onAddIssue: () => void
}

/** Panel displaying repository issues */
export class IssueListPanel extends React.Component<IIssueListPanelProps> {
  public render() {
    const { issues, isLoading, stateFilter } = this.props

    return (
      <div className="issue-list-panel">
        <header className="issue-list-header">
          <h2>Issues</h2>
          <div className="issue-list-controls">
            <select
              value={stateFilter}
              onChange={e => this.props.onStateFilterChange(e.target.value as 'open' | 'closed' | 'all')}
              className="issue-state-dropdown"
              title="Filter by state"
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="all">All</option>
            </select>
            <button
              className="issue-refresh-button"
              onClick={this.props.onRefresh}
              disabled={isLoading}
              title="Refresh issues"
            >
              <Octicon
                symbol={octicons.sync}
                className={classNames({ spinning: isLoading })}
              />
            </button>
            <button
              className="add-issue-button"
              onClick={this.props.onAddIssue}
              disabled={!this.props.canCreateIssues}
              title="Create new issue"
            >
              <Octicon symbol={octicons.plus} />
            </button>
          </div>
        </header>

        <div className="issue-list">
          {issues.length === 0 ? (
            this.renderEmptyState(isLoading)
          ) : (
            issues.map(issue => this.renderIssueItem(issue))
          )}
        </div>
      </div>
    )
  }

  private renderEmptyState(isLoading: boolean) {
    if (isLoading) {
      return (
        <div className="issue-list-empty-state">
          <Octicon symbol={octicons.sync} className="spinning" />
          <p>Loading issues...</p>
        </div>
      )
    }

    return (
      <div className="issue-list-empty-state">
        <Octicon symbol={octicons.issueOpened} />
        <p>No issues found</p>
      </div>
    )
  }

  private renderIssueItem(issue: IAPIIssueWithMetadata) {
    const stateIcon = issue.state === 'open' ? octicons.issueOpened : octicons.issueClosed
    const stateClass = issue.state === 'open' ? 'open' : 'closed'

    return (
      <div
        key={issue.number}
        className={classNames('issue-item', stateClass)}
        onClick={() => this.props.onIssueClick(issue)}
      >
        <div className="issue-item-header">
          <Octicon symbol={stateIcon} className={`issue-state-icon ${stateClass}`} />
          <span className="issue-number">#{issue.number}</span>
          <span className="issue-title">{issue.title}</span>
        </div>

        <div className="issue-item-meta">
          {issue.labels && issue.labels.length > 0 && (
            <div className="issue-labels">
              {issue.labels.slice(0, 3).map((label, index) => {
                const labelObj = typeof label === 'string' ? { name: label, color: '888888' } : label
                return (
                  <span
                    key={index}
                    className="issue-label"
                    style={{ backgroundColor: `#${labelObj.color}` }}
                  >
                    {labelObj.name}
                  </span>
                )
              })}
              {issue.labels.length > 3 && (
                <span className="issue-label-more">+{issue.labels.length - 3}</span>
              )}
            </div>
          )}

          {issue.assignees && issue.assignees.length > 0 && (
            <div className="issue-assignees">
              {issue.assignees.slice(0, 2).map(assignee => (
                <img
                  key={assignee.id}
                  src={assignee.avatar_url}
                  alt={assignee.login}
                  title={assignee.login}
                  className="issue-assignee-avatar"
                />
              ))}
            </div>
          )}

          {issue.comments !== undefined && issue.comments > 0 && (
            <span className="issue-comments">
              <Octicon symbol={octicons.comment} />
              {issue.comments}
            </span>
          )}
        </div>

        <button
          className="issue-open-external"
          onClick={e => {
            e.stopPropagation()
            this.props.onOpenInBrowser(issue)
          }}
          title="Open in browser"
        >
          <Octicon symbol={octicons.linkExternal} />
        </button>
      </div>
    )
  }
}
