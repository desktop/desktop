import assert from 'node:assert'
import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { pathToFileURL } from 'url'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { exec, IGitResult } from 'dugite'
import { promises as FileSystem } from 'fs'
import {
  chmod,
  cp,
  lstat,
  mkdir,
  readFile,
  realpath,
  symlink,
  unlink,
  writeFile,
} from 'fs/promises'
import { basename, dirname, join } from 'path'
import {
  AssistedCommitError,
  captureAssistedCommitSnapshot,
  createSingleAssistedCommitPlan,
  disposeAssistedCommitSnapshot,
  executeAssistedCommitPlan,
  finalizeAssistedCommitTransaction,
  rollbackAssistedCommitTransaction,
  validateAssistedCommitPlan,
  withAssistedCommitSnapshot,
} from '../../../src/lib/git/assisted-commit'
import { getSnapshotData } from '../../../src/lib/git/assisted-commit/state'
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
  splitPlan,
  tip,
  writeHook,
} from '../../helpers/assisted-commit'
import {
  updateRefWithVerification,
  withRefLock,
} from '../../../src/lib/git/update-ref'

const FilterDirectoryIdentityCheck = [
  "const assert = require('node:assert/strict')",
  "const fs = require('node:fs')",
  'const cwd = fs.statSync(process.cwd(), { bigint: true })',
  'const worktree = fs.statSync(process.env.GIT_WORK_TREE, { bigint: true })',
  'assert.equal(cwd.dev, worktree.dev)',
  'assert.equal(cwd.ino, worktree.ino)',
  "assert.ok(fs.existsSync('context-marker'))",
].join('\n')

