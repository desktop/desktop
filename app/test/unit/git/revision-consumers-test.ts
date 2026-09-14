import assert from 'node:assert'
import { describe, it, TestContext } from 'node:test'
import { exec } from 'dugite'
import { Repository } from '../../../src/models/repository'
import { getCommits } from '../../../src/lib/git/log'
import {
  getBlobContents,
  getPartialBlobContents,
  getPartialBlobContentsCatchPathNotInRef,
} from '../../../src/lib/git/show'
import {
  doMergeCommitsExistAfterCommit,
  getAheadBehind,
  getCommitsInRange,
} from '../../../src/lib/git/rev-list'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'

async function runGit(repository: Repository, args: string[]) {
  const result = await exec(args, repository.path)
  assert.strictEqual(result.exitCode, 0, result.stderr)
  return result.stdout.trim()
}

async function setupHistory(t: TestContext) {
  const repository = await setupEmptyRepository(t)
  await makeCommit(repository, {
    entries: [{ path: 'file.txt', contents: 'base\n' }],
    commitMessage: 'base',
  })
  const base = await runGit(repository, ['rev-parse', 'HEAD'])
  await runGit(repository, ['update-ref', 'refs/remotes/--remote/base', base])
  await makeCommit(repository, {
    entries: [{ path: 'file.txt', contents: 'updated\n' }],
    commitMessage: 'matching first',
  })
  const first = await runGit(repository, ['rev-parse', 'HEAD'])
  await makeCommit(repository, {
    entries: [{ path: 'other.txt', contents: 'other\n' }],
    commitMessage: 'matching second',
  })
  const tip = await runGit(repository, ['rev-parse', 'HEAD'])
  await runGit(repository, ['update-ref', 'refs/remotes/--remote/main', tip])
  return { repository, base, first, tip }
}

