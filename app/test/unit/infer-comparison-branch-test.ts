import { inferComparisonBranch } from '../../src/lib/stores/helpers/infer-comparison-branch'
import { Branch, BranchType } from '../../src/models/branch'
import { CommitIdentity } from '../../src/models/commit-identity'
import { GitHubRepository } from '../../src/models/github-repository'
import { PullRequest, PullRequestRef } from '../../src/models/pull-request'
import { Repository } from '../../src/models/repository'
import { IRemote } from '../../src/models/remote'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'

function createTestBranch(
  name: string,
  sha: string,
  remote: string | null = null
) {
  return new Branch(
    name,
    remote,
    {
      sha,
      author: new CommitIdentity('tester', 'tester@test.com', new Date()),
    },
    BranchType.Local
  )
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

  it('Returns the master branch when given unhosted repo', async () => {
    const repo = createTestRepo()
    const branch = await inferComparisonBranch(
      repo,
      branches,
      null,
      mockGetRemotes
    )

    expect(branch).not.toBeNull()
    expect(branch!.tip.sha).toBe('0')
  })

  it('Returns the default branch of a GitHub repository', async () => {
    const ghRepo: GitHubRepository = createTestGhRepo('test', 'default')
    const repo = createTestRepo(ghRepo)

    const branch = await inferComparisonBranch(
      repo,
      branches,
      null,
      mockGetRemotes
    )

    expect(branch).not.toBeNull()
    expect(branch!.name).toBe('default')
  })

  it('Returns the branch associated with the PR', async () => {
    const ghRepo: GitHubRepository = createTestGhRepo('test', 'default')
    const repo = createTestRepo(ghRepo)
    const head = createTestPrRef(branches[4], ghRepo)
    const base = createTestPrRef(branches[5], ghRepo)
    const pr: PullRequest = createTestPr(head, base)

    const branch = await inferComparisonBranch(
      repo,
      branches,
      pr,
      mockGetRemotes
    )

    expect(branch).not.toBeNull()
    expect(branch!.upstream).toBe(branches[5].upstream)
  })

  it("Returns the default branch of the fork's parent branch", async () => {
    const defaultBranchOfParent = branches[5]
    const defaultBranchOfFork = branches[4]
    const parent = createTestGhRepo(
      'parent',
      defaultBranchOfParent.nameWithoutRemote
    )
    const fork = createTestGhRepo('fork', defaultBranchOfFork.name, parent)
    const repo = createTestRepo(fork)

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
      mockGetRemotes
    )

    expect(branch).not.toBeNull()
    expect(branch!.upstream).toBe(defaultBranchOfParent.upstream)
  })
})
