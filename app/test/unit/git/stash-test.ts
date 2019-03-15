import * as FSE from 'fs-extra'
import * as path from 'path'
import { Repository } from '../../../src/models/repository'
import { setupEmptyRepository } from '../../helpers/repositories'
import { GitProcess } from 'dugite'
import {
  getDesktopStashEntries,
  createStashMessage,
  createStashEntry,
} from '../../../src/lib/git/stash'

describe('git/stash', () => {
  describe('getDesktopStashEntries', () => {
    let repository: Repository
    let readme: string

    beforeEach(async () => {
      repository = await setupEmptyRepository()
      readme = path.join(repository.path, 'README.md')
      await FSE.writeFile(readme, '')
      await GitProcess.exec(['add', 'README.md'], repository.path)
      await GitProcess.exec(['commit', '-m', 'initial commit'], repository.path)
    })

    it('handles unborn repo by returning empty list', async () => {
      const repo = await setupEmptyRepository()
      let didFail = false
      readme = path.join(repo.path, 'README.md')
      await FSE.writeFile(readme, '')
      await stash(repo)

      try {
        await getDesktopStashEntries(repo)
      } catch (e) {
        didFail = true
      }

      expect(didFail).toBe(true)
    })

    it('returns all stash entries created by Desktop', async () => {
      await generateTestStashEntries(repository)

      const stashEntries = await getDesktopStashEntries(repository)

      expect(stashEntries).toHaveLength(1)
      expect(stashEntries[0].branchName).toBe('master')
    })
  })

  describe('createStashEntry', () => {
    let repository: Repository
    let readme: string

    beforeEach(async () => {
      repository = await setupEmptyRepository()
      readme = path.join(repository.path, 'README.md')
      await FSE.writeFile(readme, '')
      await GitProcess.exec(['add', 'README.md'], repository.path)
      await GitProcess.exec(['commit', '-m', 'initial commit'], repository.path)
    })

    it('creates a stash entry', async () => {
      await await FSE.appendFile(readme, 'just testing stuff')
      const tipSha = await getTipSha(repository)

      await createStashEntry(repository, 'master', tipSha)

      const result = await GitProcess.exec(['stash', 'list'], repository.path)
      const entries = result.stdout.trim().split('\n')
      expect(entries).toHaveLength(1)
    })
  })
})

async function getTipSha(repository: Repository) {
  const result = await GitProcess.exec(['rev-parse', 'HEAD'], repository.path)
  return result.stdout.trim()
}

async function stash(repository: Repository, message?: string) {
  const tipSha = await getTipSha(repository)
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
