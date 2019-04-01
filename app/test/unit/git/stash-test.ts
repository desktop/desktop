import * as FSE from 'fs-extra'
import * as path from 'path'
import { Repository } from '../../../src/models/repository'
import { setupEmptyRepository } from '../../helpers/repositories'
import { GitProcess } from 'dugite'
import {
  getDesktopStashEntries,
  createDesktopStashMessage,
  createDesktopStashEntry,
  getLastDesktopStashEntryForBranch,
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

      const entries = await getDesktopStashEntries(repo)

      expect(entries).toHaveLength(0)
    })

    it('returns an empty list when no stash entries have been created', async () => {
      const entries = await getDesktopStashEntries(repository)

      expect(entries).toHaveLength(0)
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

  describe('createDesktopStashEntry', () => {
    let repository: Repository
    let readme: string

    beforeEach(async () => {
      repository = await setupEmptyRepository()
      readme = path.join(repository.path, 'README.md')
      await FSE.writeFile(readme, '')
      await GitProcess.exec(['add', 'README.md'], repository.path)
      await GitProcess.exec(['commit', '-m', 'initial commit'], repository.path)
    })

    it('creates a stash entry when repo is not unborn or in any kind of conflict or rebase state', async () => {
      const branchName = 'master'
      await FSE.appendFile(readme, 'just testing stuff')

      const tipCommit = await getTipOrError(repository)
      await createDesktopStashEntry(repository, branchName, tipCommit.sha)
    })
  })

  describe('getLastDesktopStashEntryForBranch', () => {
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

      const entry = await getLastDesktopStashEntryForBranch(
        repository,
        'master'
      )

      expect(entry).toBeNull()
    })

    it('returns last entry made for branch', async () => {
      const branchName = 'master'
      await generateTestStashEntry(repository, branchName, true)
      await generateTestStashEntry(repository, branchName, true)

      const stashEntries = await getDesktopStashEntries(repository)
      // entries are returned in LIFO order
      const lastEntry = stashEntries[0]

      const actual = await getLastDesktopStashEntryForBranch(
        repository,
        branchName
      )

      expect(actual).not.toBeNull()
      expect(actual!.stashSha).toBe(lastEntry.stashSha)
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

    it('removes the entry identified by `stashSha`', async () => {
      await FSE.appendFile(readme, '1')
      await stash(repository, 'master', null)

      let stashEntries = await getDesktopStashEntries(repository)
      const stashToDelete = stashEntries[0]

      await FSE.appendFile(readme, '2')
      await stash(repository, 'master', null)

      await dropDesktopStashEntry(repository, stashToDelete)

      // using this function to get stashSha since it parses
      // the output from git into easy to use objects
      stashEntries = await getDesktopStashEntries(repository)

      expect(stashEntries).toHaveLength(1)
      expect(stashEntries[0].stashSha).not.toEqual(stashToDelete)
    })

    it('does no-op when passed a commit sha that does not match any stash entry', async () => {})
  })
})

/**
 * Creates a stash entry using `git stash push` to allow for similating
 * entries created via the CLI and Desktop
 *
 * @param repository the repository to create the stash entry for
 * @param message passing null will similate a Desktop created stash entry
 */
async function stash(
  repository: Repository,
  branchName: string,
  message: string | null
): Promise<void> {
  const tip = await getTipOrError(repository)
  await GitProcess.exec(
    [
      'stash',
      'push',
      '-m',
      message || createDesktopStashMessage(branchName, tip.sha),
    ],
    repository.path
  )
}

async function generateTestStashEntry(
  repository: Repository,
  branchName: string,
  simulateDesktopEntry: boolean
): Promise<void> {
  const message = simulateDesktopEntry ? null : 'Should get filtered'
  const readme = path.join(repository.path, 'README.md')
  await FSE.appendFile(readme, '1')
  await stash(repository, branchName, message)
}
