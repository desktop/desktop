import { expect } from 'chai'
import { inferCompareToBranch } from '../../src/lib/stores/helpers/infer-compare-to-branch'
import { IBranchesState } from '../../src/lib/app-state'
import { ComparisonCache } from '../../src/lib/comparison-cache'
import { TipState } from '../../src/models/tip'
import { Branch, BranchType, IAheadBehind } from '../../src/models/branch'
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
      const currentPullRequest = new PullRequest(
        -1,
        new Date(),
        null,
        'Test PR',
        1,
        new PullRequestRef('can be anything', 'not using this', null),
        new PullRequestRef(prBaseBranch.name, prBaseBranch.tip.sha, null),
        ''
      )
      // Add the PR to branches state and set as the current PR
      const currentBranch = new Branch(
        'master',
        'origin/master',
        dummyCommit,
        BranchType.Local
      )
      const branches = [prBaseBranch, currentBranch]
      const inferredBranch = inferCompareToBranch(
        currentBranch,
        branches,
        currentPullRequest,
        new GitHubRepository(
          'parent',
          new Owner('', '', null),
          null,
          false,
          '',
          '',
          null,
          null
        ),
        () => null
      )

      expect(inferredBranch!.upstream).to.equal('origin/pr')
    })

    it.only('Uses the default branch on origin if it is hosted on GitHub', () => {
      // Add the PR to branches state and set as the current PR
      const currentBranch = new Branch(
        'master',
        'origin/master',
        dummyCommit,
        BranchType.Local
      )
      const branches = [currentBranch]

      // Create a GitHub repository with the default branch set to 'origin/master'
      const ghRepo = new GitHubRepository(
        '',
        new Owner('', '', null),
        null,
        false,
        '',
        'master',
        null,
        null
      )
      const inferredBranch = inferCompareToBranch(
        currentBranch,
        branches,
        null,
        ghRepo,
        () => null
      )

      expect(inferredBranch!.upstream).to.equal('origin/master')
    })
  })

  describe('Forked repository', () => {
    let ghRepo: GitHubRepository
    let fork: GitHubRepository
    let forkBranch: Branch
    let defaultUpstreamBranch: Branch

    beforeEach(() => {
      // Create a repo
      defaultUpstreamBranch = new Branch(
        'master',
        'origin/master',
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
      ghRepo = new GitHubRepository(
        'parent',
        new Owner('', '', null),
        null,
        false,
        '',
        defaultUpstreamBranch.name,
        null,
        null
      )
      // Create branch used for forked repo
      forkBranch = new Branch(
        'fork-master',
        'child/fork-master',
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
      fork = new GitHubRepository(
        'child',
        new Owner('', '', null),
        null,
        false,
        '',
        forkBranch.name,
        null,
        ghRepo
      )
    })

    it.only('Uses the default branch on the forked repository if it is ahead of the current branch', () => {
      const currentBranch = new Branch(
        'master',
        'origin/master',
        dummyCommit,
        BranchType.Local
      )
      const branches = [currentBranch, forkBranch]

      function getAheadBehind(to: string, from: string): IAheadBehind | null {
        return to === forkBranch.tip.sha && from === dummyCommit.sha
          ? { ahead: 0, behind: 1 }
          : null
      }

      const inferredBranch = inferCompareToBranch(
        currentBranch,
        branches,
        null,
        fork,
        getAheadBehind
      )

      expect(inferredBranch!.name).to.equal('fork-master')
    })

    it.only("Uses the default branch of the forked repository's parent if it is not ahead of the current branch ", () => {
      const currentBranch = new Branch(
        'master',
        'origin/master',
        dummyCommit,
        BranchType.Local
      )
      const branches = [currentBranch, forkBranch]
      // Add entry to cache to represent fork being behind by 1 commit
      const inferredBranch = inferCompareToBranch(
        currentBranch,
        branches,
        null,
        fork,
        () => null
      )

      expect(inferredBranch!.name).to.equal('master')
    })
  })
})
