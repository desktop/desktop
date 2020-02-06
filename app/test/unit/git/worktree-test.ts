import * as Os from 'os'
import * as Path from 'path'
import * as FSE from 'fs-extra'
import { GitProcess } from 'dugite'

import { setupEmptyRepository } from '../../helpers/repositories'
import {
  listWorkTrees,
  createTemporaryWorkTree,
  cleanupTemporaryWorkTrees,
} from '../../../src/lib/git/worktree'
import { Repository, LinkedWorkTree } from '../../../src/models/repository'
import { realpathSync, mkdtemp } from 'fs-extra'

describe('git/worktree', () => {
  describe('listWorktrees', () => {
    describe('for an unborn repository', () => {
      let repository: Repository

      beforeEach(async () => {
        if (
          process.platform === 'win32' &&
          process.env.TF_BUILD != null &&
          process.env.AGENT_TEMPDIRECTORY
        ) {
          // running test on Azure Pipelines (Windows)
          //
          // This is a workaround for the `TEMP` environment variable containing
          // a shortname (VSSADM~1) version of the account name, but the NodeJS
          // API returning the long path name (VSSAdministrator). Both are valid
          // but will break when we try to compare them.
          //
          // Instead of using `TEMP` in this situation we'll use the
          // `AGENT_TEMPDIRECTORY` environment variable which will be cleaned up
          // after the test run
          const repoPath = await mkdtemp(
            Path.join(process.env.AGENT_TEMPDIRECTORY, 'desktop-empty-repo-')
          )
          await GitProcess.exec(['init'], repoPath)

          repository = new Repository(repoPath, -1, null, false)
        } else {
          repository = await setupEmptyRepository()
        }
      })

      it('returns one entry', async () => {
        const result = await listWorkTrees(repository)
        expect(result).toHaveLength(1)
      })

      it('contains the head and path of the main repository', async () => {
        const { path } = repository
        const result = await listWorkTrees(repository)
        const first = result[0]
        expect(first.head).toBe('0000000000000000000000000000000000000000')

        // we use realpathSync here because git and windows/macOS report different
        // paths even though they are the same folder
        expect(realpathSync(first.path)).toBe(realpathSync(path))
      })
    })

    describe('for a repository containing commits', () => {
      let repository: Repository
      let currentHeadSha: string

      beforeEach(async () => {
        repository = await setupEmptyRepository()
        await GitProcess.exec(
          ['commit', '--allow-empty', '-m', '"first commit!"'],
          repository.path
        )
        await GitProcess.exec(
          ['commit', '--allow-empty', '-m', '"second commit!"'],
          repository.path
        )

        const result = await GitProcess.exec(
          ['rev-parse', 'HEAD'],
          repository.path
        )
        currentHeadSha = result.stdout.trim()
      })

      it('the head points to the right commit', async () => {
        const result = await listWorkTrees(repository)
        const first = result[0]
        expect(first.head).toBe(currentHeadSha)
      })

      describe('after adding a worktree manually', () => {
        const workTreePrefix = Path.join(
          Os.tmpdir(),
          'test-desktop-worktree-path'
        )
        let workTreePath: string

        beforeEach(async () => {
          workTreePath = await FSE.mkdtemp(workTreePrefix)
          const result = await GitProcess.exec(
            ['worktree', 'add', '-f', workTreePath, 'HEAD'],
            repository.path
          )
          expect(result.exitCode).toBe(0)
        })

        afterEach(async () => {
          await GitProcess.exec(
            ['worktree', 'remove', '-f', workTreePath],
            repository.path
          )
        })

        it('returns another entry', async () => {
          const result = await listWorkTrees(repository)
          expect(result).toHaveLength(2)
        })

        it('points to same commit sha', async () => {
          const result = await listWorkTrees(repository)
          const first = result[0]
          const last = result[1]
          expect(first.head).toBe(last.head)
        })
      })
    })
  })

  describe('createTemporaryWorkTree', () => {
    let repository: Repository
    let currentHeadSha: string

    beforeEach(async () => {
      repository = await setupEmptyRepository()
      await GitProcess.exec(
        ['commit', '--allow-empty', '-m', '"first commit!"'],
        repository.path
      )
      await GitProcess.exec(
        ['commit', '--allow-empty', '-m', '"second commit!"'],
        repository.path
      )
      await GitProcess.exec(
        ['commit', '--allow-empty', '-m', '"third commit!"'],
        repository.path
      )

      const result = await GitProcess.exec(
        ['rev-parse', 'HEAD'],
        repository.path
      )
      currentHeadSha = result.stdout.trim()
    })

    it('creates worktree at temporary path', async () => {
      const workTree = await createTemporaryWorkTree(repository, 'HEAD')
      const tmpDir = Os.tmpdir()

      expect(workTree.head).toBe(currentHeadSha)
      // we use realpathSync here because git and windows/macOS report different
      // paths even though they are the same folder
      expect(realpathSync(workTree.path)).toStartWith(realpathSync(tmpDir))
    })

    it('subsequent calls return different results', async () => {
      const firstWorkTree = await createTemporaryWorkTree(repository, 'HEAD')
      const secondWorkTree = await createTemporaryWorkTree(repository, 'HEAD')

      expect(firstWorkTree).not.toEqual(secondWorkTree)
    })

    it('concurrent calls return different results', async () => {
      const [firstWorkTree, secondWorkTree] = await Promise.all([
        createTemporaryWorkTree(repository, 'HEAD'),
        createTemporaryWorkTree(repository, 'HEAD'),
      ])
      expect(firstWorkTree).not.toEqual(secondWorkTree)
    })
  })

  describe('cleanupTemporaryWorkTrees', () => {
    let repository: Repository
    let internalWorkTree: LinkedWorkTree
    let externalWorkTreePath: string

    beforeEach(async () => {
      repository = await setupEmptyRepository()
      await GitProcess.exec(
        ['commit', '--allow-empty', '-m', '"first commit!"'],
        repository.path
      )
      await GitProcess.exec(
        ['commit', '--allow-empty', '-m', '"second commit!"'],
        repository.path
      )
      await GitProcess.exec(
        ['commit', '--allow-empty', '-m', '"third commit!"'],
        repository.path
      )

      internalWorkTree = await createTemporaryWorkTree(repository, 'HEAD')

      const workTreePrefix = Path.join(Os.tmpdir(), 'some-other-worktree-path')

      externalWorkTreePath = await FSE.mkdtemp(workTreePrefix)
      const result = await GitProcess.exec(
        ['worktree', 'add', '-f', externalWorkTreePath, 'HEAD'],
        repository.path
      )
      expect(result.exitCode).toBe(0)

      const workTrees = await listWorkTrees(repository)
      expect(workTrees).toHaveLength(3)
    })

    it('will cleanup temporary worktree', async () => {
      await cleanupTemporaryWorkTrees(repository)

      const workTrees = await listWorkTrees(repository)
      expect(workTrees).toHaveLength(2)
    })

    it('internal worktree no longer exists on disk', async () => {
      await cleanupTemporaryWorkTrees(repository)

      const exists = await FSE.pathExists(internalWorkTree.path)
      expect(exists).toBe(false)
    })

    it('worktree created outside Desktop remains', async () => {
      await cleanupTemporaryWorkTrees(repository)

      const exists = await FSE.pathExists(externalWorkTreePath)
      expect(exists).toBe(true)
    })
  })
})
