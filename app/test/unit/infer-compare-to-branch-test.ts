import { expect } from 'chai'
import { inferCompareToBranch } from '../../src/lib/stores/helpers/infer-compare-to-branch'
import { IBranchesState } from '../../src/lib/app-state'
import { ComparisonCache } from '../../src/lib/comparison-cache'
import { TipState } from '../../src/models/tip'
import { Branch, BranchType } from '../../src/models/branch'
import { Commit } from '../../src/models/commit'
import { CommitIdentity } from '../../src/models/commit-identity'
import { PullRequest, PullRequestRef } from '../../src/models/pull-request'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'

const committer = new CommitIdentity('tester', 'tester@test.com', new Date())
const commit = new Commit('', 'Test commit', '', committer, committer, [], [])
const branch = new Branch('master', null, commit, BranchType.Remote)
const defaultState: IBranchesState = {
  tip: {
    kind: TipState.Valid,
    branch,
  },
  defaultBranch: branch,
  allBranches: [branch],
  recentBranches: [],
  openPullRequests: [],
  isLoadingPullRequests: false,
  currentPullRequest: null,
}

describe('inferCompareToBranch', () => {
  describe('Non-forked repository', () => {
    it.only('Uses the target branch of the PR if the current branch has a PR associated with it', () => {
      const pullRequest = new PullRequest(
        -1,
        new Date(),
        null,
        'Test PR',
        1,
        new PullRequestRef('', '', null),
        new PullRequestRef('origin/pr', '', null),
        ''
      )
      const state = {
        ...defaultState,
        openPullRequests: [pullRequest],
        currentPullRequest: pullRequest,
      }
      const inferredBranch = inferCompareToBranch(state, new ComparisonCache())

      expect(inferredBranch).to.equal('origin/pr')
    })

    it.only('Uses the default branch on origin if it is hosted on GitHub', () => {
      const ghRepo = new GitHubRepository(
        '',
        new Owner('', '', null),
        null,
        false,
        '',
        branch.name,
        null,
        null
      )
      const inferredBranch = inferCompareToBranch(
        defaultState,
        new ComparisonCache(),
        ghRepo
      )

      expect(inferredBranch).to.equal(branch.name)
    })
  })

  describe('Forked repository', () => {
    it.only('Uses the default branch on the forked repository if it is ahead of the current branch', () => {
      const parentGhRepo = new GitHubRepository(
        'parent',
        new Owner('', '', null),
        null,
        false,
        '',
        'parent',
        null,
        null
      )
      const ghRepo = new GitHubRepository(
        'child',
        new Owner('', '', null),
        null,
        false,
        '',
        branch.name,
        null,
        parentGhRepo
      )
      const cache = new ComparisonCache()
      cache.set('from', 'to', { ahead: 1, behind: 0 })

      const inferredBranch = inferCompareToBranch(defaultState, cache, ghRepo)

      expect(inferredBranch).to.equal(branch.name)
    })

    it.only('', () => {})
  })
})
