import { expect } from 'chai'
import { inferComparisonBranch } from '../../src/lib/stores/helpers/infer-comparison-branch'
import { Branch, BranchType, IAheadBehind } from '../../src/models/branch'
import { Commit } from '../../src/models/commit'
import { CommitIdentity } from '../../src/models/commit-identity'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'
import { PullRequest, PullRequestRef } from '../../src/models/pull-request'
import { Repository } from '../../src/models/repository'

function createTestCommit(sha: string) {
  return new Commit(
    sha,
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
  name: string,
  defaultBranch: string | null = null,
  parent: GitHubRepository | null = null
) {
  return new GitHubRepository(
    name,
    new Owner('', '', null),
    null,
    false,
    '',
    defaultBranch,
    '',
    parent
  )
}

function createTestPrRef(
  branch: Branch,
  ghRepo: GitHubRepository | null = null
) {
  return new PullRequestRef(branch.name, branch.tip.sha, ghRepo)
}

function createTestPr(head: PullRequestRef, base: PullRequestRef) {
  return new PullRequest(-1, new Date(), null, '', 1, head, base, '')
}

function createTestRepo(ghRepo: GitHubRepository | null = null) {
  return new Repository('', -1, ghRepo, false)
}

function mockGetAheadBehind(
  repository: Repository,
  range: string
): Promise<IAheadBehind | null> {
  return Promise.resolve(null)
}

describe('inferComparisonBranch', () => {
  const branches = [
    createTestBranch('master', '0'),
    createTestBranch('dev', '1'),
    createTestBranch('staging', '2'),
    createTestBranch('default', '3', 'origin/master'),
    createTestBranch('head', '4', 'head/master1'),
    createTestBranch('base', '5', 'base/master2'),
  ]

  it('Returns the master branch when given unhosted repo', async () => {
    const repo = createTestRepo()
    const branch = await inferComparisonBranch(
      branches,
      repo,
      null,
      null,
      mockGetAheadBehind
    )

    expect(branch).is.not.null
    expect(branch!.tip.sha).to.equal('0')
  })

  it('Returns the default branch of a GitHub repository', async () => {
    const ghRepo: GitHubRepository = createTestGhRepo('test', 'default')
    const repo = createTestRepo(ghRepo)

    const branch = await inferComparisonBranch(
      branches,
      repo,
      null,
      null,
      mockGetAheadBehind
    )

    expect(branch).is.not.null
    expect(branch!.name).to.equal('default')
  })

  it('Returns the branch associated with the PR', async () => {
    const ghRepo: GitHubRepository = createTestGhRepo('test', 'default')
    const repo = createTestRepo(ghRepo)
    const head = createTestPrRef(branches[4])
    const base = createTestPrRef(branches[5])
    const pr: PullRequest = createTestPr(head, base)

    const branch = await inferComparisonBranch(
      branches,
      repo,
      pr,
      null,
      mockGetAheadBehind
    )

    expect(branch).is.not.null
    expect(branch!.upstream).to.equal(branches[5].upstream)
  })

  it('Returns the default branch of the fork if it is ahead of the current branch', async () => {
    const testBranch = branches[3]
    const ghRepo = createTestGhRepo('test', testBranch.name)
    const repo = createTestRepo(ghRepo)
    const ahead = (r: Repository, s: string) => {
      const result: IAheadBehind = { ahead: 1, behind: 0 }
      return Promise.resolve(result)
    }

    const branch = await inferComparisonBranch(
      branches,
      repo,
      null,
      testBranch,
      ahead
    )

    expect(branch).is.not.null
    expect(branch!.upstream).to.equal(testBranch.upstream)
  })

  it("Returns the default branch of the fork's parent branch if the fork is not ahead of the current branch", async () => {
    const testBranch = branches[5]
    const parent = createTestGhRepo('parent', testBranch.name)
    const ghRepo = createTestGhRepo('test', testBranch.name, parent)
    const repo = createTestRepo(ghRepo)
    const notAhead = (r: Repository, s: string) => {
      const result: IAheadBehind = { ahead: 0, behind: 0 }
      return Promise.resolve(result)
    }

    const branch = await inferComparisonBranch(
      branches,
      repo,
      null,
      testBranch,
      notAhead
    )

    expect(branch).is.not.null
    expect(branch!.upstream).to.equal(testBranch.upstream)
  })
})
