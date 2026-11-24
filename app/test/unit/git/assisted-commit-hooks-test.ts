import assert from 'node:assert'
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test'
import * as FileSystem from 'fs/promises'
import type { CopyOptions } from 'fs'
import * as Dugite from 'dugite'
import { basename, join } from 'path'
import { getProxyCommandPath } from 'process-proxy'
import type { HookProgress } from '../../../src/lib/git/core'
import { DiffSelection, DiffSelectionType } from '../../../src/models/diff'

let engine: typeof import('../../../src/lib/git/assisted-commit')
let fixtures: typeof import('../../helpers/assisted-commit')
let config: typeof import('../../../src/lib/hooks/config')
let nativeExecFault:
  | ((
      args: string[],
      cwd: string,
      options?: Dugite.IGitExecutionOptions
    ) => Promise<Dugite.IGitResult> | undefined)
  | undefined
let nativeExec: typeof Dugite.exec
let loginGitParameters: string | undefined

before(async () => {
  // Unit tests do not have webpack's packaged binary assets. Resolve only those
  // assets and the login-shell environment; all Git, hooks and proxy IPC are real.
  const copy = FileSystem.cp
  const resolveBinary = Dugite.resolveGitBinary
  const resolveExecPath = Dugite.resolveGitExecPath
  const originalExec = Dugite.exec
  nativeExec = originalExec
  mock.module('fs/promises', {
    namedExports: {
      ...FileSystem,
      cp: (source: string, destination: string, options?: CopyOptions) =>
        copy(
          ['process-proxy', 'process-proxy.exe'].includes(basename(source))
            ? getProxyCommandPath()
            : source,
          destination,
          options
        ),
    },
  })
  mock.module('dugite', {
    namedExports: {
      ...Dugite,
      exec: (
        args: string[],
        cwd: string,
        options?: Dugite.IGitExecutionOptions
      ) =>
        nativeExecFault?.(args, cwd, options) ??
        originalExec(args, cwd, options),
      resolveGitBinary: () => resolveBinary(),
    },
  })
  mock.module('../../../src/lib/hooks/get-shell-env.ts', {
    namedExports: {
      getShellEnv: async () => ({
        kind: 'success',
        env: {
          ...process.env,
          GIT_EXEC_PATH: resolveExecPath(),
          ...(loginGitParameters === undefined
            ? {}
            : { GIT_CONFIG_PARAMETERS: loginGitParameters }),
        },
      }),
    },
  })
  ;[engine, fixtures, config] = await Promise.all([
    import('../../../src/lib/git/assisted-commit'),
    import('../../helpers/assisted-commit'),
    import('../../../src/lib/hooks/config'),
  ])
})

