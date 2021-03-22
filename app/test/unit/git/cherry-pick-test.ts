import { GitProcess } from 'dugite'
import * as FSE from 'fs-extra'
import * as Path from 'path'
import {
  getCommit,
  getCommits,
  merge,
  MergeResult,
  revRangeInclusive,
} from '../../../src/lib/git'
import {
  abortCherryPick,
  cherryPick,
  CherryPickResult,
  continueCherryPick,
  getCherryPickSnapshot,
} from '../../../src/lib/git/cherry-pick'
import { isConflictedFile } from '../../../src/lib/status'
import { Branch } from '../../../src/models/branch'
import { ManualConflictResolution } from '../../../src/models/manual-conflict-resolution'
import { ICherryPickProgress } from '../../../src/models/progress'
import { Repository } from '../../../src/models/repository'
import { AppFileStatusKind } from '../../../src/models/status'
import { getBranchOrError } from '../../helpers/git'
import { createRepository } from '../../helpers/repository-builder-cherry-pick-test'
import {
  createBranch,
  makeCommit,
  switchTo,
} from '../../helpers/repository-scaffolding'
import { getStatusOrThrow } from '../../helpers/status'

const featureBranchName = 'this-is-a-feature'
const targetBranchName = 'target-branch'

describe('git/cherry-pick', () => {
  let repository: Repository
  let featureBranch: Branch
  let targetBranch: Branch
  let result: CherryPickResult | null

  beforeEach(async () => {
    // This will create a repository with a feature branch with one commit to
    // cherry pick and will check out the target branch.
    repository = await createRepository(featureBranchName, targetBranchName)

    // branch with tip as commit to cherry pick
    featureBranch = await getBranchOrError(repository, featureBranchName)

    // branch with to cherry pick to
    targetBranch = await getBranchOrError(repository, targetBranchName)

    // set result to null for each test
    result = null
  })

  it('successfully cherry-picked one commit without conflicts', async () => {
    result = await cherryPick(repository, featureBranch.tip.sha)
    const cherryPickedCommit = await getCommit(
      repository,
      featureBranch.tip.sha
    )

    const commits = await getCommits(repository, targetBranch.ref, 3)
    expect(commits.length).toBe(2)
    expect(commits[0].summary).toBe(cherryPickedCommit!.summary)
    expect(result).toBe(CherryPickResult.CompletedWithoutError)
  })

  it('successfully cherry-picked a commit with empty message', async () => {
    // add a commit with no message
    await switchTo(repository, featureBranchName)
    const filePath = Path.join(repository.path, 'EMPTY_MESSAGE.md')
    await FSE.writeFile(filePath, '# HELLO WORLD! \nTHINGS GO HERE\n')
    await GitProcess.exec(['add', filePath], repository.path)
    await GitProcess.exec(
      ['commit', '--allow-empty-message', '-m', ''],
      repository.path
    )

    featureBranch = await getBranchOrError(repository, featureBranchName)
    await switchTo(repository, targetBranchName)

    // confirm feature branch tip has an empty message
    const emptyMessageCommit = await getCommit(
      repository,
      featureBranch.tip.sha
    )
    expect(emptyMessageCommit?.summary).toBe('')

    result = await cherryPick(repository, featureBranch.tip.sha)

    const commits = await getCommits(repository, targetBranch.ref, 5)
    expect(commits.length).toBe(2)
    expect(commits[0]!.summary).toBe('')
    expect(result).toBe(CherryPickResult.CompletedWithoutError)
  })

  it('successfully cherry-picks a redundant commit', async () => {
    result = await cherryPick(repository, featureBranch.tip.sha)

    const commits = await getCommits(repository, targetBranch.ref, 5)
    expect(commits.length).toBe(2)
    expect(result).toBe(CherryPickResult.CompletedWithoutError)

    result = await cherryPick(repository, featureBranch.tip.sha)

    const commitsAfterRedundant = await getCommits(
      repository,
      targetBranch.ref,
      5
    )
    expect(commitsAfterRedundant.length).toBe(3)
    expect(result).toBe(CherryPickResult.CompletedWithoutError)
  })

  it('successfully cherry-picks an empty commit', async () => {
    // add empty commit to feature branch
    await switchTo(repository, featureBranchName)
    await GitProcess.exec(
      ['commit', '--allow-empty', '-m', 'Empty Commit'],
      repository.path
    )

    featureBranch = await getBranchOrError(repository, featureBranchName)
    await switchTo(repository, targetBranchName)

    result = await cherryPick(repository, featureBranch.tip.sha)

    const commits = await getCommits(repository, targetBranch.ref, 5)
    expect(commits.length).toBe(2)
    expect(result).toBe(CherryPickResult.CompletedWithoutError)
  })

  it('successfully cherry-picks an empty commit inside a range', async () => {
    const firstCommitSha = featureBranch.tip.sha

    // add empty commit to feature branch
    await switchTo(repository, featureBranchName)
    await GitProcess.exec(
      ['commit', '--allow-empty', '-m', 'Empty Commit'],
      repository.path
    )

    // add another commit so empty commit will be inside a range
    const featureBranchCommitTwo = {
      commitMessage: 'Cherry-picked Feature! Number Two',
      entries: [
        {
          path: 'THING_TWO.md',
          contents: '# HELLO WORLD! \nTHINGS GO HERE\n',
        },
      ],
    }
    await makeCommit(repository, featureBranchCommitTwo)

    featureBranch = await getBranchOrError(repository, featureBranchName)
    await switchTo(repository, targetBranchName)

    // cherry picking 3 (on added in setup, empty, featureBranchCommitTwo)
    const commitRange = revRangeInclusive(firstCommitSha, featureBranch.tip.sha)
    result = await cherryPick(repository, commitRange)

    const commits = await getCommits(repository, targetBranch.ref, 5)
    expect(commits.length).toBe(4) // original commit + 4 cherry picked
    expect(result).toBe(CherryPickResult.CompletedWithoutError)
  })

  it('successfully cherry-picked multiple commits without conflicts', async () => {
    // keep reference to the first commit in cherry pick range
    const firstCommitSha = featureBranch.tip.sha

    await addThreeMoreCommitsOntoFeatureBranch(repository)
    featureBranch = await getBranchOrError(repository, featureBranchName)
    await switchTo(repository, targetBranchName)

    const commitRange = revRangeInclusive(firstCommitSha, featureBranch.tip.sha)
    result = await cherryPick(repository, commitRange)

    const commits = await getCommits(repository, targetBranch.ref, 5)
    expect(commits.length).toBe(5)
    expect(commits[1].summary).toBe('Cherry-picked Feature! Number Three')
    expect(commits[2].summary).toBe('Cherry-picked Feature! Number Two')
    expect(result).toBe(CherryPickResult.CompletedWithoutError)
  })

  it('fails to cherry-pick an invalid revision range', async () => {
    result = null
    try {
      result = await cherryPick(repository, 'no such revision')
    } catch (error) {
      expect(error.toString()).toContain('Bad revision')
    }
    expect(result).toBe(null)
  })

  it('fails to cherry-pick when working tree is not clean', async () => {
    await FSE.writeFile(
      Path.join(repository.path, 'THING.md'),
      '# HELLO WORLD! \nTHINGS GO HERE\nFEATURE BRANCH UNDERWAY\n'
    )

    // This error should not occur in the wild due to the nature of Desktop's UI
    // starting on source branch and having to checkout the target branch.
    // During target branch checkout, it will fail before we even get to cherry
    // picking. Thus, this scenario from a UI's perspective is already handled.
    // No need to add dugite errors to handle it.
    result = null
    try {
      result = await cherryPick(repository, featureBranch.tip.sha)
    } catch (error) {
      expect(error.toString()).toContain(
        'The following untracked working tree files would be overwritten by merge'
      )
    }
    expect(result).toBe(null)
  })

  it('fails to cherry-pick a merge commit', async () => {
    //create new branch off of default to merge into feature branch
    await switchTo(repository, 'main')
    const mergeBranchName = 'branch-to-merge'
    await createBranch(repository, mergeBranchName, 'HEAD')
    await switchTo(repository, mergeBranchName)
    const mergeCommit = {
      commitMessage: 'Commit To Merge',
      entries: [
        {
          path: 'merging.md',
          contents: '# HELLO WORLD! \nMERGED THINGS GO HERE\n',
        },
      ],
    }
    await makeCommit(repository, mergeCommit)
    const mergeBranch = await getBranchOrError(repository, mergeBranchName)
    await switchTo(repository, featureBranchName)
    expect(await merge(repository, mergeBranch.ref)).toBe(MergeResult.Success)

    // top commit is a merge commit
    const commits = await getCommits(repository, featureBranch.ref, 7)
    expect(commits[0].summary).toContain('Merge')

    featureBranch = await getBranchOrError(repository, featureBranchName)
    await switchTo(repository, targetBranchName)

    result = null
    try {
      result = await cherryPick(repository, featureBranch.tip.sha)
    } catch (error) {
      expect(error.toString()).toContain(
        'GitError: You cannot cherry-pick merge commits from GitHub Desktop.'
      )
    }
    expect(result).toBe(null)
  })

  describe('cherry-picking with conflicts', () => {
    beforeEach(async () => {
      // In the 'git/cherry-pick' `beforeEach`, we call `createRepository` which
      // adds a commit to the feature branch with a file called THING.md. In
      // order to make a conflict, we will add the same file to the target
      // branch.
      const conflictingCommit = {
        commitMessage: 'Conflicting Commit!',
        entries: [
          {
            path: 'THING.md',
            contents: '# HELLO WORLD! \n CREATING CONFLICT! FUN TIMES!\n',
          },
        ],
      }
      await makeCommit(repository, conflictingCommit)
    })

    it('successfully detects cherry-pick with conflicts', async () => {
      result = await cherryPick(repository, featureBranch.tip.sha)
      expect(result).toBe(CherryPickResult.ConflictsEncountered)

      const status = await getStatusOrThrow(repository)
      const conflictedFiles = status.workingDirectory.files.filter(
        f => f.status.kind === AppFileStatusKind.Conflicted
      )
      expect(conflictedFiles).toHaveLength(1)
    })

    it('successfully continues cherry-picking with conflicts after resolving them by overwriting', async () => {
      result = await cherryPick(repository, featureBranch.tip.sha)
      expect(result).toBe(CherryPickResult.ConflictsEncountered)

      const statusAfterCherryPick = await getStatusOrThrow(repository)
      const { files } = statusAfterCherryPick.workingDirectory

      // git diff --check warns if conflict markers exist and will exit with
      // non-zero status if conflicts found
      const diffCheckBefore = await GitProcess.exec(
        ['diff', '--check'],
        repository.path
      )
      expect(diffCheckBefore.exitCode).toBeGreaterThan(0)

      // resolve conflicts by writing files to disk
      await FSE.writeFile(
        Path.join(repository.path, 'THING.md'),
        '# HELLO WORLD! \nTHINGS GO HERE\nFEATURE BRANCH UNDERWAY\n'
      )

      // diff --check to verify no conflicts exist (exitCode should be 0)
      const diffCheckAfter = await GitProcess.exec(
        ['diff', '--check'],
        repository.path
      )
      expect(diffCheckAfter.exitCode).toEqual(0)

      result = await continueCherryPick(repository, files)

      expect(result).toBe(CherryPickResult.CompletedWithoutError)
    })

    it('successfully continues cherry-picking with conflicts after resolving them manually', async () => {
      result = await cherryPick(repository, featureBranch.tip.sha)
      expect(result).toBe(CherryPickResult.ConflictsEncountered)

      const statusAfterCherryPick = await getStatusOrThrow(repository)
      const { files } = statusAfterCherryPick.workingDirectory

      // git diff --check warns if conflict markers exist and will exit with
      // non-zero status if conflicts found
      const diffCheckBefore = await GitProcess.exec(
        ['diff', '--check'],
        repository.path
      )
      expect(diffCheckBefore.exitCode).toBeGreaterThan(0)

      const manualResolutions = new Map<string, ManualConflictResolution>()

      for (const file of files) {
        if (isConflictedFile(file.status)) {
          manualResolutions.set(file.path, ManualConflictResolution.theirs)
        }
      }

      result = await continueCherryPick(repository, files, manualResolutions)

      expect(result).toBe(CherryPickResult.CompletedWithoutError)
    })

    it('successfully continues cherry-picking with conflicts after resolving them manually and no changes to commit', async () => {
      result = await cherryPick(repository, featureBranch.tip.sha)
      expect(result).toBe(CherryPickResult.ConflictsEncountered)

      const statusAfterCherryPick = await getStatusOrThrow(repository)
      const { files } = statusAfterCherryPick.workingDirectory

      // git diff --check warns if conflict markers exist and will exit with
      // non-zero status if conflicts found
      const diffCheckBefore = await GitProcess.exec(
        ['diff', '--check'],
        repository.path
      )
      expect(diffCheckBefore.exitCode).toBeGreaterThan(0)

      const manualResolutions = new Map<string, ManualConflictResolution>()

      for (const file of files) {
        if (isConflictedFile(file.status)) {
          manualResolutions.set(file.path, ManualConflictResolution.ours)
        }
      }

      result = await continueCherryPick(repository, files, manualResolutions)

      expect(result).toBe(CherryPickResult.CompletedWithoutError)
    })

    it('successfully detects cherry-picking with outstanding files not staged', async () => {
      result = await cherryPick(repository, featureBranch.tip.sha)
      expect(result).toBe(CherryPickResult.ConflictsEncountered)

      result = await continueCherryPick(repository, [])
      expect(result).toBe(CherryPickResult.OutstandingFilesNotStaged)

      const status = await getStatusOrThrow(repository)
      const conflictedFiles = status.workingDirectory.files.filter(
        f => f.status.kind === AppFileStatusKind.Conflicted
      )
      expect(conflictedFiles).toHaveLength(1)
    })

    it('successfully continues cherry-picking with additional changes to untracked files', async () => {
      result = await cherryPick(repository, featureBranch.tip.sha)
      expect(result).toBe(CherryPickResult.ConflictsEncountered)

      // resolve conflicts by writing files to disk
      await FSE.writeFile(
        Path.join(repository.path, 'THING.md'),
        '# HELLO WORLD! \nTHINGS GO HERE\nFEATURE BRANCH UNDERWAY\n'
      )

      // changes to untracked file
      await FSE.writeFile(
        Path.join(repository.path, 'UNTRACKED_FILE.md'),
        '# HELLO WORLD! \nUNTRACKED FILE STUFF IN HERE\n'
      )

      const statusAfterCherryPick = await getStatusOrThrow(repository)
      const { files } = statusAfterCherryPick.workingDirectory

      // THING.MD and UNTRACKED_FILE.md should be in working directory
      expect(files.length).toBe(2)

      result = await continueCherryPick(repository, files)
      expect(result).toBe(CherryPickResult.CompletedWithoutError)

      // Only UNTRACKED_FILE.md should be in working directory
      // THING.md committed with cherry pick
      const status = await getStatusOrThrow(repository)
      expect(status.workingDirectory.files[0].path).toBe('UNTRACKED_FILE.md')
    })

    it('successfully aborts cherry-pick after conflict', async () => {
      result = await cherryPick(repository, featureBranch.tip.sha)
      expect(result).toBe(CherryPickResult.ConflictsEncountered)

      // files from cherry pick exist in conflicted state
      const statusAfterConflict = await getStatusOrThrow(repository)
      expect(statusAfterConflict.workingDirectory.files).toHaveLength(1)

      await abortCherryPick(repository)

      // file from cherry pick removed after abort
      const statusAfterAbort = await getStatusOrThrow(repository)
      expect(statusAfterAbort.workingDirectory.files).toHaveLength(0)
    })
  })

  describe('cherry-picking progress', () => {
    let progress = new Array<ICherryPickProgress>()
    beforeEach(() => {
      progress = []
    })

    it('errors when given invalid revision range', async () => {
      const progress = new Array<ICherryPickProgress>()
      result = await cherryPick(repository, 'INVALID REF', p =>
        progress.push(p)
      )
      expect(result).toBe(CherryPickResult.UnableToStart)
    })

    it('successfully parses progress for a single commit', async () => {
      result = await cherryPick(repository, featureBranch.tip.sha, p =>
        progress.push(p)
      )

      // commit summary set up in before each is "Cherry-picked Feature"
      expect(progress).toEqual([
        {
          currentCommitSummary: 'Cherry-picked Feature!',
          kind: 'cherryPick',
          cherryPickCommitCount: 1,
          title: 'Cherry-picking commit 1 of 1 commits',
          totalCommitCount: 1,
          value: 1,
        },
      ])
    })

    it('successfully parses progress for multiple commits', async () => {
      const firstCommitSha = featureBranch.tip.sha

      await addThreeMoreCommitsOntoFeatureBranch(repository)
      featureBranch = await getBranchOrError(repository, featureBranchName)
      await switchTo(repository, targetBranchName)

      const commitRange = revRangeInclusive(
        firstCommitSha,
        featureBranch.tip.sha
      )
      result = await cherryPick(repository, commitRange, p => progress.push(p))

      expect(result).toBe(CherryPickResult.CompletedWithoutError)
      expect(progress).toHaveLength(4)
    })

    it('successfully parses progress for multiple commits including a conflict', async () => {
      const firstCommitSha = featureBranch.tip.sha

      await addThreeMoreCommitsOntoFeatureBranch(repository)
      featureBranch = await getBranchOrError(repository, featureBranchName)
      await switchTo(repository, targetBranchName)

      // Add a commit to the target branch to conflict with the third commit on
      // the target branch.
      const targetBranchConflictingCommitTwo = {
        commitMessage: 'Conflicting with 2nd commit on feature branch',
        entries: [
          {
            path: 'THING_THREE.md',
            contents: '# Conflict with feature branch here',
          },
        ],
      }
      await makeCommit(repository, targetBranchConflictingCommitTwo)

      const commitRange = revRangeInclusive(
        firstCommitSha,
        featureBranch.tip.sha
      )
      result = await cherryPick(repository, commitRange, p => progress.push(p))
      expect(result).toBe(CherryPickResult.ConflictsEncountered)
      // First commit and second cherry picked and rest are waiting on conflict
      // resolution.
      expect(progress).toHaveLength(2)

      const snapshot = await getCherryPickSnapshot(repository)
      expect(snapshot?.progress).toEqual(progress[1])

      // resolve conflicts and continue
      const statusAfterConflictedCherryPick = await getStatusOrThrow(repository)
      const { files } = statusAfterConflictedCherryPick.workingDirectory
      await FSE.writeFile(
        Path.join(repository.path, 'THING_THREE.md'),
        '# Resolve conflicts!'
      )
      result = await continueCherryPick(repository, files, new Map(), p =>
        progress.push(p)
      )
      expect(result).toBe(CherryPickResult.CompletedWithoutError)
      // After 3rd commit resolved, 3rd and 4th were cherry picked
      expect(progress).toHaveLength(4)
      expect(progress[0].currentCommitSummary).toEqual('Cherry-picked Feature!')
      expect(progress[1].currentCommitSummary).toEqual(
        'Cherry-picked Feature! Number Two'
      )
      expect(progress[2].currentCommitSummary).toEqual(
        'Cherry-picked Feature! Number Three'
      )
      expect(progress[3].currentCommitSummary).toEqual(
        'Cherry-picked Feature! Number Four'
      )
    })
  })
})

async function addThreeMoreCommitsOntoFeatureBranch(repository: Repository) {
  await switchTo(repository, featureBranchName)

  const featureBranchCommitTwo = {
    commitMessage: 'Cherry-picked Feature! Number Two',
    entries: [
      {
        path: 'THING_TWO.md',
        contents: '# HELLO WORLD! \nTHINGS GO HERE\n',
      },
    ],
  }
  await makeCommit(repository, featureBranchCommitTwo)

  const featureBranchCommitThree = {
    commitMessage: 'Cherry-picked Feature! Number Three',
    entries: [
      {
        path: 'THING_THREE.md',
        contents: '# HELLO WORLD! \nTHINGS GO HERE\n',
      },
    ],
  }
  await makeCommit(repository, featureBranchCommitThree)

  const featureBranchCommitFour = {
    commitMessage: 'Cherry-picked Feature! Number Four',
    entries: [
      {
        path: 'THING_FOUR.md',
        contents: '# HELLO WORLD! \nTHINGS GO HERE\n',
      },
    ],
  }
  await makeCommit(repository, featureBranchCommitFour)
}
