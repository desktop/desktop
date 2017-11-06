import * as React from 'react'
import { Commit } from '../../models/commit'
import { GitHubRepository } from '../../models/github-repository'
import { IAvatarUser } from '../../models/avatar'
import { RichText } from '../lib/rich-text'
import { Avatar } from '../lib/avatar'
import { RelativeTime } from '../relative-time'
import { getDotComAPIEndpoint } from '../../lib/api'
import { clipboard } from 'electron'
import { showContextualMenu, IMenuItem } from '../main-process-proxy'

interface ICommitProps {
  readonly gitHubRepository: GitHubRepository | null
  readonly commit: Commit
  readonly user: IAvatarUser | null
  readonly emoji: Map<string, string>
  readonly isLocal: boolean
  readonly onRevertCommit?: (commit: Commit) => void
  readonly onViewCommitOnGitHub?: (sha: string) => void
}

/** A component which displays a single commit in a commit list. */
export class CommitListItem extends React.Component<ICommitProps, {}> {
  public render() {
    const commit = this.props.commit
    const author = commit.author

    return (
      <div className="commit" onContextMenu={this.onContextMenu}>
        <Avatar user={this.props.user || undefined} />
        <div className="info">
          <RichText
            className="summary"
            emoji={this.props.emoji}
            text={commit.summary}
            renderUrlsAsLinks={false}
          />
          <div className="byline">
            <RelativeTime date={author.date} /> by {author.name}
          </div>
        </div>
      </div>
    )
  }

  public shouldComponentUpdate(nextProps: ICommitProps): boolean {
    return (
      this.props.commit.sha !== nextProps.commit.sha ||
      this.props.user !== nextProps.user
    )
  }

  private onCopySHA = () => {
    clipboard.writeText(this.props.commit.sha)
  }

  private onViewOnGitHub = () => {
    if (this.props.onViewCommitOnGitHub) {
      this.props.onViewCommitOnGitHub(this.props.commit.sha)
    }
  }

  private onContextMenu = (event: React.MouseEvent<any>) => {
    event.preventDefault()

    let viewOnGitHubLabel = 'View on GitHub'
    const gitHubRepository = this.props.gitHubRepository

    if (
      gitHubRepository &&
      gitHubRepository.endpoint !== getDotComAPIEndpoint()
    ) {
      viewOnGitHubLabel = 'View on GitHub Enterprise'
    }

    const items: IMenuItem[] = [
      {
        label: __DARWIN__ ? 'Revert This Commit' : 'Revert this commit',
        action: () => {
          if (this.props.onRevertCommit) {
            this.props.onRevertCommit(this.props.commit)
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Copy SHA',
        action: this.onCopySHA,
      },
      {
        label: viewOnGitHubLabel,
        action: this.onViewOnGitHub,
        enabled: !this.props.isLocal && !!gitHubRepository,
      },
    ]

    showContextualMenu(items)
  }
}
