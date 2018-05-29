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
const dummyCommit = new Commit(
  'shashashake',
  'Test commit',
  '',
  committer,
  committer,
  [],
  []
)
const branch = new Branch(
  'master',
  'origin/master',
  dummyCommit,
  BranchType.Remote
)
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
      // Create PR with a target branch of 'origin/pr`\
      const prBaseBranch = new Branch(
        'pr',
        'origin/pr',
        dummyCommit,
        BranchType.Remote
      )
      const pullRequest = new PullRequest(
        -1,
        new Date(),
        null,
        'Test PR',
        1,
        new PullRequestRef('', '', null),
        new PullRequestRef(prBaseBranch.name, prBaseBranch.tip.sha, null),
        ''
      )
      // Add the PR to branches state and set as the current PR
      const state = {
        ...defaultState,
        allBranches: [prBaseBranch, ...defaultState.allBranches],
        openPullRequests: [pullRequest],
        currentPullRequest: pullRequest,
      }
      const inferredBranch = inferCompareToBranch(state, new ComparisonCache())

      expect(inferredBranch!.upstream).to.equal('origin/pr')
    })

    it.only('Uses the default branch on origin if it is hosted on GitHub', () => {
      // Create a GitHub repository with the default branch set to 'origin/master'
      const ghRepo = new GitHubRepository(
        '',
        new Owner('', '', null),
        null,
        false,
        '',
        branch.upstream,
        null,
        null
      )
      const inferredBranch = inferCompareToBranch(
        defaultState,
        new ComparisonCache(),
        ghRepo
      )

      expect(inferredBranch!.upstream).to.equal('origin/master')
    })
  })

  describe('Forked repository', () => {
    it.only('Uses the default branch on the forked repository if it is ahead of the current branch', () => {
      // Create a repo
      const ghRepo = new GitHubRepository(
        'parent',
        new Owner('', '', null),
        null,
        false,
        '',
        'origin/master',
        null,
        null
      )
      // Create branch used for forked repo
      const forkBranch = new Branch(
        'fork',
        'origin/fork',
        new Commit(
          'commit',
          '',
          '',
          new CommitIdentity('', '', new Date()),
          new CommitIdentity('', '', new Date()),
          [],
          []
        ),
        BranchType.Remote
      )
      // Fork the repo
      const fork = new GitHubRepository(
        'child',
        new Owner('', '', null),
        null,
        false,
        '',
        forkBranch.upstream,
        null,
        ghRepo
      )
      //Add the forked branch to branches state
      const state = {
        ...defaultState,
        allBranches: [forkBranch, ...defaultState.allBranches],
      }
      // Add entry to cache to represent fork being behind by 1 commit
      const cache = new ComparisonCache()
      cache.set(forkBranch.tip.sha, dummyCommit.sha, { ahead: 0, behind: 1 })

      const inferredBranch = inferCompareToBranch(state, cache, fork)

      expect(inferredBranch!.upstream).to.equal('origin/fork')
    })

    it.only('', () => {})
  })
})
