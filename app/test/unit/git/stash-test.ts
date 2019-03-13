import * as FSE from 'fs-extra'
import * as path from 'path'
import { Repository } from '../../../src/models/repository'
import { setupEmptyRepository } from '../../helpers/repositories'
import { GitProcess } from 'dugite'
import { MagicStashString, getStashEntries } from '../../../src/lib/git/stash'

describe('git/stash', () => {
  describe('getStashEntries', () => {
    let repository: Repository
    let readme: string

    beforeEach(async () => {
      repository = await setupEmptyRepository()
      readme = path.join(repository.path, 'README.md')
      await FSE.writeFile(readme, '')
      await GitProcess.exec(['add', 'README.md'], repository.path)
      await GitProcess.exec(['commit', '-m', 'initial commit'], repository.path)
    })

    it('returns all stash entries created by Desktop', async () => {

      const stashEntries = await getDesktopStashEntries(repository)

      expect(stashEntries).toHaveLength(1)
    })
  })
})

async function stash(repository: Repository) {
  await GitProcess.exec(
    ['stash', 'push', '-m', `${MagicStashString}:some-branch`],
    repository.path
  )
}
