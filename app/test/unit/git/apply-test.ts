import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupFixtureRepository } from '../../helpers/repositories'
import { Repository } from '../../../src/models/repository'
import {
  getWorkingDirectoryDiff,
  discardChangesFromSelection,
} from '../../../src/lib/git'
import {
  WorkingDirectoryFileChange,
  AppFileStatusKind,
} from '../../../src/models/status'
import {
  DiffSelection,
  DiffSelectionType,
  ITextDiff,
} from '../../../src/models/diff'
import { findInteractiveDiffRange } from '../../../src/ui/diff/diff-explorer'
import { readFile } from 'fs/promises'
import * as Path from 'path'
import { structuredPatch } from 'diff'

describe('git/apply', () => {
  describe('discardChangesFromSelection()', () => {
    async function getDiff(repository: Repository, filePath: string) {
      const file = new WorkingDirectoryFileChange(
        filePath,
        { kind: AppFileStatusKind.Modified },
        DiffSelection.fromInitialSelection(DiffSelectionType.None)
      )
      return (await getWorkingDirectoryDiff(repository, file)) as ITextDiff
    }

    it('does not change the file when an empty selection is passed', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'repo-with-changes')
      const repository = new Repository(testRepoPath, -1, null, false)

      const filePath = 'modified-file.md'
      const previousDiff = await getDiff(repository, filePath)

      await discardChangesFromSelection(
        repository,
        filePath,
        previousDiff,
        DiffSelection.fromInitialSelection(DiffSelectionType.None)
      )

      const diff = await getDiff(repository, filePath)

      assert.equal(diff.text, previousDiff.text)
    })

    it('discards all file changes when a full selection is passed', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'repo-with-changes')
      const repository = new Repository(testRepoPath, -1, null, false)

      const filePath = 'modified-file.md'
      await discardChangesFromSelection(
        repository,
        filePath,
        await getDiff(repository, filePath),
        DiffSelection.fromInitialSelection(DiffSelectionType.All)
      )

      const diff = await getDiff(repository, filePath)

      // Check that the file has no local changes.
      assert.equal(diff.text, '')
      assert.equal(diff.hunks.length, 0)
    })

    it('re-adds a single removed line', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'repo-with-changes')
      const repository = new Repository(testRepoPath, -1, null, false)

      const filePath = 'modified-file.md'
      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      ).withLineSelection(4, true)

      const previousContents = await readFile(
        Path.join(repository.path, filePath),
        'utf8'
      )

      await discardChangesFromSelection(
        repository,
        filePath,
        await getDiff(repository, filePath),
        selection
      )

      const fileContents = await readFile(
        Path.join(repository.path, filePath),
        'utf8'
      )

      assert.equal(
        getDifference(previousContents, fileContents),
        `@@ -7,0 +7,1 @@
+Aliquam leo ipsum, laoreet sed libero at, mollis pulvinar arcu. Nullam porttitor`
      )
    })

    it('re-adds a removed hunk', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'repo-with-changes')
      const repository = new Repository(testRepoPath, -1, null, false)

      const filePath = 'modified-file.md'
      const diff = await getDiff(repository, filePath)
      const hunkRange = findInteractiveDiffRange(diff.hunks, 4)
      assert(hunkRange !== null)

      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      ).withRangeSelection(
        hunkRange.from,
        hunkRange.to - hunkRange.from + 1,
        true
      )

      const previousContents = await readFile(
        Path.join(repository.path, filePath),
        'utf8'
      )

      await discardChangesFromSelection(repository, filePath, diff, selection)

      const fileContents = await readFile(
        Path.join(repository.path, filePath),
        'utf8'
      )

      assert.equal(
        getDifference(previousContents, fileContents),
        `@@ -7,0 +7,4 @@
+Aliquam leo ipsum, laoreet sed libero at, mollis pulvinar arcu. Nullam porttitor
+nisl eget hendrerit vestibulum. Curabitur ornare id neque ac tristique. Cras in
+eleifend mi.
+`
      )
    })

    it('removes an added line', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'repo-with-changes')
      const repository = new Repository(testRepoPath, -1, null, false)

      const filePath = 'modified-file.md'
      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      ).withLineSelection(16, true)

      const previousContents = await readFile(
        Path.join(repository.path, filePath),
        'utf8'
      )

      await discardChangesFromSelection(
        repository,
        filePath,
        await getDiff(repository, filePath),
        selection
      )

      const fileContents = await readFile(
        Path.join(repository.path, filePath),
        'utf8'
      )

      assert.equal(
        getDifference(previousContents, fileContents),
        `@@ -21,1 +21,0 @@
-nisl eget hendrerit vestibulum. Curabitur ornare id neque ac tristique. Cras in`
      )
    })

    it('removes an added hunk', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'repo-with-changes')
      const repository = new Repository(testRepoPath, -1, null, false)

      const filePath = 'modified-file.md'
      const diff = await getDiff(repository, filePath)
      const hunkRange = findInteractiveDiffRange(diff.hunks, 16)
      assert(hunkRange !== null)
      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      ).withRangeSelection(
        hunkRange.from,
        hunkRange.to - hunkRange.from + 1,
        true
      )

      const previousContents = await readFile(
        Path.join(repository.path, filePath),
        'utf8'
      )

      await discardChangesFromSelection(
        repository,
        filePath,
        await getDiff(repository, filePath),
        selection
      )

      const fileContents = await readFile(
        Path.join(repository.path, filePath),
        'utf8'
      )

      assert.equal(
        getDifference(previousContents, fileContents),
        `@@ -20,4 +20,0 @@
-Aliquam leo ipsum, laoreet sed libero at, mollis pulvinar arcu. Nullam porttitor
-nisl eget hendrerit vestibulum. Curabitur ornare id neque ac tristique. Cras in
-eleifend mi.
-`
      )
    })
  })
})

/**
 * Returns a diff-style string with the line differences between two strings.
 */
function getDifference(before: string, after: string) {
  return structuredPatch(
    'before',
    'after',
    before.replace(/\r\n/g, '\n'),
    after.replace(/\r\n/g, '\n'),
    undefined,
    undefined,
    { context: 0 }
  )
    .hunks.flatMap(hunk => [
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
      ...hunk.lines,
    ])
    .join('\n')
}
