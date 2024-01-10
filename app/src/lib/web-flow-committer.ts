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

  if (endpoint !== getDotComAPIEndpoint() && name === 'GitHub Enterprise') {
    // We can't assume that the email address will match any specific format
    // here since the web flow committer email address on GHES is the same as
    // the noreply email which can be configured by domain administrators so
    // we'll just have to assume that for a GitHub hosted repository (but not
    // GitHub.com) a commit author of the name 'GitHub Enterprise' is the web
    // flow author.
    //
    // Hello future contributor: Turns out the web flow committer name is based
    // on the "flavor" of GitHub so it's possible that you're here wondering why
    // this isn't working and chances are it's because we've updated the
    // GHES branding or introduced some new flavor.
    return true
  }

  return false
}
