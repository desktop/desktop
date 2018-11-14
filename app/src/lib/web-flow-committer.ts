import { Commit } from '../models/commit'
import { GitHubRepository } from '../models/github-repository'
import { getDotComAPIEndpoint } from './api'

/**
 * Best-effort attempt to figure out if this commit was committed using
 * the web flow on GitHub.com or GitHub Enterprise. Web flow
 * commits (such as PR merges) will have a special GitHub committer
 * with a noreply email address.
 *
 * For GitHub.com we can be spot on but for GitHub Enterprise it's
 * possible we could fail if they've set up a custom smtp host
 * that doesn't correspond to the hostname.
 */
export function isWebFlowCommitter(
  commit: Commit,
  gitHubRepository: GitHubRepository
) {
  if (!gitHubRepository) {
    return false
  }

  const endpoint = gitHubRepository.owner.endpoint
  const { name, email } = commit.committer

  if (
    endpoint === getDotComAPIEndpoint() &&
    name === 'GitHub' &&
    email === 'noreply@github.com'
  ) {
    return true
  }

  if (name === 'GitHub Enterprise') {
    const host = new URL(endpoint).host.toLowerCase()
    return email.endsWith(`@${host}`)
  }

  return false
}
