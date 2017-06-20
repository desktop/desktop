import * as React from 'react'
import { Commit } from '../../models/commit'
import { CommitListItem } from './commit-list-item'
import { FilterList, IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { IGitHubUser } from '../../lib/dispatcher'

const RowHeight = 48

/**
 * TS can't parse generic specialization in JSX, so we have to alias it here
 * with the generic type. See https://github.com/Microsoft/TypeScript/issues/6395.
 */
const CommitsFilterList: new() => FilterList<ICommitListItem> = FilterList as any


interface ICommitListProps {
  readonly onCommitChanged: (commit: Commit) => void
  readonly onScroll: (start: number, end: number) => void
  readonly history: ReadonlyArray<string>
  readonly commits: Map<string, Commit>
  readonly selectedSHA: string | null
  readonly gitHubUsers: Map<string, IGitHubUser>
  readonly emoji: Map<string, string>
}

interface ICommitListItem extends IFilterListItem {
  readonly text: string
  readonly id: string
  readonly sha: string
}

/** A component which displays the list of commits. */
export class CommitList extends React.Component<ICommitListProps, void> {

  private renderCommit = ({ sha }: ICommitListItem) => {
    const commit = this.props.commits.get(sha)
    if (!commit) {
      return null
    }

    const gitHubUser = this.props.gitHubUsers.get(commit.author.email.toLowerCase()) || null
    let avatarUser = null
    if (gitHubUser) {
      avatarUser = { ...commit.author, avatarURL: gitHubUser.avatarURL }
    }

    return <CommitListItem key={commit.sha} commit={commit} user={avatarUser} emoji={this.props.emoji}/>
  }

  private onRowChanged = (item: ICommitListItem) => {
    if (!item) {
      return
    }
    const { sha } = item
    const commit = this.props.commits.get(sha)
    if (commit) {
      this.props.onCommitChanged(commit)
    }
  }

  private onScroll = (scrollTop: number, clientHeight: number) => {
    const numberOfRows = Math.ceil(clientHeight / RowHeight)
    const top = Math.floor(scrollTop / RowHeight)
    const bottom = top + numberOfRows
    this.props.onScroll(top, bottom)
  }

  private rowForSHA(sha_: string | null): number {
    const sha = sha_
    if (!sha) { return -1 }

    return this.props.history.findIndex(s => s === sha)
  }

  private get listGroups(): ReadonlyArray<IFilterListGroup<ICommitListItem>> {
    return [
      {
        identifier: 'files',
        hasHeader: false,
        items: this.props.history.map(sha => {
          const commit = this.props.commits.get(sha) || {
            summary: false,
            body: false,
            author: {
              name: false,
              email: false,
            },
          }
          return {
            id: sha,
            text: [ commit.summary, commit.body, commit.author.name, commit.author.email ].filter(x => x).join(' '),
            sha,
          }
        }).filter(x => x.id.length),
      },
    ]
  }

  public render() {

    if (this.props.history.length === 0) {
      return (
        <div className='panel blankslate'>
          No history
        </div>
      )
    }

    return (
      <div id='commit-list'>
        <CommitsFilterList
          groups={this.listGroups}
          rowHeight={RowHeight}
          selectedItem={this.listGroups[0].items[this.rowForSHA(this.props.selectedSHA)]}
          renderItem={this.renderCommit}
          onSelectionChanged={this.onRowChanged}
          onScroll={this.onScroll}
          invalidationProps={{
            history: this.props.history,
            gitHubUsers: this.props.gitHubUsers,
          }}
        />
      </div>
    )
  }
}
