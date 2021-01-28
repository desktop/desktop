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
import { realpathSync } from 'fs-extra'

describe('git/worktree', () => {
  describe('listWorktrees', () => {
    describe('for an unborn repository', () => {
      let repository: Repository

      beforeEach(async () => {
        repository = await setupEmptyRepository()
      })

      it('returns one entry', async () => {
        const result = await listWorkTrees(repository)
        expect(result).toHaveLength(1)
      })

      it('contains the head of the main repository', async () => {
        const result = await listWorkTrees(repository)
        const first = result[0]
        expect(first.head).toBe('0000000000000000000000000000000000000000')
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
      // we use realpathSync here because git and windows/macOS report different
      // paths even though they are the same folder
      const tmpDir = await FSE.readdir(realpathSync(Os.tmpdir()))
      const workTreeBaseName = Path.basename(realpathSync(workTree.path))

      expect(workTree.head).toBe(currentHeadSha)

      // We are checking if the last folder on worktree path exists in tmpDir
      // because tmpDir on windows uses 8.3 short names
      // and workTree path uses long names; thus, we cannot simply compare paths.
      expect(tmpDir).toContain(workTreeBaseName)
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
