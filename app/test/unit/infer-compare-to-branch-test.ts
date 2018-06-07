import { expect } from 'chai'
import {
  _getMasterBranch,
  _getDeafultBranchOfGithubRepo,
  _getFeatureBranchOfPullRequest,
  _getDefaultBranchOfFork,
} from '../../src/lib/stores/helpers/infer-comparison-branch'
import { Branch, BranchType } from '../../src/models/branch'
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

describe('inferComparisonBranch Helpers', () => {
  const branches = [
    createTestBranch('master', '0'),
    createTestBranch('dev', '1'),
    createTestBranch('staging', '2'),
    createTestBranch('default', '3', 'origin/master'),
    createTestBranch('head', '4', 'head/master1'),
    createTestBranch('base', '5', 'base/master2'),
  ]

  describe('_getMasterBranch', () => {
    it.only('Returns the master branch', () => {
      const branch = _getMasterBranch(branches)

      expect(branch).is.not.null
      expect(branch!.tip.sha).to.equal('0')
    })
  })

  describe('_getDeafultBranchForGithubRepo', () => {
    it.only('Returns the default branch of a GitHub repository', () => {
      const ghRepo: GitHubRepository = createTestGhRepo('test', 'default')

      const branch = _getDeafultBranchOfGithubRepo(branches, ghRepo)

      expect(branch).is.not.null
      expect(branch!.name).to.equal('default')
    })
  })

  describe('_getFeatureBranchOfPullRequest', () => {
    it.only('Returns the branch associated with the PR', () => {
      const head = createTestPrRef(branches[4])
      const base = createTestPrRef(branches[5])
      const pr: PullRequest = createTestPr(head, base)

      const branch = _getFeatureBranchOfPullRequest(branches, pr)

      expect(branch).is.not.null
      expect(branch!.upstream).to.equal(branches[5].upstream)
    })
  })

  describe('_getDefaultBranchOfFork', () => {
    it.only('Returns the default branch of the fork if it is ahead of the current branch', async () => {
      const testBranch = branches[3]
      const ghRepo = createTestGhRepo('test', testBranch.name)
      const repo = createTestRepo()
      function mockAheadBehind(range: string) {
        return { ahead: 1, behind: 0 }
      }

      const branch = await _getDefaultBranchOfFork(
        branches,
        repo,
        ghRepo,
        testBranch,
        mockAheadBehind
      )

      expect(branch).is.not.null
      expect(branch!.upstream).to.equal(testBranch.upstream)
    })

    it.only("Returns the default branch of the fork's parent branch if the fork is not ahead of the current branch", async () => {
      const testBranch = branches[5]
      const parent = createTestGhRepo('parent', testBranch.name)
      const ghRepo = createTestGhRepo('test', testBranch.name, parent)
      const repo = createTestRepo()
      function mockAheadBehind(range: string) {
        return { ahead: 0, behind: 0 }
      }

      const branch = await _getDefaultBranchOfFork(
        branches,
        repo,
        ghRepo,
        testBranch,
        mockAheadBehind
      )

      expect(branch).is.not.null
      expect(branch!.upstream).to.equal(testBranch.upstream)
    })
  })
})
