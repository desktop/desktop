import { expect } from 'chai'
import {
  _getMasterBranch,
  _getDeafultBranchOfGithubRepo,
} from '../../src/lib/stores/helpers/infer-compare-to-branch'
import { Branch, BranchType } from '../../src/models/branch'
import { Commit } from '../../src/models/commit'
import { CommitIdentity } from '../../src/models/commit-identity'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'

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

describe('inferComparisonBranch Helpers', () => {
  const branches = [
    createTestBranch('master', '1'),
    createTestBranch('dev', '2'),
    createTestBranch('staging', '3'),
    createTestBranch('default', '4', 'origin'),
  ]

  describe('_getMasterBranch', () => {
    it.only('Returns the master branch', () => {
      const branch = _getMasterBranch(branches)

      expect(branch).is.not.null
      expect(branch!.tip.sha).to.equal('1')
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
    it.only('Returns the branch associated with the PR', () => {})
  })

  describe('_getDefaultBranchOfFork', () => {
    it.only('Returns the default branch of the fork if it is ahead of the current branch', () => {})
    it.only("Returns the default branch of the fork's parent branch if the fork is not ahead of the current branch", () => {})
  })
})

describe('inferComparisonBranch', () => {})
