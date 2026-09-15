import { describe, it, TestContext } from 'node:test'
import assert from 'node:assert'
import { writeFile } from 'fs/promises'
import * as Path from 'path'
import { exec } from 'dugite'

import { shell } from '../helpers/test-app-shell'
import {
  setupEmptyRepository,
  setupFixtureRepository,
} from '../helpers/repositories'
import { GitStore } from '../../src/lib/stores'
import { AppFileStatusKind } from '../../src/models/status'
import { Repository } from '../../src/models/repository'
import { TipState, IValidBranch } from '../../src/models/tip'
import { getCommit, getRemotes } from '../../src/lib/git'
import { getStatusOrThrow } from '../helpers/status'
import {
  makeCommit,
  switchTo,
  cloneLocalRepository,
} from '../helpers/repository-scaffolding'
import { BranchType } from '../../src/models/branch'
import { TestStatsStore } from '../helpers/test-stats-store'

describe('GitStore', () => {
  describe('loadCommitBatch', () => {
    it('includes HEAD when loading commits', async t => {
      const path = await setupFixtureRepository(
        t,
        'repository-with-105-commits'
      )
      const repo = new Repository(path, -1, null, false)
      const gitStore = new GitStore(repo, shell, new TestStatsStore())

      const commits = await gitStore.loadCommitBatch('HEAD', 0)

      assert(commits !== null)
      assert.equal(commits.length, 100)
      assert.equal(commits[0], '708a46eac512c7b2486da2247f116d11a100b611')
    })
  })

  it('can discard changes from a repository', async t => {
    const repo = await setupEmptyRepository(t)
    const gitStore = new GitStore(repo, shell, new TestStatsStore())

    const readmeFile = 'README.md'
    const readmeFilePath = Path.join(repo.path, readmeFile)

    await writeFile(readmeFilePath, 'SOME WORDS GO HERE\n')

    const licenseFile = 'LICENSE.md'
    const licenseFilePath = Path.join(repo.path, licenseFile)

    await writeFile(licenseFilePath, 'SOME WORDS GO HERE\n')

    // commit the readme file but leave the license
    await exec(['add', readmeFile], repo.path)
    await exec(['commit', '-m', 'added readme file'], repo.path)

    await writeFile(readmeFilePath, 'WRITING SOME NEW WORDS\n')
    // setup requires knowing about the current tip
    await gitStore.loadStatus()

    let status = await getStatusOrThrow(repo)
    let files = status.workingDirectory.files

    assert.equal(files.length, 2)
    assert.equal(files[0].path, 'README.md')
    assert.equal(files[0].status.kind, AppFileStatusKind.Modified)

    // discard the LICENSE.md file
    await gitStore.discardChanges([files[1]])

    status = await getStatusOrThrow(repo)
    files = status.workingDirectory.files

    assert.equal(files.length, 1)
  })

  it('can discard a renamed file', async t => {
    const repo = await setupEmptyRepository(t)
    const gitStore = new GitStore(repo, shell, new TestStatsStore())

    const file = 'README.md'
    const renamedFile = 'NEW-README.md'
    const filePath = Path.join(repo.path, file)

    await writeFile(filePath, 'SOME WORDS GO HERE\n')

    // commit the file, and then rename it
    await exec(['add', file], repo.path)
    await exec(['commit', '-m', 'added file'], repo.path)
    await exec(['mv', file, renamedFile], repo.path)

    const statusBeforeDiscard = await getStatusOrThrow(repo)
    const filesToDiscard = statusBeforeDiscard.workingDirectory.files

    // discard the renamed file
    await gitStore.discardChanges(filesToDiscard)

    const status = await getStatusOrThrow(repo)
    const files = status.workingDirectory.files

    assert.equal(files.length, 0)
  })

  describe('undo first commit', () => {
    const commitMessage = 'added file'
    const setupRepo = async (t: TestContext) => {
      const repository = await setupEmptyRepository(t)

      const file = 'README.md'
      const filePath = Path.join(repository.path, file)

      await writeFile(filePath, 'SOME WORDS GO HERE\n')

      await exec(['add', file], repository.path)
      await exec(['commit', '-m', commitMessage], repository.path)

      const firstCommit = await getCommit(repository, 'master')
      assert(firstCommit !== null)
      assert.equal(firstCommit.parentSHAs.length, 0)

      return { repository, firstCommit }
    }

    it('reports the repository is unborn', async t => {
      const { repository, firstCommit } = await setupRepo(t)
      const gitStore = new GitStore(repository, shell, new TestStatsStore())

      await gitStore.loadStatus()
      assert.equal(gitStore.tip.kind, TipState.Valid)

      assert(firstCommit !== null)
      await gitStore.undoCommit(firstCommit)

      const after = await getStatusOrThrow(repository)
      assert(after.currentTip === undefined)
    })

    it('pre-fills the commit message', async t => {
      const { repository, firstCommit } = await setupRepo(t)

      const gitStore = new GitStore(repository, shell, new TestStatsStore())

      assert(firstCommit !== null)
      await gitStore.undoCommit(firstCommit)

      const newCommitMessage = gitStore.commitMessage
      assert(newCommitMessage !== null)
      assert.equal(newCommitMessage.summary, commitMessage)
    })

    it('clears the undo commit dialog', async t => {
      const { repository, firstCommit } = await setupRepo(t)

      const gitStore = new GitStore(repository, shell, new TestStatsStore())

      await gitStore.loadStatus()

      const tip = gitStore.tip as IValidBranch
      await gitStore.loadLocalCommits(tip.branch)

      assert.equal(gitStore.localCommitSHAs.length, 1)

      assert(firstCommit !== null)
      await gitStore.undoCommit(firstCommit)

      await gitStore.loadStatus()
      assert.equal(gitStore.tip.kind, TipState.Unborn)

      await gitStore.loadLocalCommits(null)

      assert.equal(gitStore.localCommitSHAs.length, 0)
    })

    it('has no staged files', async t => {
      const { repository, firstCommit } = await setupRepo(t)

      const gitStore = new GitStore(repository, shell, new TestStatsStore())

      await gitStore.loadStatus()

      const tip = gitStore.tip as IValidBranch
      await gitStore.loadLocalCommits(tip.branch)

      assert.equal(gitStore.localCommitSHAs.length, 1)

      assert(firstCommit !== null)
      await gitStore.undoCommit(firstCommit)

      // compare the index state to some other tree-ish
      // 4b825dc642cb6eb9a060e54bf8d69288fbee4904 is the magic empty tree
      // if nothing is staged, this should return no entries
      const result = await exec(
        [
          'diff-index',
          '--name-status',
          '-z',
          '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
        ],
        repository.path
      )
      assert.equal(result.stdout.length, 0)
    })
  })

  describe('repository with HEAD file', () => {
    it('can discard modified change cleanly', async t => {
      const path = await setupFixtureRepository(t, 'repository-with-HEAD-file')
      const repo = new Repository(path, 1, null, false)
      const gitStore = new GitStore(repo, shell, new TestStatsStore())

      const file = 'README.md'
      const filePath = Path.join(repo.path, file)

      await writeFile(filePath, 'SOME WORDS GO HERE\n')

      let status = await getStatusOrThrow(repo)
      let files = status.workingDirectory.files
      assert.equal(files.length, 1)

      await gitStore.discardChanges([files[0]])

      status = await getStatusOrThrow(repo)
      files = status.workingDirectory.files
      assert.equal(files.length, 0)
    })
  })

  describe('loadBranches', () => {
    const setupRepositories = async (t: TestContext) => {
      const upstream = await setupEmptyRepository(t)
      await makeCommit(upstream, {
        commitMessage: 'first commit',
        entries: [
          {
            path: 'README.md',
            contents: 'some words go here',
          },
        ],
      })
      await makeCommit(upstream, {
        commitMessage: 'second commit',
        entries: [
          {
            path: 'README.md',
            contents: 'some words go here\nand some more words',
          },
        ],
      })
      await switchTo(upstream, 'some-other-branch')
      await makeCommit(upstream, {
        commitMessage: 'branch commit',
        entries: [
          {
            path: 'README.md',
            contents: 'changing some words',
          },
        ],
      })
      await makeCommit(upstream, {
        commitMessage: 'second branch commit',
        entries: [
          {
            path: 'README.md',
            contents: 'and even more changing of words',
          },
        ],
      })

      // move this repository back to `master` before cloning
      await switchTo(upstream, 'master')

      const repository = await cloneLocalRepository(t, upstream)

      return { upstream, repository }
    }

    it('has a remote defined', async t => {
      const { repository } = await setupRepositories(t)
      const remotes = await getRemotes(repository)
      assert.equal(remotes.length, 1)
    })

    it('will merge a local and remote branch when tracking branch set', async t => {
      const { repository } = await setupRepositories(t)
      const gitStore = new GitStore(repository, shell, new TestStatsStore())
      await gitStore.loadBranches()

      assert.equal(gitStore.allBranches.length, 2)

      const defaultBranch = gitStore.allBranches.find(b => b.name === 'master')
      assert(defaultBranch !== undefined)
      assert.equal(defaultBranch.upstream, 'origin/master')

      const remoteBranch = gitStore.allBranches.find(
        b => b.name === 'origin/some-other-branch'
      )
      assert(remoteBranch !== undefined)
      assert.equal(remoteBranch.type, BranchType.Remote)
    })

    it('the tracking branch is not cleared when the remote branch is removed', async t => {
      const { repository, upstream } = await setupRepositories(t)
      // checkout the other branch after cloning
      await exec(['checkout', 'some-other-branch'], repository.path)

      const gitStore = new GitStore(repository, shell, new TestStatsStore())
      await gitStore.loadBranches()

      const currentBranchBefore = gitStore.allBranches.find(
        b => b.name === 'some-other-branch'
      )
      assert(currentBranchBefore !== undefined)
      assert.equal(currentBranchBefore.upstream, 'origin/some-other-branch')

      // delete the ref in the upstream branch
      await exec(['branch', '-D', 'some-other-branch'], upstream.path)

      // update the local repository state to remove the remote ref
      await exec(['fetch', '--prune', '--all'], repository.path)
      await gitStore.loadBranches()

      const currentBranchAfter = gitStore.allBranches.find(
        b => b.name === 'some-other-branch'
      )

      // ensure the tracking information is unchanged
      assert(currentBranchAfter !== undefined)
      assert.equal(currentBranchAfter.upstream, 'origin/some-other-branch')
    })
  })
})
