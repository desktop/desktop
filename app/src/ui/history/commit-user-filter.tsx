import * as React from 'react'

interface ICommitUserFilterProps {
  readonly authors: ReadonlyArray<string>
  readonly selectedUser: string | null
  readonly onUserChanged: (user: string | null) => void
}

export class CommitUserFilter extends React.Component<ICommitUserFilterProps> {
  private onChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value
    this.props.onUserChanged(value === '' ? null : value)
  }

  public render() {
    const { authors, selectedUser } = this.props
    return (
      <div className="commit-user-filter-container">
        <label className="filter-label" htmlFor="commit-user-filter-select">
          Filter by Author:
        </label>
        <select
          id="commit-user-filter-select"
          className="commit-user-filter"
          value={selectedUser || ''}
          onChange={this.onChange}
        >
          <option value="">All Users</option>
          {authors.map(author => (
            <option key={author} value={author}>
              {author}
            </option>
          ))}
        </select>
      </div>
    )
  }
}
