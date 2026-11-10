import assert from 'node:assert'
import { pathToFileURL } from 'url'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { exec, IGitResult } from 'dugite'
import { promises as FileSystem } from 'fs'
import { lstat, readFile, realpath, symlink, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import {
  AssistedCommitError,
  finalizeAssistedCommitTransaction,
  rollbackAssistedCommitTransaction,
} from '../../../src/lib/git/assisted-commit'
import { setHooksEnvEnabled } from '../../../src/lib/hooks/config'
import { setupEmptyRepository } from '../../helpers/repositories'
import { createTempDirectory } from '../../helpers/temp'
import {
  count,
  createPathMatcher,
  indexPath,
  optionalBytes,
  rawGit,
  request,
  seed,
  single,
  tip,
  writeHook,
} from '../../helpers/assisted-commit'
import {
  updateRefWithVerification,
  withRefLock,
} from '../../../src/lib/git/update-ref'

describe('git/assisted-commit lock ownership', () => {
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
})
