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
  getLastDesktopStashEntryForBranch,
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

    it('throws when repository is unborn', async () => {
      repository = await setupEmptyRepository()
      await FSE.writeFile(readme, '')
      let didFail = false

      try {
        await createDesktopStashEntry(repository, 'master', 'some_sha')
      } catch (e) {
        didFail = true
      }

      expect(didFail).toBe(true)
    })

    it('throws when repository is in conflicted state', async () => {
      repository = await setupConflictedRepo()
      await FSE.appendFile(readme, 'just testing stuff')
      const tipCommit = await getTipOrError(repository)
      let didFail = false

      try {
        await createDesktopStashEntry(repository, 'master', tipCommit.sha)
      } catch (e) {
        didFail = true
      }

      expect(didFail).toBe(true)
    })

    it('throws when repository is in the middle of a rebase', async () => {})

    it('creates a stash entry', async () => {
      const { sha } = await getTipOrError(repository)
      const branchName = 'master'
      await FSE.appendFile(readme, 'just testing stuff')

      await createDesktopStashEntry(repository, branchName, sha)

      const result = await GitProcess.exec(['stash', 'list'], repository.path)
      const entries = result.stdout.trim().split('\n')
      expect(entries).toHaveLength(1)
      expect(entries[0]).toContain(
        `${DesktopStashEntryMarker}<${branchName}@${sha}`
      )
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
      const lastEntry = await generateTestStashEntry(
        repository,
        branchName,
        true
      )

      const actual = await getLastDesktopStashEntryForBranch(
        repository,
        branchName
      )

      expect(actual).not.toBeNull()
      expect(actual!.stashSha).toBe(lastEntry)
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

  return await stash(repository, branchName, message)
}
