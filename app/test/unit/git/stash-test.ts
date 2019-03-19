import * as FSE from 'fs-extra'
import * as path from 'path'
import { Repository } from '../../../src/models/repository'
import { setupEmptyRepository } from '../../helpers/repositories'
import { GitProcess } from 'dugite'
import {
  getDesktopStashEntries,
  createDesktopStashMessage,
  createDesktopStashEntry,
  getLastDesktopStashEntry,
  dropDesktopStashEntry,
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
      let didFail = false

      try {
        await getDesktopStashEntries(repo)
      } catch (e) {
        didFail = true
      }

      expect(didFail).toBe(true)
    })

    it('returns all stash entries created by Desktop', async () => {
      await generateTestStashEntry(repository, 'master', false)
      await generateTestStashEntry(repository, 'master', false)
      await generateTestStashEntry(repository, 'master', true)

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
      await FSE.appendFile(readme, 'just testing stuff')
      const { sha } = await getTipOrError(repository)

      await createDesktopStashEntry(repository, 'master', sha)

      const result = await GitProcess.exec(['stash', 'list'], repository.path)
      const entries = result.stdout.trim().split('\n')
      expect(entries).toHaveLength(1)
    })
  })

  describe('getLastDesktopStashEntry', () => {
    let repository: Repository
    let readme: string

    beforeEach(async () => {
      repository = await setupEmptyRepository()
      readme = path.join(repository.path, 'README.md')
      await FSE.writeFile(readme, '')
      await GitProcess.exec(['add', 'README.md'], repository.path)
      await GitProcess.exec(['commit', '-m', 'initial commit'], repository.path)
    })

    it('returns null when no stash entries exist for branch', async () => {
      await generateTestStashEntry(repository, 'some-other-branch', true)

      const entry = await getLastDesktopStashEntry(repository, 'master')

      expect(entry).toBeNull()
    })

    it('returns last entry made for branch', async () => {
      const branchName = 'master'
      await generateTestStashEntry(repository, branchName, true)
      const lastEntry = await generateTestStashEntry(
        repository,
        branchName,
        true
      )

      const actual = await getLastDesktopStashEntry(repository, branchName)

      expect(actual!.stashSha).toBe(lastEntry)
    })
  })

  describe('dropDesktopStashEntry', () => {
    let repository: Repository
    let readme: string

    beforeEach(async () => {
      repository = await setupEmptyRepository()
      readme = path.join(repository.path, 'README.md')
      await FSE.writeFile(readme, '')
      await GitProcess.exec(['add', 'README.md'], repository.path)
      await GitProcess.exec(['commit', '-m', 'initial commit'], repository.path)
    })

    it('does nothing when given an empty string for `stashSha`', async () => {
      await FSE.appendFile(readme, '1')
      await stash(repository, 'master', null)

      await dropDesktopStashEntry(repository, '')

      const result = await GitProcess.exec(['stash', 'list'], repository.path)
      const entries = result.stdout.trim().split('\n')
      expect(entries).toHaveLength(1)
    })

    it('removes the entry identified by `stashSha`', async () => {
      await FSE.appendFile(readme, '1')
      const stashToDelete = await stash(repository, 'master', null)
      await FSE.appendFile(readme, '2')
      await stash(repository, 'master', null)

      await dropDesktopStashEntry(repository, stashToDelete)

      // using this function to get stashSha since it parses
      // the output from git into easy to use objects
      const entries = await getDesktopStashEntries(repository)

      expect(entries).toHaveLength(1)
      expect(entries[0].stashSha).not.toEqual(stashToDelete)
    })
  })
})

async function stash(
  repository: Repository,
  branchName: string,
  message: string | null
): Promise<string> {
  const tip = await getTipOrError(repository)

  // Since we're identifying stash entries by their object ID
  // we need to capture it at the time of creation so that we
  // can assert against it.
  const result = await GitProcess.exec(['stash', 'create'], repository.path)
  const objectId = result.stdout.trim()
  await GitProcess.exec(
    [
      'stash',
      'store',
      '-m',
      message || createDesktopStashMessage(branchName, tip.sha),
      objectId,
    ],
    repository.path
  )

  return objectId
}

async function generateTestStashEntry(
  repository: Repository,
  branchName: string,
  createdByDesktop: boolean
): Promise<string> {
  const message = createdByDesktop ? null : 'Should get filtered'
  const readme = path.join(repository.path, 'README.md')
  await FSE.appendFile(readme, '1')
  const objectId = await stash(repository, branchName, message)

  return objectId
}
