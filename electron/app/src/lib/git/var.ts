import { git } from './core'
import { Repository } from '../../models/repository'
import { CommitIdentity } from '../../models/commit-identity'

/**
 * Gets the author identity, ie the name and email which would
 * have been used should a commit have been performed in this
 * instance. This differs from what's stored in the user.name
 * and user.email config variables in that it will match what
 * Git itself will use in a commit even if there's no name or
 * email configured. If no email or name is configured Git will
 * attempt to come up with a suitable replacement using the
 * signed-in system user and hostname.
 *
 * A null return value means that no name/and or email was set
 * and the user.useconfigonly setting prevented Git from making
 * up a user ident string. If this returns null any subsequent
 * commits can be expected to fail as well.
 */
export async function getAuthorIdentity(
  repository: Repository
): Promise<CommitIdentity | null> {
  const result = await git(
    ['var', 'GIT_AUTHOR_IDENT'],
    repository.path,
    'getAuthorIdentity',
    {
      successExitCodes: new Set([0, 128]),
    }
  )

  // If user.user.useconfigonly is set and no user.name or user.email
  if (result.exitCode === 128) {
    return null
  }

  try {
    return CommitIdentity.parseIdentity(result.stdout)
  } catch (err) {
    return null
  }
}
