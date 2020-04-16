import * as React from 'react'
import { Commit } from '../../models/commit'
import { GitHubRepository } from '../../models/github-repository'
import { IAvatarUser, getAvatarUsersForCommit } from '../../models/avatar'
import { RichText } from '../lib/rich-text'
import { RelativeTime } from '../relative-time'
import { getDotComAPIEndpoint } from '../../lib/api'
import { clipboard } from 'electron'
import { showContextualMenu } from '../main-process-proxy'
import { CommitAttribution } from '../lib/commit-attribution'
import { IGitHubUser } from '../../lib/databases/github-user-database'
import { AvatarStack } from '../lib/avatar-stack'
import { IMenuItem } from '../../lib/menu-item'
import { Octicon, OcticonSymbol } from '../octicons'
import { enableGitTagsCreation } from '../../lib/feature-flag'

interface ICommitProps {
  readonly gitHubRepository: GitHubRepository | null
  readonly commit: Commit
  readonly emoji: Map<string, string>
  readonly isLocal: boolean
  readonly onRevertCommit?: (commit: Commit) => void
  readonly onViewCommitOnGitHub?: (sha: string) => void
  readonly onCreateTag?: (targetCommitSha: string) => void
  readonly gitHubUsers: Map<string, IGitHubUser> | null
  readonly showUnpushedIndicator: boolean
}

interface ICommitListItemState {
  readonly avatarUsers: ReadonlyArray<IAvatarUser>
}

/** A component which displays a single commit in a commit list. */
export class CommitListItem extends React.Component<
  ICommitProps,
  ICommitListItemState
> {
  public constructor(props: ICommitProps) {
    super(props)

    this.state = {
      avatarUsers: getAvatarUsersForCommit(
        props.gitHubRepository,
        props.gitHubUsers,
        props.commit
      ),
    }
  }

  public componentWillReceiveProps(nextProps: ICommitProps) {
    if (nextProps.commit !== this.props.commit) {
      this.setState({
        avatarUsers: getAvatarUsersForCommit(
          nextProps.gitHubRepository,
          nextProps.gitHubUsers,
          nextProps.commit
        ),
      })
    }
  }

  public render() {
    const commit = this.props.commit
    const {
      author: { date },
    } = commit

    return (
      <div className="commit" onContextMenu={this.onContextMenu}>
        <div className="info">
          <RichText
            className="summary"
            emoji={this.props.emoji}
            text={commit.summary}
            renderUrlsAsLinks={false}
          />
          <div className="description">
            <AvatarStack users={this.state.avatarUsers} />
            <div className="byline">
              <CommitAttribution
                gitHubRepository={this.props.gitHubRepository}
                commit={commit}
              />
              {renderRelativeTime(date)}
            </div>
          </div>
        </div>
        {this.renderUnpushedIndicator()}
      </div>
    )
  }

  public shouldComponentUpdate(nextProps: ICommitProps): boolean {
    return (
      this.props.commit.sha !== nextProps.commit.sha ||
      this.props.showUnpushedIndicator !== nextProps.showUnpushedIndicator
    )
  }

  private renderUnpushedIndicator() {
    if (!this.props.showUnpushedIndicator) {
      return null
    }

    return (
      <div className="unpushed-indicator-container">
        <div
          className="unpushed-indicator"
          title="This commit hasn't been pushed to the remote repository yet"
        >
          <Octicon symbol={OcticonSymbol.arrowUp} />
        </div>
      </div>
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

  private onCreateTag = () => {
    if (this.props.onCreateTag) {
      this.props.onCreateTag(this.props.commit.sha)
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
        label: __DARWIN__ ? 'Revert this Commit' : 'Revert this commit',
        action: () => {
          if (this.props.onRevertCommit) {
            this.props.onRevertCommit(this.props.commit)
          }
        },
        enabled: this.props.onRevertCommit !== undefined,
      },
    ]

    if (enableGitTagsCreation()) {
      items.push({
        label: 'Create Tag…',
        action: this.onCreateTag,
        enabled: this.props.onCreateTag !== undefined,
      })
    }

    items.push(
      { type: 'separator' },
      {
        label: 'Copy SHA',
        action: this.onCopySHA,
      },
      {
        label: viewOnGitHubLabel,
        action: this.onViewOnGitHub,
        enabled: !this.props.isLocal && !!gitHubRepository,
      }
    )

    showContextualMenu(items)
  }
}

function renderRelativeTime(date: Date) {
  return (
    <>
      {` • `}
      <RelativeTime date={date} abbreviate={true} />
    </>
  )
}
