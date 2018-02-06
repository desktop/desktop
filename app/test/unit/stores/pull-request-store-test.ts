import { expect } from 'chai'

import { PullRequestStore, RepositoriesStore } from '../../../src/lib/stores'
import {
  TestPullRequestDatabase,
  TestRepositoriesDatabase,
} from '../../helpers/databases'
import { Repository } from '../../../src/models/repository'
import { Account } from '../../../src/models/account'
import { IAPIRepository } from '../../../src/lib/api'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'

describe('PullRequestStore', () => {
  const account = new Account('tester', '', 'token', [], '', 1, '')
  let sut: PullRequestStore | null = null
  let repository: Repository | null = null

  beforeEach(async () => {
    const repositoriesDb = new TestRepositoriesDatabase()
    const pullRequestDb = new TestPullRequestDatabase()
    await Promise.all([repositoriesDb.reset(), pullRequestDb.reset()])

    const repositoriesStore = new RepositoriesStore(repositoriesDb)

    const repoPath = '/test/path'
    repository = await repositoriesStore.addRepository(repoPath)
    const apiRepo: IAPIRepository = {
      clone_url: '',
      default_branch: 'master',
      fork: false,
      html_url: '',
      name: 'test',
      owner: {
        id: 1,
        avatar_url: '',
        email: '',
        login: '',
        name: '',
        type: 'User',
        url: '',
      },
      parent: null,
      private: false,
    }
    repositoriesStore.updateGitHubRepository(repository, '', apiRepo)

    sut = new PullRequestStore(pullRequestDb, repositoriesStore)
  })

  describe('refreshing pull reqeusts', () => {
    it('insers new prs', async () => {
      await sut!.refreshPullRequests(repository!, account)
      const prs = await sut!.getPullRequests(
        new GitHubRepository(
          '',
          new Owner('login', 'endpoint', 1),
          1,
          false,
          null,
          null,
          null,
          null
        )
      )
      expect(prs).is.not.empty
    })
  })
})
