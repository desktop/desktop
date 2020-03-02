import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'
import { getDotComAPIEndpoint } from '../../src/lib/api'

let id_counter = 0

export function gitHubRepoFixture({
  owner,
  name,
  parent,
  defaultBranch,
  endpoint,
}: {
  owner: string
  name: string
  parent?: GitHubRepository
  defaultBranch?: string
  endpoint?: string
}) {
  return new GitHubRepository(
    name,
    new Owner(
      owner,
      endpoint !== undefined ? endpoint : getDotComAPIEndpoint(),
      null
    ),
    id_counter++,
    null,
    endpoint !== undefined
      ? `${endpoint}/${owner}/${name}`
      : `https://github.com/${owner}/${name}`,
    defaultBranch || 'master',
    endpoint !== undefined
      ? `${endpoint}/${owner}/${name}.git`
      : `https://github.com/${owner}/${name}.git`,
    null,
    parent
  )
}
