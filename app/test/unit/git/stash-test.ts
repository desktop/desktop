import * as FSE from 'fs-extra'
import * as path from 'path'
import { Repository } from '../../../src/models/repository'
import { setupEmptyRepository } from '../../helpers/repositories'
import { GitProcess } from 'dugite'
import {
  getDesktopStashEntries,
  createStashMessage,
} from '../../../src/lib/git/stash'

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
      await generateTestStashEntries(repository)

      const stashEntries = await getDesktopStashEntries(repository)

      expect(stashEntries).toHaveLength(1)
      expect(stashEntries[0].branchName).toBe('master')
    })
  })
})

async function stash(repository: Repository, message?: string) {
  const result = await GitProcess.exec(['rev-parse', 'HEAD'], repository.path)
  const tipSha = result.stdout.trim()
  await GitProcess.exec(
    ['stash', 'push', '-m', message || createStashMessage('master', tipSha)],
    repository.path
  )
}

async function generateTestStashEntries(repository: Repository) {
  const readme = path.join(repository.path, 'README.md')

  // simulate stashing from CLI
  await FSE.appendFile(readme, '1')
  await stash(repository, 'should get filtered')

  await FSE.appendFile(readme, '2')
  await stash(repository, 'should also get filtered')

  // simulate stashing from Desktop
  await FSE.appendFile(readme, '2')
  await stash(repository)
}
