import * as path from 'path'
import * as FSE from 'fs-extra'
import { exec } from 'dugite'

import { Repository } from '../../../src/models/repository'

import { getStatusOrThrow } from '../../helpers/status'
import {
  setupFixtureRepository,
  setupEmptyRepository,
  setupEmptyDirectory,
  setupConflictedRepoWithMultipleFiles,
} from '../../helpers/repositories'
import {
  AppFileStatusKind,
  UnmergedEntrySummary,
  GitStatusEntry,
  isManualConflict,
} from '../../../src/models/status'
import * as temp from 'temp'
import { getStatus } from '../../../src/lib/git'
import { isConflictedFile } from '../../../src/lib/status'
import { setupLocalConfig } from '../../helpers/local-config'
import { generateString } from '../../helpers/random-data'

const _temp = temp.track()
const mkdir = _temp.mkdir

describe('git/status', () => {
  describe('getStatus', () => {
    let repository: Repository

    describe('with conflicted repo', () => {
      let filePath: string

      beforeEach(async () => {
        repository = await setupConflictedRepoWithMultipleFiles()
        filePath = path.join(repository.path, 'foo')
      })

      it('parses conflicted files with markers', async () => {
        const status = await getStatusOrThrow(repository)
        const files = status.workingDirectory.files
        expect(files).toHaveLength(5)
        const conflictedFiles = files.filter(
          f => f.status.kind === AppFileStatusKind.Conflicted
        )
        expect(conflictedFiles).toHaveLength(4)

        const fooFile = files.find(f => f.path === 'foo')!
        expect(fooFile.status).toEqual({
          kind: AppFileStatusKind.Conflicted,
          entry: {
            kind: 'conflicted',
            action: UnmergedEntrySummary.BothModified,
            them: GitStatusEntry.UpdatedButUnmerged,
            us: GitStatusEntry.UpdatedButUnmerged,
          },
          conflictMarkerCount: 3,
        })

        const bazFile = files.find(f => f.path === 'baz')!
        expect(bazFile.status).toEqual({
          kind: AppFileStatusKind.Conflicted,
          entry: {
            kind: 'conflicted',
            action: UnmergedEntrySummary.BothAdded,
            them: GitStatusEntry.Added,
            us: GitStatusEntry.Added,
          },
          conflictMarkerCount: 3,
        })

        const catFile = files.find(f => f.path === 'cat')!
        expect(catFile.status).toEqual({
          kind: AppFileStatusKind.Conflicted,
          entry: {
            kind: 'conflicted',
            action: UnmergedEntrySummary.BothAdded,
            them: GitStatusEntry.Added,
            us: GitStatusEntry.Added,
          },
          conflictMarkerCount: 3,
        })
      })

      it('parses conflicted files without markers', async () => {
        const status = await getStatusOrThrow(repository)
        const files = status.workingDirectory.files
        expect(files).toHaveLength(5)
        expect(
          files.filter(f => f.status.kind === AppFileStatusKind.Conflicted)
        ).toHaveLength(4)

        const barFile = files.find(f => f.path === 'bar')!
        expect(barFile.status).toEqual({
          kind: AppFileStatusKind.Conflicted,
          entry: {
            kind: 'conflicted',
            action: UnmergedEntrySummary.DeletedByThem,
            us: GitStatusEntry.UpdatedButUnmerged,
            them: GitStatusEntry.Deleted,
          },
        })
      })

      it('parses conflicted files resulting from popping a stash', async () => {
        const repository = await setupEmptyRepository()
        const readme = path.join(repository.path, 'README.md')
        await FSE.writeFile(readme, '')
        await exec(['add', 'README.md'], repository.path)
        await exec(['commit', '-m', 'initial commit'], repository.path)

        // write a change to the readme into the stash
        await FSE.appendFile(readme, generateString())
        await exec(['stash'], repository.path)

        // write a different change to the README and commit it
        await FSE.appendFile(readme, generateString())
        await exec(['commit', '-am', 'later commit'], repository.path)

        // pop the stash to introduce a conflict into the index
        await exec(['stash', 'pop'], repository.path)

        const status = await getStatusOrThrow(repository)
        const files = status.workingDirectory.files
        expect(files).toHaveLength(1)

        const conflictedFiles = files.filter(
          f => f.status.kind === AppFileStatusKind.Conflicted
        )
        expect(conflictedFiles).toHaveLength(1)
      })

      it('parses resolved files', async () => {
        await FSE.writeFile(filePath, 'b1b2')
        const status = await getStatusOrThrow(repository)
        const files = status.workingDirectory.files

        expect(files).toHaveLength(5)

        // all files are now considered conflicted
        expect(
          files.filter(f => f.status.kind === AppFileStatusKind.Conflicted)
        ).toHaveLength(4)

        const file = files.find(f => f.path === 'foo')
        expect(file!.status).toEqual({
          kind: AppFileStatusKind.Conflicted,
          entry: {
            kind: 'conflicted',
            action: UnmergedEntrySummary.BothModified,
            them: GitStatusEntry.UpdatedButUnmerged,
            us: GitStatusEntry.UpdatedButUnmerged,
          },
          conflictMarkerCount: 0,
        })
      })
    })

    describe('with conflicted images repo', () => {
      beforeEach(async () => {
        const path = await setupFixtureRepository(
          'detect-conflict-in-binary-file'
        )
        repository = new Repository(path, -1, null, false)
        await exec(['checkout', 'make-a-change'], repository.path)
      })

      it('parses conflicted image file on merge', async () => {
        const repo = repository

        await exec(['merge', 'master'], repo.path)

        const status = await getStatusOrThrow(repo)
        const files = status.workingDirectory.files
        expect(files).toHaveLength(1)

        const file = files[0]
        expect(file.status.kind).toBe(AppFileStatusKind.Conflicted)
        expect(
          isConflictedFile(file.status) && isManualConflict(file.status)
        ).toBe(true)
      })

      it('parses conflicted image file on merge after removing', async () => {
        const repo = repository

        await exec(['rm', 'my-cool-image.png'], repo.path)
        await exec(['commit', '-am', 'removed the image'], repo.path)

        await exec(['merge', 'master'], repo.path)

        const status = await getStatusOrThrow(repo)
        const files = status.workingDirectory.files
        expect(files).toHaveLength(1)

        const file = files[0]
        expect(file.status.kind).toBe(AppFileStatusKind.Conflicted)
        expect(
          isConflictedFile(file.status) && isManualConflict(file.status)
        ).toBe(true)
      })
    })

    describe('with unconflicted repo', () => {
      beforeEach(async () => {
        const testRepoPath = await setupFixtureRepository('test-repo')
        repository = new Repository(testRepoPath, -1, null, false)
      })

      it('parses changed files', async () => {
        await FSE.writeFile(
          path.join(repository.path, 'README.md'),
          'Hi world\n'
        )

        const status = await getStatusOrThrow(repository)
        const files = status.workingDirectory.files
        expect(files).toHaveLength(1)

        const file = files[0]
        expect(file.path).toBe('README.md')
        expect(file.status.kind).toBe(AppFileStatusKind.Modified)
      })

      it('returns an empty array when there are no changes', async () => {
        const status = await getStatusOrThrow(repository)
        const files = status.workingDirectory.files
        expect(files).toHaveLength(0)
      })

      it('reflects renames', async () => {
        const repo = await setupEmptyRepository()

        await FSE.writeFile(path.join(repo.path, 'foo'), 'foo\n')

        await exec(['add', 'foo'], repo.path)
        await exec(['commit', '-m', 'Initial commit'], repo.path)
        await exec(['mv', 'foo', 'bar'], repo.path)

        const status = await getStatusOrThrow(repo)
        const files = status.workingDirectory.files

        expect(files).toHaveLength(1)
        expect(files[0].path).toBe('bar')
        expect(files[0].status).toEqual({
          kind: AppFileStatusKind.Renamed,
          oldPath: 'foo',
        })
      })

      it('reflects copies', async () => {
        const testRepoPath = await setupFixtureRepository(
          'copy-detection-status'
        )
        repository = new Repository(testRepoPath, -1, null, false)

        // Git 2.18 now uses a new config value to handle detecting copies, so
        // users who have this enabled will see this. For reference, Desktop does
        // not enable this by default.
        await setupLocalConfig(repository, [['status.renames', 'copies']])

        await exec(['add', '.'], repository.path)

        const status = await getStatusOrThrow(repository)
        const files = status.workingDirectory.files

        expect(files).toHaveLength(2)

        expect(files[0].status.kind).toBe(AppFileStatusKind.Modified)
        expect(files[0].path).toBe('CONTRIBUTING.md')

        expect(files[1].path).toBe('docs/OVERVIEW.md')
        expect(files[1].status).toEqual({
          kind: AppFileStatusKind.Copied,
          oldPath: 'CONTRIBUTING.md',
        })
      })

      it.skip('Handles at least 10k untracked files without failing', async () => {
        const numFiles = 10000
        const basePath = repository.path

        await mkdir(basePath)

        // create a lot of files
        const promises = []
        for (let i = 0; i < numFiles; i++) {
          promises.push(
            FSE.writeFile(path.join(basePath, `test-file-${i}`), 'Hey there\n')
          )
        }
        await Promise.all(promises)

        const status = await getStatusOrThrow(repository)
        const files = status.workingDirectory.files
        expect(files).toHaveLength(numFiles)
      }, 25000) // needs a little extra time on CI

      it('returns null for directory without a .git directory', async () => {
        repository = setupEmptyDirectory()
        const status = await getStatus(repository)
        expect(status).toBeNull()
      })
    })
    describe('with submodules', () => {
      it('returns the submodule status', async () => {
        const repoPath = await setupFixtureRepository('submodule-basic-setup')
        repository = new Repository(repoPath, -1, null, false)

        const submodulePath = path.join(repoPath, 'foo', 'submodule')
        const checkSubmoduleChanges = async (changes: {
          modifiedChanges: boolean
          untrackedChanges: boolean
          commitChanged: boolean
        }) => {
          const status = await getStatusOrThrow(repository)
          const files = status.workingDirectory.files
          expect(files).toHaveLength(1)

          const file = files[0]
          expect(file.path).toBe('foo/submodule')
          expect(file.status.kind).toBe(AppFileStatusKind.Modified)
          expect(file.status.submoduleStatus?.modifiedChanges).toBe(
            changes.modifiedChanges
          )
          expect(file.status.submoduleStatus?.untrackedChanges).toBe(
            changes.untrackedChanges
          )
          expect(file.status.submoduleStatus?.commitChanged).toBe(
            changes.commitChanged
          )
        }

        // Modify README.md file. Now the submodule has modified changes.
        await FSE.writeFile(
          path.join(submodulePath, 'README.md'),
          'hello world\n'
        )
        await checkSubmoduleChanges({
          modifiedChanges: true,
          untrackedChanges: false,
          commitChanged: false,
        })

        // Create untracked file in submodule. Now the submodule has both
        // modified and untracked changes.
        await FSE.writeFile(path.join(submodulePath, 'test'), 'test\n')
        await checkSubmoduleChanges({
          modifiedChanges: true,
          untrackedChanges: true,
          commitChanged: false,
        })

        // Commit the changes within the submodule. Now the submodule has commit
        // changes.
        await exec(['add', '.'], submodulePath)
        await exec(['commit', '-m', 'changes'], submodulePath)
        await checkSubmoduleChanges({
          modifiedChanges: false,
          untrackedChanges: false,
          commitChanged: true,
        })
      })
    })
  })
})
