import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import childProcess, { ChildProcess } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { mkdir } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
import * as Path from 'node:path'
import { createTempDirectory } from '../helpers/temp'
import {
  getCustomCommands,
  getCustomCommandsValidationError,
  getCustomCommandArguments,
  getCustomCommandDuration,
  getCustomCommandProgress,
  saveCustomCommandDuration,
  startCustomCommand,
  saveCustomCommands,
  serializeCustomCommands,
  importCustomCommandsFromJSON,
} from '../../src/lib/custom-command'

describe('custom commands', () => {
  const commands = [
    {
      id: 'build',
      name: 'Build',
      command: 'npm run build\nWrite-Output "done"',
    },
    { id: 'test', name: 'Test', command: 'npm test' },
  ]

  function createStorage() {
    const values = new Map<string, string>()
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    }
  }

  it('roundtrips script text without exporting local identities or history', async () => {
    const original = [
      {
        id: 'local-id',
        name: '\u6784\u5efa',
        command: 'Write-Output "\u4f60\u597d"\r\n$path = \'C:\\source\'\n',
      },
    ]
    const exported = serializeCustomCommands(original)
    assert.deepEqual(JSON.parse(exported), {
      format: 'github-desktop-custom-commands',
      version: 1,
      commands: [{ name: original[0].name, command: original[0].command }],
    })
    const imported = importCustomCommandsFromJSON('\uFEFF' + exported, [])
    assert.equal(imported[0].name, original[0].name)
    assert.equal(imported[0].command, original[0].command)
    assert.notEqual(imported[0].id, original[0].id)
    assert.notEqual(
      importCustomCommandsFromJSON(exported, [])[0].id,
      imported[0].id
    )
  })

  it('appends imports with case-insensitive unique names without modifying existing entries', async () => {
    const existing = [
      ...commands,
      { id: 'other', name: 'Build (2)', command: 'keep this' },
    ]
    const imported = importCustomCommandsFromJSON(
      serializeCustomCommands([
        { id: 'build', name: ' build ', command: 'new build' },
        { id: 'other', name: 'Third', command: 'third script' },
      ]),
      existing
    )
    assert.deepEqual(imported.slice(0, 3), existing)
    assert.deepEqual(
      imported.slice(3).map(({ name, command }) => ({ name, command })),
      [
        { name: 'build (3)', command: 'new build' },
        { name: 'Third', command: 'third script' },
      ]
    )
    assert.equal(existing.length, 3)
    assert.equal(new Set(imported.map(c => c.id)).size, 5)
    assert.equal(getCustomCommandsValidationError(imported), null)
  })

  it('handles duplicate imported names and ignores executable-looking metadata', async () => {
    const imported = importCustomCommandsFromJSON(
      JSON.stringify({
        format: 'github-desktop-custom-commands',
        version: 1,
        repositoryPath: 'other-checkout',
        scope: 'global',
        autoRun: true,
        commands: [
          { id: 'build', name: 'Build', command: 'one', durationMs: 20 },
          { id: 'build', name: 'Build', command: 'two' },
        ],
      }),
      []
    )
    assert.deepEqual(
      imported.map(c => c.name),
      ['Build', 'Build (2)']
    )
    assert.deepEqual(Object.keys(imported[0]).sort(), ['command', 'id', 'name'])
    assert.notEqual(imported[0].id, 'build')
  })

  it('rejects malformed, unsupported and incomplete files as a whole', async () => {
    const invalid = [
      'not JSON',
      'null',
      '[]',
      '{}',
      JSON.stringify({ format: 'other', version: 1, commands }),
      JSON.stringify({
        format: 'github-desktop-custom-commands',
        version: 2,
        commands,
      }),
      ...[
        [],
        null,
        [null],
        [{ name: 'Build', command: 1 }],
        [{ name: ' ', command: 'run' }],
        [{ name: 'Build', command: '\n ' }],
        [{ name: 'Valid', command: 'one' }, { name: 'Invalid' }],
      ].map(entries =>
        JSON.stringify({
          format: 'github-desktop-custom-commands',
          version: 1,
          commands: entries,
        })
      ),
    ]
    const snapshot = JSON.stringify(commands)
    for (const contents of invalid) {
      assert.throws(() => importCustomCommandsFromJSON(contents, commands))
      assert.equal(JSON.stringify(commands), snapshot)
    }
    assert.throws(() => serializeCustomCommands([]), /at least one/)
    assert.throws(
      () => serializeCustomCommands([{ id: 'a', name: '', command: 'run' }]),
      /needs a name/
    )
  })

  it('saves exact command text independently for each checkout and can forget it', async () => {
    const storage = createStorage()
    assert.deepEqual(getCustomCommands(storage, 'repo'), [])
    saveCustomCommands(storage, 'repo', commands)
    saveCustomCommands(storage, 'linked-worktree', [commands[1]])
    assert.deepEqual(getCustomCommands(storage, 'repo'), commands)
    assert.deepEqual(getCustomCommands(storage, 'linked-worktree'), [
      commands[1],
    ])
    saveCustomCommands(storage, 'repo', [])
    assert.deepEqual(getCustomCommands(storage, 'repo'), [])
    assert.deepEqual(getCustomCommands(storage, 'linked-worktree'), [
      commands[1],
    ])
  })

  it('preserves an existing single command when moving to a list', async () => {
    const storage = createStorage()
    storage.setItem('custom-command:repo', 'dotnet build')
    const migrated = getCustomCommands(storage, 'repo')
    assert.deepEqual(migrated, [
      { id: 'legacy-command', name: 'Custom command', command: 'dotnet build' },
    ])
    saveCustomCommands(storage, 'repo', migrated)
    assert.equal(storage.getItem('custom-command:repo'), null)
    saveCustomCommands(storage, 'repo', [])
    assert.deepEqual(getCustomCommands(storage, 'repo'), [])
  })

  it('shares global commands across repositories without changing repository lists', async () => {
    const storage = createStorage()
    saveCustomCommands(storage, 'repo-a', commands)
    saveCustomCommands(storage, 'repo-b', [commands[1]])
    assert.deepEqual(getCustomCommands(storage, 'repo-a', 'global'), [])
    saveCustomCommands(storage, 'repo-a', [commands[0]], 'global')
    assert.deepEqual(getCustomCommands(storage, 'repo-b', 'global'), [
      commands[0],
    ])
    assert.deepEqual(getCustomCommands(storage, 'repo-a'), commands)
    assert.deepEqual(getCustomCommands(storage, 'repo-b'), [commands[1]])

    saveCustomCommands(storage, 'repo-b', [], 'global')
    assert.deepEqual(getCustomCommands(storage, 'repo-a', 'global'), [])
    assert.deepEqual(getCustomCommands(storage, 'repo-a'), commands)
    assert.deepEqual(getCustomCommands(storage, 'repo-b'), [commands[1]])
  })

  it('does not migrate or remove legacy repository commands when saving global commands', async () => {
    const storage = createStorage()
    storage.setItem('custom-command:repo', 'dotnet build')
    assert.deepEqual(getCustomCommands(storage, 'repo', 'global'), [])
    saveCustomCommands(storage, 'repo', commands, 'global')
    assert.equal(storage.getItem('custom-command:repo'), 'dotnet build')
    assert.equal(getCustomCommands(storage, 'repo')[0].command, 'dotnet build')
    saveCustomCommands(storage, 'repo', [])
    assert.deepEqual(getCustomCommands(storage, 'repo', 'global'), commands)
  })

  it('validates global commands without overwriting either scope on failure', async () => {
    const storage = createStorage()
    saveCustomCommands(storage, 'repo', commands)
    saveCustomCommands(storage, 'repo', [commands[0]], 'global')
    assert.throws(
      () =>
        saveCustomCommands(
          storage,
          'repo',
          [commands[0], { ...commands[1], name: 'Build' }],
          'global'
        ),
      /different name/
    )
    assert.deepEqual(getCustomCommands(storage, 'repo', 'global'), [
      commands[0],
    ])
    assert.deepEqual(getCustomCommands(storage, 'repo'), commands)
    storage.setItem('global-custom-commands', 'null')
    assert.throws(() => getCustomCommands(storage, 'repo', 'global'), /invalid/)
    assert.deepEqual(getCustomCommands(storage, 'repo'), commands)
  })

  it('rejects incomplete, duplicate, or corrupted entries without overwriting saved commands', async () => {
    const storage = createStorage()
    saveCustomCommands(storage, 'repo', commands)
    assert.throws(
      () =>
        saveCustomCommands(storage, 'repo', [{ ...commands[0], name: ' ' }]),
      /needs a name/
    )
    assert.deepEqual(getCustomCommands(storage, 'repo'), commands)
    assert.match(
      getCustomCommandsValidationError([
        commands[0],
        { ...commands[1], name: ' build ' },
      ]) ?? '',
      /different name/
    )
    assert.match(
      getCustomCommandsValidationError([{ ...commands[0], command: ' \n' }]) ??
        '',
      /needs a name/
    )
    storage.setItem(
      'custom-commands:repo',
      '[{"id":"a","name":"Build","command":4}]'
    )
    assert.throws(() => getCustomCommands(storage, 'repo'), /invalid/)
    storage.setItem('custom-commands:repo', '{')
    assert.throws(() => getCustomCommands(storage, 'repo'), SyntaxError)
  })

  it('preserves quotes, Unicode, pipelines and newlines without argument interpolation', async () => {
    const command = 'Write-Output "hello & \u4e16\u754c" | Out-Host\n$env:NAME'
    const args = getCustomCommandArguments(command)
    assert.deepEqual(args.slice(0, -1), [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-OutputFormat',
      'Text',
      '-EncodedCommand',
    ])
    const script = Buffer.from(args[6], 'base64').toString('utf16le')
    assert.ok(script.includes(`\n${command}\n`))
    assert.match(script, /UTF8Encoding/)
    assert.ok(script.endsWith('exit $LASTEXITCODE'))
    assert.throws(() => getCustomCommandArguments(' \r\n'), /Enter a command/)
  })

  it('does not hide storage failures', async () => {
    const storage = {
      setItem: () => {
        throw new Error('Storage is full')
      },
      removeItem: () => {},
    }
    assert.throws(
      () => saveCustomCommands(storage, 'repo', commands),
      /Storage is full/
    )
  })

  it('learns duration separately for each command version and checkout', async () => {
    const storage = createStorage()
    const command = commands[0]
    assert.equal(getCustomCommandDuration(storage, 'repo', command), null)
    saveCustomCommandDuration(storage, 'repo', command, 2000)
    assert.equal(getCustomCommandDuration(storage, 'repo', command), 2000)
    assert.equal(getCustomCommandDuration(storage, 'other-repo', command), null)
    assert.equal(
      getCustomCommandDuration(storage, 'repo', { ...command, id: 'other' }),
      null
    )
    assert.equal(
      getCustomCommandDuration(storage, 'repo', {
        ...command,
        command: 'npm test',
      }),
      null
    )
    assert.equal(
      getCustomCommandDuration(storage, 'repo', {
        ...command,
        name: 'Compile',
      }),
      2000
    )
    saveCustomCommandDuration(storage, 'repo', command, 3000)
    assert.equal(getCustomCommandDuration(storage, 'repo', command), 3000)
  })

  it('keeps unknown progress indeterminate and caps estimates below completion', async () => {
    assert.equal(getCustomCommandProgress(1000, null), undefined)
    assert.equal(getCustomCommandProgress(0, 2000), 0)
    assert.equal(getCustomCommandProgress(1000, 2000), 50)
    assert.equal(getCustomCommandProgress(1900, 2000), 95)
    assert.equal(getCustomCommandProgress(2000, 2000), 95)
    assert.equal(getCustomCommandProgress(200000, 2000), 95)
  })

  it('rejects invalid durations and reports history storage failures', async () => {
    const storage = createStorage()
    for (const duration of [0, -1, NaN, Infinity]) {
      assert.throws(
        () => saveCustomCommandDuration(storage, 'repo', commands[0], duration),
        /positive/
      )
    }
    assert.throws(
      () =>
        getCustomCommandDuration(
          { getItem: () => '{"durationMs":0,"commandHash":"x"}' },
          'repo',
          commands[0]
        ),
      /invalid/
    )
    assert.throws(
      () =>
        saveCustomCommandDuration(
          {
            setItem: () => {
              throw new Error('Storage is full')
            },
          },
          'repo',
          commands[0],
          10
        ),
      /Storage is full/
    )
  })

  it(
    'streams both pipes without a console, shell interpolation, or premature completion',
    { skip: !__WIN32__ },
    async t => {
      const child = new ChildProcess()
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      const spawn = t.mock.method(childProcess, 'spawn', () => child)
      const cwd = "C:\\repositories\\space & 'quoted'\\worktree"
      const chunks: Buffer[] = []
      const run = startCustomCommand(cwd, 'Get-Location', chunk =>
        chunks.push(chunk)
      )
      const [executable, args, options] = spawn.mock.calls[0].arguments
      assert.ok(executable)
      assert.match(executable, /WindowsPowerShell\\v1\.0\\powershell\.exe$/i)
      assert.deepEqual(args, getCustomCommandArguments('Get-Location'))
      assert.deepEqual(options, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
      })
      const unicode = Buffer.from('\u4e16\u754c')
      child.stdout.emit('data', unicode.subarray(0, 2))
      child.stdout.emit('data', unicode.subarray(2))
      child.stderr.emit('data', Buffer.from(' error'))
      assert.equal(Buffer.concat(chunks).toString('utf8'), '\u4e16\u754c error')
      let complete = false
      run.result.then(() => {
        complete = true
      })
      child.emit('exit', 0)
      await Promise.resolve()
      assert.equal(complete, false)
      child.emit('close', 0, null)
      assert.deepEqual(await run.result, { kind: 'exited', exitCode: 0 })
    }
  )

  it('reports the actual command exit code', { skip: !__WIN32__ }, async t => {
    const child = new ChildProcess()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    t.mock.method(childProcess, 'spawn', () => child)
    const run = startCustomCommand('repo', 'exit 7', () => {})
    child.emit('close', 7, null)
    assert.deepEqual(await run.result, { kind: 'exited', exitCode: 7 })
  })

  it(
    'reports launch errors rather than claiming execution succeeded',
    { skip: !__WIN32__ },
    async t => {
      const child = new ChildProcess()
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      t.mock.method(childProcess, 'spawn', () => child)
      const run = startCustomCommand(
        'missing-checkout',
        'Get-Location',
        () => {}
      )
      child.emit('error', new Error('ENOENT'))
      child.emit('close', -2, null)
      await assert.rejects(run.result, /ENOENT/)
    }
  )

  it(
    'stops only the launched process tree and waits for confirmation',
    { skip: !__WIN32__ },
    async t => {
      const child = new ChildProcess()
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      Object.defineProperty(child, 'pid', { value: 12345 })
      t.mock.method(childProcess, 'spawn', () => child)
      let completeKill: (() => void) | undefined
      const kill = t.mock.method(
        childProcess,
        'execFile',
        (...args: unknown[]) => {
          const callback = args[3]
          assert.equal(typeof callback, 'function')
          if (typeof callback === 'function') {
            completeKill = () => callback(null, '', '')
          }
          return new ChildProcess()
        }
      )
      const run = startCustomCommand('repo', 'Start-Sleep 60', () => {})
      const stop = run.stop()
      assert.equal(run.stop(), stop)
      const [executable, args, options] = kill.mock.calls[0].arguments
      assert.match(String(executable), /System32\\taskkill\.exe$/i)
      assert.deepEqual(args, ['/PID', '12345', '/T', '/F'])
      assert.deepEqual(options, { windowsHide: true })
      child.emit('close', 1, null)
      assert.ok(completeKill)
      completeKill()
      await stop
      assert.deepEqual(await run.result, { kind: 'cancelled' })
      await run.stop()
      assert.equal(kill.mock.callCount(), 1)
    }
  )

  it(
    'reports stop failures and allows retry instead of claiming cancellation',
    { skip: !__WIN32__ },
    async t => {
      const child = new ChildProcess()
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      Object.defineProperty(child, 'pid', { value: 12345 })
      t.mock.method(childProcess, 'spawn', () => child)
      let attempts = 0
      t.mock.method(childProcess, 'execFile', (...args: unknown[]) => {
        const callback = args[3]
        assert.equal(typeof callback, 'function')
        attempts++
        if (typeof callback === 'function') {
          callback(attempts === 1 ? new Error('access denied') : null, '', '')
        }
        return new ChildProcess()
      })
      const run = startCustomCommand('repo', 'Start-Sleep 60', () => {})
      await assert.rejects(run.stop(), /Could not stop/)
      await run.stop()
      child.emit('close', 1, null)
      assert.deepEqual(await run.result, { kind: 'cancelled' })
      assert.equal(attempts, 2)
    }
  )

  it(
    'runs hidden PowerShell with Unicode output, the exact cwd, and native failure codes',
    { skip: !__WIN32__, timeout: 30000 },
    async t => {
      const parent = await createTempDirectory(t)
      const cwd = Path.join(parent, "worktree & 'quoted'")
      await mkdir(cwd)
      const chunks: Buffer[] = []
      const run = startCustomCommand(
        cwd,
        'Write-Output "\u4e16\u754c"; [Console]::Error.WriteLine("stderr"); (Get-Location).Path',
        chunk => chunks.push(chunk)
      )
      t.after(() => run.stop())
      assert.deepEqual(await run.result, { kind: 'exited', exitCode: 0 })
      const output = Buffer.concat(chunks).toString('utf8')
      assert.ok(output.includes('\u4e16\u754c'))
      assert.ok(output.includes('stderr'))
      assert.ok(output.includes(cwd))

      const failed = startCustomCommand(
        cwd,
        '& $env:ComSpec /d /c "exit 7"',
        () => {}
      )
      t.after(() => failed.stop())
      assert.deepEqual(await failed.result, { kind: 'exited', exitCode: 7 })
      const errorOutput: Buffer[] = []
      const error = startCustomCommand(
        cwd,
        'Write-Error "command failed"',
        chunk => errorOutput.push(chunk)
      )
      t.after(() => error.stop())
      assert.deepEqual(await error.result, { kind: 'exited', exitCode: 1 })
      assert.ok(
        Buffer.concat(errorOutput).toString('utf8').includes('command failed')
      )
    }
  )

  it(
    'actually stops a running command and its child process',
    { skip: !__WIN32__, timeout: 30000 },
    async t => {
      const cwd = await createTempDirectory(t)
      let output = ''
      const run = startCustomCommand(
        cwd,
        [
          '$child = Start-Process -FilePath "$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -ArgumentList "-NoProfile", "-NonInteractive", "-Command", "Start-Sleep 60" -WindowStyle Hidden -PassThru',
          'Write-Output "child-pid:$($child.Id)"',
          'Start-Sleep 60',
        ].join('\n'),
        chunk => {
          output += chunk.toString('utf8')
        }
      )
      t.after(() => run.stop())
      for (
        let attempt = 0;
        attempt < 100 && !/child-pid:\d+/.test(output);
        attempt++
      ) {
        await setTimeout(50)
      }
      const match = /child-pid:(\d+)/.exec(output)
      assert.ok(match, output)
      const childPid = Number(match[1])
      assert.equal(process.kill(childPid, 0), true)
      await run.stop()
      assert.deepEqual(await run.result, { kind: 'cancelled' })
      assert.throws(() => process.kill(childPid, 0), { code: 'ESRCH' })
    }
  )
})