describe('git/assisted-commit', () => {
  beforeEach(() => setHooksEnvEnabled(false))
  afterEach(() => localStorage.removeItem('git-hooks-env-enabled'))

  it('matches only the exact physical fault target across aliases and missing suffixes', async t => {
    const directory = await createTempDirectory(t)
    const alias = join(await createTempDirectory(t), 'directory-alias')
    const other = await createTempDirectory(t)
    await symlink(
      await realpath(directory),
      alias,
      process.platform === 'win32' ? 'junction' : 'dir'
    )
    await writeFile(join(directory, 'existing'), 'owned')
    for (const name of ['existing', 'index.lock', 'missing/attributes']) {
      const target = join(directory, name)
      const matches = await createPathMatcher(target)
      assert.ok(await matches(join(alias, name)))
      assert.ok(await matches(join(alias, name).replace(/\\/g, '/')))
      assert.ok(await matches(Buffer.from(target)))
      assert.ok(await matches(pathToFileURL(target)))
      assert.ok(!(await matches(join(other, name))))
      assert.ok(!(await matches(join(directory, `${name}.unrelated`))))
      assert.ok(!(await matches({ path: target })))
      if (process.platform === 'win32' && name === 'existing') {
        assert.ok(await matches(target.toUpperCase()))
      }
    }
  })

  it('commits a cohesive frozen selection and leaves unselected bytes and HEAD content alone', async t => {
    const repository = await seed(t, { selected: 'old\n', other: 'original\n' })
    const original = await tip(repository)
    await writeFile(join(repository.path, 'selected'), 'selected change\n')
    await writeFile(join(repository.path, 'other'), 'unselected change\n')
    const input = await request(repository, ['selected'])
    const result = await single(repository, input)
    assert.strictEqual(result.commits.length, 1)
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(await tip(repository), result.commits[0])
    assert.strictEqual(
      await rawGit(repository, ['rev-parse', 'HEAD^']),
      original
    )
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'selected'),
      Buffer.from('selected change\n')
    )
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'other'),
      Buffer.from('original\n')
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'other')),
      Buffer.from('unselected change\n')
    )
    assert.strictEqual(await rawGit(repository, ['write-tree']), result.tree)
    assert.throws(() => getSnapshotData(result.snapshot), /disposed/)
  })

  it('materializes every tree before committing separable files', async t => {
    const repository = await seed(t, { a: 'a\n', b: 'b\n' })
    await writeFile(join(repository.path, 'a'), 'new a\n')
    await writeFile(join(repository.path, 'b'), 'new b\n')
    const input = await request(repository)
    await withAssistedCommitSnapshot(repository, input, async snapshot => {
      const originalIndex = await readFile(await indexPath(repository))
      const checked = await validateAssistedCommitPlan(
        snapshot,
        splitPlan(snapshot)
      )
      assert.strictEqual(await count(repository), 1)
      assert.deepStrictEqual(
        await readFile(await indexPath(repository)),
        originalIndex
      )
      assert.strictEqual(checked.trees.length, 2)
      assert.strictEqual(checked.trees[1], snapshot.selectedTree)
      const result = await executeAssistedCommitPlan(snapshot, checked)
      assert.strictEqual(await count(repository), 3)
      for (const [index, sha] of result.commits.entries()) {
        assert.strictEqual(
          await rawGit(repository, ['rev-parse', `${sha}^{tree}`]),
          checked.trees[index]
        )
      }
      assert.deepStrictEqual(
        await commitBytes(repository, result.commits[0], 'a'),
        Buffer.from('new a\n')
      )
      assert.deepStrictEqual(
        await commitBytes(repository, result.commits[0], 'b'),
        Buffer.from('b\n')
      )
    })
  })

  for (const reverse of [false, true]) {
    it(`splits same-file hunks with insertion/deletion offsets in ${
      reverse ? 'reversed' : 'original'
    } order`, async t => {
      const base = Array.from({ length: 60 }, (_, i) => `line ${i + 1}\n`)
      const repository = await seed(t, { file: base.join('') })
      const changed = [
        'inserted at start\n',
        ...base.slice(0, 20),
        ...base.slice(23, 50),
        'replacement near end\n',
        ...base.slice(51),
      ].join('')
      await writeFile(join(repository.path, 'file'), changed)
      const input = await request(repository)
      await withAssistedCommitSnapshot(repository, input, async snapshot => {
        assert.strictEqual(snapshot.analysis.changes.length, 3)
        assert.ok(snapshot.analysis.changes.every(c => c.kind === 'text-hunk'))
        const checked = await validateAssistedCommitPlan(
          snapshot,
          splitPlan(snapshot, reverse)
        )
        const result = await executeAssistedCommitPlan(snapshot, checked)
        assert.strictEqual(await count(repository), 4)
        assert.deepStrictEqual(
          await commitBytes(repository, result.commits[2], 'file'),
          Buffer.from(changed)
        )
        assert.deepStrictEqual(
          await readFile(join(repository.path, 'file')),
          Buffer.from(changed)
        )
        const first = await commitBytes(repository, result.commits[0], 'file')
        assert.deepStrictEqual(
          first,
          Buffer.from(
            reverse
              ? [
                  ...base.slice(0, 50),
                  'replacement near end\n',
                  ...base.slice(51),
                ].join('')
              : `inserted at start\n${base.join('')}`
          )
        )
        assert.strictEqual(
          await rawGit(repository, ['write-tree']),
          snapshot.selectedTree
        )
      })
    })
  }

  it('freezes partial selected lines without exposing or committing unselected changed lines', async t => {
    const base = Array.from({ length: 40 }, (_, i) => `line ${i + 1}\n`)
    const repository = await seed(t, {
      file: base.join(''),
      full: 'old full\n',
      other: 'other\n',
    })
    const changed = [...base]
    changed[1] = 'selected first\n'
    changed[30] = 'UNSELECTED SECRET\n'
    await writeFile(join(repository.path, 'file'), changed.join(''))
    await writeFile(join(repository.path, 'full'), 'selected full\n')
    await writeFile(join(repository.path, 'other'), 'unselected other\n')
    const input = await request(repository, ['file', 'full'])
    const file = input.files.find(f => f.path === 'file')
    assert.ok(file)
    const diff = await getWorkingDirectoryDiff(repository, file)
    assert.strictEqual(diff.kind, DiffType.Text)
    if (diff.kind !== DiffType.Text) {
      throw new Error('Expected a text diff')
    }
    const selection = DiffSelection.fromInitialSelection(
      DiffSelectionType.None
    ).withRangeSelection(
      diff.hunks[0].unifiedDiffStart,
      diff.hunks[0].lines.length,
      true
    )
    const files = input.files.map(f =>
      f.path === 'file' ? f.withSelection(selection) : f
    )
    await withAssistedCommitSnapshot(
      repository,
      { ...input, files },
      async snapshot => {
        assert.ok(
          snapshot.analysis.changes.every(
            c => !c.diff.includes('UNSELECTED SECRET')
          )
        )
        assert.strictEqual(snapshot.analysis.changes.length, 2)
        const checked = await validateAssistedCommitPlan(
          snapshot,
          splitPlan(snapshot, true)
        )
        const result = await executeAssistedCommitPlan(snapshot, checked)
        const expected = [...base]
        expected[1] = 'selected first\n'
        assert.deepStrictEqual(
          await commitBytes(repository, result.commits[1], 'file'),
          Buffer.from(expected.join(''))
        )
        assert.deepStrictEqual(
          await readFile(join(repository.path, 'file')),
          Buffer.from(changed.join(''))
        )
        assert.deepStrictEqual(
          await commitBytes(repository, result.commits[1], 'other'),
          Buffer.from('other\n')
        )
        assert.strictEqual(
          snapshot.originalSelection
            .find(f => f.path === 'file')
            ?.selection.getSelectionType(),
          DiffSelectionType.Partial
        )
      }
    )
  })

  it('captures selected additions from a new file and selected deletions from a removed file', async t => {
    const repository = await seed(t, { deleted: 'one\ntwo\nthree\n' })
    await unlink(join(repository.path, 'deleted'))
    await writeFile(join(repository.path, 'new'), 'first\nsecond\nthird\n')
    const input = await request(repository)
    const files = input.files.map(file => {
      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      ).withLineSelection(file.path === 'new' ? 1 : 2, true)
      return file.withSelection(selection)
    })
    const result = await single(repository, { ...input, files })
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'new'),
      Buffer.from('first\n')
    )
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'deleted'),
      Buffer.from('one\nthree\n')
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'new')),
      Buffer.from('first\nsecond\nthird\n')
    )
    assert.strictEqual(
      await optionalBytes(join(repository.path, 'deleted')),
      null
    )
  })

  it('captures binary, empty new file, full deletion and rename atomically', async t => {
    const repository = await seed(t, {
      binary: Buffer.from([0, 1, 2]),
      removed: 'remove\n',
      old: 'rename\n',
    })
    await writeFile(join(repository.path, 'binary'), Buffer.from([0, 3, 4]))
    await unlink(join(repository.path, 'removed'))
    await writeFile(join(repository.path, 'empty'), '')
    await rawGit(repository, ['mv', '--', 'old', 'renamed'])
    const input = await request(repository)
    await withAssistedCommitSnapshot(repository, input, async snapshot => {
      assert.strictEqual(snapshot.analysis.changes.length, 4)
      assert.ok(snapshot.analysis.changes.every(c => c.kind === 'atomic'))
      const checked = await validateAssistedCommitPlan(
        snapshot,
        splitPlan(snapshot)
      )
      const result = await executeAssistedCommitPlan(snapshot, checked)
      const last = result.commits[3]
      assert.strictEqual(await count(repository), 5)
      assert.deepStrictEqual(
        await commitBytes(repository, last, 'binary'),
        Buffer.from([0, 3, 4])
      )
      assert.deepStrictEqual(
        await commitBytes(repository, last, 'empty'),
        Buffer.alloc(0)
      )
      assert.strictEqual(await commitBytes(repository, last, 'removed'), null)
      assert.strictEqual(await commitBytes(repository, last, 'old'), null)
      assert.deepStrictEqual(
        await commitBytes(repository, last, 'renamed'),
        Buffer.from('rename\n')
      )
    })
  })

  it('ignores a recreated, unselected rename source, even when it changes during execution', async t => {
    const repository = await seed(t, { old: 'source\n', another: 'a\n' })
    await rawGit(repository, ['mv', '--', 'old', 'destination'])
    await writeFile(join(repository.path, 'old'), 'unselected recreation\n')
    await writeFile(join(repository.path, 'another'), 'changed another\n')
    const input = await request(repository, ['destination', 'another'])
    const result = await withAssistedCommitSnapshot(
      repository,
      input,
      async snapshot => {
        const checked = await validateAssistedCommitPlan(
          snapshot,
          splitPlan(snapshot)
        )
        return executeAssistedCommitPlan(snapshot, checked, {
          onProgress: async progress => {
            if (progress.kind === 'committed' && progress.index === 0) {
              await writeFile(
                join(repository.path, 'old'),
                'new unselected recreation\n'
              )
            }
          },
        })
      }
    )
    assert.strictEqual(await count(repository), 3)
    assert.strictEqual(
      await commitBytes(repository, result.commits[1], 'old'),
      null
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'old')),
      Buffer.from('new unselected recreation\n')
    )
  })

  it('handles supported unusual paths literally, including leading dashes', async t => {
    const names =
      process.platform === 'win32'
        ? ['-leading', 'with space', 'Unicode-\u00e9']
        : [
            '-leading',
            'with space',
            'Unicode-\u00e9',
            'quote"file',
            'tab\tfile',
            'newline\nfile',
            'glob[1]*file',
          ]
    const repository = await seed(
      t,
      Object.fromEntries(names.map(name => [name, 'old\n']))
    )
    for (const name of names) {
      await writeFile(join(repository.path, name), `selected ${name}\n`)
    }
    const result = await single(repository, await request(repository))
    for (const name of names) {
      assert.deepStrictEqual(
        await commitBytes(repository, result.commits[0], name),
        Buffer.from(`selected ${name}\n`)
      )
      assert.deepStrictEqual(
        await readFile(join(repository.path, name)),
        Buffer.from(`selected ${name}\n`)
      )
    }
  })

  it(
    'preserves mode-only changes and symlink bytes without writing the worktree',
    { skip: process.platform === 'win32' },
    async t => {
      const repository = await seed(t, {
        executable: 'script\n',
        target: 'target\n',
      })
      await chmod(join(repository.path, 'executable'), 0o755)
      await symlink('target', join(repository.path, 'link'))
      const input = await request(repository, ['executable', 'link'])
      const result = await single(repository, input)
      assert.match(
        await rawGit(repository, [
          'ls-tree',
          result.commits[0],
          '--',
          'executable',
        ]),
        /^100755 blob /
      )
      assert.match(
        await rawGit(repository, ['ls-tree', result.commits[0], '--', 'link']),
        /^120000 blob /
      )
      assert.deepStrictEqual(
        await commitBytes(repository, result.commits[0], 'link'),
        Buffer.from('target')
      )
      assert.ok((await lstat(join(repository.path, 'link'))).isSymbolicLink())
    }
  )

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

  it('rejects invalid ownership, messages, snapshot identity and arbitrary injection before commits', async t => {
    const repository = await seed(t, { a: 'a\n', b: 'b\n' })
    await writeFile(join(repository.path, 'a'), 'A\n')
    await writeFile(join(repository.path, 'b'), 'B\n')
    const input = await request(repository)
    await withAssistedCommitSnapshot(repository, input, async snapshot => {
      const initialIndex = await readFile(await indexPath(repository))
      const initial = await tip(repository)
      const valid = splitPlan(snapshot)
      const ids = snapshot.analysis.changes.map(c => c.id)
      const invalid = [
        { ...valid, snapshotId: 'wrong' },
        { ...valid, path: 'injected' },
        { ...valid, commits: [] },
        { ...valid, commits: [{ title: ' ', changeIds: ids }] },
        { ...valid, commits: [{ title: 'first\nsecond', changeIds: ids }] },
        {
          ...valid,
          commits: [{ title: 'title', description: null, changeIds: ids }],
        },
        {
          ...valid,
          commits: [{ title: 'title', changeIds: [...ids, 'unknown'] }],
        },
        {
          ...valid,
          commits: [{ title: 'title', changeIds: [ids[0], ids[0]] }],
        },
        { ...valid, commits: [{ title: 'title', changeIds: [ids[0]] }] },
        { ...valid, commits: [{ title: 'title', changeIds: [] }] },
        {
          ...valid,
          commits: [{ title: 'title', changeIds: ids, patch: 'malicious' }],
        },
        {
          ...valid,
          commits: [{ title: 'title', changeIds: ids, blob: 'malicious' }],
        },
      ]
      for (const proposal of invalid) {
        await assert.rejects(
          validateAssistedCommitPlan(snapshot, proposal),
          error =>
            error instanceof AssistedCommitError &&
            error.code === 'invalid-plan'
        )
        assert.strictEqual(await tip(repository), initial)
        assert.deepStrictEqual(
          await readFile(await indexPath(repository)),
          initialIndex
        )
      }
      assert.throws(
        () =>
          createSingleAssistedCommitPlan(snapshot, {
            reason: 'empty-selection',
            title: 'wrong',
          }),
        /reason/
      )
      await assert.rejects(
        executeAssistedCommitPlan(snapshot, {
          plan: {
            snapshotId: snapshot.id,
            commits: [{ title: 'forged', changeIds: ids }],
          },
          trees: [snapshot.selectedTree],
        }),
        /Desktop-validated/
      )
    })
  })

  it('rejects selected mutation during planning without touching index or history', async t => {
    const repository = await seed(t, { file: 'old\n' })
    await writeFile(join(repository.path, 'file'), 'selected\n')
    const input = await request(repository)
    const initial = await tip(repository)
    await assert.rejects(
      withAssistedCommitSnapshot(repository, input, async snapshot => {
        const originalIndex = await readFile(await indexPath(repository))
        await writeFile(join(repository.path, 'file'), 'new current content\n')
        try {
          await validateAssistedCommitPlan(snapshot, splitPlan(snapshot))
        } finally {
          assert.deepStrictEqual(
            await readFile(await indexPath(repository)),
            originalIndex
          )
        }
      }),
      error =>
        error instanceof AssistedCommitError &&
        error.code === 'selection-changed'
    )
    assert.strictEqual(await tip(repository), initial)
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'file')),
      Buffer.from('new current content\n')
    )
  })

  for (const kind of ['cancel', 'selected-mutation', 'observer-error']) {
    it(`rolls back all run commits after ${kind}, preserving original real index and current bytes`, async t => {
      const repository = await seed(t, { a: 'a\n', b: 'b\n', staged: 'base\n' })
      const original = await tip(repository)
      await writeFile(join(repository.path, 'a'), 'A\n')
      await writeFile(join(repository.path, 'b'), 'B\n')
      await writeFile(join(repository.path, 'staged'), 'pre-run staging\n')
      await rawGit(repository, ['add', '--', 'staged'])
      const input = await request(repository, ['a', 'b'])
      const originalIndex = await readFile(await indexPath(repository))
      const controller = new AbortController()
      let snapshotDirectory = ''
      await assert.rejects(
        withAssistedCommitSnapshot(repository, input, async snapshot => {
          snapshotDirectory = getSnapshotData(snapshot).temporaryDirectory
          const checked = await validateAssistedCommitPlan(
            snapshot,
            splitPlan(snapshot)
          )
          return executeAssistedCommitPlan(snapshot, checked, {
            signal: controller.signal,
            onProgress: async progress => {
              if (progress.kind !== 'committed' || progress.index !== 0) {
                return
              }
              if (kind === 'cancel') {
                controller.abort()
              } else if (kind === 'selected-mutation') {
                await writeFile(join(repository.path, 'b'), 'CURRENT B\n')
              } else {
                throw new Error('observer failed')
              }
            },
          })
        }),
        error => {
          assert.ok(error instanceof AssistedCommitError)
          assert.strictEqual(error.recovery?.history, 'restored')
          assert.strictEqual(error.recovery?.index, 'unchanged')
          assert.strictEqual(error.recovery?.createdCommits.length, 1)
          assert.strictEqual(
            error.recovery?.snapshot.originalSelection.length,
            2
          )
          return true
        }
      )
      assert.strictEqual(await tip(repository), original)
      assert.strictEqual(await count(repository), 1)
      assert.deepStrictEqual(
        await readFile(await indexPath(repository)),
        originalIndex
      )
      assert.deepStrictEqual(
        await readFile(join(repository.path, 'b')),
        Buffer.from(kind === 'selected-mutation' ? 'CURRENT B\n' : 'B\n')
      )
      await assert.rejects(lstat(snapshotDirectory), /ENOENT/)
    })
  }

  it('continues after unselected mutation between commits and preserves those bytes', async t => {
    const repository = await seed(t, {
      a: 'a\n',
      b: 'b\n',
      other: 'old other\n',
    })
    await writeFile(join(repository.path, 'a'), 'A\n')
    await writeFile(join(repository.path, 'b'), 'B\n')
    const input = await request(repository)
    const result = await withAssistedCommitSnapshot(
      repository,
      input,
      async snapshot => {
        const checked = await validateAssistedCommitPlan(
          snapshot,
          splitPlan(snapshot)
        )
        return executeAssistedCommitPlan(snapshot, checked, {
          onProgress: async progress => {
            if (progress.kind === 'committed') {
              await writeFile(
                join(repository.path, 'other'),
                `unselected ${progress.index}\n`
              )
            }
          },
        })
      }
    )
    assert.strictEqual(await count(repository), 3)
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'other')),
      Buffer.from('unselected 1\n')
    )
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[1], 'other'),
      Buffer.from('old other\n')
    )
  })

  it('cancels before capture, during planning and before the first commit with resource cleanup', async t => {
    const repository = await seed(t, { file: 'old\n' })
    await writeFile(join(repository.path, 'file'), 'selected\n')
    const input = await request(repository)
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(
      captureAssistedCommitSnapshot(repository, input, {
        signal: controller.signal,
      }),
      /cancelled/
    )
    let directory = ''
    await assert.rejects(
      withAssistedCommitSnapshot(repository, input, async snapshot => {
        directory = getSnapshotData(snapshot).temporaryDirectory
        await validateAssistedCommitPlan(snapshot, splitPlan(snapshot), {
          signal: controller.signal,
        })
      }),
      /cancelled/
    )
    await assert.rejects(lstat(directory), /ENOENT/)
    await assert.rejects(
      withAssistedCommitSnapshot(repository, input, async snapshot => {
        directory = getSnapshotData(snapshot).temporaryDirectory
        const checked = await validateAssistedCommitPlan(
          snapshot,
          splitPlan(snapshot)
        )
        return executeAssistedCommitPlan(snapshot, checked, {
          signal: controller.signal,
        })
      }),
      error =>
        error instanceof AssistedCommitError &&
        error.code === 'cancelled' &&
        error.recovery?.history === 'unchanged'
    )
    await assert.rejects(lstat(directory), /ENOENT/)
    assert.strictEqual(await count(repository), 1)
  })

  it('disposes snapshots when the planner throws and supports explicit idempotent disposal', async t => {
    const repository = await seed(t, { file: 'old\n' })
    await writeFile(join(repository.path, 'file'), 'selected\n')
    const input = await request(repository)
    let directory = ''
    await assert.rejects(
      withAssistedCommitSnapshot(repository, input, async snapshot => {
        directory = getSnapshotData(snapshot).temporaryDirectory
        throw new Error('planner failed')
      }),
      /planner failed/
    )
    await assert.rejects(lstat(directory), /ENOENT/)
    const snapshot = await captureAssistedCommitSnapshot(repository, input)
    directory = getSnapshotData(snapshot).temporaryDirectory
    await disposeAssistedCommitSnapshot(snapshot)
    await disposeAssistedCommitSnapshot(snapshot)
    await assert.rejects(lstat(directory), /ENOENT/)
    assert.strictEqual(await count(repository), 1)
  })

  it('creates one caller-titled empty commit on existing and unborn branches', async t => {
    for (const unborn of [false, true]) {
      const repository = unborn
        ? await setupEmptyRepository(t, '-topic')
        : await seed(t, { file: 'unchanged\n' })
      const initialCount = await count(repository)
      const result = await single(
        repository,
        await request(repository, [], { allowEmptyCommit: true })
      )
      assert.strictEqual(result.commits.length, 1)
      assert.strictEqual(await count(repository), initialCount + 1)
      assert.strictEqual(await tip(repository), result.commits[0])
      assert.strictEqual(result.snapshot.analysis.changes.length, 0)
      assert.strictEqual(
        await rawGit(repository, ['show', '-s', '--format=%s', 'HEAD', '--']),
        'Commit the entire selected change'
      )
    }
  })

  it('restores an unborn branch and absence of its index after cancellation', async t => {
    const repository = await setupEmptyRepository(t, '-topic')
    await writeFile(join(repository.path, 'a'), 'a\n')
    await writeFile(join(repository.path, 'b'), 'b\n')
    const input = await request(repository)
    const originalIndex = await optionalBytes(await indexPath(repository))
    await assert.rejects(
      withAssistedCommitSnapshot(repository, input, async snapshot => {
        assert.strictEqual(snapshot.originalHead.ref, 'refs/heads/-topic')
        assert.strictEqual(snapshot.originalHead.sha, null)
        const checked = await validateAssistedCommitPlan(
          snapshot,
          splitPlan(snapshot)
        )
        return executeAssistedCommitPlan(snapshot, checked, {
          onProgress: progress => {
            if (progress.kind === 'committed') {
              throw new Error('stop after root')
            }
          },
        })
      }),
      error =>
        error instanceof AssistedCommitError &&
        error.recovery?.history === 'restored'
    )
    assert.strictEqual(await count(repository), 0)
    assert.strictEqual(
      await rawGit(repository, ['symbolic-ref', 'HEAD']),
      'refs/heads/-topic'
    )
    assert.deepStrictEqual(
      await optionalBytes(await indexPath(repository)),
      originalIndex
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'a')),
      Buffer.from('a\n')
    )
  })

  it('supports detached HEAD and restores its exact original commit on interruption', async t => {
    const repository = await seed(t, { a: 'a\n', b: 'b\n' })
    const original = await tip(repository)
    await rawGit(repository, ['checkout', '--detach', original])
    await writeFile(join(repository.path, 'a'), 'A\n')
    await writeFile(join(repository.path, 'b'), 'B\n')
    const input = await request(repository)
    await assert.rejects(
      withAssistedCommitSnapshot(repository, input, async snapshot => {
        assert.strictEqual(snapshot.originalHead.ref, null)
        const checked = await validateAssistedCommitPlan(
          snapshot,
          splitPlan(snapshot)
        )
        return executeAssistedCommitPlan(snapshot, checked, {
          onProgress: progress => {
            if (progress.kind === 'committed') {
              throw new Error('stop')
            }
          },
        })
      }),
      error =>
        error instanceof AssistedCommitError &&
        error.recovery?.history === 'restored'
    )
    assert.strictEqual(await tip(repository), original)
    assert.strictEqual(
      (await exec(['symbolic-ref', '--quiet', 'HEAD'], repository.path))
        .exitCode,
      1
    )
  })

  it('rejects an unsafe directory/file split before history and accepts an explicit whole-selection fallback', async t => {
    const repository = await seed(t, { replaced: 'old file\n' })
    const original = await tip(repository)
    await unlink(join(repository.path, 'replaced'))
    await mkdir(join(repository.path, 'replaced'))
    await writeFile(join(repository.path, 'replaced', 'child'), 'new child\n')
    const input = await request(repository)
    await withAssistedCommitSnapshot(repository, input, async snapshot => {
      const originalIndex = await readFile(await indexPath(repository))
      const addition = snapshot.analysis.changes.find(
        c => c.path === 'replaced/child'
      )
      const deletion = snapshot.analysis.changes.find(
        c => c.path === 'replaced'
      )
      assert.ok(addition && deletion)
      await assert.rejects(
        validateAssistedCommitPlan(snapshot, {
          snapshotId: snapshot.id,
          commits: [
            { title: 'Add a child', changeIds: [addition.id] },
            { title: 'Delete old file', changeIds: [deletion.id] },
          ],
        }),
        error =>
          error instanceof AssistedCommitError && error.code === 'unsafe-plan'
      )
      assert.strictEqual(await tip(repository), original)
      assert.deepStrictEqual(
        await readFile(await indexPath(repository)),
        originalIndex
      )
      const fallback = createSingleAssistedCommitPlan(snapshot, {
        reason: 'unsafe-split',
        title: 'Replace the old file with a directory containing the new child',
      })
      const checked = await validateAssistedCommitPlan(snapshot, fallback)
      const result = await executeAssistedCommitPlan(snapshot, checked)
      assert.strictEqual(await count(repository), 2)
      assert.strictEqual(
        await rawGit(repository, ['show', '-s', '--format=%s', 'HEAD']),
        fallback.commits[0].title
      )
      assert.deepStrictEqual(
        await commitBytes(repository, result.commits[0], 'replaced/child'),
        Buffer.from('new child\n')
      )
    })
  })

  it('supports a single selected deletion without broadening adjacent unselected additions', async t => {
    const repository = await seed(t, { file: 'one\ntwo\nthree\n' })
    await writeFile(
      join(repository.path, 'file'),
      'one\nUNSELECTED ADDITION\nthree\n'
    )
    const input = await request(repository)
    const file = input.files[0]
    const diff = await getWorkingDirectoryDiff(repository, file)
    assert.strictEqual(diff.kind, DiffType.Text)
    if (diff.kind !== DiffType.Text) {
      throw new Error('Expected a text diff')
    }
    const hunk = diff.hunks[0]
    const index = hunk.lines.findIndex(
      line => line.type === DiffLineType.Delete
    )
    assert.ok(index >= 0)
    const selection = DiffSelection.fromInitialSelection(
      DiffSelectionType.None
    ).withLineSelection(hunk.unifiedDiffStart + index, true)
    const result = await single(repository, {
      ...input,
      files: [file.withSelection(selection)],
    })
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'file'),
      Buffer.from('one\nthree\n')
    )
    assert.ok(
      !result.snapshot.analysis.changes[0].diff.includes('UNSELECTED ADDITION')
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'file')),
      Buffer.from('one\nUNSELECTED ADDITION\nthree\n')
    )
  })

  it('captures a copy atomically and ignores later unselected source changes', async t => {
    const repository = await seed(t, { source: 'original source\n' })
    await writeFile(join(repository.path, 'copy'), 'selected copy\n')
    await writeFile(join(repository.path, 'source'), 'unselected source\n')
    const file = new WorkingDirectoryFileChange(
      'copy',
      {
        kind: AppFileStatusKind.Copied,
        oldPath: 'source',
        renameIncludesModifications: true,
      },
      DiffSelection.fromInitialSelection(DiffSelectionType.All)
    )
    const result = await single(
      repository,
      await request(repository, [], { files: [file] }),
      {
        onProgress: async progress => {
          if (progress.kind === 'committing') {
            await writeFile(join(repository.path, 'source'), 'current source\n')
          }
        },
      }
    )
    assert.strictEqual(result.snapshot.analysis.changes[0].kind, 'atomic')
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'copy'),
      Buffer.from('selected copy\n')
    )
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'source'),
      Buffer.from('original source\n')
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'source')),
      Buffer.from('current source\n')
    )
  })

  it('rejects binary, rename, mode-change and empty partial selections explicitly', async t => {
    const repository = await seed(t, {
      binary: Buffer.from([0, 1]),
      old: 'old\n',
      text: 'old text\n',
    })
    await writeFile(join(repository.path, 'binary'), Buffer.from([0, 2]))
    await rawGit(repository, ['mv', '--', 'old', 'renamed'])
    await writeFile(join(repository.path, 'text'), 'new text\n')
    const input = await request(repository)
    const partial = DiffSelection.fromInitialSelection(
      DiffSelectionType.None
    ).withLineSelection(1, true)
    for (const path of ['binary', 'renamed']) {
      const file = input.files.find(f => f.path === path)
      assert.ok(file)
      await assert.rejects(
        captureAssistedCommitSnapshot(repository, {
          ...input,
          files: [file.withSelection(partial)],
        }),
        error =>
          error instanceof AssistedCommitError &&
          error.code === 'unsafe-selection'
      )
    }
    const text = input.files.find(f => f.path === 'text')
    assert.ok(text)
    await assert.rejects(
      captureAssistedCommitSnapshot(repository, {
        ...input,
        files: [
          text.withSelection(
            DiffSelection.fromInitialSelection(
              DiffSelectionType.None
            ).withLineSelection(1000, true)
          ),
        ],
      }),
      /no changed lines/
    )
    if (process.platform !== 'win32') {
      await chmod(join(repository.path, 'text'), 0o755)
      await assert.rejects(
        captureAssistedCommitSnapshot(repository, {
          ...input,
          files: [text.withSelection(partial)],
        }),
        /mode-changing/
      )
    }
    assert.strictEqual(await count(repository), 1)
  })

  it('rejects dirty or pointer-changing submodules rather than silently dropping them', async t => {
    const repository = await seed(t, { file: 'main\n' })
    const child = await seed(t, { file: 'submodule\n' })
    await rawGit(repository, [
      '-c',
      'protocol.file.allow=always',
      'submodule',
      'add',
      '--',
      child.path,
      'module',
    ])
    await rawGit(repository, ['commit', '-m', 'Add submodule'])
    const module = new Repository(
      join(repository.path, 'module'),
      -2,
      null,
      false
    )
    await rawGit(module, [
      'commit',
      '--allow-empty',
      '-m',
      'Submodule pointer change',
    ])
    const original = await tip(repository)
    const input = await request(repository, ['module'])
    assert.strictEqual(input.files.length, 1)
    await assert.rejects(
      captureAssistedCommitSnapshot(repository, input),
      /submodules/
    )
    assert.strictEqual(await tip(repository), original)
  })

  it('applies snapshotted trailers, sign-off and skip-hook options to every commit', async t => {
    const repository = await seed(t, { a: 'a\n', b: 'b\n' })
    await writeFile(join(repository.path, 'a'), 'A\n')
    await writeFile(join(repository.path, 'b'), 'B\n')
    const trailers = [
      { token: 'Co-authored-by', value: 'Peer <peer@example.com>' },
    ]
    const input = await request(repository, undefined, {
      trailers,
      skipCommitHooks: true,
      signOffCommits: true,
    })
    await writeHook(
      repository,
      'pre-commit',
      'echo should-never-run >&2\nexit 42'
    )
    await withAssistedCommitSnapshot(repository, input, async snapshot => {
      trailers[0].value = 'Changed after capture <changed@example.com>'
      const checked = await validateAssistedCommitPlan(
        snapshot,
        splitPlan(snapshot)
      )
      const result = await executeAssistedCommitPlan(snapshot, checked)
      assert.strictEqual(result.commits.length, 2)
      for (const sha of result.commits) {
        const message = await rawGit(repository, [
          'show',
          '-s',
          '--format=%B',
          sha,
        ])
        assert.match(message, /Co-authored-by: Peer <peer@example.com>/)
        assert.match(message, /Signed-off-by: /)
        assert.ok(!message.includes('changed@example.com'))
      }
    })
  })

  it('keeps original branch identity, effective include config, and literal metadata paths for hooks', async t => {
    const originalRepository = await seed(t, { file: 'old\n' })
    const parent = await createTempDirectory(t)
    const root = join(
      parent,
      process.platform === 'win32'
        ? 'root with spaces'
        : 'root "quoted"\nwith spaces'
    )
    await cp(originalRepository.path, root, { recursive: true })
    const repository = new Repository(root, -1, null, false)
    const configFile = join(parent, 'included config')
    await writeFile(
      configFile,
      '[assistedtest]\n value = "escaped \\"quote\\"\\nsecond line"\n'
    )
    await rawGit(repository, ['config', 'include.path', configFile])
    await writeFile(join(root, 'file'), 'selected\n')
    const input = await request(repository)
    await writeHook(
      repository,
      'pre-commit',
      [
        'test "$(git symbolic-ref --short HEAD)" = master',
        'test "$(git config --get assistedtest.value)" = \'escaped "quote"',
        "second line'",
        'printf checked > hook-checked',
      ].join('\n')
    )
    const result = await single(repository, input)
    assert.strictEqual(result.commits.length, 1)
    assert.strictEqual(
      await readFile(join(root, 'hook-checked'), 'utf8'),
      'checked'
    )
    assert.deepStrictEqual(
      await readFile(join(root, 'file')),
      Buffer.from('selected\n')
    )
  })

  for (const hook of ['pre-commit', 'post-commit']) {
    it(`recovers selected-file mutation during the second ${hook} without undoing current bytes`, async t => {
      const repository = await seed(t, { a: 'a\n', b: 'b\n' })
      const original = await tip(repository)
      await writeFile(join(repository.path, 'a'), 'A\n')
      await writeFile(join(repository.path, 'b'), 'B\n')
      const input = await request(repository)
      const originalIndex = await readFile(await indexPath(repository))
      await writeHook(
        repository,
        hook,
        [
          'n=0; if test -f hook-count; then n=$(cat hook-count); fi',
          'n=$((n + 1)); printf "%s" "$n" > hook-count',
          'if test "$n" = 2; then printf "HOOK CURRENT B\\n" > b; fi',
        ].join('\n')
      )
      await assert.rejects(
        withAssistedCommitSnapshot(repository, input, async snapshot => {
          const checked = await validateAssistedCommitPlan(
            snapshot,
            splitPlan(snapshot)
          )
          return executeAssistedCommitPlan(snapshot, checked)
        }),
        error =>
          error instanceof AssistedCommitError &&
          error.code === 'selection-changed' &&
          error.recovery?.history === 'restored'
      )
      assert.strictEqual(await tip(repository), original)
      assert.strictEqual(await count(repository), 1)
      assert.deepStrictEqual(
        await readFile(await indexPath(repository)),
        originalIndex
      )
      assert.deepStrictEqual(
        await readFile(join(repository.path, 'b')),
        Buffer.from('HOOK CURRENT B\n')
      )
    })
  }

  for (const hook of ['pre-commit', 'post-commit']) {
    it(`detects unintended index additions in the second ${hook} and removes only run commits`, async t => {
      const repository = await seed(t, { a: 'a\n', b: 'b\n', other: 'base\n' })
      const original = await tip(repository)
      await writeFile(join(repository.path, 'a'), 'A\n')
      await writeFile(join(repository.path, 'b'), 'B\n')
      await writeFile(join(repository.path, 'other'), 'unselected\n')
      const input = await request(repository, ['a', 'b'])
      const originalIndex = await readFile(await indexPath(repository))
      await writeHook(
        repository,
        hook,
        [
          'n=0; if test -f hook-count; then n=$(cat hook-count); fi',
          'n=$((n + 1)); printf "%s" "$n" > hook-count',
          'if test "$n" = 2; then git add -- other; fi',
        ].join('\n')
      )
      await assert.rejects(
        withAssistedCommitSnapshot(repository, input, async snapshot => {
          const checked = await validateAssistedCommitPlan(
            snapshot,
            splitPlan(snapshot)
          )
          return executeAssistedCommitPlan(snapshot, checked)
        }),
        error =>
          error instanceof AssistedCommitError &&
          error.code === 'commit-failed' &&
          error.recovery?.history === 'restored'
      )
      assert.strictEqual(await tip(repository), original)
      assert.strictEqual(await count(repository), 1)
      assert.deepStrictEqual(
        await readFile(await indexPath(repository)),
        originalIndex
      )
      assert.deepStrictEqual(
        await readFile(join(repository.path, 'other')),
        Buffer.from('unselected\n')
      )
    })
  }

  it('continues when a hook changes only unselected working-tree content', async t => {
    const repository = await seed(t, { a: 'a\n', b: 'b\n', other: 'base\n' })
    await writeFile(join(repository.path, 'a'), 'A\n')
    await writeFile(join(repository.path, 'b'), 'B\n')
    const input = await request(repository)
    await writeHook(
      repository,
      'pre-commit',
      'printf "hook current other\\n" > other'
    )
    const result = await withAssistedCommitSnapshot(
      repository,
      input,
      async snapshot => {
        const checked = await validateAssistedCommitPlan(
          snapshot,
          splitPlan(snapshot)
        )
        return executeAssistedCommitPlan(snapshot, checked)
      }
    )
    assert.strictEqual(await count(repository), 3)
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[1], 'other'),
      Buffer.from('base\n')
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'other')),
      Buffer.from('hook current other\n')
    )
  })

  it('does not invoke index hooks during capture or plan materialization', async t => {
    const repository = await seed(t, { a: 'a\n', other: 'base\n' })
    await writeFile(join(repository.path, 'a'), 'A\n')
    const input = await request(repository)
    await writeHook(
      repository,
      'post-index-change',
      'printf fired > index-hook-fired'
    )
    await withAssistedCommitSnapshot(repository, input, async snapshot => {
      assert.strictEqual(
        await optionalBytes(join(repository.path, 'index-hook-fired')),
        null
      )
      await validateAssistedCommitPlan(snapshot, splitPlan(snapshot))
      assert.strictEqual(
        await optionalBytes(join(repository.path, 'index-hook-fired')),
        null
      )
      assert.strictEqual(await count(repository), 1)
    })
  })

  it('recovers a non-ignorable signing failure after an earlier successful commit', async t => {
    const repository = await seed(t, { a: 'a\n', b: 'b\n' })
    const original = await tip(repository)
    await writeFile(join(repository.path, 'a'), 'A\n')
    await writeFile(join(repository.path, 'b'), 'B\n')
    const input = await request(repository)
    const originalIndex = await readFile(await indexPath(repository))
    await writeHook(
      repository,
      'post-commit',
      [
        'git config gpg.program /desktop-test-does-not-exist',
        'git config commit.gpgsign true',
      ].join('\n')
    )
    await assert.rejects(
      withAssistedCommitSnapshot(repository, input, async snapshot => {
        const checked = await validateAssistedCommitPlan(
          snapshot,
          splitPlan(snapshot)
        )
        return executeAssistedCommitPlan(snapshot, checked)
      }),
      error =>
        error instanceof AssistedCommitError &&
        error.code === 'commit-failed' &&
        error.recovery?.history === 'restored'
    )
    assert.strictEqual(await tip(repository), original)
    assert.deepStrictEqual(
      await readFile(await indexPath(repository)),
      originalIndex
    )
  })

  it('waits for in-flight Git on cancellation, including a hook that commits before returning', async t => {
    const repository = await seed(t, { a: 'a\n', b: 'b\n' })
    const original = await tip(repository)
    await writeFile(join(repository.path, 'a'), 'A\n')
    await writeFile(join(repository.path, 'b'), 'B\n')
    const input = await request(repository)
    const originalIndex = await readFile(await indexPath(repository))
    await writeHook(
      repository,
      'post-commit',
      'sleep 0.2\nprintf settled > hook-settled'
    )
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    await assert.rejects(
      withAssistedCommitSnapshot(repository, input, async snapshot => {
        const checked = await validateAssistedCommitPlan(
          snapshot,
          splitPlan(snapshot)
        )
        return executeAssistedCommitPlan(snapshot, checked, {
          signal: controller.signal,
          onTerminalOutputAvailable: () => {
            timer = setTimeout(() => controller.abort(), 50)
          },
        })
      }),
      error =>
        error instanceof AssistedCommitError &&
        error.code === 'cancelled' &&
        error.recovery?.createdCommits.length === 1 &&
        error.recovery?.history === 'unchanged'
    )
    if (timer !== undefined) {
      clearTimeout(timer)
    }
    assert.strictEqual(
      await readFile(join(repository.path, 'hook-settled'), 'utf8'),
      'settled'
    )
    assert.strictEqual(await tip(repository), original)
    assert.deepStrictEqual(
      await readFile(await indexPath(repository)),
      originalIndex
    )
  })

  it('does not abandon in-flight Git when a terminal observer throws', async t => {
    const repository = await seed(t, { file: 'old\n' })
    const original = await tip(repository)
    await writeFile(join(repository.path, 'file'), 'selected\n')
    const input = await request(repository)
    await writeHook(
      repository,
      'post-commit',
      'sleep 0.05\nprintf settled > hook-settled'
    )
    await assert.rejects(
      single(repository, input, {
        onTerminalOutputAvailable: () => {
          throw new Error('terminal observer failed')
        },
      }),
      error =>
        error instanceof AssistedCommitError && error.code === 'commit-failed'
    )
    assert.strictEqual(
      await readFile(join(repository.path, 'hook-settled'), 'utf8'),
      'settled'
    )
    assert.strictEqual(await tip(repository), original)
  })

  it('refuses destructive rollback when an external commit advances the original ref', async t => {
    const repository = await seed(t, { a: 'a\n', b: 'b\n' })
    await writeFile(join(repository.path, 'a'), 'A\n')
    await writeFile(join(repository.path, 'b'), 'B\n')
    const input = await request(repository)
    let external = ''
    let runTip = ''
    await assert.rejects(
      withAssistedCommitSnapshot(repository, input, async snapshot => {
        const checked = await validateAssistedCommitPlan(
          snapshot,
          splitPlan(snapshot)
        )
        return executeAssistedCommitPlan(snapshot, checked, {
          onProgress: async progress => {
            if (progress.kind === 'committed' && progress.index === 0) {
              runTip = progress.sha
              const tree = await rawGit(repository, [
                'rev-parse',
                'HEAD^{tree}',
              ])
              external = await rawGit(repository, [
                'commit-tree',
                tree,
                '-p',
                runTip,
                '-m',
                'External commit',
              ])
              await rawGit(repository, ['update-ref', 'HEAD', external, runTip])
            }
          },
        })
      }),
      error => {
        assert.ok(error instanceof AssistedCommitError)
        assert.strictEqual(error.code, 'recovery-failed')
        assert.strictEqual(error.recovery?.history, 'interfered')
        assert.strictEqual(error.recovery?.observedHead?.sha, external)
        assert.strictEqual(error.recovery?.expectedTip, runTip)
        assert.strictEqual(
          error.recovery?.snapshot.originalHead.ref,
          'refs/heads/master'
        )
        return true
      }
    )
    assert.strictEqual(await tip(repository), external)
    assert.strictEqual(await count(repository), 3)
    assert.strictEqual(
      await rawGit(repository, ['rev-parse', `${external}^`]),
      runTip
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'b')),
      Buffer.from('B\n')
    )
  })

  it('detects a same-SHA branch switch and never overwrites the external HEAD', async t => {
    const repository = await seed(t, { a: 'a\n', b: 'b\n' })
    await writeFile(join(repository.path, 'a'), 'A\n')
    await writeFile(join(repository.path, 'b'), 'B\n')
    const input = await request(repository)
    let first = ''
    await assert.rejects(
      withAssistedCommitSnapshot(repository, input, async snapshot => {
        const checked = await validateAssistedCommitPlan(
          snapshot,
          splitPlan(snapshot)
        )
        return executeAssistedCommitPlan(snapshot, checked, {
          onProgress: async progress => {
            if (progress.kind === 'committed' && progress.index === 0) {
              first = progress.sha
              await rawGit(repository, [
                'update-ref',
                'refs/heads/other',
                first,
              ])
              await rawGit(repository, [
                'symbolic-ref',
                'HEAD',
                'refs/heads/other',
              ])
            }
          },
        })
      }),
      error =>
        error instanceof AssistedCommitError &&
        error.code === 'recovery-failed' &&
        error.recovery?.observedHead?.ref === 'refs/heads/other'
    )
    assert.strictEqual(
      await rawGit(repository, ['symbolic-ref', 'HEAD']),
      'refs/heads/other'
    )
    assert.strictEqual(await tip(repository), first)
    assert.strictEqual(
      await rawGit(repository, ['rev-parse', 'refs/heads/master']),
      first
    )
  })

  it('checks HEAD identity while Git ref locks are held, rejecting external symbolic updates', async t => {
    const repository = await seed(t, { file: 'old\n' })
    const original = await tip(repository)
    const tree = await rawGit(repository, ['rev-parse', 'HEAD^{tree}'])
    const next = await rawGit(repository, [
      'commit-tree',
      tree,
      '-p',
      original,
      '-m',
      'Next',
    ])
    await rawGit(repository, ['update-ref', 'refs/heads/other', original])
    await updateRefWithVerification(
      repository,
      'refs/heads/master',
      original,
      next,
      'test guarded ref',
      async () => {
        const attempted = await exec(
          ['symbolic-ref', 'HEAD', 'refs/heads/other'],
          repository.path
        )
        assert.notStrictEqual(attempted.exitCode, 0)
        assert.match(attempted.stderr, /HEAD\.lock/)
        assert.strictEqual(
          await rawGit(repository, ['symbolic-ref', 'HEAD']),
          'refs/heads/master'
        )
      }
    )
    assert.strictEqual(await tip(repository), next)
    assert.strictEqual(
      await rawGit(repository, ['rev-parse', 'refs/heads/other']),
      original
    )
  })

  it('preserves a concurrent external index replacement and reports incomplete index recovery', async t => {
    const repository = await seed(t, { a: 'a\n', b: 'b\n', other: 'base\n' })
    const original = await tip(repository)
    await writeFile(join(repository.path, 'a'), 'A\n')
    await writeFile(join(repository.path, 'b'), 'B\n')
    await writeFile(join(repository.path, 'other'), 'external staging\n')
    const input = await request(repository, ['a', 'b'])
    const externalIndexPath = join(await createTempDirectory(t), 'index')
    const env = { GIT_INDEX_FILE: externalIndexPath }
    await rawGit(repository, ['read-tree', original], { env })
    await rawGit(repository, ['add', '--', 'other'], { env })
    const externalIndex = await readFile(externalIndexPath)
    await assert.rejects(
      withAssistedCommitSnapshot(repository, input, async snapshot => {
        const checked = await validateAssistedCommitPlan(
          snapshot,
          splitPlan(snapshot)
        )
        return executeAssistedCommitPlan(snapshot, checked, {
          onProgress: async progress => {
            if (progress.kind === 'committed' && progress.index === 0) {
              await writeFile(await indexPath(repository), externalIndex)
            }
          },
        })
      }),
      error =>
        error instanceof AssistedCommitError &&
        error.code === 'recovery-failed' &&
        error.recovery?.history === 'restored' &&
        error.recovery?.index === 'interfered'
    )
    assert.strictEqual(await tip(repository), original)
    assert.deepStrictEqual(
      await readFile(await indexPath(repository)),
      externalIndex
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'other')),
      Buffer.from('external staging\n')
    )
  })

  it('protects the real index with an exclusive lock throughout execution', async t => {
    const repository = await seed(t, { a: 'a\n', b: 'b\n', other: 'base\n' })
    await writeFile(join(repository.path, 'a'), 'A\n')
    await writeFile(join(repository.path, 'b'), 'B\n')
    await writeFile(
      join(repository.path, 'other'),
      'external staging attempt\n'
    )
    const input = await request(repository, ['a', 'b'])
    const result = await withAssistedCommitSnapshot(
      repository,
      input,
      async snapshot => {
        const checked = await validateAssistedCommitPlan(
          snapshot,
          splitPlan(snapshot)
        )
        return executeAssistedCommitPlan(snapshot, checked, {
          onProgress: async progress => {
            if (progress.kind === 'committed') {
              const attempt = await exec(
                ['add', '--', 'other'],
                repository.path
              )
              assert.strictEqual(attempt.exitCode, 128)
              assert.match(attempt.stderr, /index\.lock/)
            }
          },
        })
      }
    )
    assert.strictEqual(await count(repository), 3)
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[1], 'other'),
      Buffer.from('base\n')
    )
    assert.strictEqual(
      await optionalBytes(`${await indexPath(repository)}.lock`),
      null
    )
  })

  it('uses Desktop index semantics on success, without staging unselected current content', async t => {
    const repository = await seed(t, { selected: 'old\n', other: 'base\n' })
    await writeFile(join(repository.path, 'other'), 'pre-run staging\n')
    await rawGit(repository, ['add', '--', 'other'])
    await writeFile(join(repository.path, 'other'), 'current unselected\n')
    await writeFile(join(repository.path, 'selected'), 'selected\n')
    const input = await request(repository, ['selected'])
    const result = await single(repository, input)
    assert.strictEqual(
      await rawGit(repository, ['diff', '--cached', '--name-only']),
      ''
    )
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'other'),
      Buffer.from('base\n')
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'other')),
      Buffer.from('current unselected\n')
    )
  })

  it('rolls back after the final local commit before a future push and restores the original index exactly', async t => {
    const repository = await seed(t, { a: 'a\n', b: 'b\n', other: 'base\n' })
    const original = await tip(repository)
    await writeFile(join(repository.path, 'other'), 'pre-run staging\n')
    await rawGit(repository, ['add', '--', 'other'])
    await writeFile(join(repository.path, 'a'), 'A\n')
    await writeFile(join(repository.path, 'b'), 'B\n')
    const input = await request(repository, ['a', 'b'])
    const originalIndex = await readFile(await indexPath(repository))
    const result = await withAssistedCommitSnapshot(
      repository,
      input,
      async snapshot => {
        const checked = await validateAssistedCommitPlan(
          snapshot,
          splitPlan(snapshot)
        )
        return executeAssistedCommitPlan(snapshot, checked)
      }
    )
    assert.strictEqual(await count(repository), 3)
    const recovery = await rollbackAssistedCommitTransaction(result)
    assert.strictEqual(recovery.history, 'restored')
    assert.strictEqual(recovery.index, 'restored')
    assert.strictEqual(await tip(repository), original)
    assert.strictEqual(await count(repository), 1)
    assert.deepStrictEqual(
      await readFile(await indexPath(repository)),
      originalIndex
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'a')),
      Buffer.from('A\n')
    )
    await assert.rejects(rollbackAssistedCommitTransaction(result), /finalized/)
  })

  it('removes an empty root commit after completion and restores absence of the index', async t => {
    const repository = await setupEmptyRepository(t)
    const input = await request(repository, [], { allowEmptyCommit: true })
    const originalIndex = await optionalBytes(await indexPath(repository))
    const result = await single(repository, input)
    assert.strictEqual(await count(repository), 1)
    const recovery = await rollbackAssistedCommitTransaction(result)
    assert.strictEqual(recovery.history, 'restored')
    assert.strictEqual(await count(repository), 0)
    assert.deepStrictEqual(
      await optionalBytes(await indexPath(repository)),
      originalIndex
    )
  })

  it('finalizes the rollback capability explicitly without changing local history', async t => {
    const repository = await seed(t, { file: 'old\n' })
    await writeFile(join(repository.path, 'file'), 'selected\n')
    const result = await single(repository, await request(repository))
    finalizeAssistedCommitTransaction(result)
    finalizeAssistedCommitTransaction(result)
    await assert.rejects(rollbackAssistedCommitTransaction(result), /finalized/)
    assert.strictEqual(await tip(repository), result.commits[0])
  })

  it('uses linked-worktree metadata paths and leaves the original worktree index and branch untouched', async t => {
    const originalRepository = await seed(t, { a: 'a\n', b: 'b\n' })
    const originalTip = await tip(originalRepository)
    const path = await createTempDirectory(t)
    await rawGit(originalRepository, [
      'worktree',
      'add',
      '-b',
      'linked',
      '--',
      path,
      'HEAD',
    ])
    const repository = new Repository(path, -2, null, false)
    assert.ok((await lstat(join(path, '.git'))).isFile())
    const mainIndex = await readFile(await indexPath(originalRepository))
    await writeFile(join(path, 'a'), 'A\n')
    await writeFile(join(path, 'b'), 'B\n')
    const input = await request(repository)
    const originalIndex = await readFile(await indexPath(repository))
    const result = await withAssistedCommitSnapshot(
      repository,
      input,
      async snapshot => {
        const checked = await validateAssistedCommitPlan(
          snapshot,
          splitPlan(snapshot)
        )
        return executeAssistedCommitPlan(snapshot, checked)
      }
    )
    assert.strictEqual(await tip(originalRepository), originalTip)
    assert.deepStrictEqual(
      await readFile(await indexPath(originalRepository)),
      mainIndex
    )
    assert.strictEqual(await count(repository), 3)
    await rollbackAssistedCommitTransaction(result)
    assert.strictEqual(await tip(repository), originalTip)
    assert.deepStrictEqual(
      await readFile(await indexPath(repository)),
      originalIndex
    )
    assert.deepStrictEqual(
      await readFile(await indexPath(originalRepository)),
      mainIndex
    )
  })

  it('uses full SHA-256 object IDs for ownership, trees and unborn rollback', async t => {
    const repository = await setupEmptyRepository(t)
    await rawGit(repository, ['config', 'core.repositoryFormatVersion', '1'])
    await rawGit(repository, ['config', 'extensions.objectFormat', 'sha256'])
    await writeFile(join(repository.path, 'file'), 'selected\n')
    const input = await request(repository)
    const result = await single(repository, input)
    assert.match(result.commits[0], /^[0-9a-f]{64}$/)
    assert.match(result.tree, /^[0-9a-f]{64}$/)
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'file'),
      Buffer.from('selected\n')
    )
    await rollbackAssistedCommitTransaction(result)
    assert.strictEqual(await count(repository), 0)
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'file')),
      Buffer.from('selected\n')
    )
  })

  it('honors All-based partial selection when the first hunk is excluded', async t => {
    const base = Array.from({ length: 40 }, (_, i) => `line ${i + 1}\n`)
    const repository = await seed(t, { file: base.join('') })
    const changed = [...base]
    changed[1] = 'UNSELECTED FIRST\n'
    changed[30] = 'selected second\n'
    await writeFile(join(repository.path, 'file'), changed.join(''))
    const input = await request(repository)
    const file = input.files[0]
    const diff = await getWorkingDirectoryDiff(repository, file)
    assert.ok(diff.kind === DiffType.Text)
    const selection = DiffSelection.fromInitialSelection(
      DiffSelectionType.All
    ).withRangeSelection(
      diff.hunks[0].unifiedDiffStart,
      diff.hunks[0].lines.length,
      false
    )
    const result = await single(repository, {
      ...input,
      files: [file.withSelection(selection)],
    })
    const expected = [...base]
    expected[30] = 'selected second\n'
    assert.strictEqual(result.snapshot.analysis.changes.length, 1)
    assert.ok(
      !result.snapshot.analysis.changes[0].diff.includes('UNSELECTED FIRST')
    )
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'file'),
      Buffer.from(expected.join(''))
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'file')),
      Buffer.from(changed.join(''))
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

  for (const mutation of ['mode', 'type']) {
    it(
      `recovers selected ${mutation} identity mutation between commits without restoring old filesystem state`,
      { skip: process.platform === 'win32' },
      async t => {
        const repository = await seed(t, {
          a: 'a\n',
          b: 'b\n',
          other: 'other\n',
        })
        const original = await tip(repository)
        await writeFile(join(repository.path, 'a'), 'A\n')
        await writeFile(join(repository.path, 'b'), 'B\n')
        const input = await request(repository)
        await assert.rejects(
          withAssistedCommitSnapshot(repository, input, async snapshot => {
            const checked = await validateAssistedCommitPlan(
              snapshot,
              splitPlan(snapshot)
            )
            return executeAssistedCommitPlan(snapshot, checked, {
              onProgress: async progress => {
                if (progress.kind !== 'committed' || progress.index !== 0) {
                  return
                }
                if (mutation === 'mode') {
                  await chmod(join(repository.path, 'b'), 0o755)
                } else {
                  await unlink(join(repository.path, 'b'))
                  await symlink('other', join(repository.path, 'b'))
                }
              },
            })
          }),
          error =>
            error instanceof AssistedCommitError &&
            error.code === 'selection-changed' &&
            error.recovery?.history === 'restored'
        )
        assert.strictEqual(await tip(repository), original)
        const state = await lstat(join(repository.path, 'b'))
        assert.ok(
          mutation === 'mode'
            ? (state.mode & 0o111) !== 0
            : state.isSymbolicLink()
        )
      }
    )
  }

  for (const target of ['private', 'published']) {
    it(
      `observes Git failing after advancing its ${target} ref and recovers only run history`,
      { skip: process.platform === 'win32' },
      async t => {
        const repository = await seed(t, { file: 'old\n' })
        const original = await tip(repository)
        await writeFile(join(repository.path, 'file'), 'selected\n')
        const input = await request(repository)
        const originalIndex = await readFile(await indexPath(repository))
        await writeHook(
          repository,
          'reference-transaction',
          [
            'if test "$1" != committed || test -f ref-failed-once; then exit 0; fi',
            target === 'private'
              ? 'case "${GIT_DIR-}" in *desktop-assisted-commit-*) ;; *) exit 0 ;; esac'
              : 'case "${GIT_DIR-}" in *desktop-assisted-commit-*) exit 0 ;; esac',
            'printf failed > ref-failed-once',
            'kill -TERM "$PPID"',
          ].join('\n')
        )
        let created = ''
        await assert.rejects(single(repository, input), error => {
          assert.ok(error instanceof AssistedCommitError)
          assert.strictEqual(error.code, 'commit-failed')
          assert.strictEqual(error.recovery?.createdCommits.length, 1)
          assert.strictEqual(
            error.recovery?.history,
            target === 'private' ? 'unchanged' : 'restored'
          )
          created = error.recovery?.createdCommits[0] ?? ''
          return true
        })
        assert.match(created, /^[0-9a-f]{40}$/)
        assert.strictEqual(await tip(repository), original)
        assert.strictEqual(await count(repository), 1)
        assert.strictEqual(
          await rawGit(repository, ['rev-parse', `${created}^`]),
          original
        )
        assert.deepStrictEqual(
          await readFile(await indexPath(repository)),
          originalIndex
        )
        assert.deepStrictEqual(
          await readFile(join(repository.path, 'file')),
          Buffer.from('selected\n')
        )
      }
    )
  }

  it('waits for the second in-flight commit on cancellation and removes the earlier published commit', async t => {
    const repository = await seed(t, { a: 'a\n', b: 'b\n' })
    const original = await tip(repository)
    await writeFile(join(repository.path, 'a'), 'A\n')
    await writeFile(join(repository.path, 'b'), 'B\n')
    const input = await request(repository)
    await writeHook(
      repository,
      'post-commit',
      'sleep 0.2\nprintf settled > hook-settled'
    )
    const controller = new AbortController()
    let calls = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    await assert.rejects(
      withAssistedCommitSnapshot(repository, input, async snapshot => {
        const checked = await validateAssistedCommitPlan(
          snapshot,
          splitPlan(snapshot)
        )
        return executeAssistedCommitPlan(snapshot, checked, {
          signal: controller.signal,
          onTerminalOutputAvailable: () => {
            if (++calls === 2) {
              timer = setTimeout(() => controller.abort(), 50)
            }
          },
        })
      }),
      error =>
        error instanceof AssistedCommitError &&
        error.code === 'cancelled' &&
        error.recovery?.createdCommits.length === 2 &&
        error.recovery.history === 'restored'
    )
    if (timer !== undefined) {
      clearTimeout(timer)
    }
    assert.strictEqual(
      await readFile(join(repository.path, 'hook-settled'), 'utf8'),
      'settled'
    )
    assert.strictEqual(await tip(repository), original)
    assert.strictEqual(await count(repository), 1)
  })

  for (const overLimit of [false, true]) {
    it(`uses the exact combined 4 MiB text-splitting boundary (${
      overLimit ? 'above' : 'at'
    } limit)`, async t => {
      const repository = await seed(t, { anchor: 'anchor\n' })
      await writeFile(
        join(repository.path, 'large'),
        Buffer.alloc(4 * 1024 * 1024 + (overLimit ? 1 : 0), 120)
      )
      const input = await request(repository)
      await withAssistedCommitSnapshot(repository, input, async snapshot => {
        assert.strictEqual(snapshot.analysis.changes.length, 1)
        assert.strictEqual(
          snapshot.analysis.changes[0].kind,
          overLimit ? 'atomic' : 'text-hunk'
        )
      })
      if (overLimit) {
        const partial = DiffSelection.fromInitialSelection(
          DiffSelectionType.None
        ).withLineSelection(1, true)
        await assert.rejects(
          captureAssistedCommitSnapshot(repository, {
            ...input,
            files: input.files.map(file => file.withSelection(partial)),
          }),
          error =>
            error instanceof AssistedCommitError &&
            error.code === 'unsafe-selection'
        )
      }
      assert.strictEqual(await count(repository), 1)
    })
  }

  it('never runs automatic object maintenance against a private ref view of the shared object database', async t => {
    const repository = await seed(t, { file: 'old\n' })
    // Git's gc.auto heuristic samples loose objects in the 17 shard.
    let found = 0
    for (let i = 0; found < 2; i++) {
      const bytes = Buffer.from(`unreferenced object ${i}\n`)
      const sha = createHash('sha1')
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest('hex')
      if (sha.startsWith('17')) {
        assert.strictEqual(
          await rawGit(repository, ['hash-object', '-w', '--stdin'], {
            stdin: bytes,
          }),
          sha
        )
        found++
      }
    }
    await rawGit(repository, ['config', 'gc.auto', '1'])
    await rawGit(repository, ['config', 'gc.autoDetach', 'false'])
    await rawGit(repository, ['config', 'maintenance.auto', 'true'])
    await writeFile(join(repository.path, 'file'), 'selected\n')
    const input = await request(repository)
    await writeHook(
      repository,
      'pre-auto-gc',
      'printf attempted > auto-gc-ran\nexit 1'
    )
    const result = await single(repository, input)
    assert.strictEqual(
      await optionalBytes(join(repository.path, 'auto-gc-ran')),
      null
    )
    assert.strictEqual(await count(repository), 2)
    finalizeAssistedCommitTransaction(result)
  })

  it('preserves symbolic remote refs in the private hook context', async t => {
    const repository = await seed(t, { file: 'old\n' })
    await rawGit(repository, [
      'update-ref',
      'refs/remotes/origin/master',
      await tip(repository),
    ])
    await rawGit(repository, [
      'symbolic-ref',
      'refs/remotes/origin/HEAD',
      'refs/remotes/origin/master',
    ])
    await writeFile(join(repository.path, 'file'), 'selected\n')
    const input = await request(repository)
    await writeHook(
      repository,
      'pre-commit',
      'test "$(git symbolic-ref refs/remotes/origin/HEAD)" = refs/remotes/origin/master'
    )
    const result = await single(repository, input)
    assert.strictEqual(await count(repository), 2)
    finalizeAssistedCommitTransaction(result)
  })

  it('preserves shallow boundaries for private commit hooks', async t => {
    const source = await seed(t, { file: 'one\n' })
    await writeFile(join(source.path, 'file'), 'two\n')
    await rawGit(source, ['add', '--', 'file'])
    await rawGit(source, ['commit', '-m', 'Second original commit'])
    const root = await createTempDirectory(t)
    await rawGit(source, [
      'clone',
      '--depth=1',
      '--no-local',
      '--',
      source.path,
      root,
    ])
    const repository = new Repository(root, -2, null, false)
    assert.strictEqual(
      await rawGit(repository, ['rev-parse', '--is-shallow-repository']),
      'true'
    )
    await writeFile(join(root, 'file'), 'selected\n')
    const input = await request(repository)
    await writeHook(
      repository,
      'pre-commit',
      'test "$(git rev-parse --is-shallow-repository)" = true'
    )
    const result = await single(repository, input)
    assert.strictEqual(await count(repository), 2)
    finalizeAssistedCommitTransaction(result)
  })

  it('rejects replacement history that could introduce an unselected raw HEAD delta', async t => {
    const repository = await seed(t, {
      file: 'old\n',
      other: 'original other\n',
    })
    const original = await tip(repository)
    await writeFile(join(repository.path, 'other'), 'replacement other\n')
    const replacementIndex = join(await createTempDirectory(t), 'index')
    const env = { GIT_INDEX_FILE: replacementIndex }
    await rawGit(repository, ['read-tree', original], { env })
    await rawGit(repository, ['add', '--', 'other'], { env })
    const tree = await rawGit(repository, ['write-tree'], { env })
    const replacement = await rawGit(repository, [
      'commit-tree',
      tree,
      '-m',
      'Replacement root',
    ])
    await rawGit(repository, ['replace', original, replacement])
    await writeFile(join(repository.path, 'file'), 'selected\n')
    const input = await request(repository, ['file'])
    const originalIndex = await readFile(await indexPath(repository))
    await assert.rejects(
      withAssistedCommitSnapshot(repository, input, async () => {}),
      error =>
        error instanceof AssistedCommitError &&
        error.code === 'unsafe-selection'
    )
    assert.strictEqual(await tip(repository), original)
    assert.deepStrictEqual(
      await readFile(await indexPath(repository)),
      originalIndex
    )
  })

  for (const interference of ['advance', 'switch']) {
    it(`refuses index-only rollback retry after external HEAD ${interference}`, async t => {
      const repository = await seed(t, { file: 'old\n', other: 'base\n' })
      const original = await tip(repository)
      await writeFile(join(repository.path, 'other'), 'original staging\n')
      await rawGit(repository, ['add', '--', 'other'])
      await writeFile(join(repository.path, 'file'), 'selected\n')
      const input = await request(repository, ['file'])
      const result = await single(repository, input)
      const installed = await readFile(await indexPath(repository))
      const lock = `${await indexPath(repository)}.lock`
      await writeFile(lock, 'external lock')
      await assert.rejects(
        rollbackAssistedCommitTransaction(result),
        error =>
          error instanceof AssistedCommitError &&
          error.recovery?.history === 'restored' &&
          error.recovery.index === 'interfered'
      )
      await unlink(lock)
      let expected = original
      if (interference === 'advance') {
        const tree = await rawGit(repository, [
          'rev-parse',
          `${original}^{tree}`,
        ])
        expected = await rawGit(repository, [
          'commit-tree',
          tree,
          '-p',
          original,
          '-m',
          'External commit',
        ])
        await rawGit(repository, ['update-ref', 'HEAD', expected, original])
      } else {
        await rawGit(repository, [
          'update-ref',
          'refs/heads/external',
          original,
        ])
        await rawGit(repository, [
          'symbolic-ref',
          'HEAD',
          'refs/heads/external',
        ])
      }
      await assert.rejects(
        rollbackAssistedCommitTransaction(result),
        error =>
          error instanceof AssistedCommitError &&
          error.code === 'recovery-failed' &&
          error.recovery?.history === 'interfered' &&
          error.recovery.index === 'interfered'
      )
      assert.strictEqual(await tip(repository), expected)
      assert.deepStrictEqual(
        await readFile(await indexPath(repository)),
        installed
      )
      finalizeAssistedCommitTransaction(result)
    })
  }

  it(
    'recognizes rollback ref restoration when Git fails afterwards and safely permits retry',
    { skip: process.platform === 'win32' },
    async t => {
      const repository = await seed(t, { file: 'old\n', other: 'base\n' })
      const original = await tip(repository)
      await writeFile(join(repository.path, 'other'), 'original staging\n')
      await rawGit(repository, ['add', '--', 'other'])
      await writeFile(join(repository.path, 'file'), 'selected\n')
      const input = await request(repository, ['file'])
      const originalIndex = await readFile(await indexPath(repository))
      const result = await single(repository, input)
      await writeHook(
        repository,
        'reference-transaction',
        [
          'if test "$1" != committed || test -f rollback-failed-once; then exit 0; fi',
          'printf failed > rollback-failed-once',
          'kill -TERM "$PPID"',
        ].join('\n')
      )
      await assert.rejects(
        rollbackAssistedCommitTransaction(result),
        error =>
          error instanceof AssistedCommitError &&
          error.code === 'recovery-failed' &&
          error.recovery?.history === 'restored'
      )
      assert.strictEqual(await tip(repository), original)
      await rollbackAssistedCommitTransaction(result)
      assert.deepStrictEqual(
        await readFile(await indexPath(repository)),
        originalIndex
      )
      assert.strictEqual(await count(repository), 1)
    }
  )

  it('preserves tracked symlink placeholder mode and literal target bytes with core.symlinks=false', async t => {
    const repository = await seed(t, { first: 'one\n', second: 'two\n' })
    await rawGit(repository, ['config', 'core.symlinks', 'false'])
    const target = await rawGit(repository, ['hash-object', '-w', '--stdin'], {
      stdin: 'first',
    })
    await writeFile(join(repository.path, 'link'), 'first')
    await rawGit(repository, [
      'update-index',
      '--add',
      '--cacheinfo',
      '120000',
      target,
      'link',
    ])
    await rawGit(repository, ['commit', '-m', 'Add recorded symlink'])
    await writeFile(join(repository.path, 'link'), 'second')
    const result = await single(repository, await request(repository, ['link']))
    assert.match(
      await rawGit(repository, ['ls-tree', result.commits[0], '--', 'link']),
      /^120000 blob /
    )
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'link'),
      Buffer.from('second')
    )
    assert.ok((await lstat(join(repository.path, 'link'))).isFile())
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'link')),
      Buffer.from('second')
    )
  })

  it('does not start commit hooks when cancellation arrives during private preparation', async t => {
    const repository = await seed(t, { file: 'old\n' })
    const original = await tip(repository)
    await writeFile(join(repository.path, 'file'), 'selected\n')
    const input = await request(repository)
    await writeHook(
      repository,
      'pre-commit',
      'printf "unexpected hook edit\\n" > file\nprintf started > cancelled-hook-started'
    )
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    await assert.rejects(
      single(repository, input, {
        signal: controller.signal,
        onProgress: progress => {
          if (progress.kind === 'committing') {
            timer = setTimeout(() => controller.abort(), 1)
          }
        },
      }),
      error =>
        error instanceof AssistedCommitError && error.code === 'cancelled'
    )
    if (timer !== undefined) {
      clearTimeout(timer)
    }
    assert.strictEqual(
      await optionalBytes(join(repository.path, 'cancelled-hook-started')),
      null
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'file')),
      Buffer.from('selected\n')
    )
    assert.strictEqual(await tip(repository), original)
  })

  for (const state of ['attached', 'unborn', 'detached']) {
    it(`holds HEAD identity without ref/reflog writes during guarded index work (${state})`, async t => {
      const repository =
        state === 'unborn'
          ? await setupEmptyRepository(t)
          : await seed(t, { file: 'old\n' })
      const original = state === 'unborn' ? null : await tip(repository)
      if (state === 'detached' && original !== null) {
        await rawGit(repository, ['checkout', '--detach', original])
      }
      const directory = await rawGit(repository, [
        'rev-parse',
        '--absolute-git-dir',
      ])
      const head = await readFile(join(directory, 'HEAD'))
      const reflog = await optionalBytes(join(directory, 'logs', 'HEAD'))
      await withRefLock(
        repository,
        state === 'detached' ? 'HEAD' : 'refs/heads/master',
        original ?? '0'.repeat(40),
        async () => {
          const attempt = await exec(
            ['symbolic-ref', 'HEAD', 'refs/heads/external'],
            repository.path
          )
          assert.notStrictEqual(attempt.exitCode, 0)
          assert.match(attempt.stderr, /HEAD\.lock/)
          assert.deepStrictEqual(await readFile(join(directory, 'HEAD')), head)
        }
      )
      assert.deepStrictEqual(await readFile(join(directory, 'HEAD')), head)
      assert.deepStrictEqual(
        await optionalBytes(join(directory, 'logs', 'HEAD')),
        reflog
      )
      assert.strictEqual(await count(repository), state === 'unborn' ? 0 : 1)
    })
  }

  it(
    'restores the index without creating a child-owned abort transaction',
    { skip: process.platform === 'win32' },
    async t => {
      const repository = await seed(t, { file: 'old\n', other: 'base\n' })
      const original = await tip(repository)
      await writeFile(join(repository.path, 'other'), 'original staging\n')
      await rawGit(repository, ['add', '--', 'other'])
      await writeFile(join(repository.path, 'file'), 'selected\n')
      const input = await request(repository, ['file'])
      const originalIndex = await readFile(await indexPath(repository))
      const result = await single(repository, input)
      await writeHook(
        repository,
        'reference-transaction',
        [
          'if test "$1" != aborted || test -f index-guard-failed-once; then exit 0; fi',
          'printf failed > index-guard-failed-once',
          'kill -TERM "$PPID"',
        ].join('\n')
      )
      const recovery = await rollbackAssistedCommitTransaction(result)
      assert.strictEqual(recovery.history, 'restored')
      assert.strictEqual(recovery.index, 'restored')
      assert.strictEqual(
        await optionalBytes(join(repository.path, 'index-guard-failed-once')),
        null
      )
      assert.strictEqual(await tip(repository), original)
      assert.deepStrictEqual(
        await readFile(await indexPath(repository)),
        originalIndex
      )
    }
  )

  for (const spelling of ['git-output', 'directory-alias']) {
    it(`holds the final owned HEAD across index synchronization (${spelling})`, async t => {
      const repository = await seed(t, { file: 'old\n', other: 'base\n' })
      await writeFile(join(repository.path, 'other'), 'pre-run staging\n')
      await rawGit(repository, ['add', '--', 'other'])
      await writeFile(join(repository.path, 'file'), 'selected\n')
      const input = await request(repository, ['file'])
      const actualIndex = await indexPath(repository)
      const alias = join(await createTempDirectory(t), 'metadata-alias')
      await symlink(
        await realpath(dirname(actualIndex)),
        alias,
        process.platform === 'win32' ? 'junction' : 'dir'
      )
      const realIndex =
        spelling === 'directory-alias' ? join(alias, 'index') : actualIndex
      const matchesIndex = await createPathMatcher(realIndex)
      const originalRename = FileSystem.rename
      let attemptCode: number | undefined
      t.mock.method(
        FileSystem,
        'rename',
        async (
          source: Parameters<typeof FileSystem.rename>[0],
          destination: Parameters<typeof FileSystem.rename>[1]
        ) => {
          if (await matchesIndex(destination)) {
            let terminated = false
            let childExited = false
            let childFailed = false
            let result: IGitResult | undefined
            let executionError: unknown
            try {
              result = await exec(['update-ref', '--stdin'], repository.path, {
                processCallback: child => {
                  child.once('exit', (code, signal) => {
                    childExited = true
                    childFailed =
                      signal === 'SIGTERM' || (code !== null && code !== 0)
                  })
                  child.stdin?.write('start\n')
                  const timeout = setTimeout(() => {
                    if (
                      child.pid !== undefined &&
                      child.exitCode === null &&
                      child.signalCode === null
                    ) {
                      terminated = globalThis.process.kill(child.pid, 'SIGTERM')
                    }
                  }, 10)
                  child.once('close', () => clearTimeout(timeout))
                },
              })
            } catch (error) {
              executionError = error
            }
            assert.ok(
              terminated,
              'The helper Git process must actually be terminated'
            )
            assert.ok(
              childExited && childFailed,
              'The helper must exit unsuccessfully before checking the parent-owned guard'
            )
            // Dugite rejects POSIX signals but resolves Windows numeric exits.
            if (result === undefined) {
              assert.ok(executionError instanceof Error)
            } else {
              assert.notStrictEqual(result.exitCode, 0)
            }
            const current = await tip(repository)
            await rawGit(repository, [
              'update-ref',
              'refs/heads/external',
              current,
            ])
            const attempt = await exec(
              ['symbolic-ref', 'HEAD', 'refs/heads/external'],
              repository.path
            )
            attemptCode = attempt.exitCode
          }
          return originalRename(source, destination)
        }
      )
      const result = await single(repository, input)
      assert.notStrictEqual(attemptCode, undefined)
      assert.notStrictEqual(attemptCode, 0)
      assert.strictEqual(
        await rawGit(repository, ['symbolic-ref', 'HEAD']),
        'refs/heads/master'
      )
      assert.strictEqual(await tip(repository), result.commits[0])
      finalizeAssistedCommitTransaction(result)
    })
  }

  it(
    'joins a guarded action when its Git process fails during asynchronous work',
    { skip: process.platform === 'win32' },
    async t => {
      const repository = await seed(t, { file: 'old\n' })
      const original = await tip(repository)
      await writeHook(
        repository,
        'reference-transaction',
        'if test "$1" = prepared; then printf "%s" "$PPID" > guarding-process; fi'
      )
      let resume: () => void = () => {}
      let started: () => void = () => {}
      const paused = new Promise<void>(resolve => {
        resume = resolve
      })
      const actionStarted = new Promise<void>(resolve => {
        started = resolve
      })
      let actionSettled = false
      let returned = false
      const operation = updateRefWithVerification(
        repository,
        'refs/heads/master',
        original,
        original,
        'test joined verification',
        async () => {
          started()
          await paused
          actionSettled = true
        }
      ).then(
        () => {
          returned = true
          return null
        },
        error => {
          returned = true
          return error
        }
      )
      await actionStarted
      const pid = Number(
        await readFile(join(repository.path, 'guarding-process'), 'utf8')
      )
      process.kill(pid, 'SIGTERM')
      await new Promise(resolve => setTimeout(resolve, 100))
      const abandoned = returned
      resume()
      const error = await operation
      assert.ok(error instanceof Error)
      assert.ok(actionSettled)
      assert.strictEqual(abandoned, false)
    }
  )

  it(
    'retains parent-owned HEAD protection throughout delayed recovery I/O',
    { skip: process.platform === 'win32' },
    async t => {
      const repository = await seed(t, { file: 'old\n', other: 'base\n' })
      const original = await tip(repository)
      await writeFile(join(repository.path, 'other'), 'pre-run staging\n')
      await rawGit(repository, ['add', '--', 'other'])
      await writeFile(join(repository.path, 'file'), 'selected\n')
      const input = await request(repository, ['file'])
      const originalIndex = await readFile(await indexPath(repository))
      const result = await single(repository, input)
      const realLock = `${await indexPath(repository)}.lock`
      const matchesLock = await createPathMatcher(realLock)
      await writeHook(
        repository,
        'reference-transaction',
        'if test "$1" = prepared; then printf "%s" "$PPID" > guarding-process; fi'
      )
      const originalOpen = FileSystem.open
      let checked = false
      let ioSettled = false
      t.mock.method(
        FileSystem,
        'open',
        async (...args: Parameters<typeof FileSystem.open>) => {
          const handle = await originalOpen(...args)
          if (await matchesLock(args[0])) {
            const originalSync = handle.sync.bind(handle)
            t.mock.method(handle, 'sync', async () => {
              await originalSync()
              if (!checked) {
                checked = true
                await rawGit(repository, ['rev-parse', 'HEAD'])
                const attempt = await exec(
                  ['symbolic-ref', 'HEAD', 'refs/heads/external'],
                  repository.path
                )
                assert.notStrictEqual(attempt.exitCode, 0)
                assert.match(attempt.stderr, /HEAD\.lock/)
                await new Promise(resolve => setTimeout(resolve, 100))
                ioSettled = true
              }
            })
          }
          return handle
        }
      )
      const recovery = await rollbackAssistedCommitTransaction(result)
      assert.ok(checked)
      assert.ok(ioSettled)
      assert.strictEqual(await tip(repository), original)
      assert.deepStrictEqual(
        await readFile(await indexPath(repository)),
        originalIndex
      )
      assert.strictEqual(await optionalBytes(realLock), null)
      assert.strictEqual(recovery.index, 'restored')
      assert.deepStrictEqual(
        await readFile(await indexPath(repository)),
        originalIndex
      )
    }
  )

  it('rejects a hook replacement that conceals an unselected raw commit tree', async t => {
    const repository = await seed(t, { file: 'old\n', other: 'base\n' })
    const original = await tip(repository)
    await writeFile(join(repository.path, 'file'), 'selected\n')
    await writeFile(join(repository.path, 'other'), 'UNSELECTED CONTENT\n')
    const input = await request(repository, ['file'])
    const originalIndex = await readFile(await indexPath(repository))
    await writeHook(
      repository,
      'post-commit',
      [
        'good=$(git rev-parse HEAD)',
        'parent=$(git rev-parse "$good^")',
        'git add -- other',
        'tree=$(git write-tree)',
        'bad=$(printf "Incorrect raw tree\\n" | git commit-tree "$tree" -p "$parent")',
        'git update-ref HEAD "$bad" "$good"',
        'git replace "$bad" "$good"',
        'git read-tree "$good"',
      ].join('\n')
    )
    await assert.rejects(
      single(repository, input),
      error =>
        error instanceof AssistedCommitError && error.code === 'commit-failed'
    )
    assert.strictEqual(await tip(repository), original)
    assert.deepStrictEqual(
      await readFile(await indexPath(repository)),
      originalIndex
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'other')),
      Buffer.from('UNSELECTED CONTENT\n')
    )
  })

  it('retains a retry capability when cancelled execution cannot restore its installed index', async t => {
    const repository = await seed(t, { file: 'old\n', other: 'base\n' })
    const original = await tip(repository)
    await writeFile(join(repository.path, 'other'), 'pre-run staging\n')
    await rawGit(repository, ['add', '--', 'other'])
    await writeFile(join(repository.path, 'file'), 'selected\n')
    const input = await request(repository, ['file'])
    const originalIndex = await readFile(await indexPath(repository))
    const realIndex = await indexPath(repository)
    const matchesIndex = await createPathMatcher(realIndex)
    const externalLock = `${realIndex}.lock`
    const controller = new AbortController()
    const originalRename = FileSystem.rename
    let interrupted = false
    t.mock.method(
      FileSystem,
      'rename',
      async (
        source: Parameters<typeof FileSystem.rename>[0],
        destination: Parameters<typeof FileSystem.rename>[1]
      ) => {
        await originalRename(source, destination)
        if ((await matchesIndex(destination)) && !interrupted) {
          interrupted = true
          controller.abort()
          await writeFile(externalLock, 'external staging lock')
        }
      }
    )
    let failure: AssistedCommitError | undefined
    await assert.rejects(
      single(repository, input, { signal: controller.signal }),
      error => {
        assert.ok(error instanceof AssistedCommitError)
        failure = error
        assert.strictEqual(error.recovery?.history, 'restored')
        assert.strictEqual(error.recovery?.index, 'interfered')
        assert.ok(error.recovery?.retryToken)
        return true
      }
    )
    assert.ok(
      interrupted,
      'Cancellation must occur after installing the real index'
    )
    assert.strictEqual(await tip(repository), original)
    await unlink(externalLock)
    const token = failure?.recovery?.retryToken
    assert.ok(token)
    await rollbackAssistedCommitTransaction(token)
    assert.deepStrictEqual(await readFile(realIndex), originalIndex)
    const snapshot = failure?.recovery?.snapshot
    assert.ok(snapshot)
    assert.throws(() => getSnapshotData(snapshot), /disposed/)
  })

  for (const selection of [
    'new-untracked-mode',
    'group-only-full',
    'group-only-partial',
  ]) {
    it(
      `matches native Git executable modes for ${selection}`,
      { skip: process.platform === 'win32' },
      async t => {
        const repository = await seed(t, { file: 'old\n' })
        const path = selection === 'new-untracked-mode' ? 'new-file' : 'file'
        if (selection === 'new-untracked-mode') {
          await rawGit(repository, ['config', 'core.filemode', 'false'])
        }
        await writeFile(join(repository.path, path), 'selected\n')
        await chmod(
          join(repository.path, path),
          selection === 'new-untracked-mode' ? 0o755 : 0o654
        )
        const input = await request(repository, [path])
        const files =
          selection === 'group-only-partial'
            ? input.files.map(file =>
                file.withSelection(
                  DiffSelection.fromInitialSelection(
                    DiffSelectionType.None
                  ).withLineSelection(2, true)
                )
              )
            : input.files
        const result = await single(repository, { ...input, files })
        assert.match(
          await rawGit(repository, ['ls-tree', result.commits[0], '--', path]),
          /^100644 blob /
        )
        finalizeAssistedCommitTransaction(result)
      }
    )
  }
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

  it('rejects a late parent header that Git interprets as a disconnected root', async t => {
    const repository = await seed(t, { file: 'old\n' })
    const original = await tip(repository)
    await writeFile(join(repository.path, 'file'), 'selected\n')
    const input = await request(repository)
    await writeHook(
      repository,
      'post-commit',
      [
        'good=$(git rev-parse HEAD)',
        'tree=$(git rev-parse "$good^{tree}")',
        'parent=$(git rev-parse "$good^")',
        'author=$(git var GIT_AUTHOR_IDENT)',
        'committer=$(git var GIT_COMMITTER_IDENT)',
        'bad=$(printf "tree %s\\nauthor %s\\ncommitter %s\\nparent %s\\n\\nLate parent\\n" "$tree" "$author" "$committer" "$parent" | git hash-object -w -t commit --stdin)',
        'git update-ref HEAD "$bad" "$good"',
      ].join('\n')
    )
    await assert.rejects(
      single(repository, input),
      error =>
        error instanceof AssistedCommitError && error.code === 'commit-failed'
    )
    assert.strictEqual(await tip(repository), original)
    assert.strictEqual(await count(repository), 1)
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

  it('formats captured trailers with frozen configuration rather than live repository policy', async t => {
    const repository = await seed(t, { file: 'old\n' })
    await rawGit(repository, ['config', 'trailer.ifMissing', 'add'])
    await writeFile(join(repository.path, 'file'), 'selected\n')
    const input = await request(repository, ['file'], {
      trailers: [{ token: 'Co-authored-by', value: 'Peer <peer@example.com>' }],
    })
    await withAssistedCommitSnapshot(repository, input, async snapshot => {
      await rawGit(repository, ['config', 'trailer.ifMissing', 'doNothing'])
      const proposal = createSingleAssistedCommitPlan(snapshot, {
        reason: 'uncertain-boundaries',
        title: 'Selected',
      })
      const checked = await validateAssistedCommitPlan(snapshot, proposal)
      const result = await executeAssistedCommitPlan(snapshot, checked)
      assert.match(
        await rawGit(repository, [
          'show',
          '-s',
          '--format=%B',
          result.commits[0],
        ]),
        /Co-authored-by: Peer <peer@example.com>/
      )
      finalizeAssistedCommitTransaction(result)
    })
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
  for (const target of ['index', 'HEAD', 'branch']) {
    it(`unwinds an exclusive ${target} lock after a one-shot initialization stat failure`, async t => {
      const repository = await seed(t, { file: 'old\n' })
      const original = await tip(repository)
      await writeFile(join(repository.path, 'file'), 'selected\n')
      const input = await request(repository)
      const path =
        target === 'index'
          ? `${await indexPath(repository)}.lock`
          : `${await rawGit(repository, [
              'rev-parse',
              '--path-format=absolute',
              '--git-path',
              target === 'HEAD' ? 'HEAD' : 'refs/heads/master',
            ])}.lock`
      const originalOpen = FileSystem.open
      const matchesLock = await createPathMatcher(path)
      let failed = false
      t.mock.method(
        FileSystem,
        'open',
        async (...args: Parameters<typeof FileSystem.open>) => {
          const handle = await originalOpen(...args)
          if ((await matchesLock(args[0])) && !failed) {
            const originalStat = handle.stat.bind(handle)
            t.mock.method(handle, 'stat', async () => {
              if (!failed) {
                failed = true
                throw new Error('Injected one-shot lock stat EIO')
              }
              return originalStat()
            })
          }
          return handle
        }
      )
      if (target === 'index') {
        await assert.rejects(
          single(repository, input),
          /Injected one-shot|initialization/
        )
      } else {
        await assert.rejects(
          withRefLock(
            repository,
            'refs/heads/master',
            original,
            async () => {}
          ),
          /Injected one-shot|initialization/
        )
      }
      assert.ok(failed)
      assert.strictEqual(await optionalBytes(path), null)
      assert.strictEqual(await tip(repository), original)
      assert.strictEqual(
        await optionalBytes(
          `${await rawGit(repository, [
            'rev-parse',
            '--path-format=absolute',
            '--git-path',
            'HEAD',
          ])}.lock`
        ),
        null
      )
    })
  }
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
  it(
    'rejects symlink HEAD before any transaction can publish history',
    { skip: process.platform === 'win32' },
    async t => {
      const repository = await seed(t, { file: 'old\n' })
      const original = await tip(repository)
      await writeFile(join(repository.path, 'file'), 'selected\n')
      const input = await request(repository)
      const originalIndex = await readFile(await indexPath(repository))
      const headPath = await rawGit(repository, [
        'rev-parse',
        '--path-format=absolute',
        '--git-path',
        'HEAD',
      ])
      const ref = await rawGit(repository, ['symbolic-ref', 'HEAD'])
      await unlink(headPath)
      await symlink(ref, headPath)
      await assert.rejects(
        single(repository, input),
        error =>
          error instanceof AssistedCommitError &&
          error.code === 'unsafe-selection'
      )
      assert.strictEqual(await tip(repository), original)
      assert.strictEqual(await count(repository), 1)
      assert.ok((await lstat(headPath)).isSymbolicLink())
      assert.deepStrictEqual(
        await readFile(await indexPath(repository)),
        originalIndex
      )
      assert.deepStrictEqual(
        await readFile(join(repository.path, 'file')),
        Buffer.from('selected\n')
      )
    }
  )
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
  it('captures present fully selected binary bytes after an index-only deletion', async t => {
    const repository = await seed(t, {
      'asset.bin': Buffer.from([0, 1, 2]),
    })
    await rawGit(repository, ['rm', '--cached', '--', 'asset.bin'])
    const selectedBytes = Buffer.from([0, 3, 4])
    await writeFile(join(repository.path, 'asset.bin'), selectedBytes)
    const input = await request(repository, ['asset.bin'])
    const selected = input.files.find(
      file => file.status.kind === AppFileStatusKind.Untracked
    )
    assert.ok(selected)
    const result = await single(repository, { ...input, files: [selected] })
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(await tip(repository), result.commits[0])
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'asset.bin'),
      selectedBytes
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'asset.bin')),
      selectedBytes
    )
    finalizeAssistedCommitTransaction(result)
  })
  it('excludes pre-existing staged executable mode when core.filemode=false', async t => {
    const repository = await seed(t, { file: 'original\n' })
    await rawGit(repository, ['config', 'core.filemode', 'false'])
    await rawGit(repository, ['update-index', '--chmod=+x', '--', 'file'])
    await writeFile(join(repository.path, 'file'), 'SELECTED\n')
    const result = await single(repository, await request(repository, ['file']))
    assert.strictEqual(await count(repository), 2)
    assert.match(
      await rawGit(repository, ['ls-tree', 'HEAD', '--', 'file']),
      /^100644 /
    )
    assert.deepStrictEqual(
      await commitBytes(repository, result.commits[0], 'file'),
      Buffer.from('SELECTED\n')
    )
    finalizeAssistedCommitTransaction(result)
  })
  it('retries failed owned index-lock close without abandoning its handle or path', async t => {
    const repository = await seed(t, { file: 'original\n' })
    const original = await tip(repository)
    await writeFile(join(repository.path, 'file'), 'SELECTED\n')
    const input = await request(repository, ['file'])
    const originalIndex = await readFile(await indexPath(repository))
    const realLock = `${await indexPath(repository)}.lock`
    const matchesLock = await createPathMatcher(realLock)
    const originalOpen = FileSystem.open
    let closes = 0
    let descriptor: (() => number) | undefined
    let closeOwnedHandle: (() => Promise<void>) | undefined
    t.after(async () => {
      if (descriptor?.() !== -1) {
        await closeOwnedHandle?.()
      }
    })
    t.mock.method(
      FileSystem,
      'open',
      async (...args: Parameters<typeof FileSystem.open>) => {
        const handle = await originalOpen(...args)
        if (await matchesLock(args[0])) {
          const close = handle.close.bind(handle)
          descriptor = () => handle.fd
          closeOwnedHandle = close
          t.mock.method(handle, 'close', async () => {
            closes++
            if (closes === 1) {
              throw new Error('Injected one-shot owned index-lock close EIO')
            }
            return close()
          })
        }
        return handle
      }
    )
    const controller = new AbortController()
    let failure: AssistedCommitError | undefined
    await assert.rejects(
      single(repository, input, {
        signal: controller.signal,
        onProgress: progress => {
          if (progress.kind === 'committed') {
            controller.abort()
          }
        },
      }),
      error => {
        assert.ok(error instanceof AssistedCommitError)
        failure = error
        return error.code === 'recovery-failed'
      }
    )
    const token = failure?.recovery?.retryToken
    assert.ok(token)
    const recovered = await rollbackAssistedCommitTransaction(token)
    assert.deepStrictEqual(recovered.errors, [])
    assert.strictEqual(await tip(repository), original)
    assert.strictEqual(await count(repository), 1)
    assert.deepStrictEqual(
      await readFile(await indexPath(repository)),
      originalIndex
    )
    assert.strictEqual(await optionalBytes(realLock), null)
    assert.ok(closes >= 2)
    assert.strictEqual(descriptor?.(), -1)
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'file')),
      Buffer.from('SELECTED\n')
    )
  })
  for (const fault of ['index-close', 'HEAD-close', 'index-unlink']) {
    it(`retains cleanup capability across repeated ${fault} failures`, async t => {
      const repository = await seed(t, { file: 'original\n' })
      const original = await tip(repository)
      await writeFile(join(repository.path, 'file'), 'SELECTED\n')
      const input = await request(repository, ['file'])
      const realIndex = await indexPath(repository)
      const originalIndex = await readFile(realIndex)
      const directory = await rawGit(repository, [
        'rev-parse',
        '--absolute-git-dir',
      ])
      const target =
        fault === 'HEAD-close'
          ? join(directory, 'HEAD.lock')
          : `${realIndex}.lock`
      const matchesLock = await createPathMatcher(target)
      let failCleanup = true
      let injected = 0
      const handles: Array<{
        readonly fd: () => number
        readonly close: () => Promise<void>
      }> = []
      t.after(async () => {
        for (const handle of handles) {
          if (handle.fd() !== -1) {
            await handle.close()
          }
        }
      })
      if (fault === 'index-unlink') {
        const originalUnlink = FileSystem.unlink
        t.mock.method(
          FileSystem,
          'unlink',
          async (...args: Parameters<typeof FileSystem.unlink>) => {
            if ((await matchesLock(args[0])) && failCleanup) {
              injected++
              throw new Error('Injected persistent owned-lock unlink EIO')
            }
            return originalUnlink(...args)
          }
        )
      } else {
        const originalOpen = FileSystem.open
        t.mock.method(
          FileSystem,
          'open',
          async (...args: Parameters<typeof FileSystem.open>) => {
            const handle = await originalOpen(...args)
            if (await matchesLock(args[0])) {
              const close = handle.close.bind(handle)
              handles.push({ fd: () => handle.fd, close })
              t.mock.method(handle, 'close', async () => {
                if (failCleanup) {
                  injected++
                  throw new Error('Injected persistent owned-lock close EIO')
                }
                return close()
              })
            }
            return handle
          }
        )
      }
      const controller = new AbortController()
      let failure: AssistedCommitError | undefined
      await assert.rejects(
        single(repository, input, {
          signal: controller.signal,
          onProgress: progress => {
            if (fault !== 'HEAD-close' && progress.kind === 'committed') {
              controller.abort()
            }
          },
        }),
        error => {
          assert.ok(error instanceof AssistedCommitError)
          failure = error
          return error.code === 'recovery-failed'
        }
      )
      assert.ok(injected > 0, 'Owned-lock cleanup fault must be exercised')
      const token = failure?.recovery?.retryToken
      assert.ok(token)
      assert.throws(
        () => finalizeAssistedCommitTransaction(token),
        error =>
          error instanceof AssistedCommitError &&
          error.code === 'cleanup-failed'
      )
      const beforeRetry = injected
      await assert.rejects(
        rollbackAssistedCommitTransaction(token),
        error =>
          error instanceof AssistedCommitError &&
          error.code === 'recovery-failed'
      )
      assert.ok(
        injected > beforeRetry,
        'Retry must exercise the same cleanup fault'
      )
      failCleanup = false
      const recovery = await rollbackAssistedCommitTransaction(token)
      assert.deepStrictEqual(recovery.errors, [])
      assert.strictEqual(await tip(repository), original)
      assert.strictEqual(await count(repository), 1)
      assert.deepStrictEqual(await readFile(realIndex), originalIndex)
      assert.strictEqual(await optionalBytes(target), null)
      assert.ok(handles.every(handle => handle.fd() === -1))
      assert.deepStrictEqual(
        await readFile(join(repository.path, 'file')),
        Buffer.from('SELECTED\n')
      )
    })
  }
  for (const target of ['index', 'HEAD']) {
    it(`retains ${target} ownership when initialization stat and cleanup both fail`, async t => {
      const repository = await seed(t, { file: 'original\n' })
      const original = await tip(repository)
      await writeFile(join(repository.path, 'file'), 'SELECTED\n')
      const input = await request(repository, ['file'])
      const realIndex = await indexPath(repository)
      const originalIndex = await readFile(realIndex)
      const directory = await rawGit(repository, [
        'rev-parse',
        '--absolute-git-dir',
      ])
      const path =
        target === 'index' ? `${realIndex}.lock` : join(directory, 'HEAD.lock')
      const matchesLock = await createPathMatcher(path)
      const originalOpen = FileSystem.open
      const originalUnlink = FileSystem.unlink
      let failFirstStat = true
      let failCleanup = true
      let failedUnlinks = 0
      t.after(async () => {
        if ((await optionalBytes(path)) !== null) {
          await originalUnlink(path)
        }
      })
      t.mock.method(
        FileSystem,
        'open',
        async (...args: Parameters<typeof FileSystem.open>) => {
          const handle = await originalOpen(...args)
          if (await matchesLock(args[0])) {
            const stat = handle.stat.bind(handle)
            t.mock.method(handle, 'stat', async () => {
              if (failFirstStat) {
                failFirstStat = false
                throw new Error('Injected initialization stat EIO')
              }
              return stat()
            })
          }
          return handle
        }
      )
      t.mock.method(
        FileSystem,
        'unlink',
        async (...args: Parameters<typeof FileSystem.unlink>) => {
          if ((await matchesLock(args[0])) && failCleanup) {
            failedUnlinks++
            throw new Error('Injected initialization cleanup unlink EIO')
          }
          return originalUnlink(...args)
        }
      )
      let failure: AssistedCommitError | undefined
      await assert.rejects(single(repository, input), error => {
        assert.ok(error instanceof AssistedCommitError)
        failure = error
        return error.code === 'recovery-failed'
      })
      assert.strictEqual(
        failFirstStat,
        false,
        'Initialization stat fault must fire'
      )
      assert.ok(failedUnlinks > 0, 'Initialization cleanup fault must fire')
      const token = failure?.recovery?.retryToken
      assert.ok(token)
      assert.ok((failure?.recovery?.errors.length ?? 0) > 0)
      failCleanup = false
      const recovery = await rollbackAssistedCommitTransaction(token)
      assert.deepStrictEqual(recovery.errors, [])
      assert.strictEqual(await optionalBytes(path), null)
      assert.strictEqual(await tip(repository), original)
      assert.strictEqual(await count(repository), 1)
      assert.deepStrictEqual(await readFile(realIndex), originalIndex)
      assert.deepStrictEqual(
        await readFile(join(repository.path, 'file')),
        Buffer.from('SELECTED\n')
      )
    })
  }
  it('preserves executor recovery capability when resource-scope disposal also fails', async t => {
    const repository = await seed(t, { file: 'original\n' })
    const original = await tip(repository)
    await writeFile(join(repository.path, 'file'), 'SELECTED\n')
    const input = await request(repository, ['file'])
    const originalIndex = await readFile(await indexPath(repository))
    const originalRemove = FileSystem.rm
    const directories = new Set<string>()
    let failCleanup = true
    t.after(async () => {
      for (const directory of directories) {
        await originalRemove(directory, { recursive: true, force: true })
      }
    })
    t.mock.method(
      FileSystem,
      'rm',
      async (...args: Parameters<typeof FileSystem.rm>) => {
        if (
          typeof args[0] === 'string' &&
          basename(args[0]).startsWith('desktop-assisted-commit-')
        ) {
          directories.add(args[0])
          if (failCleanup) {
            throw new Error('Injected persistent snapshot disposal EIO')
          }
        }
        return originalRemove(...args)
      }
    )
    const controller = new AbortController()
    let failure: AssistedCommitError | undefined
    await assert.rejects(
      single(repository, input, {
        signal: controller.signal,
        onProgress: progress => {
          if (progress.kind === 'committed') {
            controller.abort()
          }
        },
      }),
      error => {
        assert.ok(error instanceof AssistedCommitError)
        failure = error
        return error.code === 'recovery-failed'
      }
    )
    const token = failure?.recovery?.retryToken
    assert.ok(token)
    assert.strictEqual(failure?.recovery?.createdCommits.length, 1)
    assert.ok((failure?.recovery?.errors.length ?? 0) >= 2)
    failCleanup = false
    const recovery = await rollbackAssistedCommitTransaction(token)
    assert.deepStrictEqual(recovery.errors, [])
    assert.strictEqual(await tip(repository), original)
    assert.strictEqual(await count(repository), 1)
    assert.deepStrictEqual(
      await readFile(await indexPath(repository)),
      originalIndex
    )
    for (const directory of directories) {
      await assert.rejects(lstat(directory), { code: 'ENOENT' })
    }
  })
  it('retains an uninitialized handle until its owned inode can be observed', async t => {
    const repository = await seed(t, { file: 'original\n' })
    const original = await tip(repository)
    await writeFile(join(repository.path, 'file'), 'SELECTED\n')
    const input = await request(repository, ['file'])
    const realIndex = await indexPath(repository)
    const originalIndex = await readFile(realIndex)
    const target = `${realIndex}.lock`
    const matchesLock = await createPathMatcher(target)
    const originalOpen = FileSystem.open
    let failStat = true
    let failedStats = 0
    let descriptor: (() => number) | undefined
    let closeOwnedHandle: (() => Promise<void>) | undefined
    t.after(async () => {
      if (descriptor?.() !== -1) {
        await closeOwnedHandle?.()
      }
    })
    t.mock.method(
      FileSystem,
      'open',
      async (...args: Parameters<typeof FileSystem.open>) => {
        const handle = await originalOpen(...args)
        if (await matchesLock(args[0])) {
          const stat = handle.stat.bind(handle)
          descriptor = () => handle.fd
          closeOwnedHandle = handle.close.bind(handle)
          t.mock.method(handle, 'stat', async () => {
            if (failStat) {
              failedStats++
              throw new Error('Injected persistent owned inode observation EIO')
            }
            return stat()
          })
        }
        return handle
      }
    )
    let failure: AssistedCommitError | undefined
    await assert.rejects(single(repository, input), error => {
      assert.ok(error instanceof AssistedCommitError)
      failure = error
      return error.code === 'recovery-failed'
    })
    assert.ok(failedStats > 0, 'Unknown-inode observation fault must fire')
    const token = failure?.recovery?.retryToken
    assert.ok(token)
    assert.notStrictEqual(descriptor?.(), -1)
    await assert.rejects(
      rollbackAssistedCommitTransaction(token),
      error =>
        error instanceof AssistedCommitError && error.code === 'recovery-failed'
    )
    failStat = false
    const recovery = await rollbackAssistedCommitTransaction(token)
    assert.deepStrictEqual(recovery.errors, [])
    assert.strictEqual(descriptor?.(), -1)
    assert.strictEqual(await optionalBytes(target), null)
    assert.strictEqual(await tip(repository), original)
    assert.strictEqual(await count(repository), 1)
    assert.deepStrictEqual(await readFile(realIndex), originalIndex)
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'file')),
      Buffer.from('SELECTED\n')
    )
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
        'app/test/unit/git/assisted-commit-test.ts',
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
