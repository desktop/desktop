import * as path from 'path'
import * as FSE from 'fs-extra'

import { Repository } from '../../../src/models/repository'
import {
  WorkingDirectoryFileChange,
  AppFileStatusKind,
  FileChange,
} from '../../../src/models/status'
import {
  ITextDiff,
  IImageDiff,
  DiffSelectionType,
  DiffSelection,
  DiffType,
  ISubmoduleDiff,
} from '../../../src/models/diff'
import {
  setupFixtureRepository,
  setupEmptyRepository,
} from '../../helpers/repositories'

import {
  getWorkingDirectoryDiff,
  getWorkingDirectoryImage,
  getBlobImage,
  getBinaryPaths,
  getBranchMergeBaseChangedFiles,
  getBranchMergeBaseDiff,
  git,
} from '../../../src/lib/git'
import { getStatusOrThrow } from '../../helpers/status'

import { GitError as DugiteError, exec } from 'dugite'
import { makeCommit, switchTo } from '../../helpers/repository-scaffolding'
import { writeFile } from 'fs/promises'

async function getTextDiff(
  repo: Repository,
  file: WorkingDirectoryFileChange
): Promise<ITextDiff> {
  const diff = await getWorkingDirectoryDiff(repo, file)
  expect(diff.kind === DiffType.Text)
  return diff as ITextDiff
}

