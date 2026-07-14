import { describe, it } from 'node:test'
import assert from 'node:assert'
import { writeFile } from 'fs/promises'
import * as path from 'path'

import { addConflictedFile } from '../../../src/lib/git/add'
import { getStatusOrThrow } from '../../helpers/status'
import { setupConflictedRepo } from '../../helpers/repositories'
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
  })
})
