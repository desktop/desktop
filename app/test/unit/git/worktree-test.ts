import * as Os from 'os'
import * as Path from 'path'
import * as FSE from 'fs-extra'
import { GitProcess } from 'dugite'

import { setupEmptyRepository } from '../../helpers/repositories'
import { listWorktrees } from '../../../src/lib/git/worktree'
import { Repository } from '../../../src/models/repository'

describe('git/worktree', () => {
  describe('listWorktrees', () => {
    describe('for an unborn repository', () => {
      let repository: Repository

      beforeEach(async () => {
        repository = await setupEmptyRepository()
      })

      it('returns one entry', async () => {
        const result = await listWorktrees(repository)
        expect(result).toHaveLength(1)
      })

      it('contains the head and path of the main repository', async () => {
        const { path } = repository
        const result = await listWorktrees(repository)
        const first = result[0]
        expect(first.head).toBe('0000000000000000000000000000000000000000')

        // You might be wondering why this isn't a `.toBe` comparsion.
        // Well, on macOS the path emitted by Git may start with a `/private`
        // which is super-annoying and also different to what NodeJS returns,
        // so we need to manage and reconcile these two cases
        const endsWith = first.path.endsWith(path)
        expect(endsWith).toBe(true)
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
        const result = await listWorktrees(repository)
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
          const result = await listWorktrees(repository)
          expect(result).toHaveLength(2)
        })

        it('points to same commit sha', async () => {
          const result = await listWorktrees(repository)
          const first = result[0]
          const last = result[1]
          expect(first.head).toBe(last.head)
        })
      })
    })
  })

  describe('addWorkTree', () => {
    it.skip('creates worktree at desired path', () => {})
  })

  describe('findOrCreateTemporaryWorkTree', () => {
    it.skip('creates worktree at temporary path', () => {})
    it.skip('subsequent calls return the same result', () => {})
  })
})