describe('git/assisted-commit real hook interception', () => {
  beforeEach(() => config.setHooksEnvEnabled(true))
  afterEach(() => {
    nativeExecFault = undefined
    loginGitParameters = undefined
    localStorage.removeItem('git-hooks-env-enabled')
  })

  for (const empty of [false, true]) {
    it(`captures ${
      empty ? 'explicitly empty' : 'selected'
    } changes with inherited system attributes disabled`, async t => {
      const repository = await fixtures.seed(t, { file: 'original\n' })
      if (!empty) {
        await FileSystem.writeFile(join(repository.path, 'file'), 'SELECTED\n')
      }
      const input = await fixtures.request(repository, empty ? [] : ['file'], {
        allowEmptyCommit: empty,
      })
      let absentSources = 0
      nativeExecFault = async (args, cwd, options) => {
        const result = await nativeExec(args, cwd, {
          ...options,
          env: { ...options?.env, GIT_ATTR_NOSYSTEM: '1' },
        })
        if (args.includes('GIT_ATTR_SYSTEM')) {
          assert.strictEqual(result.exitCode, 1)
          assert.strictEqual(result.stdout.length, 0)
          assert.strictEqual(result.stderr.length, 0)
          absentSources++
        }
        return result
      }
      const result = await fixtures.single(repository, input)
      assert.strictEqual(result.commits.length, 1)
      assert.strictEqual(await fixtures.count(repository), 2)
      assert.strictEqual(await fixtures.tip(repository), result.commits[0])
      assert.strictEqual(absentSources, 1)
      assert.deepStrictEqual(
        await fixtures.commitBytes(repository, result.commits[0], 'file'),
        Buffer.from(empty ? 'original\n' : 'SELECTED\n')
      )
      engine.finalizeAssistedCommitTransaction(result)
    })
  }
  it('does not treat an attribute lookup failure with diagnostics as an absent source', async t => {
    const repository = await fixtures.seed(t, { file: 'original\n' })
    const original = await fixtures.tip(repository)
    await FileSystem.writeFile(join(repository.path, 'file'), 'SELECTED\n')
    const input = await fixtures.request(repository, ['file'])
    const originalIndex = await FileSystem.readFile(
      await fixtures.indexPath(repository)
    )
    nativeExecFault = async (args, cwd, options) => {
      const result = await nativeExec(args, cwd, options)
      return args.includes('GIT_ATTR_SYSTEM')
        ? {
            ...result,
            exitCode: 1,
            stdout: '',
            stderr: 'Injected attribute source lookup EIO',
          }
        : result
    }
    await assert.rejects(fixtures.single(repository, input), error => {
      assert.ok(error instanceof engine.AssistedCommitError)
      return error.code === 'unsafe-selection'
    })
    assert.strictEqual(await fixtures.tip(repository), original)
    assert.strictEqual(await fixtures.count(repository), 1)
    assert.deepStrictEqual(
      await FileSystem.readFile(await fixtures.indexPath(repository)),
      originalIndex
    )
  })
  it('isolates internal full patches from inherited zero-context GIT_DIFF_OPTS', async t => {
    const repository = await fixtures.seed(t, {
      file: 'one\ntwo\nthree\n',
    })
    await FileSystem.writeFile(
      join(repository.path, 'file'),
      'one\nSELECTED\nthree\n'
    )
    const input = await fixtures.request(repository, ['file'])
    nativeExecFault = (args, cwd, options) =>
      nativeExec(args, cwd, {
        ...options,
        env: { GIT_DIFF_OPTS: '--unified=0', ...options?.env },
      })
    const result = await fixtures.single(repository, input)
    assert.strictEqual(await fixtures.count(repository), 2)
    assert.deepStrictEqual(
      await fixtures.commitBytes(repository, result.commits[0], 'file'),
      Buffer.from('one\nSELECTED\nthree\n')
    )
    engine.finalizeAssistedCommitTransaction(result)
  })
  it('captures execution policy rather than legacy GIT_CONFIG query-file policy', async t => {
    const repository = await fixtures.seed(t, {
      file: 'one\ntwo\n\nfour\n',
    })
    await fixtures.rawGit(repository, ['config', 'core.autocrlf', 'true'])
    const current = Buffer.from('one\r\nSELECTED\r\n\r\nUNSELECTED\r\n')
    await FileSystem.writeFile(join(repository.path, 'file'), current)
    const input = await fixtures.request(repository, ['file'])
    const queryConfig = join(repository.path, 'query-config')
    const queryBytes =
      '[user]\nname = Query identity\nemail = query@example.com\n'
    await FileSystem.writeFile(queryConfig, queryBytes)
    const selection = DiffSelection.fromInitialSelection(
      DiffSelectionType.None
    ).withRangeSelection(2, 2, true)
    nativeExecFault = (args, cwd, options) =>
      nativeExec(args, cwd, {
        ...options,
        env: { GIT_CONFIG: queryConfig, ...options?.env },
      })
    const result = await fixtures.single(repository, {
      ...input,
      files: [input.files[0].withSelection(selection)],
    })
    assert.strictEqual(await fixtures.count(repository), 2)
    assert.deepStrictEqual(
      await fixtures.commitBytes(repository, result.commits[0], 'file'),
      Buffer.from('one\nSELECTED\n\nfour\n')
    )
    assert.deepStrictEqual(
      await FileSystem.readFile(join(repository.path, 'file')),
      current
    )
    assert.deepStrictEqual(
      await FileSystem.readFile(queryConfig),
      Buffer.from(queryBytes)
    )
    engine.finalizeAssistedCommitTransaction(result)
  })

  it('ignores the current failed operation and still runs hooks on every later commit', async t => {
    const repository = await fixtures.seed(t, { a: 'a\n', b: 'b\n' })
    await FileSystem.writeFile(join(repository.path, 'a'), 'A\n')
    await FileSystem.writeFile(join(repository.path, 'b'), 'B\n')
    const input = await fixtures.request(repository)
    await fixtures.writeHook(
      repository,
      'pre-commit',
      [
        'n=0; if test -f hook-count; then n=$(cat hook-count); fi',
        'n=$((n + 1)); printf "%s" "$n" > hook-count',
        'echo "failed invocation $n" >&2',
        'exit 1',
      ].join('\n')
    )
    const failures: string[] = []
    const progress: HookProgress[] = []
    const output: string[] = []
    const unsubscribers: Array<() => void> = []
    try {
      const result = await engine.withAssistedCommitSnapshot(
        repository,
        input,
        async snapshot => {
          const checked = await engine.validateAssistedCommitPlan(
            snapshot,
            fixtures.splitPlan(snapshot)
          )
          return engine.executeAssistedCommitPlan(snapshot, checked, {
            onHookFailure: async (name, terminal) => {
              assert.strictEqual(name, 'pre-commit')
              const text = Array.isArray(terminal)
                ? Buffer.concat(terminal).toString()
                : terminal.toString()
              assert.match(text, /failed invocation/)
              failures.push(name)
              return 'ignore'
            },
            onHookProgress: value => progress.push(value),
            onTerminalOutputAvailable: subscribe => {
              const subscription = subscribe(chunk =>
                output.push(chunk.toString())
              )
              unsubscribers.push(subscription.unsubscribe)
            },
          })
        }
      )
      assert.strictEqual(result.commits.length, 2)
      assert.strictEqual(await fixtures.count(repository), 3)
      assert.strictEqual(failures.length, 2)
      assert.strictEqual(
        progress.filter(
          p => p.status === 'started' && p.hookName === 'pre-commit'
        ).length,
        2
      )
      assert.strictEqual(
        progress.filter(
          p => p.status === 'finished' && p.hookName === 'pre-commit'
        ).length,
        2
      )
      assert.match(output.join(''), /failure ignored by user/)
      assert.strictEqual(
        await FileSystem.readFile(join(repository.path, 'hook-count'), 'utf8'),
        '2'
      )
      assert.deepStrictEqual(
        await fixtures.commitBytes(repository, result.commits[1], 'a'),
        Buffer.from('A\n')
      )
      assert.deepStrictEqual(
        await fixtures.commitBytes(repository, result.commits[1], 'b'),
        Buffer.from('B\n')
      )
      engine.finalizeAssistedCommitTransaction(result)
    } finally {
      unsubscribers.forEach(unsubscribe => unsubscribe())
    }
  })

  it('declining the second hook failure rolls back every earlier run commit and preserves the original index', async t => {
    const repository = await fixtures.seed(t, { a: 'a\n', b: 'b\n' })
    const original = await fixtures.tip(repository)
    await FileSystem.writeFile(join(repository.path, 'a'), 'A\n')
    await FileSystem.writeFile(join(repository.path, 'b'), 'B\n')
    const input = await fixtures.request(repository)
    const originalIndex = await FileSystem.readFile(
      await fixtures.indexPath(repository)
    )
    await fixtures.writeHook(
      repository,
      'pre-commit',
      [
        'n=0; if test -f hook-count; then n=$(cat hook-count); fi',
        'n=$((n + 1)); printf "%s" "$n" > hook-count',
        'echo failure >&2; exit 1',
      ].join('\n')
    )
    let invocations = 0
    await assert.rejects(
      engine.withAssistedCommitSnapshot(repository, input, async snapshot => {
        const checked = await engine.validateAssistedCommitPlan(
          snapshot,
          fixtures.splitPlan(snapshot)
        )
        return engine.executeAssistedCommitPlan(snapshot, checked, {
          onHookFailure: async () => (++invocations === 1 ? 'ignore' : 'abort'),
        })
      }),
      error =>
        error instanceof engine.AssistedCommitError &&
        error.code === 'hook-aborted' &&
        error.recovery?.history === 'restored' &&
        error.recovery.createdCommits.length === 1
    )
    assert.strictEqual(invocations, 2)
    assert.strictEqual(await fixtures.tip(repository), original)
    assert.strictEqual(await fixtures.count(repository), 1)
    assert.deepStrictEqual(
      await FileSystem.readFile(await fixtures.indexPath(repository)),
      originalIndex
    )
    assert.deepStrictEqual(
      await FileSystem.readFile(join(repository.path, 'b')),
      Buffer.from('B\n')
    )
  })

  it('cancelling while a failure decision is awaited cannot subsequently ignore it', async t => {
    const repository = await fixtures.seed(t, { a: 'a\n', b: 'b\n' })
    const original = await fixtures.tip(repository)
    await FileSystem.writeFile(join(repository.path, 'a'), 'A\n')
    await FileSystem.writeFile(join(repository.path, 'b'), 'B\n')
    const input = await fixtures.request(repository)
    await fixtures.writeHook(
      repository,
      'pre-commit',
      [
        'n=0; if test -f hook-count; then n=$(cat hook-count); fi',
        'n=$((n + 1)); printf "%s" "$n" > hook-count',
        'if test "$n" = 2; then echo failed >&2; exit 1; fi',
      ].join('\n')
    )
    const controller = new AbortController()
    await assert.rejects(
      engine.withAssistedCommitSnapshot(repository, input, async snapshot => {
        const checked = await engine.validateAssistedCommitPlan(
          snapshot,
          fixtures.splitPlan(snapshot)
        )
        return engine.executeAssistedCommitPlan(snapshot, checked, {
          signal: controller.signal,
          onHookFailure: async () => {
            controller.abort()
            await new Promise(resolve => setTimeout(resolve, 10))
            return 'ignore'
          },
        })
      }),
      error =>
        error instanceof engine.AssistedCommitError &&
        error.code === 'cancelled' &&
        error.recovery?.history === 'restored'
    )
    assert.strictEqual(await fixtures.tip(repository), original)
    assert.strictEqual(await fixtures.count(repository), 1)
  })

  it('supports the existing hook abort control without abandoning in-flight Git', async t => {
    const repository = await fixtures.seed(t, { file: 'old\n' })
    const original = await fixtures.tip(repository)
    await FileSystem.writeFile(join(repository.path, 'file'), 'selected\n')
    const input = await fixtures.request(repository)
    await fixtures.writeHook(
      repository,
      'pre-commit',
      'echo about-to-run >&2\nsleep 10'
    )
    const controller = new AbortController()
    let started = false
    await assert.rejects(
      fixtures.single(repository, input, {
        signal: controller.signal,
        onHookProgress: progress => {
          if (progress.status === 'started') {
            started = true
            controller.abort()
            progress.abort()
          }
        },
      }),
      error =>
        error instanceof engine.AssistedCommitError &&
        error.code === 'cancelled'
    )
    assert.ok(started)
    assert.strictEqual(await fixtures.tip(repository), original)
    assert.strictEqual(await fixtures.count(repository), 1)
    assert.strictEqual(
      await fixtures.optionalBytes(
        `${await fixtures.indexPath(repository)}.lock`
      ),
      null
    )
  })

  it('surfaces hook callback exceptions after Git settles and recovers the run', async t => {
    const repository = await fixtures.seed(t, { file: 'old\n' })
    const original = await fixtures.tip(repository)
    await FileSystem.writeFile(join(repository.path, 'file'), 'selected\n')
    const input = await fixtures.request(repository)
    await fixtures.writeHook(
      repository,
      'pre-commit',
      'echo rejected >&2\nexit 1'
    )
    await assert.rejects(
      fixtures.single(repository, input, {
        onHookFailure: async () => {
          throw new Error('decision callback failed')
        },
      }),
      error =>
        error instanceof engine.AssistedCommitError &&
        error.code === 'commit-failed' &&
        error.recovery?.history === 'unchanged' &&
        error.cause instanceof engine.AssistedCommitError &&
        error.cause.cause instanceof AggregateError
    )
    assert.strictEqual(await fixtures.tip(repository), original)
    assert.strictEqual(await fixtures.count(repository), 1)
  })
  it('discovers every hook from frozen private configuration after the original hooksPath changes', async t => {
    const repository = await fixtures.seed(t, { file: 'old\n' })
    const original = await fixtures.tip(repository)
    await FileSystem.writeFile(join(repository.path, 'file'), 'selected\n')
    const first = join(repository.path, 'hooks-first')
    const second = join(repository.path, 'hooks-second')
    await fixtures.rawGit(repository, ['config', 'core.hooksPath', first])
    await fixtures.writeHook(
      repository,
      'pre-commit',
      'echo frozen-rejection >&2\nexit 1'
    )
    await fixtures.writeHook(repository, 'commit-msg', 'exit 0')
    const input = await fixtures.request(repository, ['file'])
    let invoked = false
    await assert.rejects(
      engine.withAssistedCommitSnapshot(repository, input, async snapshot => {
        await fixtures.rawGit(repository, ['config', 'core.hooksPath', second])
        await fixtures.writeHook(repository, 'commit-msg', 'exit 0')
        const plan = engine.createSingleAssistedCommitPlan(snapshot, {
          reason: 'uncertain-boundaries',
          title: 'Selected file',
        })
        const checked = await engine.validateAssistedCommitPlan(snapshot, plan)
        return engine.executeAssistedCommitPlan(snapshot, checked, {
          onHookFailure: async (name, output) => {
            assert.strictEqual(name, 'pre-commit')
            assert.match(output.toString(), /frozen-rejection/)
            invoked = true
            return 'abort'
          },
        })
      }),
      error =>
        error instanceof engine.AssistedCommitError &&
        error.code === 'hook-aborted'
    )
    assert.ok(invoked)
    assert.strictEqual(await fixtures.tip(repository), original)
    assert.strictEqual(await fixtures.count(repository), 1)
  })

  it(
    'retains attempted publication ownership when its first HEAD observation also fails',
    { skip: process.platform === 'win32' },
    async t => {
      config.setHooksEnvEnabled(false)
      const repository = await fixtures.seed(t, { file: 'old\n' })
      const original = await fixtures.tip(repository)
      await FileSystem.writeFile(join(repository.path, 'file'), 'selected\n')
      const input = await fixtures.request(repository)
      await fixtures.writeHook(
        repository,
        'reference-transaction',
        [
          'if test "$1" != committed || test -f publish-observation-fault; then exit 0; fi',
          'case "${GIT_DIR-}" in *desktop-assisted-commit-*) exit 0 ;; esac',
          'printf ready > publish-observation-fault',
          'kill -TERM "$PPID"',
        ].join('\n')
      )
      let injected = false
      nativeExecFault = (args, cwd, options) => {
        if (
          !injected &&
          cwd === repository.path &&
          options?.env?.GIT_DIR === undefined &&
          args[0] === 'symbolic-ref' &&
          args.at(-1) === 'HEAD'
        ) {
          return FileSystem.access(
            join(repository.path, 'publish-observation-fault')
          ).then(
            () => {
              injected = true
              throw new Error('Injected one-shot HEAD observation failure')
            },
            () => nativeExec(args, cwd, options)
          )
        }
        return undefined
      }
      await assert.rejects(
        fixtures.single(repository, input),
        error =>
          error instanceof engine.AssistedCommitError &&
          error.recovery?.history === 'restored'
      )
      assert.ok(injected)
      assert.strictEqual(await fixtures.tip(repository), original)
      assert.strictEqual(await fixtures.count(repository), 1)
    }
  )

  it(
    'does not launch another native formatter after a failed formatter settles',
    { skip: process.platform === 'win32' },
    async t => {
      config.setHooksEnvEnabled(false)
      const repository = await fixtures.seed(t, { a: 'a\n', b: 'b\n' })
      const original = await fixtures.tip(repository)
      await FileSystem.writeFile(join(repository.path, 'a'), 'A\n')
      await FileSystem.writeFile(join(repository.path, 'b'), 'B\n')
      await fixtures.rawGit(repository, ['config', 'trailer.peer.key', 'Peer'])
      await fixtures.rawGit(repository, [
        'config',
        'trailer.peer.cmd',
        'sleep 0.5; printf peer',
      ])
      const input = await fixtures.request(repository, ['a', 'b'], {
        trailers: [{ token: 'Peer', value: 'peer' }],
      })
      let launched = 0
      nativeExecFault = (args, cwd, options) => {
        if (cwd !== repository.path || args[0] !== 'interpret-trailers') {
          return undefined
        }
        const index = ++launched
        return nativeExec(args, cwd, {
          ...options,
          processCallback: child => {
            options?.processCallback?.(child)
            if (index === 1) {
              setTimeout(() => {
                if (child.pid !== undefined && child.exitCode === null) {
                  process.kill(child.pid, 'SIGTERM')
                }
              }, 50)
            }
          },
        })
      }
      await assert.rejects(
        engine.withAssistedCommitSnapshot(repository, input, async snapshot => {
          const checked = await engine.validateAssistedCommitPlan(
            snapshot,
            fixtures.splitPlan(snapshot)
          )
          return engine.executeAssistedCommitPlan(snapshot, checked)
        }),
        error => error instanceof engine.AssistedCommitError
      )
      assert.strictEqual(launched, 1)
      assert.strictEqual(await fixtures.tip(repository), original)
    }
  )

  it('recovers the confirmed prefix when the next publication and its observation both fail', async t => {
    config.setHooksEnvEnabled(false)
    const repository = await fixtures.seed(t, { a: 'a\n', b: 'b\n' })
    const original = await fixtures.tip(repository)
    await FileSystem.writeFile(join(repository.path, 'a'), 'A\n')
    await FileSystem.writeFile(join(repository.path, 'b'), 'B\n')
    const input = await fixtures.request(repository, ['a', 'b'])
    await fixtures.writeHook(
      repository,
      'reference-transaction',
      [
        'if test "$1" != prepared; then exit 0; fi',
        'case "${GIT_DIR-}" in *desktop-assisted-commit-*) exit 0 ;; esac',
        'n=0; if test -f publish-count; then n=$(cat publish-count); fi',
        'n=$((n + 1)); printf "%s" "$n" > publish-count',
        'if test "$n" = 2; then printf ready > rejected-observation-fault; exit 1; fi',
      ].join('\n')
    )
    let injected = false
    nativeExecFault = (args, cwd, options) => {
      if (
        !injected &&
        cwd === repository.path &&
        options?.env?.GIT_DIR === undefined &&
        args[0] === 'symbolic-ref' &&
        args.at(-1) === 'HEAD'
      ) {
        return FileSystem.access(
          join(repository.path, 'rejected-observation-fault')
        ).then(
          () => {
            injected = true
            throw new Error('Injected failed-publication observation')
          },
          () => nativeExec(args, cwd, options)
        )
      }
      return undefined
    }
    await assert.rejects(
      engine.withAssistedCommitSnapshot(repository, input, async snapshot => {
        const checked = await engine.validateAssistedCommitPlan(
          snapshot,
          fixtures.splitPlan(snapshot)
        )
        return engine.executeAssistedCommitPlan(snapshot, checked)
      }),
      error =>
        error instanceof engine.AssistedCommitError &&
        error.recovery?.history === 'restored'
    )
    assert.ok(injected)
    assert.strictEqual(await fixtures.tip(repository), original)
    assert.strictEqual(await fixtures.count(repository), 1)
  })
  it('does not let login-shell Git parameters replace captured private hook policy', async t => {
    const repository = await fixtures.seed(t, { file: 'old\n' })
    const original = await fixtures.tip(repository)
    await FileSystem.writeFile(join(repository.path, 'file'), 'selected\n')
    const first = join(repository.path, 'captured-hooks')
    const second = join(repository.path, 'shell-hooks')
    await fixtures.rawGit(repository, ['config', 'core.hooksPath', first])
    await fixtures.writeHook(
      repository,
      'pre-commit',
      'echo captured-rejection >&2\nexit 1'
    )
    await FileSystem.mkdir(second, { recursive: true })
    await FileSystem.writeFile(
      join(second, 'pre-commit'),
      '#!/bin/sh\nexit 0\n'
    )
    await FileSystem.chmod(join(second, 'pre-commit'), 0o755)
    loginGitParameters = `'core.hooksPath=${second}'`
    const input = await fixtures.request(repository, ['file'])
    let rejected = false
    await assert.rejects(
      fixtures.single(repository, input, {
        onHookFailure: async (name, output) => {
          assert.strictEqual(name, 'pre-commit')
          assert.match(output.toString(), /captured-rejection/)
          rejected = true
          return 'abort'
        },
      }),
      error =>
        error instanceof engine.AssistedCommitError &&
        error.code === 'hook-aborted'
    )
    assert.ok(rejected)
    assert.strictEqual(await fixtures.tip(repository), original)
  })
  it('preserves the underlying native credential helper instead of freezing transient Desktop overrides', async t => {
    const repository = await fixtures.seed(t, { file: 'old\n' })
    await fixtures.rawGit(repository, [
      'config',
      'credential.helper',
      '!f() { printf "username=fixture\\npassword=dummy\\n"; }; f',
    ])
    await FileSystem.writeFile(join(repository.path, 'file'), 'selected\n')
    const input = await fixtures.request(repository)
    await fixtures.writeHook(
      repository,
      'pre-commit',
      'printf "protocol=https\\nhost=example.invalid\\n\\n" | git -c credential.interactive=false credential fill > native-credential-check\ngrep -q "username=fixture" native-credential-check'
    )
    const result = await fixtures.single(repository, input)
    assert.strictEqual(await fixtures.count(repository), 2)
    engine.finalizeAssistedCommitTransaction(result)
  })
})
