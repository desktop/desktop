import * as FSE from 'fs-extra'
import * as path from 'path'
import { Repository } from '../../../src/models/repository'
import {
  setupEmptyRepository,
  setupConflictedRepo,
} from '../../helpers/repositories'
import { GitProcess } from 'dugite'
import {
  getDesktopStashEntries,
  createDesktopStashMessage,
  createDesktopStashEntry,
  DesktopStashEntryMarker,
  stashEntryMessageRe,
} from '../../../src/lib/git/stash'
import { getTipOrError } from '../../helpers/tip'

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

      const entries = await getDesktopStashEntries(repo)

      expect(entries).toHaveLength(0)
    })

    it('returns an empty list when no stash entries have been created', async () => {
      const entries = await getDesktopStashEntries(repository)

      expect(entries).toHaveLength(0)
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
      const branchName = 'master'
      await FSE.appendFile(readme, 'just testing stuff')
      const tipCommit = await getTipOrError(repository)

      await createDesktopStashEntry(repository, branchName, tipCommit.sha)

      const result = await GitProcess.exec(['stash', 'list'], repository.path)
      const entries = result.stdout.trim().split('\n')
      expect(entries).toHaveLength(1)
      expect(entries[0]).toContain(
        `${DesktopStashEntryMarker}<${branchName}@${tipCommit.sha}`
      )
    })
  })

  describe('createDesktopStashMessage', () => {
    it('creates message that matches Desktop stash entry format', () => {
      const branchName = 'master'
      const tipSha = 'bc45b3b97993eed2c3d7872a0b766b3e29a12e4b'

      const message = createDesktopStashMessage(branchName, tipSha)

      expect(message).toBe(
        '!!GitHub_Desktop<master@bc45b3b97993eed2c3d7872a0b766b3e29a12e4b>'
      )
      expect(message).toMatch(stashEntryMessageRe)
    })
  })
})

async function stash(repository: Repository, message?: string) {
  const tipCommit = await getTipOrError(repository)
  await GitProcess.exec(
    [
      'stash',
      'push',
      '-m',
      message || createDesktopStashMessage('master', tipCommit.sha),
    ],
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
