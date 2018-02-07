import { expect } from 'chai'

import { PullRequestStore } from '../../../src/lib/stores'
import {
  TestPullRequestDatabase,
  TestRepositoriesDatabase,
} from '../../helpers/databases'
import { Repository } from '../../../src/models/repository'
import { Account } from '../../../src/models/account'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { IAPIRepository } from '../../../src/lib/api'

const findGitHubRepositoryByIDStub = (
  id: number
): Promise<GitHubRepository | null> => {
  return Promise.resolve(
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
}

const findOrPutGitHubRepositoryStub = (
  endpoint: string,
  apiRepository: IAPIRepository
): Promise<GitHubRepository> => {
  return Promise.resolve(
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
}

describe('PullRequestStore', () => {
  const account = new Account('tester', '', 'token', [], '', 1, '')
  let sut: PullRequestStore | null = null
  let repository: Repository | null = null

  beforeEach(async () => {
    const repositoriesDb = new TestRepositoriesDatabase()
    const pullRequestDb = new TestPullRequestDatabase()
    await Promise.all([repositoriesDb.reset(), pullRequestDb.reset()])

    sut = new PullRequestStore(
      pullRequestDb,
      findOrPutGitHubRepositoryStub,
      findGitHubRepositoryByIDStub
    )
  })

  describe('refreshing pull reqeusts', () => {
    it.only('insers new prs', async () => {
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
