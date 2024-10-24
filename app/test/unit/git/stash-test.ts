import * as FSE from 'fs-extra'
import * as path from 'path'
import { Repository } from '../../../src/models/repository'
import { setupEmptyRepository } from '../../helpers/repositories'
import { exec } from 'dugite'
import {
  createDesktopStashMessage,
  createDesktopStashEntry,
  getLastDesktopStashEntryForBranch,
  dropDesktopStashEntry,
  popStashEntry,
  getStashes,
} from '../../../src/lib/git/stash'
import { getStatusOrThrow } from '../../helpers/status'
import { AppFileStatusKind } from '../../../src/models/status'
import {
  IStashEntry,
  StashedChangesLoadStates,
} from '../../../src/models/stash-entry'
import { generateString } from '../../helpers/random-data'

describe('git/stash', () => {
  describe('getStash', () => {
    let repository: Repository
    let readme: string

    beforeEach(async () => {
      repository = await setupEmptyRepository()
      readme = path.join(repository.path, 'README.md')
      await FSE.writeFile(readme, '')
      await exec(['add', 'README.md'], repository.path)
      await exec(['commit', '-m', 'initial commit'], repository.path)
    })

    it('handles unborn repo by returning empty list', async () => {
      const repo = await setupEmptyRepository()

      const stash = await getStashes(repo)

      expect(stash.desktopEntries).toHaveLength(0)
    })

    it('returns an empty list when no stash entries have been created', async () => {
      const stash = await getStashes(repository)

      expect(stash.desktopEntries).toHaveLength(0)
    })

    it('returns all stash entries created by Desktop', async () => {
      await generateTestStashEntry(repository, 'master', false)
      await generateTestStashEntry(repository, 'master', false)
      await generateTestStashEntry(repository, 'master', true)

      const stash = await getStashes(repository)
      const entries = stash.desktopEntries
      expect(entries).toHaveLength(1)
      expect(entries[0].branchName).toBe('master')
      expect(entries[0].name).toBe('refs/stash@{0}')
    })
  })

  describe('createDesktopStashEntry', () => {
    let repository: Repository
    let readme: string

    beforeEach(async () => {
      repository = await setupEmptyRepository()
      readme = path.join(repository.path, 'README.md')
      await FSE.writeFile(readme, '')
      await exec(['add', 'README.md'], repository.path)
      await exec(['commit', '-m', 'initial commit'], repository.path)
    })

    it('creates a stash entry when repo is not unborn or in any kind of conflict or rebase state', async () => {
      await FSE.appendFile(readme, 'just testing stuff')

      await createDesktopStashEntry(repository, 'master', [])

      const stash = await getStashes(repository)
      const entries = stash.desktopEntries

      expect(entries).toHaveLength(1)
      expect(entries[0].branchName).toBe('master')
    })

    it('stashes untracked files and removes them from the working directory', async () => {
      const untrackedFile = path.join(repository.path, 'not-tracked.txt')
      FSE.writeFile(untrackedFile, 'some untracked file')

      let status = await getStatusOrThrow(repository)
      let files = status.workingDirectory.files

      expect(files).toHaveLength(1)
      expect(files[0].status.kind).toBe(AppFileStatusKind.Untracked)

      const untrackedFiles = status.workingDirectory.files.filter(
        f => f.status.kind === AppFileStatusKind.Untracked
      )

      await createDesktopStashEntry(repository, 'master', untrackedFiles)

      status = await getStatusOrThrow(repository)
      files = status.workingDirectory.files

      expect(files).toHaveLength(0)
    })
  })

  describe('getLastDesktopStashEntryForBranch', () => {
    let repository: Repository
    let readme: string

    beforeEach(async () => {
      repository = await setupEmptyRepository()
      readme = path.join(repository.path, 'README.md')
      await FSE.writeFile(readme, '')
      await exec(['add', 'README.md'], repository.path)
      await exec(['commit', '-m', 'initial commit'], repository.path)
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

      const stash = await getStashes(repository)
      // entries are returned in LIFO order
      const lastEntry = stash.desktopEntries[0]

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

      const message = createDesktopStashMessage(branchName)

      expect(message).toBe('!!GitHub_Desktop<master>')
    })
  })

  describe('dropDesktopStashEntry', () => {
    let repository: Repository
    let readme: string

    beforeEach(async () => {
      repository = await setupEmptyRepository()
      readme = path.join(repository.path, 'README.md')
      await FSE.writeFile(readme, '')
      await exec(['add', 'README.md'], repository.path)
      await exec(['commit', '-m', 'initial commit'], repository.path)
    })

    it('removes the entry identified by `stashSha`', async () => {
      await generateTestStashEntry(repository, 'master', true)
      await generateTestStashEntry(repository, 'master', true)

      let stash = await getStashes(repository)
      let entries = stash.desktopEntries
      expect(entries.length).toBe(2)

      const stashToDelete = entries[1]
      await dropDesktopStashEntry(repository, stashToDelete.stashSha)

      // using this function to get stashSha since it parses
      // the output from git into easy to use objects
      stash = await getStashes(repository)
      entries = stash.desktopEntries
      expect(entries.length).toBe(1)
      expect(entries[0].stashSha).not.toEqual(stashToDelete)
    })

    it('does not fail when attempting to delete when stash is empty', async () => {
      let didFail = false
      const doesNotExist: IStashEntry = {
        name: 'refs/stash@{0}',
        branchName: 'master',
        stashSha: 'xyz',
        tree: 'xyz',
        parents: ['abc'],
        files: { kind: StashedChangesLoadStates.NotLoaded },
      }

      try {
        await dropDesktopStashEntry(repository, doesNotExist.stashSha)
      } catch {
        didFail = true
      }

      expect(didFail).toBe(false)
    })

    it("does not fail when attempting to delete stash entry that doesn't exist", async () => {
      let didFail = false
      const doesNotExist: IStashEntry = {
        name: 'refs/stash@{4}',
        branchName: 'master',
        stashSha: 'xyz',
        tree: 'xyz',
        parents: ['abc'],
        files: { kind: StashedChangesLoadStates.NotLoaded },
      }
      await generateTestStashEntry(repository, 'master', true)
      await generateTestStashEntry(repository, 'master', true)
      await generateTestStashEntry(repository, 'master', true)

      try {
        await dropDesktopStashEntry(repository, doesNotExist.stashSha)
      } catch {
        didFail = true
      }

      expect(didFail).toBe(false)
    })
  })

  describe('popStashEntry', () => {
    let repository: Repository
    let readme: string

    beforeEach(async () => {
      repository = await setupEmptyRepository()
      readme = path.join(repository.path, 'README.md')
      await FSE.writeFile(readme, '')
      await exec(['add', 'README.md'], repository.path)
      await exec(['commit', '-m', 'initial commit'], repository.path)
    })
    describe('without any conflicts', () => {
      it('restores changes back to the working directory', async () => {
        await generateTestStashEntry(repository, 'master', true)
        const stash = await getStashes(repository)
        const { desktopEntries } = stash
        expect(desktopEntries.length).toBe(1)

        let status = await getStatusOrThrow(repository)
        let files = status.workingDirectory.files
        expect(files).toHaveLength(0)

        const entryToApply = desktopEntries[0]
        await popStashEntry(repository, entryToApply.stashSha)

        status = await getStatusOrThrow(repository)
        files = status.workingDirectory.files
        expect(files).toHaveLength(1)
      })
    })

    describe('when there are (resolvable) conflicts', () => {
      it('restores changes and drops stash', async () => {
        await generateTestStashEntry(repository, 'master', true)
        const stash = await getStashes(repository)
        const { desktopEntries } = stash
        expect(desktopEntries.length).toBe(1)

        const readme = path.join(repository.path, 'README.md')
        await FSE.appendFile(readme, generateString())
        await exec(['commit', '-am', 'later commit'], repository.path)

        let status = await getStatusOrThrow(repository)
        let files = status.workingDirectory.files
        expect(files).toHaveLength(0)

        const entryToApply = desktopEntries[0]
        await popStashEntry(repository, entryToApply.stashSha)

        status = await getStatusOrThrow(repository)
        files = status.workingDirectory.files
        expect(files).toHaveLength(1)

        const stashAfter = await getStashes(repository)
        expect(stashAfter.desktopEntries).not.toContain(entryToApply)
      })
    })

    describe('when there are unresolvable conflicts', () => {
      it('throws an error', async () => {
        await generateTestStashEntry(repository, 'master', true)
        const stash = await getStashes(repository)
        const { desktopEntries } = stash
        expect(desktopEntries.length).toBe(1)

        const readme = path.join(repository.path, 'README.md')
        await FSE.writeFile(readme, generateString())

        const entryToApply = desktopEntries[0]
        await expect(
          popStashEntry(repository, entryToApply.stashSha)
        ).rejects.toThrowError()
      })
    })
  })
})

/**
 * Creates a stash entry using `git stash push` to allow for simulating
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
  const result = await exec(
    ['stash', 'push', '-m', message || createDesktopStashMessage(branchName)],
    repository.path
  )

  if (result.exitCode !== 0) {
    throw new Error(result.stderr)
  }
}

async function generateTestStashEntry(
  repository: Repository,
  branchName: string,
  simulateDesktopEntry: boolean
): Promise<void> {
  const message = simulateDesktopEntry ? null : 'Should get filtered'
  const readme = path.join(repository.path, 'README.md')
  await FSE.appendFile(readme, generateString())
  await stash(repository, branchName, message)
}