describe('git/diff', () => {
  let repository: Repository

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
        { kind: AppFileStatusKind.New },
        diffSelection
      )
      const current = await getWorkingDirectoryImage(repository, file)

      expect(current.mediaType).toBe('image/png')
      expect(current.contents).toMatch(/A2HkbLsBYSgAAAABJRU5ErkJggg==$/)
    })

    it('retrieves valid images for modified file', async () => {
      const diffSelection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      )
      const file = new WorkingDirectoryFileChange(
        'modified-image.jpg',
        { kind: AppFileStatusKind.Modified },
        diffSelection
      )
      const current = await getWorkingDirectoryImage(repository, file)
      expect(current.mediaType).toBe('image/jpg')
      expect(current.contents).toMatch(/gdTTb6MClWJ3BU8T8PTtXoB88kFL\/9k=$/)
    })
  })

  describe('getBlobImage', () => {
    it('retrieves valid image for modified file', async () => {
      const diffSelection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      )
      const file = new WorkingDirectoryFileChange(
        'modified-image.jpg',
        { kind: AppFileStatusKind.Modified },
        diffSelection
      )
      const current = await getBlobImage(repository, file.path, 'HEAD')

      expect(current.mediaType).toBe('image/jpg')
      expect(current.contents).toMatch(
        /zcabBFNf6G8U1y7QpBYtbOWQivIsDU8T4kYKKTQFg7v\/9k=/
      )
    })

    it('retrieves valid images for deleted file', async () => {
      const diffSelection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      )
      const file = new WorkingDirectoryFileChange(
        'new-animated-image.gif',
        { kind: AppFileStatusKind.Deleted },
        diffSelection
      )
      const previous = await getBlobImage(repository, file.path, 'HEAD')

      expect(previous.mediaType).toBe('image/gif')
      expect(previous.contents).toMatch(
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
        { kind: AppFileStatusKind.Modified },
        diffSelection
      )
      const diff = await getWorkingDirectoryDiff(repository, file)

      expect(diff.kind === DiffType.Image)

      const imageDiff = diff as IImageDiff
      expect(imageDiff.previous).not.toBeUndefined()
      expect(imageDiff.current).not.toBeUndefined()
    })

    it('changes for text are not set', async () => {
      const testRepoPath = await setupFixtureRepository('repo-with-changes')
      repository = new Repository(testRepoPath, -1, null, false)

      const diffSelection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      )
      const file = new WorkingDirectoryFileChange(
        'new-file.md',
        { kind: AppFileStatusKind.New },
        diffSelection
      )
      const diff = await getTextDiff(repository, file)

      expect(diff.hunks.length).toBeGreaterThan(0)
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
        { kind: AppFileStatusKind.New },
        diffSelection
      )
      const diff = await getTextDiff(repository, file)

      const hunk = diff.hunks[0]

      expect(hunk.lines[0].text).toContain('@@ -0,0 +1,33 @@')

      expect(hunk.lines[1].text).toContain('+Lorem ipsum dolor sit amet,')
      expect(hunk.lines[2].text).toContain(
        '+ullamcorper sit amet tellus eget, '
      )

      expect(hunk.lines[33].text).toContain(
        '+ urna, ac porta justo leo sed magna.'
      )
    })

    it('counts lines for modified file', async () => {
      const diffSelection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      )
      const file = new WorkingDirectoryFileChange(
        'modified-file.md',
        { kind: AppFileStatusKind.Modified },
        diffSelection
      )
      const diff = await getTextDiff(repository, file)

      const first = diff.hunks[0]
      expect(first.lines[0].text).toContain('@@ -4,10 +4,6 @@')

      expect(first.lines[4].text).toContain('-Aliquam leo ipsum')
      expect(first.lines[5].text).toContain('-nisl eget hendrerit')
      expect(first.lines[6].text).toContain('-eleifend mi.')
      expect(first.lines[7].text).toContain('-')

      const second = diff.hunks[1]
      expect(second.lines[0].text).toContain('@@ -21,6 +17,10 @@')

      expect(second.lines[4].text).toContain('+Aliquam leo ipsum')
      expect(second.lines[5].text).toContain('+nisl eget hendrerit')
      expect(second.lines[6].text).toContain('+eleifend mi.')
      expect(second.lines[7].text).toContain('+')
    })

    it('counts lines for staged file', async () => {
      const diffSelection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      )
      const file = new WorkingDirectoryFileChange(
        'staged-file.md',
        { kind: AppFileStatusKind.Modified },
        diffSelection
      )
      const diff = await getTextDiff(repository, file)

      const first = diff.hunks[0]
      expect(first.lines[0].text).toContain('@@ -2,7 +2,7 @@ ')

      expect(first.lines[4].text).toContain(
        '-tortor placerat facilisis. Ut sed ex tortor. Duis consectetur at ex vel mattis.'
      )
      expect(first.lines[5].text).toContain('+tortor placerat facilisis.')

      const second = diff.hunks[1]
      expect(second.lines[0].text).toContain('@@ -17,9 +17,7 @@ ')

      expect(second.lines[4].text).toContain('-vel sagittis nisl rutrum. ')
      expect(second.lines[5].text).toContain(
        '-tempor a ligula. Proin pretium ipsum '
      )
      expect(second.lines[6].text).toContain(
        '-elementum neque id tellus gravida rhoncus.'
      )
      expect(second.lines[7].text).toContain('+vel sagittis nisl rutrum.')
    })

    it('displays a binary diff for a docx file', async () => {
      const repositoryPath = await setupFixtureRepository('diff-rendering-docx')
      const repo = new Repository(repositoryPath, -1, null, false)

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      expect(files).toHaveLength(1)

      const diff = await getWorkingDirectoryDiff(repo, files[0])

      expect(diff.kind).toBe(DiffType.Binary)
    })

    it('is empty for a renamed file', async () => {
      const repo = await setupEmptyRepository()

      await FSE.writeFile(path.join(repo.path, 'foo'), 'foo\n')

      await exec(['add', 'foo'], repo.path)
      await exec(['commit', '-m', 'Initial commit'], repo.path)
      await exec(['mv', 'foo', 'bar'], repo.path)

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      expect(files).toHaveLength(1)

      const diff = await getTextDiff(repo, files[0])

      expect(diff.hunks).toHaveLength(0)
    })

    // A renamed file in the working directory is just two staged files
    // with high similarity. If we don't take the rename into account
    // when generating the diffs we'd be looking at a diff with only
    // additions.
    it('only shows modifications after move for a renamed and modified file', async () => {
      const repo = await setupEmptyRepository()

      await FSE.writeFile(path.join(repo.path, 'foo'), 'foo\n')

      await exec(['add', 'foo'], repo.path)
      await exec(['commit', '-m', 'Initial commit'], repo.path)
      await exec(['mv', 'foo', 'bar'], repo.path)

      await FSE.writeFile(path.join(repo.path, 'bar'), 'bar\n')

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      expect(files).toHaveLength(1)

      const diff = await getTextDiff(repo, files[0])

      expect(diff.hunks).toHaveLength(1)

      const first = diff.hunks[0]
      expect(first.lines).toHaveLength(3)
      expect(first.lines[1].text).toBe('-foo')
      expect(first.lines[2].text).toBe('+bar')
    })

    it('handles unborn repository with mixed state', async () => {
      const repo = await setupEmptyRepository()

      await FSE.writeFile(
        path.join(repo.path, 'foo'),
        'WRITING THE FIRST LINE\n'
      )

      await exec(['add', 'foo'], repo.path)

      await FSE.writeFile(path.join(repo.path, 'foo'), 'WRITING OVER THE TOP\n')

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      expect(files).toHaveLength(1)

      const diff = await getTextDiff(repo, files[0])

      expect(diff.hunks).toHaveLength(1)

      const first = diff.hunks[0]
      expect(first.lines).toHaveLength(2)
      expect(first.lines[1].text).toBe('+WRITING OVER THE TOP')
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

      await exec(['add', 'foo'], repo.path)
      await exec(['commit', '-m', 'commit first file with LF'], repo.path)

      // change config on-the-fly to trigger the line endings change warning
      await exec(['config', 'core.autocrlf', 'true'], repo.path)
      lineEnding = '\n\n'

      await FSE.writeFile(
        filePath,
        `WRITING MANY LINES ${lineEnding} USING THIS LINE ENDING ${lineEnding} TO SHOW THAT GIT${lineEnding} WILL INSERT IT WITHOUT CHANGING THING ${lineEnding} HA HA BUSINESS`
      )

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      expect(files).toHaveLength(1)

      const diff = await getTextDiff(repo, files[0])

      expect(diff.lineEndingsChange).not.toBeUndefined()
      expect(diff.lineEndingsChange!.from).toBe('LF')
      expect(diff.lineEndingsChange!.to).toBe('CRLF')
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
      expect(files).toHaveLength(1)

      const diff = await getTextDiff(repo, files[0])
      expect(diff.text).toBe(`@@ -0,0 +1 @@\n+${testString}`)
    })
  })

  describe('getBinaryPaths', () => {
    describe('in empty repo', () => {
      let repo: Repository
      beforeEach(async () => {
        repo = await setupEmptyRepository()
      })
      it('throws since HEAD doesnt exist', () => {
        expect(getBinaryPaths(repo, 'HEAD', [])).rejects.toThrow()
      })
    })

    describe('with files using binary merge driver', () => {
      let repo: Repository
      beforeEach(async () => {
        repo = await setupEmptyRepository()
        writeFile(path.join(repo.path, 'foo.bin'), 'foo\n')
        writeFile(
          path.join(repo.path, '.gitattributes'),
          '*.bin merge=binary\n'
        )
        await git(['add', '.'], repo.path, '')
        await git(['commit', '-m', 'initial'], repo.path, '')
        await git(['checkout', '-b', 'branch-a'], repo.path, '')
        await writeFile(path.join(repo.path, 'foo.bin'), 'bar\n')
        await git(['commit', '-a', '-m', 'second'], repo.path, '')
        await git(['checkout', '-'], repo.path, '')
        await writeFile(path.join(repo.path, 'foo.bin'), 'foozball\n')
        await git(['commit', '-a', '-m', 'third'], repo.path, '')
        await git(['merge', 'branch-a'], repo.path, '', {
          expectedErrors: new Set([DugiteError.MergeConflicts]),
        })
      })
      it('includes plain text files using binary driver', async () => {
        expect(
          await getBinaryPaths(repo, 'MERGE_HEAD', [
            {
              kind: 'entry',
              path: 'foo.bin',
              statusCode: 'UU',
              submoduleStatusCode: '????',
            },
          ])
        ).toEqual(['foo.bin'])
      })
    })

    describe('in repo with text only files', () => {
      let repo: Repository
      beforeEach(async () => {
        const testRepoPath = await setupFixtureRepository('repo-with-changes')
        repo = new Repository(testRepoPath, -1, null, false)
      })
      it('returns an empty array', async () => {
        expect(await getBinaryPaths(repo, 'HEAD', [])).toHaveLength(0)
      })
    })
    describe('in repo with image changes', () => {
      let repo: Repository
      beforeEach(async () => {
        const testRepoPath = await setupFixtureRepository(
          'repo-with-image-changes'
        )
        repo = new Repository(testRepoPath, -1, null, false)
      })
      it('returns all changed image files', async () => {
        expect(await getBinaryPaths(repo, 'HEAD', [])).toEqual([
          'modified-image.jpg',
          'new-animated-image.gif',
          'new-image.png',
        ])
      })
    })
    describe('in repo with merge conflicts on image files', () => {
      let repo: Repository
      beforeEach(async () => {
        const testRepoPath = await setupFixtureRepository(
          'detect-conflict-in-binary-file'
        )
        repo = new Repository(testRepoPath, -1, null, false)
        await exec(['checkout', 'make-a-change'], repo.path)
        await exec(['merge', 'master'], repo.path)
      })
      it('returns all conflicted image files', async () => {
        expect(await getBinaryPaths(repo, 'MERGE_HEAD', [])).toEqual([
          'my-cool-image.png',
        ])
      })
    })
  })

  describe('with submodules', () => {
    const submoduleRelativePath: string = path.join('foo', 'submodule')
    let submodulePath: string

    const getSubmoduleDiff = async () => {
      const status = await getStatusOrThrow(repository)
      const file = status.workingDirectory.files[0]
      const diff = await getWorkingDirectoryDiff(repository, file)
      expect(diff.kind).toBe(DiffType.Submodule)

      return diff as ISubmoduleDiff
    }

    beforeEach(async () => {
      const repoPath = await setupFixtureRepository('submodule-basic-setup')
      repository = new Repository(repoPath, -1, null, false)
      submodulePath = path.join(repoPath, submoduleRelativePath)
    })

    it('can get the diff for a submodule with the right paths', async () => {
      // Just make any change to the submodule to get a diff
      await FSE.writeFile(path.join(submodulePath, 'README.md'), 'hello\n')

      const diff = await getSubmoduleDiff()
      expect(diff.fullPath).toBe(submodulePath)
      // Even on Windows, the path separator is '/' for this specific attribute
      expect(diff.path).toBe('foo/submodule')
    })

    it('can get the diff for a submodule with only modified changes', async () => {
      // Modify README.md file. Now the submodule has modified changes.
      await FSE.writeFile(path.join(submodulePath, 'README.md'), 'hello\n')

      const diff = await getSubmoduleDiff()
      expect(diff.oldSHA).toBeNull()
      expect(diff.newSHA).toBeNull()
      expect(diff.status).toMatchObject({
        commitChanged: false,
        modifiedChanges: true,
        untrackedChanges: false,
      })
    })

    it('can get the diff for a submodule with only untracked changes', async () => {
      // Create NEW.md file. Now the submodule has untracked changes.
      await FSE.writeFile(path.join(submodulePath, 'NEW.md'), 'hello\n')

      const diff = await getSubmoduleDiff()
      expect(diff.oldSHA).toBeNull()
      expect(diff.newSHA).toBeNull()
      expect(diff.status).toMatchObject({
        commitChanged: false,
        modifiedChanges: false,
        untrackedChanges: true,
      })
    })

    it('can get the diff for a submodule a commit change', async () => {
      // Make a change and commit it. Now the submodule has a commit change.
      await FSE.writeFile(path.join(submodulePath, 'README.md'), 'hello\n')
      await exec(['commit', '-a', '-m', 'test'], submodulePath)

      const diff = await getSubmoduleDiff()
      expect(diff.oldSHA).not.toBeNull()
      expect(diff.newSHA).not.toBeNull()
      expect(diff.status).toMatchObject({
        commitChanged: true,
        modifiedChanges: false,
        untrackedChanges: false,
      })
    })

    it('can get the diff for a submodule a all kinds of changes', async () => {
      await FSE.writeFile(path.join(submodulePath, 'README.md'), 'hello\n')
      await exec(['commit', '-a', '-m', 'test'], submodulePath)
      await FSE.writeFile(path.join(submodulePath, 'README.md'), 'bye\n')
      await FSE.writeFile(path.join(submodulePath, 'NEW.md'), 'new!!\n')

      const diff = await getSubmoduleDiff()
      expect(diff.oldSHA).not.toBeNull()
      expect(diff.newSHA).not.toBeNull()
      expect(diff.status).toMatchObject({
        commitChanged: true,
        modifiedChanges: true,
        untrackedChanges: true,
      })
    })
  })

  describe('getBranchMergeBaseChangedFiles', () => {
    it('loads the files changed between two branches if merged', async () => {
      // create feature branch from initial master commit
      await exec(['branch', 'feature-branch'], repository.path)

      const firstCommit = {
        entries: [{ path: 'A.md', contents: 'A' }],
      }
      await makeCommit(repository, firstCommit)

      // switch to the feature branch and add feature.md and add foo.md
      await switchTo(repository, 'feature-branch')

      const secondCommit = {
        entries: [{ path: 'feature.md', contents: 'feature' }],
      }
      await makeCommit(repository, secondCommit)

      /*
        Now, we have:

           B
        A  |  -- Feature
        |  /
        I -- Master

        If we did `git diff master feature`, we would see files changes
        from just A and B.

        We are testing `git diff --merge-base master feature`, which will
        display the diff of the resulting merge of `feature` into `master`.
        Thus, we will see changes from B only.
      */

      const changesetData = await getBranchMergeBaseChangedFiles(
        repository,
        'master',
        'feature-branch',
        'irrelevantToTest'
      )

      expect(changesetData).not.toBeNull()
      if (changesetData === null) {
        return
      }

      expect(changesetData.files).toHaveLength(1)
      expect(changesetData.files[0].path).toBe('feature.md')
    })

    it('returns null for unrelated histories', async () => {
      // create a second branch that's orphaned from our current branch
      await exec(['checkout', '--orphan', 'orphaned-branch'], repository.path)

      // add a commit to this new branch
      await exec(
        ['commit', '--allow-empty', '-m', `first commit on gh-pages`],
        repository.path
      )

      const changesetData = await getBranchMergeBaseChangedFiles(
        repository,
        'master',
        'feature-branch',
        'irrelevantToTest'
      )

      expect(changesetData).toBeNull()
    })
  })

  describe('getBranchMergeBaseDiff', () => {
    it('loads the diff of a file between two branches if merged', async () => {
      // Add foo.md to master
      const fooPath = path.join(repository.path, 'foo.md')
      await FSE.writeFile(fooPath, 'foo\n')
      await exec(['commit', '-a', '-m', 'foo'], repository.path)

      // Create feature branch from commit with foo.md
      await exec(['branch', 'feature-branch'], repository.path)

      // Commit a line "bar" to foo.md on master branch
      await FSE.appendFile(fooPath, 'bar\n')
      await exec(['add', fooPath], repository.path)
      await exec(['commit', '-m', 'A'], repository.path)

      // switch to the feature branch and add feature to foo.md
      await switchTo(repository, 'feature-branch')

      // Commit a line of "feature" to foo.md on feature branch
      await FSE.appendFile(fooPath, 'feature\n')
      await exec(['add', fooPath], repository.path)
      await exec(['commit', '-m', 'B'], repository.path)

      /*
        Now, we have:

           B
        A  |  -- Feature
        |  /
        Foo -- Master

        A adds line of "bar" to foo.md
        B adds line "feature" to foo.md

        If we did `git diff master feature`, we would see both lines
        "bar" and "feature" added to foo.md

        We are testing `git diff --merge-base master feature`, which will
        display the diff of the resulting merge of `feature` into `master`.
        Thus, we will see changes from B only or the line "feature".
      */

      const diff = await getBranchMergeBaseDiff(
        repository,
        new FileChange('foo.md', { kind: AppFileStatusKind.New }),
        'master',
        'feature-branch',
        false,
        'irrelevantToTest'
      )
      expect(diff.kind).toBe(DiffType.Text)

      if (diff.kind !== DiffType.Text) {
        return
      }

      expect(diff.text).not.toContain('bar')
      expect(diff.text).toContain('feature')
    })
  })
})
