import * as chai from 'chai'
const expect = chai.expect

import * as path from 'path'

const fs = require('fs-extra')
const temp = require('temp').track()

import Repository from '../src/models/repository'
import { WorkingDirectoryFileChange, FileStatus } from '../src/models/status'
import { DiffSelection, DiffSelectionType } from '../src/models/diff'
import { createPatchForModifiedFile } from '../src/lib/patch-formatter'
import { selectLinesInSection, mergeSelections } from './diff-selection-helper'
import { LocalGitOperations } from '../src/lib/local-git-operations'

describe('patch formatting', () => {
  let repository: Repository | null = null

  function setupTestRepository(repositoryName: string): string {
    const testRepoFixturePath = path.join(__dirname, 'fixtures', repositoryName)
    const testRepoPath = temp.mkdirSync('desktop-git-test-')
    fs.copySync(testRepoFixturePath, testRepoPath)

    fs.renameSync(path.join(testRepoPath, '_git'), path.join(testRepoPath, '.git'))

    return testRepoPath
  }

  after(() => {
    temp.cleanupSync()
  })

  describe('createPatchesForModifiedFile', () => {

    beforeEach(() => {
      const testRepoPath = setupTestRepository('repo-with-changes')
      repository = new Repository(testRepoPath, -1, null)
    })

    it('creates right patch when first hunk is selected', async () => {

      const modifiedFile = 'modified-file.md'

      const unselectedFile = new DiffSelection(DiffSelectionType.None, new Map<number, boolean>())
      const file = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, unselectedFile)

      const diff = await LocalGitOperations.getDiff(repository!, file, null)

      // select first hunk
      const first = selectLinesInSection(diff, 0, true)
      // skip second hunk
      const second = selectLinesInSection(diff, 1, false)

      const selectedLines = mergeSelections([ first, second ])

      const selection = new DiffSelection(DiffSelectionType.Partial, selectedLines)
      const updatedFile = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, selection)

      const patch = createPatchForModifiedFile(updatedFile, diff)

      expect(patch).to.have.string('--- a/modified-file.md\n')
      expect(patch).to.have.string('+++ b/modified-file.md\n')
      expect(patch).to.have.string('@@ -4,10 +4,6 @@ ')
    })

    it('creates right patch when second hunk is selected', async () => {

      const modifiedFile = 'modified-file.md'
      const unselectedFile = new DiffSelection(DiffSelectionType.None, new Map<number, boolean>())
      const file = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, unselectedFile)

      const diff = await LocalGitOperations.getDiff(repository!, file, null)

      // skip first hunk
      const first = selectLinesInSection(diff, 0, false)
      // select second hunk
      const second = selectLinesInSection(diff, 1, true)

      const selectedLines = mergeSelections([ first, second ])

      const selection = new DiffSelection(DiffSelectionType.Partial, selectedLines)
      const updatedFile = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, selection)

      const patch = createPatchForModifiedFile(updatedFile, diff)

      expect(patch).to.have.string('--- a/modified-file.md\n')
      expect(patch).to.have.string('+++ b/modified-file.md\n')
      expect(patch).to.have.string('@@ -21,6 +17,10 @@')
    })

    it('creates right patch when first and third hunk is selected', async () => {

      const modifiedFile = 'modified-file.md'

      const unselectedFile = new DiffSelection(DiffSelectionType.None, new Map<number, boolean>())
      const file = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, unselectedFile)

      const diff = await LocalGitOperations.getDiff(repository!, file, null)

      // select first hunk
      const first = selectLinesInSection(diff, 0, true)
      // skip second hunk
      const second = selectLinesInSection(diff, 1, false)
      // select third hunk
      const third = selectLinesInSection(diff, 2, true)

      const selectedLines = mergeSelections([ first, second, third ])

      const selection = new DiffSelection(DiffSelectionType.Partial, selectedLines)
      const updatedFile = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, selection)

      const patch = createPatchForModifiedFile(updatedFile, diff)

      expect(patch).to.have.string('--- a/modified-file.md\n')
      expect(patch).to.have.string('+++ b/modified-file.md\n')
      expect(patch).to.have.string('@@ -31,3 +31,8 @@')
    })
  })
})
