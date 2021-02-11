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
import { cherryPick, CherryPickResult } from '../../../src/lib/git/cherry-pick'
import { Branch } from '../../../src/models/branch'
import { Repository } from '../../../src/models/repository'
import { getBranchOrError } from '../../helpers/git'
import { createRepository } from '../../helpers/repository-builder-cherry-pick-test'
import {
  createBranch,
  makeCommit,
  switchTo,
} from '../../helpers/repository-scaffolding'

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

  it('successfully cherry pick one commit without conflicts', async () => {
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

  it('successfully cherry pick a commit with empty message', async () => {
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

  it('successfully cherry pick multiple commits without conflicts', async () => {
    // keep reference to the first commit in cherry pick range
    const firstCommitSha = featureBranch.tip.sha

    // add two more commits to cherry pick
    await switchTo(repository, featureBranchName)

    const featureBranchCommitTwo = {
      commitMessage: 'Cherry Picked Feature! Number Two',
      entries: [
        {
          path: 'THING_TWO.md',
          contents: '# HELLO WORLD! \nTHINGS GO HERE\n',
        },
      ],
    }
    await makeCommit(repository, featureBranchCommitTwo)

    const featureBranchCommitThree = {
      commitMessage: 'Cherry Picked Feature! Number Three',
      entries: [
        {
          path: 'THING_THREE.md',
          contents: '# HELLO WORLD! \nTHINGS GO HERE\n',
        },
      ],
    }
    await makeCommit(repository, featureBranchCommitThree)

    featureBranch = await getBranchOrError(repository, featureBranchName)
    await switchTo(repository, targetBranchName)

    const commitRange = revRangeInclusive(firstCommitSha, featureBranch.tip.sha)
    result = await cherryPick(repository, commitRange)

    const commits = await getCommits(repository, targetBranch.ref, 5)
    expect(commits.length).toBe(4)
    expect(commits[0].summary).toBe(featureBranchCommitThree.commitMessage)
    expect(commits[1].summary).toBe(featureBranchCommitTwo.commitMessage)
    expect(result).toBe(CherryPickResult.CompletedWithoutError)
  })

  it('fails to cherry pick invalid revision range', async () => {
    result = null
    try {
      result = await cherryPick(repository, 'no such revision')
    } catch (error) {
      expect(error.toString()).toContain('Bad revision')
    }
    expect(result).toBe(null)
  })

  it('fails to cherry pick when working tree is not clean', async () => {
    await FSE.writeFile(
      Path.join(repository.path, 'THING.md'),
      '# HELLO WORLD! \nTHINGS GO HERE\nFEATURE BRANCH UNDERWAY\n'
    )
    // This error is not one of the parsed dugite errors
    // https://github.com/desktop/dugite/blob/master/lib/errors.ts
    // TODO: add to dugite error so we can make use of
    // `localChangesOverwrittenHandler` in `error-handler.ts`
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

  it('fails to cherry pick a merge commit', async () => {
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
        'is a merge but no -m option was given'
      )
    }
    expect(result).toBe(null)
  })

  it('fails to cherry pick an empty commit', async () => {
    // add empty commit to feature branch
    await switchTo(repository, featureBranchName)
    await GitProcess.exec(
      ['commit', '--allow-empty', '-m', 'Empty Commit'],
      repository.path
    )

    featureBranch = await getBranchOrError(repository, featureBranchName)
    await switchTo(repository, targetBranchName)

    result = null
    try {
      result = await cherryPick(repository, featureBranch.tip.sha)
    } catch (error) {
      expect(error.toString()).toContain('There are no changes to commit')
    }
    expect(result).toBe(null)
  })

  it('fails to cherry pick an empty commit inside a range', async () => {
    const firstCommitSha = featureBranch.tip.sha

    // add empty commit to feature branch
    await switchTo(repository, featureBranchName)
    await GitProcess.exec(
      ['commit', '--allow-empty', '-m', 'Empty Commit'],
      repository.path
    )

    // add another commit so empty commit will be inside a range
    const featureBranchCommitTwo = {
      commitMessage: 'Cherry Picked Feature! Number Two',
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

    try {
      const commitRange = revRangeInclusive(
        firstCommitSha,
        featureBranch.tip.sha
      )
      result = await cherryPick(repository, commitRange)
    } catch (error) {
      expect(error.toString()).toContain('There are no changes to commit')
    }
    expect(result).toBe(null)
  })

  it('fails to cherry pick a redundant commit', async () => {
    result = await cherryPick(repository, featureBranch.tip.sha)
    expect(result).toBe(CherryPickResult.CompletedWithoutError)

    result = null
    try {
      result = await cherryPick(repository, featureBranch.tip.sha)
    } catch (error) {
      expect(error.toString()).toContain('There are no changes to commit')
    }
    expect(result).toBe(null)
  })
})
