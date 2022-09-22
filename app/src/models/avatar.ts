import { Commit } from './commit'
import { CommitIdentity } from './commit-identity'
import { GitAuthor } from './git-author'
import { GitHubRepository } from './github-repository'
import { isWebFlowCommitter } from '../lib/web-flow-committer'

/** The minimum properties we need in order to display a user's avatar. */
export interface IAvatarUser {
  /** The user's email. */
  readonly email: string

  /** The user's avatar URL. */
  readonly avatarURL: string | undefined

  /** The user's name. */
  readonly name: string

  /**
   * The endpoint of the repository that this user is associated with.
   * This will be https://api.github.com for GitHub.com-hosted
   * repositories, something like `https://github.example.com/api/v3`
   * for GitHub Enterprise and null for local repositories or
   * repositories hosted on non-GitHub services.
   */
  readonly endpoint: string | null
}

export function getAvatarUserFromAuthor(
  author: CommitIdentity | GitAuthor,
  gitHubRepository: GitHubRepository | null
) {
  return {
    email: author.email,
    name: author.name,
    endpoint: gitHubRepository === null ? null : gitHubRepository.endpoint,
    avatarURL: undefined,
  }
}

/**
 * Attempt to look up avatars for all authors (and committer)
 * of a particular commit.
 *
 * Avatars are returned ordered, starting with the author, followed
 * by all co-authors and finally the committer (if different from
 * author and any co-author).
 *
 * @param gitHubRepository
 * @param gitHubUsers
 * @param commit
 */
export function getAvatarUsersForCommit(
  gitHubRepository: GitHubRepository | null,
  commit: Commit
) {
  const avatarUsers = []

  avatarUsers.push(getAvatarUserFromAuthor(commit.author, gitHubRepository))
  avatarUsers.push(
    ...commit.coAuthors.map(x => getAvatarUserFromAuthor(x, gitHubRepository))
  )

  const coAuthoredByCommitter = commit.coAuthors.some(
    x => x.name === commit.committer.name && x.email === commit.committer.email
  )

  const webFlowCommitter =
    gitHubRepository !== null && isWebFlowCommitter(commit, gitHubRepository)

  if (
    !commit.authoredByCommitter &&
    !webFlowCommitter &&
    !coAuthoredByCommitter
  ) {
    avatarUsers.push(
      getAvatarUserFromAuthor(commit.committer, gitHubRepository)
    )
  }

  return avatarUsers
}
