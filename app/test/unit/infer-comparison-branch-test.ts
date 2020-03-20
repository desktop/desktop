jest.mock('../../src/lib/git')

import { inferComparisonBranch } from '../../src/lib/stores/helpers/infer-comparison-branch'
import { Branch, BranchType } from '../../src/models/branch'
import { Commit } from '../../src/models/commit'
import { CommitIdentity } from '../../src/models/commit-identity'
import { GitHubRepository } from '../../src/models/github-repository'
import { PullRequest, PullRequestRef } from '../../src/models/pull-request'
import { Repository } from '../../src/models/repository'
import { IRemote } from '../../src/models/remote'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'
import { AheadBehindUpdater } from '../../src/lib/stores/helpers/ahead-behind-updater'
import { getAheadBehind } from '../../src/lib/git'

const mockedGetAheadBehind: jest.Mock<
  typeof getAheadBehind
> = getAheadBehind as any

function createTestCommit(sha: string) {
  return new Commit(
    sha,
    sha.slice(0, 7),
    '',
    '',
    new CommitIdentity('tester', 'tester@test.com', new Date()),
    new CommitIdentity('tester', 'tester@test.com', new Date()),
    [],
    []
  )
}

function createTestBranch(
  name: string,
  sha: string,
  remote: string | null = null
) {
  return new Branch(name, remote, createTestCommit(sha), BranchType.Local)
}

function createTestGhRepo(
  owner: string,
  defaultBranch: string | null = null,
  parent: GitHubRepository | null = null
) {
  return gitHubRepoFixture({
    owner: owner,
    name: 'my-cool-repo',
    defaultBranch: `${
      defaultBranch !== null && defaultBranch.indexOf('/') !== -1
        ? defaultBranch.split('/')[1]
        : defaultBranch
    }`,
    parent: parent || undefined,
  })
}

function createTestPrRef(branch: Branch, ghRepo: GitHubRepository) {
  return new PullRequestRef(branch.name, branch.tip.sha, ghRepo)
}

function createTestPr(head: PullRequestRef, base: PullRequestRef) {
  return new PullRequest(new Date(), '', 1, head, base, '')
}

function createTestRepo(ghRepo: GitHubRepository | null = null) {
  return new Repository('', -1, ghRepo, false)
}

function mockGetRemotes(repo: Repository): Promise<ReadonlyArray<IRemote>> {
  return Promise.resolve([])
}

describe('inferComparisonBranch', () => {
  const branches = [
    createTestBranch('master', '0', 'origin'),
    createTestBranch('dev', '1', 'origin'),
    createTestBranch('staging', '2', 'origin'),
    createTestBranch('default', '3', 'origin'),
    createTestBranch('head', '4', 'origin'),
    createTestBranch('upstream/base', '5', 'upstream'),
    createTestBranch('fork', '6', 'origin'),
  ]

  beforeEach(() => {
    mockedGetAheadBehind.mockReturnValue(
      Promise.resolve({
        ahead: 0,
        behind: 0,
      })
    )
  })

  it('Returns the master branch when given unhosted repo', async () => {
    const repo = createTestRepo()
    const aheadBehindUpdater = new AheadBehindUpdater(repo, () => {})
    const branch = await inferComparisonBranch(
      repo,
      branches,
      null,
      branches[0],
      mockGetRemotes,
      aheadBehindUpdater
    )

    expect(branch).not.toBeNull()
    expect(branch!.tip.sha).toBe('0')
  })

  it('Returns the default branch of a GitHub repository', async () => {
    const ghRepo: GitHubRepository = createTestGhRepo('test', 'default')
    const repo = createTestRepo(ghRepo)
    const aheadBehindUpdater = new AheadBehindUpdater(repo, () => {})

    const branch = await inferComparisonBranch(
      repo,
      branches,
      null,
      branches[0],
      mockGetRemotes,
      aheadBehindUpdater
    )

    expect(branch).not.toBeNull()
    expect(branch!.name).toBe('default')
  })

  it('Returns the branch associated with the PR', async () => {
    const ghRepo: GitHubRepository = createTestGhRepo('test', 'default')
    const repo = createTestRepo(ghRepo)
    const aheadBehindUpdater = new AheadBehindUpdater(repo, () => {})
    const head = createTestPrRef(branches[4], ghRepo)
    const base = createTestPrRef(branches[5], ghRepo)
    const pr: PullRequest = createTestPr(head, base)

    const branch = await inferComparisonBranch(
      repo,
      branches,
      pr,
      branches[0],
      mockGetRemotes,
      aheadBehindUpdater
    )

    expect(branch).not.toBeNull()
    expect(branch!.upstream).toBe(branches[5].upstream)
  })

  it('Returns the default branch of the fork if it is ahead of the current branch', async () => {
    const currentBranch = branches[3]
    const defaultBranch = branches[6]
    const parent = createTestGhRepo('parent', 'parent')
    const fork = createTestGhRepo('fork', 'fork', parent)
    const repo = createTestRepo(fork)
    const aheadBehindUpdater = new AheadBehindUpdater(repo, () => {})

    mockedGetAheadBehind.mockReturnValue(
      Promise.resolve({
        ahead: 1,
        behind: 0,
      })
    )

    const branch = await inferComparisonBranch(
      repo,
      branches,
      null,
      currentBranch,
      mockGetRemotes,
      aheadBehindUpdater
    )

    expect(branch).not.toBeNull()
    expect(branch!.name).toBe(defaultBranch.name)
  })

  it("Returns the default branch of the fork's parent branch if the fork is not ahead of the current branch", async () => {
    const defaultBranchOfParent = branches[5]
    const defaultBranchOfFork = branches[4]
    const parent = createTestGhRepo(
      'parent',
      defaultBranchOfParent.nameWithoutRemote
    )
    const fork = createTestGhRepo('fork', defaultBranchOfFork.name, parent)
    const repo = createTestRepo(fork)
    const aheadBehindUpdater = new AheadBehindUpdater(repo, () => {})
    const mockGetRemotes = (repo: Repository) => {
      const remotes: ReadonlyArray<IRemote> = [
        { name: 'origin', url: fork.cloneURL! },
        { name: 'upstream', url: parent.cloneURL! },
      ]

      return Promise.resolve(remotes)
    }

    const branch = await inferComparisonBranch(
      repo,
      branches,
      null,
      defaultBranchOfParent,
      mockGetRemotes,
      aheadBehindUpdater
    )

    expect(branch).not.toBeNull()
    expect(branch!.upstream).toBe(defaultBranchOfParent.upstream)
  })
})
