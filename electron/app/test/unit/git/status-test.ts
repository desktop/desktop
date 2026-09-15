import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import { appendFile, writeFile } from 'fs/promises'
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
import { getStatus } from '../../../src/lib/git'
import { isConflictedFile } from '../../../src/lib/status'
import { setupLocalConfig } from '../../helpers/local-config'
import { generateString } from '../../helpers/random-data'

describe('git/status', () => {
  describe('getStatus', () => {
    describe('with conflicted repo', () => {
      it('parses conflicted files with markers', async t => {
        const repository = await setupConflictedRepoWithMultipleFiles(t)

        const status = await getStatusOrThrow(repository)
        const files = status.workingDirectory.files
        assert.equal(files.length, 5)
        const conflictedFiles = files.filter(
          f => f.status.kind === AppFileStatusKind.Conflicted
        )
        assert.equal(conflictedFiles.length, 4)

        const fooFile = files.find(f => f.path === 'foo')
        assert(fooFile)
        assert.deepStrictEqual(fooFile.status, {
          kind: AppFileStatusKind.Conflicted,
          entry: {
            kind: 'conflicted',
            action: UnmergedEntrySummary.BothModified,
            them: GitStatusEntry.UpdatedButUnmerged,
            us: GitStatusEntry.UpdatedButUnmerged,
            submoduleStatus: undefined,
          },
          conflictMarkerCount: 3,
        })

        const bazFile = files.find(f => f.path === 'baz')
        assert(bazFile)
        assert.deepStrictEqual(bazFile.status, {
          kind: AppFileStatusKind.Conflicted,
          entry: {
            kind: 'conflicted',
            action: UnmergedEntrySummary.BothAdded,
            them: GitStatusEntry.Added,
            us: GitStatusEntry.Added,
            submoduleStatus: undefined,
          },
          conflictMarkerCount: 3,
        })

        const catFile = files.find(f => f.path === 'cat')
        assert(catFile)
        assert.deepStrictEqual(catFile.status, {
          kind: AppFileStatusKind.Conflicted,
          entry: {
            kind: 'conflicted',
            action: UnmergedEntrySummary.BothAdded,
            them: GitStatusEntry.Added,
            us: GitStatusEntry.Added,
            submoduleStatus: undefined,
          },
          conflictMarkerCount: 3,
        })
      })

      it('parses conflicted files without markers', async t => {
        const repository = await setupConflictedRepoWithMultipleFiles(t)

        const status = await getStatusOrThrow(repository)
        const files = status.workingDirectory.files
        assert.equal(files.length, 5)
        assert.equal(
          files.filter(f => f.status.kind === AppFileStatusKind.Conflicted)
            .length,
          4
        )

        const barFile = files.find(f => f.path === 'bar')
        assert(barFile)
        assert.deepStrictEqual(barFile.status, {
          kind: AppFileStatusKind.Conflicted,
          entry: {
            kind: 'conflicted',
            action: UnmergedEntrySummary.DeletedByThem,
            us: GitStatusEntry.UpdatedButUnmerged,
            them: GitStatusEntry.Deleted,
            submoduleStatus: undefined,
          },
        })
      })

      it('parses conflicted files resulting from popping a stash', async t => {
        const repository = await setupEmptyRepository(t)
        const readme = path.join(repository.path, 'README.md')
        await writeFile(readme, '')
        await exec(['add', 'README.md'], repository.path)
        await exec(['commit', '-m', 'initial commit'], repository.path)

        // write a change to the readme into the stash
        await appendFile(readme, generateString())
        await exec(['stash'], repository.path)

        // write a different change to the README and commit it
        await appendFile(readme, generateString())
        await exec(['commit', '-am', 'later commit'], repository.path)

        // pop the stash to introduce a conflict into the index
        await exec(['stash', 'pop'], repository.path)

        const status = await getStatusOrThrow(repository)
        const files = status.workingDirectory.files
        assert.equal(files.length, 1)

        const conflictedFiles = files.filter(
          f => f.status.kind === AppFileStatusKind.Conflicted
        )
        assert.equal(conflictedFiles.length, 1)
      })

      it('parses resolved files', async t => {
        const repository = await setupConflictedRepoWithMultipleFiles(t)
        const filePath = path.join(repository.path, 'foo')

        await writeFile(filePath, 'b1b2')
        const status = await getStatusOrThrow(repository)
        const files = status.workingDirectory.files

        assert.equal(files.length, 5)

        // all files are now considered conflicted
        assert.equal(
          files.filter(f => f.status.kind === AppFileStatusKind.Conflicted)
            .length,
          4
        )

        const file = files.find(f => f.path === 'foo')
        assert(file)
        assert.deepStrictEqual(file.status, {
          kind: AppFileStatusKind.Conflicted,
          entry: {
            kind: 'conflicted',
            action: UnmergedEntrySummary.BothModified,
            them: GitStatusEntry.UpdatedButUnmerged,
            us: GitStatusEntry.UpdatedButUnmerged,
            submoduleStatus: undefined,
          },
          conflictMarkerCount: 0,
        })
      })
    })

    describe('with conflicted images repo', () => {
      it('parses conflicted image file on merge', async t => {
        const path = await setupFixtureRepository(
          t,
          'detect-conflict-in-binary-file'
        )
        const repository = new Repository(path, -1, null, false)
        await exec(['checkout', 'make-a-change'], repository.path)

        await exec(['merge', 'master'], repository.path)

        const status = await getStatusOrThrow(repository)
        const files = status.workingDirectory.files
        assert.equal(files.length, 1)

        const file = files[0]
        assert.equal(file.status.kind, AppFileStatusKind.Conflicted)
        assert.equal(
          isConflictedFile(file.status) && isManualConflict(file.status),
          true
        )
      })

      it('parses conflicted image file on merge after removing', async t => {
        const path = await setupFixtureRepository(
          t,
          'detect-conflict-in-binary-file'
        )
        const repository = new Repository(path, -1, null, false)

        await exec(['rm', 'my-cool-image.png'], repository.path)
        await exec(['commit', '-am', 'removed the image'], repository.path)

        await exec(['merge', 'master'], repository.path)

        const status = await getStatusOrThrow(repository)
        const files = status.workingDirectory.files
        assert.equal(files.length, 1)

        const file = files[0]
        assert.equal(file.status.kind, AppFileStatusKind.Conflicted)
        assert.equal(
          isConflictedFile(file.status) && isManualConflict(file.status),
          true
        )
      })
    })

    describe('with unconflicted repo', () => {
      it('parses changed files', async t => {
        const testRepoPath = await setupFixtureRepository(t, 'test-repo')
        const repository = new Repository(testRepoPath, -1, null, false)

        await writeFile(path.join(repository.path, 'README.md'), 'Hi world\n')

        const status = await getStatusOrThrow(repository)
        const files = status.workingDirectory.files
        assert.equal(files.length, 1)

        const file = files[0]
        assert.equal(file.path, 'README.md')
        assert.equal(file.status.kind, AppFileStatusKind.Modified)
      })

      it('returns an empty array when there are no changes', async t => {
        const testRepoPath = await setupFixtureRepository(t, 'test-repo')
        const repository = new Repository(testRepoPath, -1, null, false)

        const status = await getStatusOrThrow(repository)
        const files = status.workingDirectory.files
        assert.equal(files.length, 0)
      })

      it('reflects renames', async t => {
        const repo = await setupEmptyRepository(t)

        await writeFile(path.join(repo.path, 'foo'), 'foo\n')

        await exec(['add', 'foo'], repo.path)
        await exec(['commit', '-m', 'Initial commit'], repo.path)
        await exec(['mv', 'foo', 'bar'], repo.path)

        const status = await getStatusOrThrow(repo)
        const files = status.workingDirectory.files

        assert.equal(files.length, 1)
        assert.equal(files[0].path, 'bar')
        assert.deepStrictEqual(files[0].status, {
          kind: AppFileStatusKind.Renamed,
          oldPath: 'foo',
          renameIncludesModifications: false,
          submoduleStatus: undefined,
        })
      })

      it('reflects copies', async t => {
        const testRepoPath = await setupFixtureRepository(
          t,
          'copy-detection-status'
        )
        const repository = new Repository(testRepoPath, -1, null, false)

        // Git 2.18 now uses a new config value to handle detecting copies, so
        // users who have this enabled will see this. For reference, Desktop does
        // not enable this by default.
        await setupLocalConfig(repository, [['status.renames', 'copies']])

        await exec(['add', '.'], repository.path)

        const status = await getStatusOrThrow(repository)
        const files = status.workingDirectory.files

        assert.equal(files.length, 2)

        assert.equal(files[0].status.kind, AppFileStatusKind.Modified)
        assert.equal(files[0].path, 'CONTRIBUTING.md')

        assert.equal(files[1].path, 'docs/OVERVIEW.md')
        assert.deepStrictEqual(files[1].status, {
          kind: AppFileStatusKind.Copied,
          oldPath: 'CONTRIBUTING.md',
          submoduleStatus: undefined,
          renameIncludesModifications: false,
        })
      })

      it('returns null for directory without a .git directory', async t => {
        const repository = await setupEmptyDirectory(t)
        const status = await getStatus(repository)
        assert(status === null)
      })
    })
    describe('with submodules', () => {
      it('returns the submodule status', async t => {
        const repoPath = await setupFixtureRepository(
          t,
          'submodule-basic-setup'
        )
        const repository = new Repository(repoPath, -1, null, false)

        const submodulePath = path.join(repoPath, 'foo', 'submodule')
        const checkSubmoduleChanges = async (changes: {
          modifiedChanges: boolean
          untrackedChanges: boolean
          commitChanged: boolean
        }) => {
          const status = await getStatusOrThrow(repository)
          const files = status.workingDirectory.files
          assert.equal(files.length, 1)

          const file = files[0]
          assert.equal(file.path, 'foo/submodule')
          assert.equal(file.status.kind, AppFileStatusKind.Modified)
          assert.equal(
            file.status.submoduleStatus?.modifiedChanges,
            changes.modifiedChanges
          )
          assert.equal(
            file.status.submoduleStatus?.untrackedChanges,
            changes.untrackedChanges
          )
          assert.equal(
            file.status.submoduleStatus?.commitChanged,
            changes.commitChanged
          )
        }

        // Modify README.md file. Now the submodule has modified changes.
        await writeFile(path.join(submodulePath, 'README.md'), 'hello world\n')
        await checkSubmoduleChanges({
          modifiedChanges: true,
          untrackedChanges: false,
          commitChanged: false,
        })

        // Create untracked file in submodule. Now the submodule has both
        // modified and untracked changes.
        await writeFile(path.join(submodulePath, 'test'), 'test\n')
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
