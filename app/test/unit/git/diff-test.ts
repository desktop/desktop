import { expect } from 'chai'

import * as path from 'path'
import * as FSE from 'fs-extra'

import { Repository } from '../../../src/models/repository'
import {
  AppFileStatus,
  WorkingDirectoryFileChange,
} from '../../../src/models/status'
import {
  ITextDiff,
  IImageDiff,
  DiffSelectionType,
  DiffSelection,
  DiffType,
} from '../../../src/models/diff'
import {
  setupFixtureRepository,
  setupEmptyRepository,
} from '../../helpers/repositories'

import {
  getWorkingDirectoryDiff,
  getWorkingDirectoryImage,
  getBlobImage,
} from '../../../src/lib/git'
import { getStatusOrThrow } from '../../helpers/status'

import { GitProcess } from 'dugite'

async function getTextDiff(
  repo: Repository,
  file: WorkingDirectoryFileChange
): Promise<ITextDiff> {
  const diff = await getWorkingDirectoryDiff(repo, file)
  expect(diff.kind === DiffType.Text)
  return diff as ITextDiff
}

describe('git/diff', () => {
  let repository: Repository | null = null

  beforeEach(async () => {
    const testRepoPath = await setupFixtureRepository('repo-with-image-changes')
    repository = new Repository(testRepoPath, -1, null, false)
  })

  describe('getWorkingDirectoryImage', () => {
    it('retrieves valid image for new file', async () => {
      const diffSelection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      )
      const file = new WorkingDirectoryFileChange(
        'new-image.png',
        AppFileStatus.New,
        diffSelection
      )
      const current = await getWorkingDirectoryImage(repository!, file)

      expect(current.mediaType).to.equal('image/png')
      expect(current.contents).to.match(/A2HkbLsBYSgAAAABJRU5ErkJggg==$/)
    })

    it('retrieves valid images for modified file', async () => {
      const diffSelection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      )
      const file = new WorkingDirectoryFileChange(
        'modified-image.jpg',
        AppFileStatus.Modified,
        diffSelection
      )
      const current = await getWorkingDirectoryImage(repository!, file)
      expect(current.mediaType).to.equal('image/jpg')
      expect(current.contents).to.match(/gdTTb6MClWJ3BU8T8PTtXoB88kFL\/9k=$/)
    })
  })

  describe('getBlobImage', () => {
    it('retrieves valid image for modified file', async () => {
      const diffSelection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      )
      const file = new WorkingDirectoryFileChange(
        'modified-image.jpg',
        AppFileStatus.Modified,
        diffSelection
      )
      const current = await getBlobImage(repository!, file.path, 'HEAD')

      expect(current.mediaType).to.equal('image/jpg')
      expect(current.contents).to.match(
        /zcabBFNf6G8U1y7QpBYtbOWQivIsDU8T4kYKKTQFg7v\/9k=/
      )
    })

    it('retrieves valid images for deleted file', async () => {
      const diffSelection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      )
      const file = new WorkingDirectoryFileChange(
        'new-animated-image.gif',
        AppFileStatus.Deleted,
        diffSelection
      )
      const previous = await getBlobImage(repository!, file.path, 'HEAD')

      expect(previous.mediaType).to.equal('image/gif')
      expect(previous.contents).to.match(
        /pSQ0J85QG55rqWbgLdEmOWQJ1MjFS3WWA2slfZxeEAtp3AykkAAA7$/
      )
    })
  })

  describe('imageDiff', () => {
    it('changes for images are set', async () => {
      const diffSelection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      )
      const file = new WorkingDirectoryFileChange(
        'modified-image.jpg',
        AppFileStatus.Modified,
        diffSelection
      )
      const diff = await getWorkingDirectoryDiff(repository!, file)

      expect(diff.kind === DiffType.Image)

      const imageDiff = diff as IImageDiff
      expect(imageDiff.previous).is.not.undefined
      expect(imageDiff.current).is.not.undefined
    })

    it('changes for text are not set', async () => {
      const testRepoPath = await setupFixtureRepository('repo-with-changes')
      repository = new Repository(testRepoPath, -1, null, false)

      const diffSelection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      )
      const file = new WorkingDirectoryFileChange(
        'new-file.md',
        AppFileStatus.New,
        diffSelection
      )
      const diff = await getTextDiff(repository!, file)

      expect(diff.hunks.length).is.greaterThan(0)
    })
  })

  describe('getWorkingDirectoryDiff', () => {
    beforeEach(async () => {
      const testRepoPath = await setupFixtureRepository('repo-with-changes')
      repository = new Repository(testRepoPath, -1, null, false)
    })

    it('counts lines for new file', async () => {
      const diffSelection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      )
      const file = new WorkingDirectoryFileChange(
        'new-file.md',
        AppFileStatus.New,
        diffSelection
      )
      const diff = await getTextDiff(repository!, file)

      const hunk = diff.hunks[0]

      expect(hunk.lines[0].text).to.have.string('@@ -0,0 +1,33 @@')

      expect(hunk.lines[1].text).to.have.string('+Lorem ipsum dolor sit amet,')
      expect(hunk.lines[2].text).to.have.string(
        '+ullamcorper sit amet tellus eget, '
      )

      expect(hunk.lines[33].text).to.have.string(
        '+ urna, ac porta justo leo sed magna.'
      )
    })

    it('counts lines for modified file', async () => {
      const diffSelection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      )
      const file = new WorkingDirectoryFileChange(
        'modified-file.md',
        AppFileStatus.Modified,
        diffSelection
      )
      const diff = await getTextDiff(repository!, file)

      const first = diff.hunks[0]
      expect(first.lines[0].text).to.have.string('@@ -4,10 +4,6 @@')

      expect(first.lines[4].text).to.have.string('-Aliquam leo ipsum')
      expect(first.lines[5].text).to.have.string('-nisl eget hendrerit')
      expect(first.lines[6].text).to.have.string('-eleifend mi.')
      expect(first.lines[7].text).to.have.string('-')

      const second = diff.hunks[1]
      expect(second.lines[0].text).to.have.string('@@ -21,6 +17,10 @@')

      expect(second.lines[4].text).to.have.string('+Aliquam leo ipsum')
      expect(second.lines[5].text).to.have.string('+nisl eget hendrerit')
      expect(second.lines[6].text).to.have.string('+eleifend mi.')
      expect(second.lines[7].text).to.have.string('+')
    })

    it('counts lines for staged file', async () => {
      const diffSelection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      )
      const file = new WorkingDirectoryFileChange(
        'staged-file.md',
        AppFileStatus.Modified,
        diffSelection
      )
      const diff = await getTextDiff(repository!, file)

      const first = diff.hunks[0]
      expect(first.lines[0].text).to.have.string('@@ -2,7 +2,7 @@ ')

      expect(first.lines[4].text).to.have.string(
        '-tortor placerat facilisis. Ut sed ex tortor. Duis consectetur at ex vel mattis.'
      )
      expect(first.lines[5].text).to.have.string('+tortor placerat facilisis.')

      const second = diff.hunks[1]
      expect(second.lines[0].text).to.have.string('@@ -17,9 +17,7 @@ ')

      expect(second.lines[4].text).to.have.string('-vel sagittis nisl rutrum. ')
      expect(second.lines[5].text).to.have.string(
        '-tempor a ligula. Proin pretium ipsum '
      )
      expect(second.lines[6].text).to.have.string(
        '-elementum neque id tellus gravida rhoncus.'
      )
      expect(second.lines[7].text).to.have.string('+vel sagittis nisl rutrum.')
    })

    it('displays a binary diff for a docx file', async () => {
      const repositoryPath = await setupFixtureRepository('diff-rendering-docx')
      const repo = new Repository(repositoryPath, -1, null, false)

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      expect(files.length).to.equal(1)

      const diff = await getWorkingDirectoryDiff(repo, files[0])

      expect(diff.kind).to.equal(DiffType.Binary)
    })

    it('is empty for a renamed file', async () => {
      const repo = await setupEmptyRepository()

      await FSE.writeFile(path.join(repo.path, 'foo'), 'foo\n')

      await GitProcess.exec(['add', 'foo'], repo.path)
      await GitProcess.exec(['commit', '-m', 'Initial commit'], repo.path)
      await GitProcess.exec(['mv', 'foo', 'bar'], repo.path)

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      expect(files.length).to.equal(1)

      const diff = await getTextDiff(repo, files[0])

      expect(diff.hunks.length).to.equal(0)
    })

    // A renamed file in the working directory is just two staged files
    // with high similarity. If we don't take the rename into account
    // when generating the diffs we'd be looking at a diff with only
    // additions.
    it('only shows modifications after move for a renamed and modified file', async () => {
      const repo = await setupEmptyRepository()

      await FSE.writeFile(path.join(repo.path, 'foo'), 'foo\n')

      await GitProcess.exec(['add', 'foo'], repo.path)
      await GitProcess.exec(['commit', '-m', 'Initial commit'], repo.path)
      await GitProcess.exec(['mv', 'foo', 'bar'], repo.path)

      await FSE.writeFile(path.join(repo.path, 'bar'), 'bar\n')

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      expect(files.length).to.equal(1)

      const diff = await getTextDiff(repo, files[0])

      expect(diff.hunks.length).to.equal(1)

      const first = diff.hunks[0]
      expect(first.lines.length).to.equal(3)
      expect(first.lines[1].text).to.equal('-foo')
      expect(first.lines[2].text).to.equal('+bar')
    })

    it('handles unborn repository with mixed state', async () => {
      const repo = await setupEmptyRepository()

      await FSE.writeFile(
        path.join(repo.path, 'foo'),
        'WRITING THE FIRST LINE\n'
      )

      await GitProcess.exec(['add', 'foo'], repo.path)

      await FSE.writeFile(path.join(repo.path, 'foo'), 'WRITING OVER THE TOP\n')

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      expect(files.length).to.equal(1)

      const diff = await getTextDiff(repo, files[0])

      expect(diff.hunks.length).to.equal(1)

      const first = diff.hunks[0]
      expect(first.lines.length).to.equal(2)
      expect(first.lines[1].text).to.equal('+WRITING OVER THE TOP')
    })
  })

  describe('getWorkingDirectoryDiff/line-endings', () => {
    it('displays line endings change from LF to CRLF', async () => {
      const repo = await setupEmptyRepository()
      const filePath = path.join(repo.path, 'foo')

      let lineEnding = '\r\n'

      await FSE.writeFile(
        filePath,
        `WRITING MANY LINES ${lineEnding} USING THIS LINE ENDING ${lineEnding} TO SHOW THAT GIT${lineEnding} WILL INSERT IT WITHOUT CHANGING THING ${lineEnding} HA HA BUSINESS`
      )

      await GitProcess.exec(['add', 'foo'], repo.path)
      await GitProcess.exec(
        ['commit', '-m', 'commit first file with LF'],
        repo.path
      )

      await GitProcess.exec(['config', 'core.autocrlf', 'true'], repo.path)
      lineEnding = '\n\n'

      await FSE.writeFile(
        filePath,
        `WRITING MANY LINES ${lineEnding} USING THIS LINE ENDING ${lineEnding} TO SHOW THAT GIT${lineEnding} WILL INSERT IT WITHOUT CHANGING THING ${lineEnding} HA HA BUSINESS`
      )

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      expect(files.length).to.equal(1)

      const diff = await getTextDiff(repo, files[0])

      expect(diff.lineEndingsChange).to.not.be.undefined
      expect(diff.lineEndingsChange!.from).to.equal('LF')
      expect(diff.lineEndingsChange!.to).to.equal('CRLF')
    })
  })

  describe('getWorkingDirectoryDiff/unicode', () => {
    it('displays unicode characters', async () => {
      const repo = await setupEmptyRepository()
      const filePath = path.join(repo.path, 'foo')

      const testString = 'here are some cool characters: • é  漢字'
      await FSE.writeFile(filePath, testString)

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files
      expect(files.length).to.equal(1)

      const diff = await getTextDiff(repo, files[0])
      expect(diff.text).to.equal(`@@ -0,0 +1 @@\n+${testString}`)
    })
  })
})
