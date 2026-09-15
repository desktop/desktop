import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import { appendFile, writeFile } from 'fs/promises'

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
import { join } from 'node:path'

async function getTextDiff(
  repo: Repository,
  file: WorkingDirectoryFileChange
): Promise<ITextDiff> {
  const diff = await getWorkingDirectoryDiff(repo, file)
  assert.equal(diff.kind, DiffType.Text)
  return diff as ITextDiff
}

describe('git/diff', () => {
  describe('getWorkingDirectoryImage', () => {
    it('retrieves valid image for new file', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'repo-with-image-changes'
      )
      const repository = new Repository(testRepoPath, -1, null, false)
      const diffSelection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      )
      const file = new WorkingDirectoryFileChange(
        'new-image.png',
        { kind: AppFileStatusKind.New },
        diffSelection
      )
      const current = await getWorkingDirectoryImage(repository, file)

      assert.equal(current.mediaType, 'image/png')
      assert(/A2HkbLsBYSgAAAABJRU5ErkJggg==$/.test(current.contents))
    })

    it('retrieves valid images for modified file', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'repo-with-image-changes'
      )
      const repository = new Repository(testRepoPath, -1, null, false)
      const diffSelection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      )
      const file = new WorkingDirectoryFileChange(
        'modified-image.jpg',
        { kind: AppFileStatusKind.Modified },
        diffSelection
      )
      const current = await getWorkingDirectoryImage(repository, file)
      assert.equal(current.mediaType, 'image/jpg')
      assert(/gdTTb6MClWJ3BU8T8PTtXoB88kFL\/9k=$/.test(current.contents))
    })
  })

  describe('getBlobImage', () => {
    it('retrieves valid image for modified file', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'repo-with-image-changes'
      )
      const repository = new Repository(testRepoPath, -1, null, false)
      const diffSelection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      )
      const file = new WorkingDirectoryFileChange(
        'modified-image.jpg',
        { kind: AppFileStatusKind.Modified },
        diffSelection
      )
      const current = await getBlobImage(repository, file.path, 'HEAD')

      assert.equal(current.mediaType, 'image/jpg')
      assert(
        /zcabBFNf6G8U1y7QpBYtbOWQivIsDU8T4kYKKTQFg7v\/9k=/.test(
          current.contents
        )
      )
    })

    it('retrieves valid images for deleted file', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'repo-with-image-changes'
      )
      const repository = new Repository(testRepoPath, -1, null, false)
      const diffSelection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      )
      const file = new WorkingDirectoryFileChange(
        'new-animated-image.gif',
        { kind: AppFileStatusKind.Deleted },
        diffSelection
      )
      const previous = await getBlobImage(repository, file.path, 'HEAD')

      assert.equal(previous.mediaType, 'image/gif')
      assert(
        /pSQ0J85QG55rqWbgLdEmOWQJ1MjFS3WWA2slfZxeEAtp3AykkAAA7$/.test(
          previous.contents
        )
      )
    })
  })

  describe('imageDiff', () => {
    it('changes for images are set', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'repo-with-image-changes'
      )
      const repository = new Repository(testRepoPath, -1, null, false)
      const diffSelection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      )
      const file = new WorkingDirectoryFileChange(
        'modified-image.jpg',
        { kind: AppFileStatusKind.Modified },
        diffSelection
      )
      const diff = await getWorkingDirectoryDiff(repository, file)

      assert.equal(diff.kind, DiffType.Image)

      const imageDiff = diff as IImageDiff
      assert(imageDiff.previous !== undefined)
      assert(imageDiff.current !== undefined)
    })

    it('changes for text are not set', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'repo-with-changes')
      const repository = new Repository(testRepoPath, -1, null, false)

      const diffSelection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      )
      const file = new WorkingDirectoryFileChange(
        'new-file.md',
        { kind: AppFileStatusKind.New },
        diffSelection
      )
      const diff = await getTextDiff(repository, file)

      assert(diff.hunks.length > 0)
    })
  })

  describe('getWorkingDirectoryDiff', () => {
    it('counts lines for new file', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'repo-with-changes')
      const repository = new Repository(testRepoPath, -1, null, false)

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

      assert(hunk.lines[0].text.includes('@@ -0,0 +1,33 @@'))

      assert(hunk.lines[1].text.includes('+Lorem ipsum dolor sit amet,'))
      assert(hunk.lines[2].text.includes('+ullamcorper sit amet tellus eget, '))

      assert(
        hunk.lines[33].text.includes('+ urna, ac porta justo leo sed magna.')
      )
    })

    it('counts lines for modified file', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'repo-with-changes')
      const repository = new Repository(testRepoPath, -1, null, false)

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
      assert(first.lines[0].text.includes('@@ -4,10 +4,6 @@'))

      assert(first.lines[4].text.includes('-Aliquam leo ipsum'))
      assert(first.lines[5].text.includes('-nisl eget hendrerit'))
      assert(first.lines[6].text.includes('-eleifend mi.'))
      assert(first.lines[7].text.includes('-'))

      const second = diff.hunks[1]
      assert(second.lines[0].text.includes('@@ -21,6 +17,10 @@'))

      assert(second.lines[4].text.includes('+Aliquam leo ipsum'))
      assert(second.lines[5].text.includes('+nisl eget hendrerit'))
      assert(second.lines[6].text.includes('+eleifend mi.'))
      assert(second.lines[7].text.includes('+'))
    })

    it('counts lines for staged file', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'repo-with-changes')
      const repository = new Repository(testRepoPath, -1, null, false)

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
      assert(first.lines[0].text.includes('@@ -2,7 +2,7 @@ '))

      assert(
        first.lines[4].text.includes(
          '-tortor placerat facilisis. Ut sed ex tortor. Duis consectetur at ex vel mattis.'
        )
      )
      assert(first.lines[5].text.includes('+tortor placerat facilisis.'))

      const second = diff.hunks[1]
      assert(second.lines[0].text.includes('@@ -17,9 +17,7 @@ '))

      assert(second.lines[4].text.includes('-vel sagittis nisl rutrum. '))
      assert(
        second.lines[5].text.includes('-tempor a ligula. Proin pretium ipsum ')
      )
      assert(
        second.lines[6].text.includes(
          '-elementum neque id tellus gravida rhoncus.'
        )
      )
      assert(second.lines[7].text.includes('+vel sagittis nisl rutrum.'))
    })

    it('displays a binary diff for a docx file', async t => {
      const repositoryPath = await setupFixtureRepository(
        t,
        'diff-rendering-docx'
      )
      const repo = new Repository(repositoryPath, -1, null, false)

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      assert.equal(files.length, 1)

      const diff = await getWorkingDirectoryDiff(repo, files[0])

      assert.equal(diff.kind, DiffType.Binary)
    })

    it('is empty for a renamed file', async t => {
      const repo = await setupEmptyRepository(t)

      await writeFile(path.join(repo.path, 'foo'), 'foo\n')

      await exec(['add', 'foo'], repo.path)
      await exec(['commit', '-m', 'Initial commit'], repo.path)
      await exec(['mv', 'foo', 'bar'], repo.path)

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      assert.equal(files.length, 1)

      const diff = await getTextDiff(repo, files[0])

      assert.equal(diff.hunks.length, 0)
    })

    // A renamed file in the working directory is just two staged files
    // with high similarity. If we don't take the rename into account
    // when generating the diffs we'd be looking at a diff with only
    // additions.
    it('only shows modifications after move for a renamed and modified file', async t => {
      const repo = await setupEmptyRepository(t)

      await writeFile(path.join(repo.path, 'foo'), 'foo\n')

      await exec(['add', 'foo'], repo.path)
      await exec(['commit', '-m', 'Initial commit'], repo.path)
      await exec(['mv', 'foo', 'bar'], repo.path)

      await writeFile(path.join(repo.path, 'bar'), 'bar\n')

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      assert.equal(files.length, 1)

      const diff = await getTextDiff(repo, files[0])

      assert.equal(diff.hunks.length, 1)

      const first = diff.hunks[0]
      assert.equal(first.lines.length, 3)
      assert.equal(first.lines[1].text, '-foo')
      assert.equal(first.lines[2].text, '+bar')
    })

    it('handles unborn repository with mixed state', async t => {
      const repo = await setupEmptyRepository(t)

      await writeFile(path.join(repo.path, 'foo'), 'WRITING THE FIRST LINE\n')

      await exec(['add', 'foo'], repo.path)

      await writeFile(path.join(repo.path, 'foo'), 'WRITING OVER THE TOP\n')

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      assert.equal(files.length, 1)

      const diff = await getTextDiff(repo, files[0])

      assert.equal(diff.hunks.length, 1)

      const first = diff.hunks[0]
      assert.equal(first.lines.length, 2)
      assert.equal(first.lines[1].text, '+WRITING OVER THE TOP')
    })
  })

  describe('getWorkingDirectoryDiff/line-endings', () => {
    it('displays line endings change from LF to CRLF', async t => {
      const repo = await setupEmptyRepository(t)
      const filePath = path.join(repo.path, 'foo')

      let lineEnding = '\r\n'

      await writeFile(
        filePath,
        `WRITING MANY LINES ${lineEnding} USING THIS LINE ENDING ${lineEnding} TO SHOW THAT GIT${lineEnding} WILL INSERT IT WITHOUT CHANGING THING ${lineEnding} HA HA BUSINESS`
      )

      await exec(['add', 'foo'], repo.path)
      await exec(['commit', '-m', 'commit first file with LF'], repo.path)

      // change config on-the-fly to trigger the line endings change warning
      await exec(['config', 'core.autocrlf', 'true'], repo.path)
      lineEnding = '\n\n'

      await writeFile(
        filePath,
        `WRITING MANY LINES ${lineEnding} USING THIS LINE ENDING ${lineEnding} TO SHOW THAT GIT${lineEnding} WILL INSERT IT WITHOUT CHANGING THING ${lineEnding} HA HA BUSINESS`
      )

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      assert.equal(files.length, 1)

      const diff = await getTextDiff(repo, files[0])

      assert(diff.lineEndingsChange !== undefined)
      assert.equal(diff.lineEndingsChange.from, 'LF')
      assert.equal(diff.lineEndingsChange.to, 'CRLF')
    })
  })

  describe('getWorkingDirectoryDiff/unicode', () => {
    it('displays unicode characters', async t => {
      const repo = await setupEmptyRepository(t)
      const filePath = path.join(repo.path, 'foo')

      const testString = 'here are some cool characters: • é  漢字'
      await writeFile(filePath, testString)

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files
      assert.equal(files.length, 1)

      const diff = await getTextDiff(repo, files[0])
      assert.equal(diff.text, `@@ -0,0 +1 @@\n+${testString}`)
    })
  })

  describe('getBinaryPaths', () => {
    describe('in empty repo', () => {
      it('throws since HEAD doesnt exist', async t => {
        const repo = await setupEmptyRepository(t)
        await assert.rejects(() => getBinaryPaths(repo, 'HEAD', []))
      })
    })

    describe('with files using binary merge driver', () => {
      it('includes plain text files using binary driver', async t => {
        const repo = await setupEmptyRepository(t)
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

        assert.deepStrictEqual(
          await getBinaryPaths(repo, 'MERGE_HEAD', [
            {
              kind: 'entry',
              path: 'foo.bin',
              statusCode: 'UU',
              submoduleStatusCode: '????',
            },
          ]),
          ['foo.bin']
        )
      })
    })

    describe('in repo with text only files', () => {
      it('returns an empty array', async t => {
        const testRepoPath = await setupFixtureRepository(
          t,
          'repo-with-changes'
        )
        const repo = new Repository(testRepoPath, -1, null, false)
        assert.equal((await getBinaryPaths(repo, 'HEAD', [])).length, 0)
      })
    })
    describe('in repo with image changes', t => {
      it('returns all changed image files', async t => {
        const testRepoPath = await setupFixtureRepository(
          t,
          'repo-with-image-changes'
        )
        const repo = new Repository(testRepoPath, -1, null, false)
        assert.deepStrictEqual(await getBinaryPaths(repo, 'HEAD', []), [
          'modified-image.jpg',
          'new-animated-image.gif',
          'new-image.png',
        ])
      })
    })
    describe('in repo with merge conflicts on image files', () => {
      it('returns all conflicted image files', async t => {
        const testRepoPath = await setupFixtureRepository(
          t,
          'detect-conflict-in-binary-file'
        )
        const repo = new Repository(testRepoPath, -1, null, false)
        await exec(['checkout', 'make-a-change'], repo.path)
        await exec(['merge', 'master'], repo.path)

        assert.deepStrictEqual(await getBinaryPaths(repo, 'MERGE_HEAD', []), [
          'my-cool-image.png',
        ])
      })
    })
  })

  describe('with submodules', () => {
    const getSubmodulePath = (repoPath: string, ...components: string[]) => {
      return join(repoPath, 'foo', 'submodule', ...components)
    }

    const getSubmoduleDiff = async (repository: Repository) => {
      const status = await getStatusOrThrow(repository)
      const file = status.workingDirectory.files[0]
      const diff = await getWorkingDirectoryDiff(repository, file)
      assert.equal(diff.kind, DiffType.Submodule)

      return diff as ISubmoduleDiff
    }

    it('can get the diff for a submodule with the right paths', async t => {
      const repoPath = await setupFixtureRepository(t, 'submodule-basic-setup')
      const repository = new Repository(repoPath, -1, null, false)

      // Just make any change to the submodule to get a diff
      await writeFile(getSubmodulePath(repoPath, 'README.md'), 'hello\n')

      const diff = await getSubmoduleDiff(repository)
      assert.equal(diff.fullPath, getSubmodulePath(repoPath))
      // Even on Windows, the path separator is '/' for this specific attribute
      assert.equal(diff.path, 'foo/submodule')
    })

    it('can get the diff for a submodule with only modified changes', async t => {
      const repoPath = await setupFixtureRepository(t, 'submodule-basic-setup')
      const repository = new Repository(repoPath, -1, null, false)

      // Modify README.md file. Now the submodule has modified changes.
      await writeFile(getSubmodulePath(repoPath, 'README.md'), 'hello\n')

      const diff = await getSubmoduleDiff(repository)
      assert(diff.oldSHA === null)
      assert(diff.newSHA === null)
      assert(!diff.status.commitChanged)
      assert(diff.status.modifiedChanges)
      assert(!diff.status.untrackedChanges)
    })

    it('can get the diff for a submodule with only untracked changes', async t => {
      const repoPath = await setupFixtureRepository(t, 'submodule-basic-setup')
      const repository = new Repository(repoPath, -1, null, false)

      // Create NEW.md file. Now the submodule has untracked changes.
      await writeFile(getSubmodulePath(repoPath, 'NEW.md'), 'hello\n')

      const diff = await getSubmoduleDiff(repository)
      assert(diff.oldSHA === null)
      assert(diff.newSHA === null)
      assert(!diff.status.commitChanged)
      assert(!diff.status.modifiedChanges)
      assert(diff.status.untrackedChanges)
    })

    it('can get the diff for a submodule a commit change', async t => {
      const repoPath = await setupFixtureRepository(t, 'submodule-basic-setup')
      const repository = new Repository(repoPath, -1, null, false)

      // Make a change and commit it. Now the submodule has a commit change.
      await writeFile(getSubmodulePath(repoPath, 'README.md'), 'hello\n')
      await exec(['commit', '-a', '-m', 'test'], getSubmodulePath(repoPath))

      const diff = await getSubmoduleDiff(repository)
      assert(diff.oldSHA !== null)
      assert(diff.newSHA !== null)
      assert(diff.status.commitChanged)
      assert(!diff.status.modifiedChanges)
      assert(!diff.status.untrackedChanges)
    })

    it('can get the diff for a submodule a all kinds of changes', async t => {
      const repoPath = await setupFixtureRepository(t, 'submodule-basic-setup')
      const repository = new Repository(repoPath, -1, null, false)

      await writeFile(getSubmodulePath(repoPath, 'README.md'), 'hello\n')
      await exec(['commit', '-a', '-m', 'test'], getSubmodulePath(repoPath))
      await writeFile(getSubmodulePath(repoPath, 'README.md'), 'bye\n')
      await writeFile(getSubmodulePath(repoPath, 'NEW.md'), 'new!!\n')

      const diff = await getSubmoduleDiff(repository)
      assert(diff.oldSHA !== null)
      assert(diff.newSHA !== null)
      assert(diff.status.commitChanged)
      assert(diff.status.modifiedChanges)
      assert(diff.status.untrackedChanges)
    })
  })

  describe('getBranchMergeBaseChangedFiles', () => {
    it('loads the files changed between two branches if merged', async t => {
      const repoPath = await setupFixtureRepository(t, 'submodule-basic-setup')
      const repository = new Repository(repoPath, -1, null, false)

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

      assert(changesetData !== null)
      if (changesetData === null) {
        return
      }

      assert.equal(changesetData.files.length, 1)
      assert.equal(changesetData.files[0].path, 'feature.md')
    })

    it('returns null for unrelated histories', async t => {
      const repoPath = await setupFixtureRepository(t, 'submodule-basic-setup')
      const repository = new Repository(repoPath, -1, null, false)

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

      assert(changesetData === null)
    })
  })

  describe('getBranchMergeBaseDiff', () => {
    it('loads the diff of a file between two branches if merged', async t => {
      const repoPath = await setupFixtureRepository(t, 'submodule-basic-setup')
      const repository = new Repository(repoPath, -1, null, false)

      // Add foo.md to master
      const fooPath = path.join(repository.path, 'foo.md')
      await writeFile(fooPath, 'foo\n')
      await exec(['commit', '-a', '-m', 'foo'], repository.path)

      // Create feature branch from commit with foo.md
      await exec(['branch', 'feature-branch'], repository.path)

      // Commit a line "bar" to foo.md on master branch
      await appendFile(fooPath, 'bar\n')
      await exec(['add', fooPath], repository.path)
      await exec(['commit', '-m', 'A'], repository.path)

      // switch to the feature branch and add feature to foo.md
      await switchTo(repository, 'feature-branch')

      // Commit a line of "feature" to foo.md on feature branch
      await appendFile(fooPath, 'feature\n')
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
      assert.equal(diff.kind, DiffType.Text)

      if (diff.kind !== DiffType.Text) {
        return
      }

      assert(!diff.text.includes('bar'))
      assert(diff.text.includes('feature'))
    })
  })
})
