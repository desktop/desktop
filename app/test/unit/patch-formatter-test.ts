import * as Path from 'path'
import * as FSE from 'fs-extra'

import { Repository } from '../../src/models/repository'
import {
  WorkingDirectoryFileChange,
  FileChange,
  AppFileStatusKind,
} from '../../src/models/status'
import {
  DiffSelection,
  DiffSelectionType,
  ITextDiff,
  DiffType,
} from '../../src/models/diff'
import { DiffParser } from '../../src/lib/diff-parser'
import { formatPatch } from '../../src/lib/patch-formatter'
import { getWorkingDirectoryDiff, convertDiff } from '../../src/lib/git'
import { setupFixtureRepository } from '../helpers/repositories'

async function parseDiff(diff: string): Promise<ITextDiff> {
  const parser = new DiffParser()
  const rawDiff = parser.parse(diff)
  const repository = new Repository('', -1, null, false)
  const fileChange = new FileChange('file.txt', {
    kind: AppFileStatusKind.Modified,
  })
  const output = await convertDiff(repository, fileChange, rawDiff, 'HEAD')
  expect(output.kind === DiffType.Text)
  return output as ITextDiff
}

describe('patch formatting', () => {
  let repository: Repository | null = null

  describe('formatPatchesForModifiedFile', () => {
    beforeEach(async () => {
      const testRepoPath = await setupFixtureRepository('repo-with-changes')
      repository = new Repository(testRepoPath, -1, null, false)
    })

    it('creates right patch when first hunk is selected', async () => {
      const modifiedFile = 'modified-file.md'

      const unselectedFile = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      )
      const file = new WorkingDirectoryFileChange(
        modifiedFile,
        { kind: AppFileStatusKind.Modified },
        unselectedFile
      )

      const diff = await getWorkingDirectoryDiff(repository!, file)

      expect(diff.kind === DiffType.Text)

      const textDiff = diff as ITextDiff
      const second = textDiff.hunks[1]

      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      ).withRangeSelection(
        second.unifiedDiffStart,
        second.unifiedDiffEnd - second.unifiedDiffStart,
        false
      )

      const updatedFile = new WorkingDirectoryFileChange(
        modifiedFile,
        { kind: AppFileStatusKind.Modified },
        selection
      )

      const patch = formatPatch(updatedFile, textDiff)

      expect(patch).toContain('--- a/modified-file.md\n')
      expect(patch).toContain('+++ b/modified-file.md\n')
      expect(patch).toContain('@@ -4,10 +4,6 @@')
    })

    it('creates right patch when second hunk is selected', async () => {
      const modifiedFile = 'modified-file.md'
      const unselectedFile = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      )
      const file = new WorkingDirectoryFileChange(
        modifiedFile,
        { kind: AppFileStatusKind.Modified },
        unselectedFile
      )

      const diff = await getWorkingDirectoryDiff(repository!, file)

      expect(diff.kind === DiffType.Text)

      const textDiff = diff as ITextDiff
      const first = textDiff.hunks[0]

      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      ).withRangeSelection(
        first.unifiedDiffStart,
        first.unifiedDiffEnd - first.unifiedDiffStart,
        false
      )

      const updatedFile = new WorkingDirectoryFileChange(
        modifiedFile,
        { kind: AppFileStatusKind.Modified },
        selection
      )

      const patch = formatPatch(updatedFile, textDiff)

      expect(patch).toContain('--- a/modified-file.md\n')
      expect(patch).toContain('+++ b/modified-file.md\n')
      expect(patch).toContain('@@ -21,6 +17,10 @@')
    })

    it('creates right patch when first and third hunk is selected', async () => {
      const modifiedFile = 'modified-file.md'

      const unselectedFile = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      )
      const file = new WorkingDirectoryFileChange(
        modifiedFile,
        { kind: AppFileStatusKind.Modified },
        unselectedFile
      )

      const diff = await getWorkingDirectoryDiff(repository!, file)

      expect(diff.kind === DiffType.Text)

      const textDiff = diff as ITextDiff
      const second = textDiff.hunks[1]

      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      ).withRangeSelection(
        second.unifiedDiffStart,
        second.unifiedDiffEnd - second.unifiedDiffStart,
        false
      )
      const updatedFile = new WorkingDirectoryFileChange(
        modifiedFile,
        { kind: AppFileStatusKind.Modified },
        selection
      )

      const patch = formatPatch(updatedFile, textDiff)

      expect(patch).toContain('--- a/modified-file.md\n')
      expect(patch).toContain('+++ b/modified-file.md\n')
      expect(patch).toContain('@@ -31,3 +31,8 @@')
    })

    it(`creates the right patch when an addition is selected but preceding deletions aren't`, async () => {
      const modifiedFile = 'modified-file.md'
      await FSE.writeFile(Path.join(repository!.path, modifiedFile), 'line 1\n')

      const unselectedFile = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      )
      const file = new WorkingDirectoryFileChange(
        modifiedFile,
        { kind: AppFileStatusKind.Modified },
        unselectedFile
      )

      const diff = await getWorkingDirectoryDiff(repository!, file)

      expect(diff.kind === DiffType.Text)

      const textDiff = diff as ITextDiff

      let selection = DiffSelection.fromInitialSelection(DiffSelectionType.All)
      const hunk = textDiff.hunks[0]
      hunk.lines.forEach((line, index) => {
        const absoluteIndex = hunk.unifiedDiffStart + index
        if (line.text === '+line 1') {
          selection = selection.withLineSelection(absoluteIndex, true)
        } else {
          selection = selection.withLineSelection(absoluteIndex, false)
        }
      })

      const updatedFile = new WorkingDirectoryFileChange(
        modifiedFile,
        { kind: AppFileStatusKind.Modified },
        selection
      )

      const patch = formatPatch(updatedFile, textDiff)
      const expectedPatch = `--- a/modified-file.md
+++ b/modified-file.md
@@ -1,33 +1,34 @@
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
      expect(patch).toBe(expectedPatch)
    })

    it("doesn't include unselected added lines as context", async () => {
      const rawDiff = [
        '--- a/file.md',
        '+++ b/file.md',
        '@@ -10,2 +10,4 @@',
        ' context',
        '+added line 1',
        '+added line 2',
        ' context',
      ].join('\n')

      const diff = await parseDiff(rawDiff)

      // Select the second added line
      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      ).withLineSelection(3, true)

      const file = new WorkingDirectoryFileChange(
        'file.md',
        { kind: AppFileStatusKind.Modified },
        selection
      )
      const patch = formatPatch(file, diff)

      expect(patch).toBe(`--- a/file.md
+++ b/file.md
@@ -10,2 +10,3 @@
 context
+added line 2
 context
`)
    })

    it('rewrites hunk header when necessary', async () => {
      const rawDiff = [
        '--- /dev/null',
        '+++ b/file.md',
        '@@ -0,2 +1,2 @@',
        '+added line 1',
        '+added line 2',
      ].join('\n')
      const diff = await parseDiff(rawDiff)

      // Select the second added line
      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      ).withLineSelection(2, true)

      const file = new WorkingDirectoryFileChange(
        'file.md',
        { kind: AppFileStatusKind.New },
        selection
      )
      const patch = formatPatch(file, diff)

      expect(patch).toContain('@@ -0,0 +1 @@')
      expect(patch).toContain('+added line 2')
    })

    it('includes empty context lines', async () => {
      const rawDiff = [
        '--- a/file.md',
        '+++ b/file.md',
        '@@ -1 +1,2 @@',
        ' ',
        '+added line 2',
      ].join('\n')
      const diff = await parseDiff(rawDiff)

      // Select the second added line
      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      ).withLineSelection(2, true)

      const file = new WorkingDirectoryFileChange(
        'file.md',
        { kind: AppFileStatusKind.Modified },
        selection
      )
      const patch = formatPatch(file, diff)

      expect(patch).toContain('@@ -1 +1,2 @@')
      expect(patch).toContain(' ')
      expect(patch).toContain('+added line 2')
    })

    it('creates the right patch when a `No newline` marker is involved', async () => {
      const rawDiff = [
        '--- a/file.md',
        '+++ b/file.md',
        '@@ -23,5 +24,5 @@ and more stuff',
        ' ',
        ' ',
        ' ',
        '-',
        '-and fun stuff? I dnno',
        '\\ No newline at end of file',
        '+and fun stuff? I dnno',
        '+it could be,',
      ].join('\n')
      const diff = await parseDiff(rawDiff)

      // Select the second added line
      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      ).withLineSelection(7, true)

      const file = new WorkingDirectoryFileChange(
        'file.md',
        { kind: AppFileStatusKind.Modified },
        selection
      )

      const patch = formatPatch(file, diff)

      expect(patch).toContain('\\ No newline at end of file')
      expect(patch).toContain('+it could be')
    })
  })
})
