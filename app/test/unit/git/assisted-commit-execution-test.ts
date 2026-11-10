import assert from 'node:assert'
import { createHash } from 'crypto'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { cp, lstat, readFile, symlink, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  AssistedCommitError,
  createSingleAssistedCommitPlan,
  executeAssistedCommitPlan,
  finalizeAssistedCommitTransaction,
  rollbackAssistedCommitTransaction,
  validateAssistedCommitPlan,
  withAssistedCommitSnapshot,
} from '../../../src/lib/git/assisted-commit'
import { setHooksEnvEnabled } from '../../../src/lib/hooks/config'
import { Repository } from '../../../src/models/repository'
import { createTempDirectory } from '../../helpers/temp'
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
  writeHook,
} from '../../helpers/assisted-commit'

describe('git/assisted-commit execution and hook context', () => {
  beforeEach(() => setHooksEnvEnabled(false))
  afterEach(() => localStorage.removeItem('git-hooks-env-enabled'))

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
})
