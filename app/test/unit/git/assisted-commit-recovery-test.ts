import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { exec } from 'dugite'
import { promises as FileSystem } from 'fs'
import { chmod, lstat, readFile, symlink, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  AssistedCommitError,
  captureAssistedCommitSnapshot,
  disposeAssistedCommitSnapshot,
  executeAssistedCommitPlan,
  finalizeAssistedCommitTransaction,
  rollbackAssistedCommitTransaction,
  validateAssistedCommitPlan,
  withAssistedCommitSnapshot,
} from '../../../src/lib/git/assisted-commit'
import { getSnapshotData } from '../../../src/lib/git/assisted-commit/state'
import { setHooksEnvEnabled } from '../../../src/lib/hooks/config'
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

describe('git/assisted-commit rollback and recovery', () => {
  beforeEach(() => setHooksEnvEnabled(false))
  afterEach(() => localStorage.removeItem('git-hooks-env-enabled'))

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
})
