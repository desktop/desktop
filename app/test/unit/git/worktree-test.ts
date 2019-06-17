import { setupEmptyRepository } from '../../helpers/repositories'
import { listWorktrees } from '../../../src/lib/git/worktree'
import { Repository } from '../../../src/models/repository'
import { GitProcess } from 'dugite'

describe('git/worktree', () => {
  describe('list', () => {
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
    })
  })
})
