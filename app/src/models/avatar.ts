import { IGitHubUser } from '../lib/databases/github-user-database'
import { Commit } from './commit'
import { CommitIdentity } from './commit-identity'
import { GitAuthor } from './git-author'
import { generateGravatarUrl } from '../lib/gravatar'

/** The minimum properties we need in order to display a user's avatar. */
export interface IAvatarUser {
  /** The user's email. */
  readonly email: string

  /** The user's avatar URL. */
  readonly avatarURL: string

  /** The user's name. */
  readonly name: string
}

export function getAvatarUserFromAuthor(
  gitHubUsers: Map<string, IGitHubUser> | null,
  author: CommitIdentity | GitAuthor
) {
  const gitHubUser =
    gitHubUsers === null
      ? null
      : gitHubUsers.get(author.email.toLowerCase()) || null

  const avatarURL = gitHubUser
    ? gitHubUser.avatarURL
    : generateGravatarUrl(author.email)

  return {
    email: author.email,
    name: author.name,
    avatarURL,
  }
}

export function getAvatarUsersForCommit(
  gitHubUsers: Map<string, IGitHubUser> | null,
  commit: Commit
) {
  const avatarUsers = []

  avatarUsers.push(getAvatarUserFromAuthor(gitHubUsers, commit.author))
  avatarUsers.push(
    ...commit.coAuthors.map(x => getAvatarUserFromAuthor(gitHubUsers, x))
  )

  if (!commit.authoredByCommitter) {
    avatarUsers.push(getAvatarUserFromAuthor(gitHubUsers, commit.committer))
  }

  return avatarUsers
}
