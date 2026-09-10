import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  CopilotAppError,
  createCopilotAppIntegration,
  ICopilotAppDependencies,
  runCopilotAppCommand,
  validateCopilotAppPath,
} from '../../src/lib/copilot-app'
import {
  getWindowsCopilotAppCandidates,
  ICopilotAppRegistry,
} from '../../src/lib/copilot-app/win32'

const macApp = '/Applications/GitHub Copilot.app'
const macBinary = `${macApp}/Contents/MacOS/github`
const windowsBinary = 'C:\\Tools\\GitHub Copilot\\github.exe'
const help = `Open GitHub resources in GitHub Copilot

Usage: github [COMMAND]

Commands:
  open  Open a local directory or GitHub URL
  help  Print this message or the help of the given subcommand(s)
`

function setup(overrides: Partial<ICopilotAppDependencies> = {}) {
  const calls: Array<{
    executable: string
    args: ReadonlyArray<string>
    timeout: number
  }> = []
  const integration = createCopilotAppIntegration({
    platform: 'darwin',
    homeDirectory: '/Users/test',
    findMacApp: async () => macApp,
    findWindowsApps: async () => [windowsBinary],
    isExecutable: async path => path === macBinary || path === windowsBinary,
    run: async (executable, args, timeout) => {
      calls.push({ executable, args, timeout })
      return { stdout: args[0] === '--help' ? help : '', stderr: '' }
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
  it('discovers a macOS bundle without executing it', async () => {
    const app = setup()
    assert.strictEqual(await app.findCopilotApp(), macApp)
    assert.strictEqual(await app.validateCopilotAppPath(macApp), true)
    assert.strictEqual(await app.validateCopilotAppPath(`${macApp}/`), true)
    assert.strictEqual(await app.validateCopilotAppPath(macBinary), true)
    assert.deepStrictEqual(app.calls, [])
  })

  it('supports nonstandard bundle locations from Launch Services', async () => {
    const custom = '/Volumes/Applications & Tools/Custom Name.app'
    const app = setup({
      findMacApp: async () => custom,
      isExecutable: async path => path === `${custom}/Contents/MacOS/github`,
    })
    assert.strictEqual(await app.findCopilotApp(), custom)
  })

  it('validates fallbacks when Launch Services fails or returns a stale path', async () => {
    for (const findMacApp of [
      async () => '/missing/GitHub Copilot.app',
      async () => {
        throw new Error('Launch Services unavailable')
      },
    ]) {
      const custom = '/Users/test/Applications/GitHub Copilot.app'
      const app = setup({
        findMacApp,
        isExecutable: async path => path === `${custom}/Contents/MacOS/github`,
      })
      assert.strictEqual(await app.findCopilotApp(), custom)
    }
  })

  it('does not cache a missing or subsequently removed installation', async () => {
    let exists = false
    const app = setup({ isExecutable: async () => exists })
    assert.strictEqual(await app.findCopilotApp(), null)
    exists = true
    assert.strictEqual(await app.findCopilotApp(), macApp)
    exists = false
    assert.strictEqual(await app.findCopilotApp(), null)
  })

  it('rejects invalid, missing, and inaccessible paths', async () => {
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
    const inaccessible = setup({
      isExecutable: async () => {
        throw new Error('Access denied')
      },
    })
    assert.strictEqual(await inaccessible.validateCopilotAppPath(macApp), false)
  })

  it('validates custom Windows executable paths and skips stale registry entries', async () => {
    const app = setup({
      platform: 'win32',
      findWindowsApps: async () => ['D:\\Missing\\github.exe', windowsBinary],
    })
    assert.strictEqual(await app.findCopilotApp(), windowsBinary)
    assert.strictEqual(await app.validateCopilotAppPath(windowsBinary), true)
    assert.strictEqual(await app.validateCopilotAppPath('github.exe'), false)
    assert.strictEqual(
      await app.validateCopilotAppPath('C:\\Tools\\github.cmd'),
      false
    )
  })

  it('fails gracefully on unsupported platforms', async () => {
    const app = setup({ platform: 'linux' })
    assert.strictEqual(await app.findCopilotApp(), null)
    assert.strictEqual(await app.validateCopilotAppPath(macApp), false)
    await assert.rejects(
      app.openInCopilotApp(macApp, '/repo'),
      errorWithKind('not-found')
    )
    assert.deepStrictEqual(app.calls, [])
  })
})

describe('Copilot App Windows registry discovery', () => {
  const uninstall = 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
  const wow =
    'Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
  const record = (values: Record<string, string>) =>
    Object.entries({
      DisplayName: 'GitHub Copilot',
      Publisher: 'GitHub Inc.',
      ...values,
    }).map(([name, data]) => ({ name, data }))

  const empty: ICopilotAppRegistry = {
    readValues: () => [],
    readKeys: () => [],
  }

  it('reads quoted NSIS InstallLocation and MainBinaryName under HKCU', () => {
    const registry: ICopilotAppRegistry = {
      ...empty,
      readValues: (hive, key) =>
        hive === 'HKEY_CURRENT_USER' && key === `${uninstall}\\GitHub Copilot`
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

  it('scans MSI display names under HKLM including WOW6432Node', () => {
    for (const parent of [uninstall, wow]) {
      const registry: ICopilotAppRegistry = {
        readKeys: (hive, key) =>
          hive === 'HKEY_LOCAL_MACHINE' && key === parent ? ['{MSI-ID}'] : [],
        readValues: (hive, key) =>
          hive === 'HKEY_LOCAL_MACHINE' && key === `${parent}\\{MSI-ID}`
            ? record({ InstallLocation: 'E:\\Custom Copilot' })
            : [],
      }
      assert.deepStrictEqual(getWindowsCopilotAppCandidates(registry, {}), [
        'E:\\Custom Copilot\\github.exe',
      ])
    }
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
        { readKeys: fail, readValues: fail },
        {
          LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
          ProgramFiles: 'C:\\Program Files',
        }
      ),
      [
        'C:\\Users\\test\\AppData\\Local\\GitHub Copilot\\github.exe',
        'C:\\Program Files\\GitHub Copilot\\github.exe',
        'C:\\Users\\test\\AppData\\Local\\Programs\\GitHub Copilot\\github.exe',
      ]
    )
  })
})

describe('Copilot App launch', () => {
  it('invokes the macOS bundle binary once with literal repository arguments', async () => {
    const app = setup()
    const repository = '/Users/test/a repo;$(touch nope)&"quotes"'
    await app.openInCopilotApp(macApp, repository)
    assert.deepStrictEqual(app.calls, [
      { executable: macBinary, args: ['--help'], timeout: 5000 },
      { executable: macBinary, args: ['open', repository], timeout: 30000 },
    ])
  })

  it('invokes a custom Windows executable with literal repository arguments', async () => {
    const app = setup({ platform: 'win32' })
    const repository = 'D:\\My Repos\\repo & %PATH% (test)'
    await app.openInCopilotApp(windowsBinary, repository)
    assert.deepStrictEqual(app.calls[1], {
      executable: windowsBinary,
      args: ['open', repository],
      timeout: 30000,
    })
  })

  it('does not invoke missing installations or invalid repository paths', async () => {
    const app = setup()
    await assert.rejects(
      app.openInCopilotApp('/missing.app', '/repo'),
      errorWithKind('not-found')
    )
    await assert.rejects(
      app.openInCopilotApp(macApp, '--help'),
      errorWithKind('launch-failed')
    )
    assert.deepStrictEqual(app.calls, [])
  })

  it('rejects old binaries that silently ignore arguments and exit successfully', async () => {
    for (const stdout of [
      '',
      'github 1.1.16',
      'Usage: github\n  open  a path',
    ]) {
      let invocations = 0
      const app = setup({
        run: async () => {
          invocations++
          return { stdout, stderr: '' }
        },
      })
      await assert.rejects(
        app.openInCopilotApp(macApp, '/repo'),
        errorWithKind('unsupported-version')
      )
      assert.strictEqual(invocations, 1)
    }
  })

  it('rejects failed or timed-out capability probes without attempting open', async () => {
    for (const error of [
      Object.assign(new Error('Unknown option'), { code: 1 }),
      Object.assign(new Error('Timed out'), {
        killed: true,
        signal: 'SIGKILL',
      }),
    ]) {
      let invocations = 0
      const app = setup({
        run: async () => {
          invocations++
          throw error
        },
      })
      await assert.rejects(
        app.openInCopilotApp(macApp, '/repo'),
        errorWithKind('unsupported-version')
      )
      assert.strictEqual(invocations, 1)
    }
  })

  it('reports a disappeared binary as not found', async () => {
    const app = setup({
      run: async () => {
        throw Object.assign(new Error('Gone'), { code: 'ENOENT' })
      },
    })

    await assert.rejects(
      app.openInCopilotApp(macApp, '/repo'),
      errorWithKind('not-found')
    )
  })

  it('distinguishes a probe spawn failure from an unsupported version', async () => {
    const app = setup({
      run: async () => {
        throw Object.assign(new Error('Permission denied'), {
          code: 'EACCES',
        })
      },
    })
    await assert.rejects(
      app.openInCopilotApp(macApp, '/repo'),
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
        run: async (_, args) => {
          if (args[0] === '--help') {
            return { stdout: help, stderr: '' }
          }
          opens++
          throw error
        },
      })
      await assert.rejects(
        app.openInCopilotApp(macApp, '/repo'),
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
        return { stdout: help, stderr: '' }
      },
    })
    let complete = false
    const result = app.openInCopilotApp(macApp, '/repo').then(() => {
      complete = true
    })
    await started
    assert.strictEqual(complete, false)
    accept()
    await result
    assert.strictEqual(complete, true)
  })
})

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
