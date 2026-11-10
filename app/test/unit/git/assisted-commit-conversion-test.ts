import assert from 'node:assert'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { exec } from 'dugite'
import { promises as FileSystem } from 'fs'
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  symlink,
  unlink,
  writeFile,
} from 'fs/promises'
import { join } from 'path'
import {
  AssistedCommitError,
  captureAssistedCommitSnapshot,
  finalizeAssistedCommitTransaction,
  withAssistedCommitSnapshot,
} from '../../../src/lib/git/assisted-commit'
import { getWorkingDirectoryDiff } from '../../../src/lib/git/diff'
import { setHooksEnvEnabled } from '../../../src/lib/hooks/config'
import {
  DiffLineType,
  DiffSelection,
  DiffSelectionType,
  DiffType,
} from '../../../src/models/diff'
import { Repository } from '../../../src/models/repository'
import {
  AppFileStatusKind,
  WorkingDirectoryFileChange,
} from '../../../src/models/status'
import { setupEmptyRepository } from '../../helpers/repositories'
import { createTempDirectory } from '../../helpers/temp'
import {
  commitBytes,
  count,
  createPathMatcher,
  indexPath,
  optionalBytes,
  rawGit,
  request,
  seed,
  single,
  tip,
} from '../../helpers/assisted-commit'

const FilterDirectoryIdentityCheck = [
  "const assert = require('node:assert/strict')",
  "const fs = require('node:fs')",
  'const cwd = fs.statSync(process.cwd(), { bigint: true })',
  'const worktree = fs.statSync(process.env.GIT_WORK_TREE, { bigint: true })',
  'assert.equal(cwd.dev, worktree.dev)',
  'assert.equal(cwd.ino, worktree.ino)',
  "assert.ok(fs.existsSync('context-marker'))",
].join('\n')

