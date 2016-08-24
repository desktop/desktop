import * as chai from 'chai'
const expect = chai.expect

import * as path from 'path'

const fs = require('fs-extra')
const temp = require('temp').track()

import Repository from '../src/models/repository'
import { WorkingDirectoryFileChange, FileStatus } from '../src/models/status'
import { DiffSelection, DiffSelectionType } from '../src/models/diff'
import { createPatchesForModifiedFile } from '../src/lib/patch-formatter'
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

      const lines = new Map<number, boolean>()

      // select first hunk
      for (let i = 4; i <= 7; i++) {
        lines.set(i, true)
      }

      // skip second hunk
      for (let i = 16; i <= 19; i++) {
        lines.set(i, false)
      }

      const modifiedFile = 'modified-file.md'
      const selectedLines = new Map<number, boolean>(lines)
      const selection = new DiffSelection(DiffSelectionType.Partial, selectedLines)
      const file = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, selection)

      const diff = await LocalGitOperations.getDiff(repository!, file, null)
      const patches = createPatchesForModifiedFile(file, diff)

      expect(patches[0]).to.not.be.undefined
      expect(patches[0]).to.have.string('--- a/modified-file.md\n')
      expect(patches[0]).to.have.string('+++ b/modified-file.md\n')
      expect(patches[0]).to.have.string('@@ -4,10 +4,6 @@ ')

      expect(patches[1]).to.be.undefined
    })
  })
})
