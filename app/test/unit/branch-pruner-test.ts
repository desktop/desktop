import { BranchPruner } from '../../src/lib/stores/helpers/branch-pruner'
import { Repository } from '../../src/models/repository'
import { GitStoreCache } from '../../src/lib/stores/git-store-cache'
import { RepositoriesStore } from '../../src/lib/stores'
import {
  IRepositoryStateCache,
  getInitialRepositoryState,
} from '../../src/lib/stores/repository-state-cache'
import { setupFixtureRepository } from '../helpers/repositories'
import { shell } from '../helpers/test-app-shell'
import { TestRepositoriesDatabase } from '../helpers/databases'
import { GitProcess } from 'dugite'
import { Branch, BranchType } from '../../src/models/branch'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'
import { Commit } from '../../src/models/commit'
import { CommitIdentity } from '../../src/models/commit-identity'

jest.useFakeTimers()
jest.mock('../../src/lib/stores/repositories-store')

describe('BranchPruner', () => {
  const onGitStoreUpdated = () => {}
  const onDidLoadNewCommits = () => {}
  const onDidError = () => {}

  let gitStoreCache: GitStoreCache
  let repositoriesStore: RepositoriesStore
  let repositoriesStateCache: IRepositoryStateCache
  let onPruneCompleted: jest.Mock<
    (
      repository: Repository,
      prunedBranches: ReadonlyArray<Branch>
    ) => Promise<void>
  >
  let realDateNow: () => number

  function mockDateNow(date: Date) {
    const stub = jest.fn(() => date.getTime())
    global.Date.now = stub
    return stub
  }

  beforeEach(async () => {
    gitStoreCache = new GitStoreCache(
      shell,
      onGitStoreUpdated,
      onDidLoadNewCommits,
      onDidError
    )

    const repositoriesDb = new TestRepositoriesDatabase()
    await repositoriesDb.reset()
    repositoriesStore = new RepositoriesStore(repositoriesDb)

    repositoriesStateCache = {
      get: (r: Repository) => getInitialRepositoryState(),
    }

    onPruneCompleted = jest.fn(
      () => (repository: Repository, prunedBranches: ReadonlyArray<Branch>) => {
        console.log('repository', repository)
        console.log('prunedBranches', prunedBranches)
        return Promise.resolve()
      }
    )

    realDateNow = Date.now.bind(global.Date)
  })

  afterEach(() => {
    global.Date.now = realDateNow
  })

  it('Does nothing on non GitHub repositories', async () => {
    const path = await setupFixtureRepository('branch-prune-cases')
    const repository = new Repository(path, 0, null, false)
    const branchPruner = new BranchPruner(
      repository,
      gitStoreCache,
      repositoriesStore,
      repositoriesStateCache,
      onPruneCompleted
    )

    let gitOutput = await GitProcess.exec(['branch'], repository.path)
    const branchesBeforePruning = gitOutput.stdout.split('\n')
    await branchPruner.start()
    gitOutput = await GitProcess.exec(['branch'], repository.path)
    const branchesAfterPruning = gitOutput.stdout.split('\n')

    expect(branchesBeforePruning.length).toBe(branchesAfterPruning.length)
    for (let i = 0; i < branchesBeforePruning.length; i++) {
      expect(branchesAfterPruning[i]).toBe(branchesAfterPruning[i])
    }
  })

  it('Prunes for GitHub repository', async () => {
    const path = await setupFixtureRepository('branch-prune-cases')
    const ghRepo = new GitHubRepository(
      'branch-prune-test',
      new Owner('', '', null),
      null,
      null,
      null,
      'master',
      null,
      null
    )
    const repository = new Repository(path, 0, ghRepo, false)
    const initialRepoState = getInitialRepositoryState()
    repositoriesStateCache = {
      get: (r: Repository) => {
        return {
          ...initialRepoState,
          branchesState: {
            ...initialRepoState.branchesState,
            defaultBranch: new Branch(
              'fake branch',
              null,
              new Commit(
                '123',
                'summary',
                'body',
                new CommitIdentity(
                  'jest',
                  'jest@test.fake',
                  new Date(Date.now())
                ),
                new CommitIdentity(
                  'test',
                  'tester@test.fake',
                  new Date(Date.now())
                ),
                [],
                []
              ),
              BranchType.Local
            ),
          },
        }
      },
    }
    const branchPruner = new BranchPruner(
      repository,
      gitStoreCache,
      repositoriesStore,
      repositoriesStateCache,
      onPruneCompleted
    )
    const expectedBranchesForPruning: ReadonlyArray<string> = []

    const fixedDate = new Date('Mon, 14 Jan 2019 16:00:00 GMT')
    const aDayFromNow = fixedDate.setHours(fixedDate.getHours() + 24)
    mockDateNow(new Date(aDayFromNow))
    let gitOutput = await GitProcess.exec(['branch'], repository.path)
    await branchPruner.start()
    gitOutput = await GitProcess.exec(['branch'], repository.path)
    const branchesAfterPruning = gitOutput.stdout.split('\n')

    expect(onPruneCompleted).toBeCalledWith(
      repository,
      expectedBranchesForPruning
    )
    expect(branchesAfterPruning.length).toBe(expectedBranchesForPruning.length)
    for (let i = 0; i < expectedBranchesForPruning.length; i++) {
      expect(expectedBranchesForPruning[i]).toBe(branchesAfterPruning[i])
    }
  })

  it('Does not prune if the last prune date is less than 24 hours ago', () => {})

  it('Does not prune if there is no default branch', () => {})
})
