import { Repository, nameOf } from '../../src/models/repository'
import { plainGitHubRepo } from '../helpers/github-repo-builder'

const repoPath = '/some/cool/path'

describe('nameOf', () => {
  it('Returns the repo base path if there is no associated github metadata', () => {
    const repo = new Repository(repoPath, -1, null, false)

    const name = nameOf(repo)

    expect(name).toBe('path')
  })

  it('Returns the name of the repo', () => {
    const ghRepo = plainGitHubRepo({ owner: 'desktop', name: 'name' })
    const repo = new Repository(repoPath, -1, ghRepo, false)

    const name = nameOf(repo)

    expect(name).toBe('desktop/name')
  })
})
