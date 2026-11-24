import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFile, writeFile } from 'fs/promises'
import * as path from 'path'
import { exec } from 'dugite'

import { addConflictedFile } from '../../../src/lib/git/add'
import { pathExists } from '../../../src/lib/path-exists'
import { getStatusOrThrow } from '../../helpers/status'
import {
  PathspecMagicFileName,
  setupConflictedRepo,
  setupConflictedRepoWithPathspecMagicFile,
} from '../../helpers/repositories'
import { AppFileStatusKind } from '../../../src/models/status'

describe('git/add', () => {
  describe('addConflictedFile', () => {
    it('stages a conflicted file after manual resolution', async t => {
      const repo = await setupConflictedRepo(t)

      // Get the conflicted status
      const beforeStatus = await getStatusOrThrow(repo)
      const conflictedFiles = beforeStatus.workingDirectory.files.filter(
        f => f.status.kind === AppFileStatusKind.Conflicted
      )
      assert.ok(
        conflictedFiles.length > 0,
        'Expected at least one conflicted file'
      )

      const file = conflictedFiles[0]

      // Resolve the conflict by writing new content
      await writeFile(
        path.join(repo.path, file.path),
        'resolved content\n',
        'utf8'
      )

      // Stage the resolved file
      await addConflictedFile(repo, file)

      // Verify the file is no longer conflicted in status
      const afterStatus = await getStatusOrThrow(repo)
      const stillConflicted = afterStatus.workingDirectory.files.filter(
        f =>
          f.path === file.path && f.status.kind === AppFileStatusKind.Conflicted
      )
      assert.equal(
        stillConflicted.length,
        0,
        'File should no longer be conflicted after staging'
      )
    })

    it(
      'stages only the conflicted file when its name contains pathspec magic',
      { skip: process.platform === 'win32' },
      async t => {
        const repo = await setupConflictedRepoWithPathspecMagicFile(t)
        const unrelatedFilePath = path.join(
          repo.path,
          'unrelated-untracked.txt'
        )
        await writeFile(unrelatedFilePath, 'untracked content\n')

        const status = await getStatusOrThrow(repo)
        const file = status.workingDirectory.files.find(
          f => f.path === PathspecMagicFileName
        )
        assert.ok(file, 'Expected the pathspec-magic file to be conflicted')

        await writeFile(
          path.join(repo.path, PathspecMagicFileName),
          'resolved content\n'
        )
        await addConflictedFile(repo, file)

        const stagedFiles = await exec(
          ['diff', '--cached', '--name-only', '-z'],
          repo.path
        )
        assert.deepEqual(stagedFiles.stdout.split('\0').filter(Boolean), [
          PathspecMagicFileName,
        ])

        await exec(['commit', '-m', 'Resolve conflict'], repo.path)
        const committedFiles = await exec(
          ['show', '--pretty=format:', '--name-only', '-z', 'HEAD'],
          repo.path
        )
        assert.deepEqual(committedFiles.stdout.split('\0').filter(Boolean), [
          PathspecMagicFileName,
        ])
        assert.equal(await pathExists(unrelatedFilePath), true)
        assert.equal(
          await readFile(unrelatedFilePath, 'utf8'),
          'untracked content\n'
        )
      }
    )
  })
})