describe('revision consumers with leading-dash refs', () => {
  it('partial blob readers read leading-dash refs and preserve missing-path handling', async t => {
    const { repository, base } = await setupHistory(t)
    for (const read of [
      getPartialBlobContents,
      getPartialBlobContentsCatchPathNotInRef,
    ]) {
      assert.deepStrictEqual(
        await read(repository, '--remote/base', 'file.txt', 1024),
        Buffer.from('base\n')
      )
      assert.strictEqual(await read(repository, base, 'other.txt', 1024), null)
      for (const revision of [
        '--remote/base',
        '--remote/main~2',
        '--remote/base^{tree}',
      ]) {
        assert.deepStrictEqual(
          await read(repository, revision, 'file.txt', 1024),
          Buffer.from('base\n')
        )
        assert.strictEqual(
          await read(repository, revision, 'other.txt', 1024),
          null
        )
      }
      for (const revision of ['--remote/missing', 'missing-ref']) {
        await assert.rejects(
          () => read(repository, revision, 'other.txt', 1024),
          { name: 'GitError' }
        )
      }
    }

    const contents = Buffer.alloc(1024 * 1024, Buffer.from([0, 255, 128, 10]))
    await makeCommit(repository, {
      entries: [{ path: 'large.bin', contents }],
    })
    await runGit(repository, [
      'update-ref',
      'refs/remotes/--remote/large',
      'HEAD',
    ])
    const partial = await getPartialBlobContents(
      repository,
      '--remote/large',
      'large.bin',
      8
    )
    assert.ok(partial !== null && partial.length > 0)
    assert.deepStrictEqual(partial, contents.subarray(0, partial.length))
  })

  it('getBlobContents reads exact binary contents from leading-dash refs', async t => {
    const { repository } = await setupHistory(t)
    const contents = Buffer.from([0, 255, 13, 10, 128])
    await makeCommit(repository, {
      entries: [{ path: 'binary file.bin', contents }],
    })
    await runGit(repository, [
      'update-ref',
      'refs/remotes/--remote/blob',
      'HEAD',
    ])
    assert.deepStrictEqual(
      await getBlobContents(repository, '--remote/blob', 'binary file.bin'),
      contents
    )
    assert.deepStrictEqual(
      await getBlobContents(repository, '--remote/base', 'file.txt'),
      Buffer.from('base\n')
    )
    for (const revision of [
      '--remote/base',
      '--remote/main~2',
      '--remote/base^{tree}',
    ]) {
      assert.deepStrictEqual(
        await getBlobContents(repository, revision, 'file.txt'),
        Buffer.from('base\n')
      )
      await assert.rejects(
        () => getBlobContents(repository, revision, 'other.txt'),
        /path 'other.txt' exists on disk, but not in/
      )
    }
    for (const revision of ['--remote/missing', 'missing-ref']) {
      await assert.rejects(
        () => getBlobContents(repository, revision, 'other.txt'),
        { name: 'GitError' }
      )
    }
  })

  it('doMergeCommitsExistAfterCommit detects merges after leading-dash refs', async t => {
    const { repository, base, tip } = await setupHistory(t)
    assert.strictEqual(
      await doMergeCommitsExistAfterCommit(repository, '--remote/base'),
      false
    )
    await runGit(repository, ['checkout', '-b', 'side', base])
    await makeCommit(repository, {
      entries: [{ path: 'side.txt', contents: 'side\n' }],
    })
    await runGit(repository, ['checkout', '--detach', tip])
    await runGit(repository, ['merge', '--no-ff', '-m', 'merge side', 'side'])
    assert.strictEqual(
      await doMergeCommitsExistAfterCommit(repository, '--remote/base'),
      true
    )
    assert.strictEqual(
      await doMergeCommitsExistAfterCommit(repository, null),
      true
    )
    await runGit(repository, [
      'update-ref',
      'refs/remotes/--remote/merged',
      'HEAD',
    ])
    assert.strictEqual(
      await doMergeCommitsExistAfterCommit(repository, '--remote/merged'),
      false
    )
  })

  it('getCommitsInRange preserves order and summaries for leading-dash ranges', async t => {
    const { repository, first, tip } = await setupHistory(t)
    assert.deepStrictEqual(
      await getCommitsInRange(repository, '--remote/base..--remote/main'),
      [
        { sha: first, summary: 'matching first' },
        { sha: tip, summary: 'matching second' },
      ]
    )
    assert.deepStrictEqual(
      await getCommitsInRange(repository, '--remote/main..HEAD'),
      []
    )
    assert.strictEqual(
      await getCommitsInRange(repository, '--remote/missing..HEAD'),
      null
    )
  })

  it('getAheadBehind counts both sides of leading-dash ranges', async t => {
    const { repository, base } = await setupHistory(t)
    await runGit(repository, ['checkout', '-b', 'other', base])
    await makeCommit(repository, {
      entries: [{ path: 'side.txt', contents: 'side\n' }],
    })
    assert.deepStrictEqual(
      await getAheadBehind(repository, '--remote/main...HEAD'),
      { ahead: 2, behind: 1 }
    )
    assert.strictEqual(
      await getAheadBehind(repository, '--remote/missing...HEAD'),
      null
    )
  })

  it('getCommits reads refs and ranges while preserving filters and pagination', async t => {
    const { repository, base, first, tip } = await setupHistory(t)
    const commits = await getCommits(repository, '--remote/main')
    assert.deepStrictEqual(
      commits.map(c => c.sha),
      [tip, first, base]
    )
    const filtered = await getCommits(
      repository,
      '--remote/base..--remote/main',
      1,
      1,
      ['--grep=matching']
    )
    assert.deepStrictEqual(
      filtered.map(c => ({ sha: c.sha, summary: c.summary })),
      [{ sha: first, summary: 'matching first' }]
    )
    assert.deepStrictEqual(
      await getCommits(repository, '--remote/main', undefined, undefined, [
        '--grep=absent',
      ]),
      []
    )
  })
})