describe('git/assisted-commit frozen conversion and attributes', () => {
  beforeEach(() => setHooksEnvEnabled(false))
  afterEach(() => localStorage.removeItem('git-hooks-env-enabled'))

  it('keeps Git newline and clean-filter semantics in frozen text bytes', async t => {
    const repository = await seed(t, {
      '.gitattributes': '*.txt text eol=lf\n',
      'file.txt': 'old\n',
      noEol: 'old',
    })
    await writeFile(join(repository.path, 'file.txt'), 'one\r\ntwo\r\n')
    await writeFile(join(repository.path, 'noEol'), 'new without newline')
    const input = await request(repository)
    const before = await readFile(join(repository.path, 'file.txt'))
    const result = await single(repository, input)
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'file.txt'),
      Buffer.from('one\ntwo\n')
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'file.txt')),
      before
    )
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'noEol'),
      Buffer.from('new without newline')
    )
  })

  it('checks capture consistency when a clean filter changes selected content during hashing', async t => {
    const repository = await seed(t, {
      a: 'a\n',
      b: 'b\n',
      '.gitattributes': '',
    })
    const original = await tip(repository)
    await rawGit(repository, [
      'config',
      'filter.mutate.clean',
      'cat; printf "FILTER CURRENT B\\n" > b',
    ])
    await writeFile(
      join(repository.path, '.gitattributes'),
      'a filter=mutate\n'
    )
    await writeFile(join(repository.path, 'a'), 'A\n')
    await writeFile(join(repository.path, 'b'), 'B\n')
    const files = ['a', 'b'].map(
      path =>
        new WorkingDirectoryFileChange(
          path,
          { kind: AppFileStatusKind.Modified },
          DiffSelection.fromInitialSelection(DiffSelectionType.All)
        )
    )
    const input = {
      files,
      trailers: [],
      skipCommitHooks: false,
      signOffCommits: false,
      allowEmptyCommit: false,
    }
    const originalIndex = await readFile(await indexPath(repository))
    await assert.rejects(
      captureAssistedCommitSnapshot(repository, input),
      error =>
        error instanceof AssistedCommitError &&
        error.code === 'selection-changed'
    )
    assert.strictEqual(await tip(repository), original)
    assert.deepStrictEqual(
      await readFile(await indexPath(repository)),
      originalIndex
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'b')),
      Buffer.from('FILTER CURRENT B\n')
    )
  })
  it('preserves indexed attributes fallback when an unselected .gitattributes deletion is missing on disk', async t => {
    const base = Array.from({ length: 12 }, (_, index) => `line ${index + 1}\n`)
    const repository = await seed(t, {
      '.gitattributes': '*.txt text eol=lf\n',
      'file.txt': base.join(''),
    })
    await unlink(join(repository.path, '.gitattributes'))
    const changed = [...base]
    changed[1] = 'SELECTED\n'
    changed[10] = 'UNSELECTED\n'
    await writeFile(
      join(repository.path, 'file.txt'),
      changed.join('').replace(/\n/g, '\r\n')
    )
    const input = await request(repository, ['file.txt'])
    const file = input.files[0]
    const diff = await getWorkingDirectoryDiff(repository, file)
    assert.ok(diff.kind === DiffType.Text)
    const selection = DiffSelection.fromInitialSelection(
      DiffSelectionType.None
    ).withRangeSelection(
      diff.hunks[0].unifiedDiffStart,
      diff.hunks[0].lines.length,
      true
    )
    const result = await single(repository, {
      ...input,
      files: [file.withSelection(selection)],
    })
    const expected = [...base]
    expected[1] = 'SELECTED\n'
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'file.txt'),
      Buffer.from(expected.join(''))
    )
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], '.gitattributes'),
      Buffer.from('*.txt text eol=lf\n')
    )
    assert.strictEqual(
      await optionalBytes(join(repository.path, '.gitattributes')),
      null
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'file.txt')),
      Buffer.from(changed.join('').replace(/\n/g, '\r\n'))
    )
    finalizeAssistedCommitTransaction(result)
  })

  it('rejects partial selection indices from default textconv', async t => {
    const repository = await seed(t, { anchor: 'anchor\n' })
    await rawGit(repository, ['config', 'diff.default.textconv', 'sed 1d'])
    await writeFile(
      join(repository.path, 'new'),
      'UNSELECTED HEADER\nSELECTED\nUNSELECTED TAIL\n'
    )
    const input = await request(repository, ['new'])
    const selection = DiffSelection.fromInitialSelection(
      DiffSelectionType.None
    ).withLineSelection(1, true)
    await assert.rejects(
      withAssistedCommitSnapshot(
        repository,
        {
          ...input,
          files: input.files.map(file => file.withSelection(selection)),
        },
        async () => {}
      ),
      error =>
        error instanceof AssistedCommitError &&
        error.code === 'unsafe-selection'
    )
    assert.strictEqual(await count(repository), 1)
  })
  it('rejects a missing named diff driver that falls back to default textconv', async t => {
    const repository = await seed(t, {
      anchor: 'anchor\n',
      '.gitattributes': 'new diff=missing-driver\n',
    })
    await rawGit(repository, ['config', 'diff.default.textconv', 'sed 1d'])
    await writeFile(
      join(repository.path, 'new'),
      'UNSELECTED HEADER\nSELECTED\nUNSELECTED TAIL\n'
    )
    const input = await request(repository, ['new'])
    const selection = DiffSelection.fromInitialSelection(
      DiffSelectionType.None
    ).withLineSelection(1, true)
    await assert.rejects(
      withAssistedCommitSnapshot(
        repository,
        {
          ...input,
          files: input.files.map(file => file.withSelection(selection)),
        },
        async () => {}
      ),
      error =>
        error instanceof AssistedCommitError &&
        error.code === 'unsafe-selection'
    )
    assert.strictEqual(await count(repository), 1)
  })
  it('rejects partial capture when index-aware CRLF conversion has a different diff identity', async t => {
    const repository = await setupEmptyRepository(t)
    await rawGit(repository, ['config', 'core.autocrlf', 'false'])
    const base = Array.from(
      { length: 65 },
      (_, index) => `line ${index + 1}\r\n`
    )
    await writeFile(join(repository.path, 'file.txt'), base.join(''))
    await rawGit(repository, ['add', '--', 'file.txt'])
    await rawGit(repository, ['commit', '-m', 'Original CRLF'])
    const original = await tip(repository)
    await rawGit(repository, ['config', 'core.autocrlf', 'true'])
    const changed = [...base]
    changed[1] = 'SELECTED\r\n'
    changed[10] = 'UNSELECTED\r\n'
    await writeFile(join(repository.path, 'file.txt'), changed.join(''))
    const input = await request(repository, ['file.txt'])
    const diff = await getWorkingDirectoryDiff(repository, input.files[0])
    assert.ok(diff.kind === DiffType.Text)
    const selection = DiffSelection.fromInitialSelection(
      DiffSelectionType.None
    ).withRangeSelection(
      diff.hunks[0].unifiedDiffStart,
      diff.hunks[0].lines.length,
      true
    )
    await assert.rejects(
      withAssistedCommitSnapshot(
        repository,
        {
          ...input,
          files: [input.files[0].withSelection(selection)],
        },
        async () => {}
      ),
      error =>
        error instanceof AssistedCommitError &&
        error.code === 'unsafe-selection'
    )
    assert.strictEqual(await tip(repository), original)
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'file.txt')),
      Buffer.from(changed.join(''))
    )
  })
  for (const driver of ['set', 'unset', 'unspecified']) {
    it(`rejects literal sentinel-named textconv driver ${driver}`, async t => {
      const repository = await seed(t, {
        '.gitattributes': `new diff=${driver}\n`,
        anchor: 'anchor\n',
      })
      await rawGit(repository, ['config', `diff.${driver}.textconv`, 'sed 1d'])
      await writeFile(
        join(repository.path, 'new'),
        'UNSELECTED HEADER\nSELECTED\nTAIL\n'
      )
      const input = await request(repository, ['new'])
      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      ).withLineSelection(1, true)
      await assert.rejects(
        withAssistedCommitSnapshot(
          repository,
          {
            ...input,
            files: [input.files[0].withSelection(selection)],
          },
          async () => {}
        ),
        error =>
          error instanceof AssistedCommitError &&
          error.code === 'unsafe-selection'
      )
    })
  }
  it('rejects unconfigured literal diff=unset when default textconv applies', async t => {
    const repository = await seed(t, {
      '.gitattributes': 'new diff=unset\n',
      anchor: 'anchor\n',
    })
    await rawGit(repository, ['config', 'diff.default.textconv', 'sed 1d'])
    await writeFile(
      join(repository.path, 'new'),
      'UNSELECTED HEADER\nSELECTED\nTAIL\n'
    )
    const input = await request(repository, ['new'])
    const selection = DiffSelection.fromInitialSelection(
      DiffSelectionType.None
    ).withLineSelection(1, true)
    await assert.rejects(
      withAssistedCommitSnapshot(
        repository,
        {
          ...input,
          files: [input.files[0].withSelection(selection)],
        },
        async () => {}
      ),
      error =>
        error instanceof AssistedCommitError &&
        error.code === 'unsafe-selection'
    )
  })
  it('rejects stale addition-only partial indices when an index-only deletion was restored before capture', async t => {
    const repository = await seed(t, { file: 'one\ntwo\nthree\n' })
    await rawGit(repository, ['rm', '--cached', '--', 'file'])
    await writeFile(join(repository.path, 'file'), 'one\nSELECTED\nthree\n')
    const input = await request(repository, ['file'])
    const selected = input.files.find(
      file =>
        file.status.kind === AppFileStatusKind.Untracked ||
        file.status.kind === AppFileStatusKind.New
    )
    assert.ok(selected)
    const selection = DiffSelection.fromInitialSelection(
      DiffSelectionType.None
    ).withLineSelection(2, true)
    await rawGit(repository, ['reset', 'HEAD', '--', 'file'])
    await assert.rejects(
      withAssistedCommitSnapshot(
        repository,
        {
          ...input,
          files: [selected.withSelection(selection)],
        },
        async () => {}
      ),
      error =>
        error instanceof AssistedCommitError &&
        error.code === 'unsafe-selection'
    )
    assert.strictEqual(await count(repository), 1)
  })
  it('preserves native indexed CRLF conversion for complete file selection', async t => {
    const repository = await setupEmptyRepository(t)
    await rawGit(repository, ['config', 'core.autocrlf', 'false'])
    await writeFile(join(repository.path, 'file'), 'one\r\ntwo\r\nthree\r\n')
    await rawGit(repository, ['add', '--', 'file'])
    await rawGit(repository, ['commit', '-m', 'Original CRLF'])
    await rawGit(repository, ['config', 'core.autocrlf', 'true'])
    await writeFile(
      join(repository.path, 'file'),
      'one\r\nSELECTED\r\nthree\r\n'
    )
    const result = await single(repository, await request(repository, ['file']))
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'file'),
      Buffer.from('one\r\nSELECTED\r\nthree\r\n')
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'file')),
      Buffer.from('one\r\nSELECTED\r\nthree\r\n')
    )
    finalizeAssistedCommitTransaction(result)
  })
  it('rejects selected content mutated and restored between full capture filters', async t => {
    const repository = await seed(t, {
      a: 'a\n',
      b: 'b\n',
      c: 'c\n',
      '.gitattributes': 'a filter=change\nc filter=restore\n',
    })
    const original = await tip(repository)
    await writeFile(join(repository.path, 'a'), 'SELECTED A\n')
    await writeFile(join(repository.path, 'b'), 'SELECTED B\n')
    await writeFile(join(repository.path, 'c'), 'SELECTED C\n')
    const input = await request(repository, ['a', 'b', 'c'])
    const captureIndex = await readFile(await indexPath(repository))
    await rawGit(repository, [
      'config',
      'filter.change.clean',
      'cat; sleep 0.02; printf "TRANSIENT UNSELECTED B\\n" > b',
    ])
    await rawGit(repository, [
      'config',
      'filter.restore.clean',
      'cat; sleep 0.02; printf "SELECTED B\\n" > b',
    ])
    await assert.rejects(
      withAssistedCommitSnapshot(repository, input, async () => {
        assert.fail('An inconsistent snapshot must not reach the planner')
      }),
      error =>
        error instanceof AssistedCommitError &&
        error.code === 'selection-changed'
    )
    assert.strictEqual(await tip(repository), original)
    assert.strictEqual(await count(repository), 1)
    assert.deepStrictEqual(
      await readFile(await indexPath(repository)),
      captureIndex
    )
    assert.strictEqual(
      await rawGit(repository, ['write-tree']),
      await rawGit(repository, ['rev-parse', 'HEAD^{tree}'])
    )
    for (const path of ['a', 'b', 'c']) {
      assert.deepStrictEqual(
        await readFile(join(repository.path, path)),
        Buffer.from(`SELECTED ${path.toUpperCase()}\n`)
      )
    }
  })
  it('freezes native full-file conversion configuration before filters change live policy', async t => {
    const repository = await seed(t, {
      a: 'original\n',
      '.gitattributes': 'a filter=policy\n',
    })
    await rawGit(repository, ['config', 'core.autocrlf', 'false'])
    await writeFile(join(repository.path, 'a'), 'SELECTED A\r\n')
    const input = await request(repository, ['a'])
    const configPath = await rawGit(repository, [
      'rev-parse',
      '--path-format=absolute',
      '--git-path',
      'config',
    ])
    await rawGit(repository, [
      'config',
      'filter.policy.clean',
      `cat; printf '\\n[core]\\n\\tautocrlf = true\\n' >> ${JSON.stringify(
        configPath
      )}`,
    ])
    const result = await single(repository, input)
    assert.strictEqual(result.commits.length, 1)
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(await tip(repository), result.commits[0])
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'a'),
      Buffer.from('SELECTED A\r\n')
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'a')),
      Buffer.from('SELECTED A\r\n')
    )
    assert.strictEqual(
      await rawGit(repository, ['config', '--get', 'core.autocrlf']),
      'true'
    )
    finalizeAssistedCommitTransaction(result)
  })
  it('uses stable internal patch prefixes despite diff.noprefix=true', async t => {
    const repository = await seed(t, { 'dir/file': 'old\n' })
    await rawGit(repository, ['config', 'diff.noprefix', 'true'])
    await writeFile(join(repository.path, 'dir/file'), 'selected\n')
    const result = await single(repository, await request(repository))
    assert.strictEqual(result.commits.length, 1)
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(await tip(repository), result.commits[0])
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'dir/file'),
      Buffer.from('selected\n')
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'dir/file')),
      Buffer.from('selected\n')
    )
    assert.strictEqual(await rawGit(repository, ['write-tree']), result.tree)
    finalizeAssistedCommitTransaction(result)
  })
  it('freezes global attributes before clean filters mutate their live source', async t => {
    const repository = await seed(t, {
      'a.txt': 'original\n',
      '.gitattributes': 'a.txt filter=attributes\n',
    })
    const attributes = join(await createTempDirectory(t), 'global-attributes')
    await writeFile(attributes, '*.txt -text\n')
    await rawGit(repository, ['config', 'core.attributesFile', attributes])
    await writeFile(join(repository.path, 'a.txt'), 'SELECTED\r\n')
    const input = await request(repository, ['a.txt'])
    await rawGit(repository, [
      'config',
      'filter.attributes.clean',
      `cat; printf '*.txt text eol=lf\\n' > ${JSON.stringify(attributes)}`,
    ])
    const result = await single(repository, input)
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(await tip(repository), result.commits[0])
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'a.txt'),
      Buffer.from('SELECTED\r\n')
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'a.txt')),
      Buffer.from('SELECTED\r\n')
    )
    assert.deepStrictEqual(
      await readFile(attributes),
      Buffer.from('*.txt text eol=lf\n')
    )
    finalizeAssistedCommitTransaction(result)
  })
  it('resolves relative global attribute paths against the original worktree', async t => {
    const repository = await seed(t, { 'a.txt': 'original\n' })
    await writeFile(join(repository.path, 'global-attributes'), '*.txt -text\n')
    await rawGit(repository, [
      'config',
      'core.attributesFile',
      'global-attributes',
    ])
    await writeFile(join(repository.path, 'a.txt'), 'SELECTED\r\n')
    const result = await single(
      repository,
      await request(repository, ['a.txt'])
    )
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'a.txt'),
      Buffer.from('SELECTED\r\n')
    )
    assert.strictEqual(
      await commitBytes(repository, result.commits[0], 'global-attributes'),
      null
    )
    finalizeAssistedCommitTransaction(result)
  })
  it('captures the implicit global attribute source once into private metadata', async t => {
    const repository = await seed(t, { 'a.txt': 'original\n' })
    const attributes = await rawGit(repository, ['var', 'GIT_ATTR_GLOBAL'])
    assert.ok(attributes.length > 0)
    const matchesAttributes = await createPathMatcher(attributes)
    await writeFile(join(repository.path, 'a.txt'), 'SELECTED\r\n')
    const input = await request(repository, ['a.txt'])
    const originalRead = FileSystem.readFile
    let reads = 0
    t.mock.method(
      FileSystem,
      'readFile',
      async (...args: Parameters<typeof FileSystem.readFile>) => {
        if (await matchesAttributes(args[0])) {
          reads++
          return Buffer.from(
            reads === 1 ? '*.txt -text\n' : '*.txt text eol=lf\n'
          )
        }
        return originalRead(...args)
      }
    )
    const result = await single(repository, input)
    assert.strictEqual(reads, 1)
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'a.txt'),
      Buffer.from('SELECTED\r\n')
    )
    finalizeAssistedCommitTransaction(result)
  })
  it('captures complete interior edits independently of diff.context=0', async t => {
    const repository = await seed(t, { file: 'one\ntwo\nthree\n' })
    await rawGit(repository, ['config', 'diff.context', '0'])
    await writeFile(join(repository.path, 'file'), 'one\nSELECTED\nthree\n')
    const result = await single(repository, await request(repository))
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(await tip(repository), result.commits[0])
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'file'),
      Buffer.from('one\nSELECTED\nthree\n')
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'file')),
      Buffer.from('one\nSELECTED\nthree\n')
    )
    finalizeAssistedCommitTransaction(result)
  })
  it('rejects a partial CRLF conversion even when native and frozen hunk shapes match', async t => {
    const repository = await setupEmptyRepository(t)
    await rawGit(repository, ['config', 'core.autocrlf', 'false'])
    await writeFile(join(repository.path, 'file'), 'old\r\n')
    await rawGit(repository, ['add', '--', 'file'])
    await rawGit(repository, ['commit', '-m', 'Original indexed CRLF'])
    const original = await tip(repository)
    await rawGit(repository, ['config', 'core.autocrlf', 'true'])
    await writeFile(join(repository.path, 'file'), 'SELECTED\r\nUNSELECTED\r\n')
    const input = await request(repository, ['file'])
    const diff = await getWorkingDirectoryDiff(repository, input.files[0])
    assert.ok(diff.kind === DiffType.Text)
    assert.strictEqual(diff.hunks.length, 1)
    assert.strictEqual(diff.hunks[0].lines[1].type, DiffLineType.Delete)
    assert.strictEqual(diff.hunks[0].lines[2].text, '+SELECTED\r')
    const selection = DiffSelection.fromInitialSelection(
      DiffSelectionType.None
    ).withRangeSelection(1, 2, true)
    const originalIndex = await readFile(await indexPath(repository))
    await assert.rejects(
      withAssistedCommitSnapshot(
        repository,
        {
          ...input,
          files: [input.files[0].withSelection(selection)],
        },
        async () => {}
      ),
      error =>
        error instanceof AssistedCommitError &&
        error.code === 'unsafe-selection'
    )
    assert.strictEqual(await tip(repository), original)
    assert.strictEqual(await count(repository), 1)
    assert.deepStrictEqual(
      await readFile(await indexPath(repository)),
      originalIndex
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'file')),
      Buffer.from('SELECTED\r\nUNSELECTED\r\n')
    )
  })
  it('freezes inherited attribute source without remapping selected hunk indices', async t => {
    const childPath = process.env.DESKTOP_ASSISTED_ATTRIBUTE_TEST_REPOSITORY
    if (childPath !== undefined) {
      const repository = new Repository(childPath, -1, null, false)
      const input = await request(repository, ['file.txt'])
      const diff = await getWorkingDirectoryDiff(repository, input.files[0])
      assert.ok(diff.kind === DiffType.Text)
      assert.strictEqual(diff.hunks.length, 2)
      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      ).withRangeSelection(
        diff.hunks[0].unifiedDiffStart,
        diff.hunks[0].lines.length,
        true
      )
      const result = await single(repository, {
        ...input,
        files: [input.files[0].withSelection(selection)],
      })
      finalizeAssistedCommitTransaction(result)
      return
    }
    const base = Array.from({ length: 12 }, (_, index) => `line ${index + 1}\n`)
    const repository = await seed(t, {
      'file.txt': base.join(''),
      '.gitattributes': '*.txt text eol=lf\n',
    })
    const original = await tip(repository)
    await writeFile(join(repository.path, '.gitattributes'), '*.txt -text\n')
    const changed = [...base]
    changed[1] = 'SELECTED\n'
    changed[10] = 'UNSELECTED\n'
    const current = changed.join('').replace(/\n/g, '\r\n')
    await writeFile(join(repository.path, 'file.txt'), current)
    const child = await promisify(execFile)(
      process.execPath,
      [
        'script/test.mjs',
        'app/test/unit/git/assisted-commit-conversion-test.ts',
        '--test-name-pattern=freezes inherited attribute source without remapping',
      ],
      {
        env: {
          ...process.env,
          NODE_TEST_CONTEXT: undefined,
          GIT_ATTR_SOURCE: 'HEAD',
          DESKTOP_ASSISTED_ATTRIBUTE_TEST_REPOSITORY: repository.path,
        },
        timeout: 60_000,
      }
    )
    assert.match(child.stdout, /tests 1\b/)
    const expected = [...base]
    expected[1] = 'SELECTED\n'
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(
      await rawGit(repository, ['rev-parse', 'HEAD^']),
      original
    )
    assert.deepStrictEqual(
      await commitBytes(repository, await tip(repository), 'file.txt'),
      Buffer.from(expected.join(''))
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'file.txt')),
      Buffer.from(current)
    )
    assert.deepStrictEqual(
      await commitBytes(repository, await tip(repository), '.gitattributes'),
      Buffer.from('*.txt text eol=lf\n')
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, '.gitattributes')),
      Buffer.from('*.txt -text\n')
    )
  })
  it('normalizes suppressed blank context for internal full-selection diffs', async t => {
    const repository = await seed(t, { file: 'one\n\nthree\n\nfive\n' })
    await rawGit(repository, ['config', 'diff.suppressBlankEmpty', 'true'])
    await writeFile(join(repository.path, 'file'), 'one\n\nSELECTED\n\nfive\n')
    const result = await single(repository, await request(repository, ['file']))
    assert.strictEqual(await count(repository), 2)
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'file'),
      Buffer.from('one\n\nSELECTED\n\nfive\n')
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'file')),
      Buffer.from('one\n\nSELECTED\n\nfive\n')
    )
    finalizeAssistedCommitTransaction(result)
  })
  it('never captures transient alternate content when selected path ancestors are swapped and restored', async t => {
    const repository = await seed(t, {
      a: 'a\n',
      'dir/b': 'original b\n',
      z: 'z\n',
      '.gitattributes': 'a filter=swap\nz filter=restore\n',
    })
    await writeFile(join(repository.path, 'a'), 'SELECTED A\n')
    await writeFile(join(repository.path, 'dir/b'), 'SELECTED B\n')
    await writeFile(join(repository.path, 'z'), 'SELECTED Z\n')
    await mkdir(join(repository.path, 'alternate'))
    await writeFile(
      join(repository.path, 'alternate/b'),
      'TRANSIENT UNSELECTED B\n'
    )
    const input = await request(repository, ['a', 'dir/b', 'z'])
    const original = await tip(repository)
    const childState = await lstat(join(repository.path, 'dir/b'))
    await rawGit(repository, [
      'config',
      'filter.swap.clean',
      'cat; if test ! -d original-dir; then mv dir original-dir; mv alternate dir; fi',
    ])
    await rawGit(repository, [
      'config',
      'filter.restore.clean',
      'cat; if test -d original-dir; then mv dir alternate; mv original-dir dir; fi',
    ])
    const result = await single(repository, input)
    const current = await lstat(join(repository.path, 'dir/b'))
    assert.deepStrictEqual(
      [
        current.dev,
        current.ino,
        current.mode,
        current.mtimeMs,
        current.ctimeMs,
      ],
      [
        childState.dev,
        childState.ino,
        childState.mode,
        childState.mtimeMs,
        childState.ctimeMs,
      ]
    )
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(
      await rawGit(repository, ['rev-parse', 'HEAD^']),
      original
    )
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'dir/b'),
      Buffer.from('SELECTED B\n')
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'dir/b')),
      Buffer.from('SELECTED B\n')
    )
    assert.strictEqual(
      await commitBytes(repository, result.commits[0], 'alternate/b'),
      null
    )
    finalizeAssistedCommitTransaction(result)
  })
  it('preserves relative clean-filter command cwd, worktree and quoted path arguments for frozen input conversion', async t => {
    const path = "file ' spaced.txt"
    const repository = await seed(t, {
      [path]: 'original\n',
      '.gitattributes': '*.txt filter=context\n',
      'context-marker': 'original root\n',
      'filter.sh': [
        '#!/bin/sh',
        'set -eu',
        'if ! test . -ef "$GIT_WORK_TREE"; then echo "filter cwd/worktree identity mismatch" >&2; exit 1; fi',
        'test -f context-marker',
        'test "$1" = "file \' spaced.txt"',
        'cat',
        '',
      ].join('\n'),
    })
    await writeFile(join(repository.path, path), 'SELECTED\n')
    const input = await request(repository, [path])
    await rawGit(repository, [
      'config',
      'filter.context.clean',
      'sh filter.sh %f',
    ])
    await rawGit(repository, ['config', 'filter.context.required', 'true'])
    const alias = join(await createTempDirectory(t), 'worktree-alias')
    await symlink(
      await realpath(repository.path),
      alias,
      process.platform === 'win32' ? 'junction' : 'dir'
    )
    const args = [
      '-c',
      'filter.context.clean=GIT_WORK_TREE="$DESKTOP_TEST_FILTER_ROOT" sh filter.sh %f',
      'hash-object',
      '--stdin',
      `--path=${path}`,
    ]
    const matching = await exec(args, repository.path, {
      stdin: 'SELECTED\n',
      env: { DESKTOP_TEST_FILTER_ROOT: alias },
    })
    assert.strictEqual(matching.exitCode, 0, matching.stderr)
    const wrongRoot = await exec(args, repository.path, {
      stdin: 'SELECTED\n',
      env: { DESKTOP_TEST_FILTER_ROOT: await createTempDirectory(t) },
    })
    assert.notStrictEqual(wrongRoot.exitCode, 0)
    assert.match(wrongRoot.stderr, /filter cwd\/worktree identity mismatch/)
    const result = await single(repository, input)
    assert.strictEqual(await count(repository), 2)
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], path),
      Buffer.from('SELECTED\n')
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, path)),
      Buffer.from('SELECTED\n')
    )
    finalizeAssistedCommitTransaction(result)
  })
  it('preserves persistent process-filter protocol and original root context for frozen input conversion', async t => {
    const script = [
      FilterDirectoryIdentityCheck,
      'function read(size) {',
      '  const bytes = Buffer.alloc(size)',
      '  let position = 0',
      '  while (position < size) {',
      '    const count = fs.readSync(0, bytes, position, size - position)',
      '    if (count === 0) return undefined',
      '    position += count',
      '  }',
      '  return bytes',
      '}',
      'function packet() {',
      '  const header = read(4)',
      '  if (header === undefined) return undefined',
      '  const size = parseInt(header.toString(), 16)',
      '  return size === 0 ? null : read(size - 4)',
      '}',
      'function list() {',
      '  const packets = []',
      '  for (;;) {',
      '    const value = packet()',
      '    if (value === undefined) return undefined',
      '    if (value === null) return Buffer.concat(packets)',
      '    packets.push(value)',
      '  }',
      '}',
      'function send(value) {',
      '  const bytes = Buffer.from(value)',
      "  fs.writeSync(1, (bytes.length + 4).toString(16).padStart(4, '0'))",
      '  fs.writeSync(1, bytes)',
      '}',
      "function flush() { fs.writeSync(1, '0000') }",
      'list()',
      "send('git-filter-server\\n'); send('version=2\\n'); flush()",
      'list()',
      "send('capability=clean\\n'); send('capability=smudge\\n'); flush()",
      'while (list() !== undefined) {',
      '  const content = list()',
      "  send('status=success\\n'); flush()",
      '  if (content.length > 0) send(content)',
      '  flush(); flush()',
      '}',
      '',
    ].join('\n')
    const repository = await seed(t, {
      file: 'original\n',
      '.gitattributes': 'file filter=context\n',
      'context-marker': 'original root\n',
      'process-filter.cjs': script,
    })
    await writeFile(join(repository.path, 'file'), 'SELECTED\n')
    const input = await request(repository, ['file'])
    await rawGit(repository, [
      'config',
      'filter.context.process',
      `${JSON.stringify(process.execPath)} process-filter.cjs`,
    ])
    await rawGit(repository, ['config', 'filter.context.required', 'true'])
    const result = await single(repository, input)
    assert.strictEqual(await count(repository), 2)
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'file'),
      Buffer.from('SELECTED\n')
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'file')),
      Buffer.from('SELECTED\n')
    )
    finalizeAssistedCommitTransaction(result)
  })
  it('accepts physical directory aliases but rejects another process-filter worktree', async t => {
    const directory = await createTempDirectory(t)
    const script = join(directory, 'identity.cjs')
    await writeFile(script, FilterDirectoryIdentityCheck)
    await writeFile(join(directory, 'context-marker'), 'original root')
    const alias = join(await createTempDirectory(t), 'worktree-alias')
    await symlink(
      await realpath(directory),
      alias,
      process.platform === 'win32' ? 'junction' : 'dir'
    )
    await promisify(execFile)(process.execPath, [script], {
      cwd: directory,
      env: { ...process.env, GIT_WORK_TREE: alias },
    })
    await assert.rejects(
      promisify(execFile)(process.execPath, [script], {
        cwd: directory,
        env: { ...process.env, GIT_WORK_TREE: await createTempDirectory(t) },
      }),
      /AssertionError/
    )
  })
  it('does not resolve an unselected relative orderfile from the private conversion worktree', async t => {
    const repository = await seed(t, {
      file: 'original\n',
      '.git-order': 'file\n',
    })
    await rawGit(repository, ['config', 'diff.orderFile', '.git-order'])
    await writeFile(join(repository.path, 'file'), 'SELECTED\n')
    await writeFile(join(repository.path, '.git-order'), 'unselected\nfile\n')
    const nativeDiff = await rawGit(repository, [
      'diff',
      '--no-ext-diff',
      'HEAD',
      '--',
      'file',
    ])
    assert.match(nativeDiff, /\+SELECTED/)
    const result = await single(repository, await request(repository, ['file']))
    assert.strictEqual(await count(repository), 2)
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'file'),
      Buffer.from('SELECTED\n')
    )
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], '.git-order'),
      Buffer.from('file\n')
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, '.git-order')),
      Buffer.from('unselected\nfile\n')
    )
    finalizeAssistedCommitTransaction(result)
  })
})
