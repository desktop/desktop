import assert from 'node:assert'
import { describe, it } from 'node:test'
import { isAbsolute } from 'path'
import {
  CopilotAppError,
  createCopilotAppIntegration,
  ICopilotAppDependencies,
  runCopilotAppCommand,
  validateCopilotAppPath,
} from '../../src/lib/copilot-app'
import {
  getCopilotAppCandidates as getDarwinCopilotAppCandidates,
  getCopilotAppExecutable as getDarwinCopilotAppExecutable,
} from '../../src/lib/copilot-app/darwin'
import {
  getCopilotAppExecutable as getWindowsCopilotAppExecutable,
  getWindowsCopilotAppCandidates,
  ICopilotAppRegistry,
} from '../../src/lib/copilot-app/win32'

const macApp = '/Applications/GitHub Copilot.app'
const macBinary = `${macApp}/Contents/MacOS/github`
const windowsBinary = 'C:\\Tools\\GitHub Copilot\\github.exe'
const appPath = __WIN32__ ? windowsBinary : macApp
const appBinary = __WIN32__ ? windowsBinary : macBinary
const repositoryPath = __WIN32__ ? 'C:\\repo' : '/repo'

function setup(overrides: Partial<ICopilotAppDependencies> = {}) {
  const calls: Array<{
    executable: string
    args: ReadonlyArray<string>
    timeout: number
  }> = []
  const integration = createCopilotAppIntegration({
    findAppCandidates: async () => [appPath],
    getExecutable: path => {
      if (__DARWIN__) {
        return getDarwinCopilotAppExecutable(path)
      }
      if (__WIN32__) {
        return getWindowsCopilotAppExecutable(path)
      }
      return null
    },
    isAbsolutePath: isAbsolute,
    pathExists: async path => path === appBinary,
    run: async (executable, args, timeout) => {
      calls.push({ executable, args, timeout })
      return { stdout: '', stderr: '' }
    },
    ...overrides,
  })
  return { ...integration, calls }
}

function errorWithKind(kind: CopilotAppError['kind']) {
  return (error: unknown) =>
    error instanceof CopilotAppError && error.kind === kind
}

describe('Copilot App discovery and validation', () => {
  if (__DARWIN__ || __WIN32__) {
    it('discovers the current platform app without executing it', async () => {
      const app = setup()
      assert.strictEqual(await app.findCopilotApp(), appPath)
      assert.strictEqual(await app.validateCopilotAppPath(appPath), true)
      if (__DARWIN__) {
        assert.strictEqual(await app.validateCopilotAppPath(`${macApp}/`), true)
        assert.strictEqual(await app.validateCopilotAppPath(macBinary), true)
      }
      assert.deepStrictEqual(app.calls, [])
    })

    if (__DARWIN__) {
      it('supports nonstandard bundle locations from Launch Services', async () => {
        const custom = '/Volumes/Applications & Tools/Custom Name.app'
        const app = setup({
          findAppCandidates: async () => [custom],
          pathExists: async path => path === `${custom}/Contents/MacOS/github`,
        })
        assert.strictEqual(await app.findCopilotApp(), custom)
      })

      it('validates fallbacks when Launch Services fails or returns a stale path', async () => {
        const custom = '/Users/test/Applications/GitHub Copilot.app'
        for (const found of ['/missing/GitHub Copilot.app', null]) {
          const app = setup({
            findAppCandidates: async () =>
              getDarwinCopilotAppCandidates(found, '/Users/test'),
            pathExists: async path =>
              path === `${custom}/Contents/MacOS/github`,
          })
          assert.strictEqual(await app.findCopilotApp(), custom)
        }
      })
    }

    it('does not cache a missing or subsequently removed installation', async () => {
      let exists = false
      const app = setup({ pathExists: async () => exists })
      assert.strictEqual(await app.findCopilotApp(), null)
      exists = true
      assert.strictEqual(await app.findCopilotApp(), appPath)
      exists = false
      assert.strictEqual(await app.findCopilotApp(), null)
    })

    it('rejects invalid and missing paths', async () => {
      const app = setup()
      for (const path of [
        '',
        'relative.app',
        '/other/app',
        '/missing.app',
        `${macApp}\0`,
      ]) {
        assert.strictEqual(await app.validateCopilotAppPath(path), false)
      }
      assert.strictEqual(
        await validateCopilotAppPath('/missing/Copilot.app'),
        false
      )
    })

    if (__WIN32__) {
      it('validates custom Windows executable paths and skips stale registry entries', async () => {
        const app = setup({
          findAppCandidates: async () => [
            'D:\\Missing\\github.exe',
            windowsBinary,
          ],
        })
        assert.strictEqual(await app.findCopilotApp(), windowsBinary)
        assert.strictEqual(
          await app.validateCopilotAppPath(windowsBinary),
          true
        )
        assert.strictEqual(
          await app.validateCopilotAppPath('github.exe'),
          false
        )
        assert.strictEqual(
          await app.validateCopilotAppPath('C:\\Tools\\github.cmd'),
          false
        )
      })
    }
  }

  if (__LINUX__) {
    it('fails gracefully on unsupported platforms', async () => {
      const app = setup()
      assert.strictEqual(await app.findCopilotApp(), null)
      assert.strictEqual(await app.validateCopilotAppPath(macApp), false)
      await assert.rejects(
        app.openInCopilotApp(macApp, '/repo'),
        errorWithKind('not-found')
      )
      assert.deepStrictEqual(app.calls, [])
    })
  }
})

