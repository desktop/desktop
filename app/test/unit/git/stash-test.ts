import * as FSE from 'fs-extra'
import * as path from 'path'
import { Repository } from '../../../src/models/repository'
import { setupFixtureRepository } from '../../helpers/repositories'
import { GitProcess } from 'dugite'
import { MagicStashString, getStashEntries } from '../../../src/lib/git/stash'

describe('git/stash', () => {
  let repository: Repository | null = null

  beforeEach(async () => {
    const testRepoPath = await setupFixtureRepository('stashing-test-repo')
    repository = new Repository(testRepoPath, -1, null, false)
  })

  describe('getStashEntries', () => {
    it('returns all stash entries created by desktop', async () => {
      await FSE.writeFile(
        path.join(repository!.path, 'README.md'),
        'Hi world\n'
      )
      await stash(repository!)

      const stashEntries = await getStashEntries(repository!)

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
