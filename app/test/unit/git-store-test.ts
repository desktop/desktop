import * as FSE from 'fs-extra'
import * as Path from 'path'
import { GitProcess } from 'dugite'

import { shell } from '../helpers/test-app-shell'
import {
  setupEmptyRepository,
  setupFixtureRepository,
} from '../helpers/repositories'
import { GitStore } from '../../src/lib/stores'
import { AppFileStatusKind } from '../../src/models/status'
import { Repository } from '../../src/models/repository'
import { Commit } from '../../src/models/commit'
import { TipState, IValidBranch } from '../../src/models/tip'
import { getCommit, getRemotes } from '../../src/lib/git'
import { getStatusOrThrow } from '../helpers/status'
import {
  makeCommit,
  switchTo,
  cloneLocalRepository,
} from '../helpers/repository-scaffolding'
import { BranchType } from '../../src/models/branch'
import { StatsStore, StatsDatabase } from '../../src/lib/stats'
import { UiActivityMonitor } from '../../src/ui/lib/ui-activity-monitor'

describe('GitStore', () => {
  let statsStore: StatsStore

  beforeEach(() => {
    statsStore = new StatsStore(
      new StatsDatabase('test-StatsDatabase'),
      new UiActivityMonitor()
    )
  })

  describe('loadCommitBatch', () => {
    it('includes HEAD when loading commits', async () => {
      const path = await setupFixtureRepository('repository-with-105-commits')
      const repo = new Repository(path, -1, null, false)
      const gitStore = new GitStore(repo, shell, statsStore)

      const commits = await gitStore.loadCommitBatch('HEAD')

      expect(commits).not.toBeNull()
      expect(commits).toHaveLength(100)
      expect(commits![0]).toEqual('708a46eac512c7b2486da2247f116d11a100b611')
    })
  })

  it('can discard changes from a repository', async () => {
    const repo = await setupEmptyRepository()
    const gitStore = new GitStore(repo, shell, statsStore)

    const readmeFile = 'README.md'
    const readmeFilePath = Path.join(repo.path, readmeFile)

    await FSE.writeFile(readmeFilePath, 'SOME WORDS GO HERE\n')

    const licenseFile = 'LICENSE.md'
    const licenseFilePath = Path.join(repo.path, licenseFile)

    await FSE.writeFile(licenseFilePath, 'SOME WORDS GO HERE\n')

    // commit the readme file but leave the license
    await GitProcess.exec(['add', readmeFile], repo.path)
    await GitProcess.exec(['commit', '-m', 'added readme file'], repo.path)

    await FSE.writeFile(readmeFilePath, 'WRITING SOME NEW WORDS\n')
    // setup requires knowing about the current tip
    await gitStore.loadStatus()

    let status = await getStatusOrThrow(repo)
    let files = status.workingDirectory.files

    expect(files).toHaveLength(2)
    expect(files[0].path).toEqual('README.md')
    expect(files[0].status.kind).toEqual(AppFileStatusKind.Modified)

    // discard the LICENSE.md file
    await gitStore.discardChanges([files[1]])

    status = await getStatusOrThrow(repo)
    files = status.workingDirectory.files

    expect(files).toHaveLength(1)
  })

  it('can discard a renamed file', async () => {
    const repo = await setupEmptyRepository()
    const gitStore = new GitStore(repo, shell, statsStore)

    const file = 'README.md'
    const renamedFile = 'NEW-README.md'
    const filePath = Path.join(repo.path, file)

    await FSE.writeFile(filePath, 'SOME WORDS GO HERE\n')

    // commit the file, and then rename it
    await GitProcess.exec(['add', file], repo.path)
    await GitProcess.exec(['commit', '-m', 'added file'], repo.path)
    await GitProcess.exec(['mv', file, renamedFile], repo.path)

    const statusBeforeDiscard = await getStatusOrThrow(repo)
    const filesToDiscard = statusBeforeDiscard.workingDirectory.files

    // discard the renamed file
    await gitStore.discardChanges(filesToDiscard)

    const status = await getStatusOrThrow(repo)
    const files = status.workingDirectory.files

    expect(files).toHaveLength(0)
  })

  describe('undo first commit', () => {
    let repository: Repository
    let firstCommit: Commit | null = null

    const commitMessage = 'added file'

    beforeEach(async () => {
      repository = await setupEmptyRepository()

      const file = 'README.md'
      const filePath = Path.join(repository.path, file)

      await FSE.writeFile(filePath, 'SOME WORDS GO HERE\n')

      await GitProcess.exec(['add', file], repository.path)
      await GitProcess.exec(['commit', '-m', commitMessage], repository.path)

      firstCommit = await getCommit(repository, 'master')
      expect(firstCommit).not.toBeNull()
      expect(firstCommit!.parentSHAs).toHaveLength(0)
    })

    it('reports the repository is unborn', async () => {
      const gitStore = new GitStore(repository, shell, statsStore)

      await gitStore.loadStatus()
      expect(gitStore.tip.kind).toEqual(TipState.Valid)

      await gitStore.undoCommit(firstCommit!)

      const after = await getStatusOrThrow(repository)
      expect(after.currentTip).toBeUndefined()
    })

    it('pre-fills the commit message', async () => {
      const gitStore = new GitStore(repository, shell, statsStore)

      await gitStore.undoCommit(firstCommit!)

      const newCommitMessage = gitStore.commitMessage
      expect(newCommitMessage).not.toBeNull()
      expect(newCommitMessage!.summary).toEqual(commitMessage)
    })

    it('clears the undo commit dialog', async () => {
      const gitStore = new GitStore(repository, shell, statsStore)

      await gitStore.loadStatus()

      const tip = gitStore.tip as IValidBranch
      await gitStore.loadLocalCommits(tip.branch)

      expect(gitStore.localCommitSHAs).toHaveLength(1)

      await gitStore.undoCommit(firstCommit!)

      await gitStore.loadStatus()
      expect(gitStore.tip.kind).toEqual(TipState.Unborn)

      await gitStore.loadLocalCommits(null)

      expect(gitStore.localCommitSHAs).toHaveLength(0)
    })

    it('has no staged files', async () => {
      const gitStore = new GitStore(repository, shell, statsStore)

      await gitStore.loadStatus()

      const tip = gitStore.tip as IValidBranch
      await gitStore.loadLocalCommits(tip.branch)

      expect(gitStore.localCommitSHAs.length).toEqual(1)

      await gitStore.undoCommit(firstCommit!)

      // compare the index state to some other tree-ish
      // 4b825dc642cb6eb9a060e54bf8d69288fbee4904 is the magic empty tree
      // if nothing is staged, this should return no entries
      const result = await GitProcess.exec(
        [
          'diff-index',
          '--name-status',
          '-z',
          '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
        ],
        repository.path
      )
      expect(result.stdout.length).toEqual(0)
    })
  })

  describe('repository with HEAD file', () => {
    it('can discard modified change cleanly', async () => {
      const path = await setupFixtureRepository('repository-with-HEAD-file')
      const repo = new Repository(path, 1, null, false)
      const gitStore = new GitStore(repo, shell, statsStore)

      const file = 'README.md'
      const filePath = Path.join(repo.path, file)

      await FSE.writeFile(filePath, 'SOME WORDS GO HERE\n')

      let status = await getStatusOrThrow(repo!)
      let files = status.workingDirectory.files
      expect(files.length).toEqual(1)

      await gitStore.discardChanges([files[0]])

      status = await getStatusOrThrow(repo)
      files = status.workingDirectory.files
      expect(files.length).toEqual(0)
    })
  })

  describe('loadBranches', () => {
    let upstream: Repository
    let repository: Repository
    beforeEach(async () => {
      upstream = await setupEmptyRepository()
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

      repository = await cloneLocalRepository(upstream)
    })

    it('has a remote defined', async () => {
      const remotes = await getRemotes(repository)
      expect(remotes).toHaveLength(1)
    })

    it('will merge a local and remote branch when tracking branch set', async () => {
      const gitStore = new GitStore(repository, shell, statsStore)
      await gitStore.loadBranches()

      expect(gitStore.allBranches).toHaveLength(2)

      const defaultBranch = gitStore.allBranches.find(b => b.name === 'master')
      expect(defaultBranch!.upstream).toBe('origin/master')

      const remoteBranch = gitStore.allBranches.find(
        b => b.name === 'origin/some-other-branch'
      )
      expect(remoteBranch!.type).toBe(BranchType.Remote)
    })

    it('the tracking branch is not cleared when the remote branch is removed', async () => {
      // checkout the other branch after cloning
      await GitProcess.exec(['checkout', 'some-other-branch'], repository.path)

      const gitStore = new GitStore(repository, shell, statsStore)
      await gitStore.loadBranches()

      const currentBranchBefore = gitStore.allBranches.find(
        b => b.name === 'some-other-branch'
      )
      expect(currentBranchBefore!.upstream).toBe('origin/some-other-branch')

      // delete the ref in the upstream branch
      await GitProcess.exec(
        ['branch', '-D', 'some-other-branch'],
        upstream.path
      )

      // update the local repository state to remove the remote ref
      await GitProcess.exec(['fetch', '--prune', '--all'], repository.path)
      await gitStore.loadBranches()

      const currentBranchAfter = gitStore.allBranches.find(
        b => b.name === 'some-other-branch'
      )

      // ensure the tracking information is unchanged
      expect(currentBranchAfter!.upstream).toBe('origin/some-other-branch')
    })
  })
})
