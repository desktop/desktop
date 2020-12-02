import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'
import { getDotComAPIEndpoint } from '../../src/lib/api'

let id_counter = 0

/**
 * Most of these fields are passed on to the
 * GitHubRepository constructor directly.
 *
 * Notable exception: `endpoint`
 */
interface IGitHubRepoFixtureOptions {
  owner: string
  name: string
  parent?: GitHubRepository
  /** defaults to 'master' */
  defaultBranch?: string
  isPrivate?: boolean

  /**
   * Defaults to github.com if omitted.
   * We make an attempt at constructing a meaningful non-github.com
   * clone url and html url from this, even if its ''.
   */
  endpoint?: string
}

/**
 * Makes a fairly standard `GitHubRepository` for use in tests.
 * Ensures a unique `dbID` for each, during a test run.
 *
 * @param options
 * @returns a new GitHubRepository model
 */
export function gitHubRepoFixture({
  owner,
  name,
  parent,
  defaultBranch,
  endpoint,
  isPrivate,
}: IGitHubRepoFixtureOptions): GitHubRepository {
  const htmlUrl = `${
    endpoint !== undefined ? endpoint : 'https://github.com'
  }/${owner}/${name}`
  return new GitHubRepository(
    name,
    new Owner(
      owner,
      endpoint !== undefined ? endpoint : getDotComAPIEndpoint(),
      id_counter++
    ),
    id_counter++,
    isPrivate !== undefined ? isPrivate : null,
    htmlUrl,
    defaultBranch || 'master',
    `${htmlUrl}.git`,
    null,
    null,
    null,
    parent
  )
}
