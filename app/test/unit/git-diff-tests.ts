import * as chai from 'chai'
const expect = chai.expect

import { Repository } from '../../src/models/repository'
import { GitDiff } from '../../src/lib/git/git-diff'
import { FileStatus, WorkingDirectoryFileChange } from '../../src/models/status'
import { DiffSelectionType, DiffSelection } from '../../src/models/diff'
import { setupFixtureRepository } from '../fixture-helper'

describe('GitDiff', () => {
  let repository: Repository | null = null

  beforeEach(() => {
    const testRepoPath = setupFixtureRepository('repo-with-image-changes')
    repository = new Repository(testRepoPath, -1, null)
  })

  describe('getWorkingDirectoryImage', () => {

    it('retrieves valid image for new file', async () => {
      const diffSelection = DiffSelection.fromInitialSelection(DiffSelectionType.All)
      const file = new WorkingDirectoryFileChange('new-image.png', FileStatus.New, diffSelection)
      const current = await GitDiff.getWorkingDirectoryImage(repository!, file)

      expect(current.mediaType).to.equal('image/png')
      expect(current.contents).to.match(/A2HkbLsBYSgAAAABJRU5ErkJggg==$/)
    })

    it('retrieves valid images for modified file', async () => {
      const diffSelection = DiffSelection.fromInitialSelection(DiffSelectionType.All)
      const file = new WorkingDirectoryFileChange('modified-image.jpg', FileStatus.Modified, diffSelection)
      const current = await GitDiff.getWorkingDirectoryImage(repository!, file)
      expect(current.mediaType).to.equal('image/jpg')
      expect(current.contents).to.match(/gdTTb6MClWJ3BU8T8PTtXoB88kFL\/9k=$/)
    })
  })

  describe('getBlobImage', () => {

    it('retrieves valid image for modified file', async () => {
      const diffSelection = DiffSelection.fromInitialSelection(DiffSelectionType.All)
      const file = new WorkingDirectoryFileChange('modified-image.jpg', FileStatus.Modified, diffSelection)
      const current = await GitDiff.getBlobImage(repository!, file)

      expect(current.mediaType).to.equal('image/jpg')
      expect(current.contents).to.match(/A2HkbLsBYSgAAAABJRU5ErkJggg==$/)
    })

    it('retrieves valid images for deleted file', async () => {
      const diffSelection = DiffSelection.fromInitialSelection(DiffSelectionType.All)

      const file = new WorkingDirectoryFileChange('new-animated-gif.gif', FileStatus.Deleted, diffSelection)
      const previous = await GitDiff.getBlobImage(repository!, file)
      expect(previous.mediaType).to.equal('image/gif')
      expect(previous.contents).to.match(/0000$/)
    })
  })
})