if (__WIN32__) {
  describe('Copilot App Windows registry discovery', () => {
    const uninstall = 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
    const record = (values: Record<string, string>) =>
      Object.entries({
        DisplayName: 'GitHub Copilot',
        Publisher: 'GitHub Inc.',
        ...values,
      }).map(([name, data]) => ({ name, data }))
    const empty: ICopilotAppRegistry = {
      readValues: () => [],
    }

    it('reads quoted NSIS InstallLocation and MainBinaryName under HKCU', () => {
      const registry: ICopilotAppRegistry = {
        ...empty,
        readValues: key =>
          key === `${uninstall}\\GitHub Copilot`
            ? record({
                InstallLocation: '"D:\\Apps & Tools\\Copilot"',
                MainBinaryName: 'github.exe',
              })
            : [],
      }
      assert.deepStrictEqual(getWindowsCopilotAppCandidates(registry, {}), [
        'D:\\Apps & Tools\\Copilot\\github.exe',
      ])
    })

    it('parses quoted and unquoted DisplayIcon paths without truncating commas', () => {
      for (const icon of [
        '"D:\\Apps, Tools\\github.exe",0',
        'D:\\Apps, Tools\\github.exe,-12',
        '"D:\\Apps, Tools\\github.exe"',
      ]) {
        const registry: ICopilotAppRegistry = {
          ...empty,
          readValues: () => record({ DisplayIcon: icon }),
        }
        assert.deepStrictEqual(getWindowsCopilotAppCandidates(registry, {}), [
          'D:\\Apps, Tools\\github.exe',
        ])
      }
    })

    it('ignores missing entries returned for registry values', () => {
      const registry: ICopilotAppRegistry = {
        ...empty,
        readValues: () => [
          undefined,
          ...record({ InstallLocation: 'E:\\Custom Copilot' }),
        ],
      }
      assert.deepStrictEqual(getWindowsCopilotAppCandidates(registry, {}), [
        'E:\\Custom Copilot\\github.exe',
      ])
    })

    it('rejects unrelated applications and malformed registry paths', () => {
      const invalidValues: ReadonlyArray<Record<string, string>> = [
        { Publisher: 'Other Publisher', InstallLocation: 'C:\\App' },
        { DisplayName: 'Other App', InstallLocation: 'C:\\App' },
        { InstallLocation: 'relative' },
        { InstallLocation: 'C:\\App', MainBinaryName: '..\\other.exe' },
        { DisplayIcon: '"C:\\App\\github.exe" --uninstall' },
      ]
      for (const values of invalidValues) {
        assert.deepStrictEqual(
          getWindowsCopilotAppCandidates(
            { ...empty, readValues: () => record(values) },
            {}
          ),
          []
        )
      }
    })

    it('falls back to standard locations when registry access fails', () => {
      const fail = () => {
        throw new Error('Access denied')
      }
      assert.deepStrictEqual(
        getWindowsCopilotAppCandidates(
          { readValues: fail },
          {
            LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
            ProgramFiles: 'C:\\Program Files',
          }
        ),
        [
          'C:\\Users\\test\\AppData\\Local\\Programs\\GitHub Copilot\\github.exe',
          'C:\\Program Files\\GitHub Copilot\\github.exe',
        ]
      )
    })
  })
}

