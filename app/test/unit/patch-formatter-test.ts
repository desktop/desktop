import * as chai from 'chai'
const expect = chai.expect

import * as Path from 'path'
import * as FS from 'fs'

import { Repository } from '../../src/models/repository'
import { WorkingDirectoryFileChange, FileStatus } from '../../src/models/status'
import { DiffSelection, DiffSelectionType } from '../../src/models/diff'
import { createPatchForModifiedFile } from '../../src/lib/patch-formatter'
import { LocalGitOperations } from '../../src/lib/local-git-operations'
import { setupFixtureRepository } from '../fixture-helper'

describe('patch formatting', () => {
  let repository: Repository | null = null

  describe('createPatchesForModifiedFile', () => {

    beforeEach(() => {
      const testRepoPath = setupFixtureRepository('repo-with-changes')
      repository = new Repository(testRepoPath, -1, null)
    })

    it('creates right patch when first hunk is selected', async () => {

      const modifiedFile = 'modified-file.md'

      const unselectedFile = DiffSelection.fromInitialSelection(DiffSelectionType.None)
      const file = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, unselectedFile)

      const diff = await LocalGitOperations.getWorkingDirectoryDiff(repository!, file)

      const selection = DiffSelection
        .fromInitialSelection(DiffSelectionType.All)
        .withRangeSelection(diff.hunks[1].unifiedDiffStart, diff.hunks[1].unifiedDiffEnd - diff.hunks[1].unifiedDiffStart, false)

      const updatedFile = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, selection)

      const patch = createPatchForModifiedFile(updatedFile, diff)

      expect(patch).to.have.string('--- a/modified-file.md\n')
      expect(patch).to.have.string('+++ b/modified-file.md\n')
      expect(patch).to.have.string('@@ -4,10 +4,6 @@ ')
    })

    it('creates right patch when second hunk is selected', async () => {

      const modifiedFile = 'modified-file.md'
      const unselectedFile = DiffSelection.fromInitialSelection(DiffSelectionType.None)
      const file = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, unselectedFile)

      const diff = await LocalGitOperations.getWorkingDirectoryDiff(repository!, file)

      const selection = DiffSelection
        .fromInitialSelection(DiffSelectionType.All)
        .withRangeSelection(diff.hunks[0].unifiedDiffStart, diff.hunks[0].unifiedDiffEnd - diff.hunks[0].unifiedDiffStart, false)

      const updatedFile = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, selection)

      const patch = createPatchForModifiedFile(updatedFile, diff)

      expect(patch).to.have.string('--- a/modified-file.md\n')
      expect(patch).to.have.string('+++ b/modified-file.md\n')
      expect(patch).to.have.string('@@ -21,6 +17,10 @@')
    })

    it('creates right patch when first and third hunk is selected', async () => {

      const modifiedFile = 'modified-file.md'

      const unselectedFile = DiffSelection.fromInitialSelection(DiffSelectionType.None)
      const file = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, unselectedFile)

      const diff = await LocalGitOperations.getWorkingDirectoryDiff(repository!, file)

      const selection = DiffSelection
        .fromInitialSelection(DiffSelectionType.All)
        .withRangeSelection(diff.hunks[1].unifiedDiffStart, diff.hunks[1].unifiedDiffEnd - diff.hunks[1].unifiedDiffStart, false)
      const updatedFile = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, selection)

      const patch = createPatchForModifiedFile(updatedFile, diff)

      expect(patch).to.have.string('--- a/modified-file.md\n')
      expect(patch).to.have.string('+++ b/modified-file.md\n')
      expect(patch).to.have.string('@@ -31,3 +31,8 @@')
    })

    it(`creates the right patch when an addition is selected but preceding deletions aren't`, async () => {
      const modifiedFile = 'modified-file.md'
      FS.writeFileSync(Path.join(repository!.path, modifiedFile), 'line 1\n')

      const unselectedFile = DiffSelection.fromInitialSelection(DiffSelectionType.None)
      const file = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, unselectedFile)

      const diff = await LocalGitOperations.getWorkingDirectoryDiff(repository!, file)

      let selection = DiffSelection.fromInitialSelection(DiffSelectionType.All)
      const hunk = diff.hunks[0]
      hunk.lines.forEach((line, index) => {
        const absoluteIndex = hunk.unifiedDiffStart + index
        if (line.text === '+line 1') {
          selection = selection.withLineSelection(absoluteIndex, true)
        } else {
          selection = selection.withLineSelection(absoluteIndex, false)
        }
      })

      const updatedFile = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, selection)

      const patch = createPatchForModifiedFile(updatedFile, diff)
      const expectedPatch = `--- a/modified-file.md
+++ b/modified-file.md
@@ -1,33 +1,NaN @@
 Lorem ipsum dolor sit amet, consectetur adipiscing elit. Cras mi urna,
 ullamcorper sit amet tellus eget, congue ornare leo. Donec dapibus sem quis sem
 commodo, id ultricies ligula varius. Vestibulum ante ipsum primis in faucibus
 orci luctus et ultrices posuere cubilia Curae; Maecenas efficitur lacus ac
 tortor placerat facilisis. Ut sed ex tortor. Duis consectetur at ex vel mattis.
\u0020
 Aliquam leo ipsum, laoreet sed libero at, mollis pulvinar arcu. Nullam porttitor
 nisl eget hendrerit vestibulum. Curabitur ornare id neque ac tristique. Cras in
 eleifend mi.
\u0020
 Donec sit amet posuere nibh, sed laoreet nisl. Pellentesque a consectetur
 turpis. Curabitur varius ex nisi, vitae vestibulum augue cursus sit amet. Morbi
 non vestibulum velit. Integer consectetur lacus vitae erat pellentesque
 tincidunt. Nullam id nunc rhoncus, ultrices orci bibendum, blandit orci. Morbi
 vitae accumsan metus, et cursus diam. Sed mi augue, sollicitudin imperdiet
 semper ac, scelerisque vitae nulla. Nam cursus est massa, et tincidunt lectus
 consequat vel. Nunc commodo elementum metus, vel pellentesque est efficitur sit
 amet. Aliquam rhoncus, diam vel pulvinar eleifend, massa tellus lobortis elit,
 quis cursus justo tellus vel magna. Quisque placerat nunc non nibh porttitor,
 vel sagittis nisl rutrum. Proin enim augue, condimentum sit amet suscipit id,
 tempor a ligula. Proin pretium ipsum vel nulla sollicitudin mollis. Morbi
 elementum neque id tellus gravida rhoncus.
\u0020
 Ut fringilla, orci id consequat sodales, tellus tellus interdum risus, eleifend
 vestibulum velit nunc sit amet nulla. Ut tristique, diam ut rhoncus commodo,
 libero tellus maximus ex, vel rutrum mauris purus vel enim. Donec accumsan nulla
  id purus lacinia venenatis. Phasellus convallis ex et vulputate aliquet. Ut
  porttitor diam magna, vel porttitor tortor ornare et. Suspendisse eleifend
  sagittis tempus. Pellentesque mollis dolor id lectus lobortis vulputate. Etiam
  eu lacus sit amet mauris ornare dictum. Integer erat nisi, semper ut augue
  vitae, cursus pulvinar lorem. Suspendisse potenti. Mauris eleifend elit ac
  sodales posuere. Cras ultrices, ex in porta volutpat, libero sapien blandit
  urna, ac porta justo leo sed magna.
+line 1
`
      expect(patch).to.equal(expectedPatch)
    })
  })
})
