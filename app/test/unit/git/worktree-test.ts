import { setupEmptyRepository } from '../../helpers/repositories'
import { listWorktrees } from '../../../src/lib/git/worktree'

describe('git/worktree', () => {
  describe('list', () => {
    describe('for an unborn repository', () => {
      it('returns one entry', async () => {
        const repository = await setupEmptyRepository()
        const result = await listWorktrees(repository)
        expect(result).toHaveLength(1)
      })

      it('contains the head and path of the main repository', async () => {
        const repository = await setupEmptyRepository()
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
  })
})
