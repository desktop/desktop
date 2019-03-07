import * as FSE from 'fs-extra'
import * as path from 'path'
import { Repository } from '../../../src/models/repository'
import { setupEmptyRepository } from '../../helpers/repositories'
import { GitProcess } from 'dugite'
import { MagicStashString, getStashEntries } from '../../../src/lib/git/stash'

describe('git/stash', () => {
  describe('getStashEntries', () => {
    it('returns all stash entries created by desktop', async () => {
      const repository = await setupEmptyRepository()

      await FSE.writeFile(path.join(repository.path, 'README.md'), 'Hi world\n')
      await stash(repository)

      const stashEntries = await getStashEntries(repository)

      expect(stashEntries).toHaveLength(1)
    })
  })
})

async function stash(repository: Repository) {
  await GitProcess.exec(['add', 'README.md'], repository.path)
  await GitProcess.exec(
    ['stash', 'push', '-m', `${MagicStashString}:some-branch`],
    repository.path
  )
}
