import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  symlink,
  unlink,
  writeFile,
} from 'fs/promises'
import { join } from 'path'
import {
  AssistedCommitError,
  captureAssistedCommitSnapshot,
  createSingleAssistedCommitPlan,
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
import {
  commitBytes,
  count,
  indexPath,
  optionalBytes,
  rawGit,
  request,
  seed,
  single,
  splitPlan,
  tip,
} from '../../helpers/assisted-commit'

describe('git/assisted-commit', () => {
  beforeEach(() => setHooksEnvEnabled(false))
  afterEach(() => localStorage.removeItem('git-hooks-env-enabled'))

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
})