if (__DARWIN__ || __WIN32__) {
  describe('Copilot App launch', () => {
    it('invokes the app binary once with literal repository arguments', async () => {
      const app = setup()
      const repository = __WIN32__
        ? 'D:\\My Repos\\repo & %PATH% (test)'
        : '/Users/test/a repo;$(touch nope)&"quotes"'
      await app.openInCopilotApp(appPath, repository)
      assert.deepStrictEqual(app.calls, [
        { executable: appBinary, args: ['open', repository], timeout: 30000 },
      ])
    })

    it('does not invoke missing installations or invalid repository paths', async () => {
      const app = setup()
      const missing = __WIN32__ ? 'C:\\missing.exe' : '/missing.app'
      await assert.rejects(
        app.openInCopilotApp(missing, repositoryPath),
        errorWithKind('not-found')
      )
      await assert.rejects(
        app.openInCopilotApp(appPath, 'relative'),
        errorWithKind('launch-failed')
      )
      assert.deepStrictEqual(app.calls, [])
    })

    it('reports a disappeared binary as not found', async () => {
      const app = setup({
        run: async () => {
          throw Object.assign(new Error('Gone'), { code: 'ENOENT' })
        },
      })

      await assert.rejects(
        app.openInCopilotApp(appPath, repositoryPath),
        errorWithKind('not-found')
      )
    })

    it('reports a launch permission failure', async () => {
      const app = setup({
        run: async () => {
          throw Object.assign(new Error('Permission denied'), {
            code: 'EACCES',
          })
        },
      })
      await assert.rejects(
        app.openInCopilotApp(appPath, repositoryPath),
        errorWithKind('launch-failed')
      )
    })

    it('preserves stderr on launch errors and never retries, including timeouts', async () => {
      for (const error of [
        Object.assign(new Error('Exit 1'), {
          code: 1,
          stderr: 'Repository not found',
        }),
        Object.assign(new Error('Permission denied'), { code: 'EACCES' }),
        Object.assign(new Error('Timed out'), {
          killed: true,
          signal: 'SIGKILL',
        }),
      ]) {
        let opens = 0
        const app = setup({
          run: async () => {
            opens++
            throw error
          },
        })
        await assert.rejects(
          app.openInCopilotApp(appPath, repositoryPath),
          (failure: unknown) => {
            assert.ok(failure instanceof CopilotAppError)
            assert.strictEqual(failure.kind, 'launch-failed')
            assert.ok(
              failure.message.includes(
                'stderr' in error ? error.stderr : error.message
              )
            )
            return true
          }
        )
        assert.strictEqual(opens, 1)
      }
    })

    it('waits for CLI acknowledgement before resolving', async () => {
      let accept: () => void = () => {}
      let requested: () => void = () => {}
      const started = new Promise<void>(resolve => {
        requested = resolve
      })
      const accepted = new Promise<void>(resolve => {
        accept = resolve
      })
      const app = setup({
        run: async (_, args) => {
          if (args[0] === 'open') {
            requested()
            await accepted
          }
          return { stdout: '', stderr: '' }
        },
      })
      let complete = false
      const result = app.openInCopilotApp(appPath, repositoryPath).then(() => {
        complete = true
      })
      await started
      assert.strictEqual(complete, false)
      accept()
      await result
      assert.strictEqual(complete, true)
    })
  })
}

describe('Copilot App process execution', () => {
  it('collects output and passes shell characters without shell interpretation', async () => {
    const value = 'spaces & $(echo unexpected); %PATH% "quoted"'
    const result = await runCopilotAppCommand(
      process.execPath,
      [
        '-e',
        'process.stdout.write(process.argv[1]); process.stderr.write("diagnostic")',
        value,
      ],
      5000
    )
    assert.deepStrictEqual(result, { stdout: value, stderr: 'diagnostic' })
  })

  it('rejects nonzero exits with stderr', async () => {
    await assert.rejects(
      runCopilotAppCommand(
        process.execPath,
        ['-e', 'process.stderr.write("rejected"); process.exit(7)'],
        5000
      ),
      (error: unknown) => {
        assert.ok(
          error instanceof Error && 'code' in error && 'stderr' in error
        )
        assert.strictEqual(error.code, 7)
        assert.strictEqual(error.stderr, 'rejected')
        return true
      }
    )
  })

  it('rejects spawn errors', async () => {
    await assert.rejects(
      runCopilotAppCommand('/missing/copilot/github', [], 5000),
      { code: 'ENOENT' }
    )
  })

  it('bounds processes that never exit', async () => {
    await assert.rejects(
      runCopilotAppCommand(
        process.execPath,
        ['-e', 'setInterval(() => {}, 1000)'],
        100
      ),
      { killed: true, signal: 'SIGKILL' }
    )
  })
})
