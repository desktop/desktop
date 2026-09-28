import assert from 'node:assert/strict'
import {
  afterEach,
  before,
  beforeEach,
  describe,
  it,
  mock,
  TestContext,
} from 'node:test'
import * as React from 'react'
import {
  CustomCommandScope,
  CustomCommandResult,
  ICustomCommand,
  importCustomCommandsFromJSON,
  serializeCustomCommands,
} from '../../../src/lib/custom-command'
import { Repository } from '../../../src/models/repository'
import { CustomCommandDialog } from '../../../src/ui/custom-command/custom-command-dialog'
import { DialogStackContext } from '../../../src/ui/dialog/dialog'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

let CustomCommandRunDialog: typeof import('../../../src/ui/custom-command/custom-command-run-dialog').CustomCommandRunDialog
let Terminal: typeof import('../../../src/ui/terminal').Terminal

describe('custom command dialog', () => {
  before(async () => {
    const context = mock.method(
      HTMLCanvasElement.prototype,
      'getContext',
      () => null
    )
    try {
      ;({ CustomCommandRunDialog } = await import(
        '../../../src/ui/custom-command/custom-command-run-dialog'
      ))
      ;({ Terminal } = await import('../../../src/ui/terminal'))
    } finally {
      context.mock.restore()
    }
  })
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'showModal'
  )
  const closeDescriptor = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'close'
  )
  let restoreIpcSend: () => void
  let unmount: (() => void) | undefined

  beforeEach(async () => {
    const { ipcRenderer } = await import('electron')
    const previousSend = ipcRenderer.send
    ipcRenderer.send = () => {}
    restoreIpcSend = () => {
      ipcRenderer.send = previousSend
    }
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = true
      },
    })
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = false
      },
    })
  })

  afterEach(() => {
    unmount?.()
    unmount = undefined
    restoreIpcSend()
    if (descriptor === undefined) {
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    } else {
      Object.defineProperty(
        HTMLDialogElement.prototype,
        'showModal',
        descriptor
      )
    }
    if (closeDescriptor === undefined) {
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
    } else {
      Object.defineProperty(
        HTMLDialogElement.prototype,
        'close',
        closeDescriptor
      )
    }
  })

  const initialCommands = [
    { id: 'build', name: 'Build', command: 'npm run build' },
    { id: 'test', name: 'Test', command: 'npm test' },
  ]

  function setup(
    commands: ReadonlyArray<ICustomCommand> = initialCommands,
    success = true,
    scope: CustomCommandScope = 'repository'
  ) {
    const repository = new Repository('C:\\repo\\worktree', 1, null, false)
    const calls: {
      commands: ReadonlyArray<ICustomCommand>
      repository: Repository
      scope: CustomCommandScope
    }[] = []
    let dismissed = false
    const dispatcher = {
      importCustomCommands: mock.fn(
        async (
          _existing: ReadonlyArray<ICustomCommand>
        ): Promise<ReadonlyArray<ICustomCommand> | null> => null
      ),
      exportCustomCommands: mock.fn(
        async (_commands: ReadonlyArray<ICustomCommand>) => true
      ),
      saveCustomCommands: async (
        repository: Repository,
        commands: ReadonlyArray<ICustomCommand>,
        scope: CustomCommandScope
      ) => {
        calls.push({ repository, commands, scope })
        return success
      },
    }
    const view = render(
      <DialogStackContext.Provider value={{ isTopMost: true }}>
        <CustomCommandDialog
          repository={repository}
          scope={scope}
          dispatcher={dispatcher}
          initialCommands={commands}
          onDismissed={() => {
            dismissed = true
          }}
        />
      </DialogStackContext.Provider>
    )
    unmount = view.unmount
    return { calls, repository, view, dispatcher, isDismissed: () => dismissed }
  }

  for (const scope of ['repository', 'global'] as const) {
    it(`imports into a ${scope} draft without saving or overwriting until confirmed`, async () => {
      const { calls, dispatcher, isDismissed } = setup(
        initialCommands,
        true,
        scope
      )
      dispatcher.importCustomCommands.mock.mockImplementation(async existing =>
        importCustomCommandsFromJSON(
          serializeCustomCommands([initialCommands[0]]),
          existing
        )
      )
      fireEvent.click(screen.getByRole('button', { name: 'Import...' }))
      await screen.findByRole('status')
      assert.match(screen.getByRole('status').textContent ?? '', /Review/)
      assert.equal(
        screen.getByRole('textbox', { name: 'Name' }).getAttribute('value'),
        'Build (2)'
      )
      assert.equal(calls.length, 0)
      assert.equal(isDismissed(), false)
      fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
      await waitFor(() => assert.equal(isDismissed(), true))
      assert.equal(calls[0].scope, scope)
      assert.deepEqual(calls[0].commands.slice(0, 2), initialCommands)
      assert.equal(calls[0].commands[2].name, 'Build (2)')
    })
  }

  it('discards imported commands when the editor is cancelled', async () => {
    const { calls, dispatcher, isDismissed, view } = setup()
    const appeared = new Promise<void>(resolve => {
      view.container.addEventListener('dialog-appeared', () => resolve(), {
        once: true,
      })
    })
    dispatcher.importCustomCommands.mock.mockImplementation(async existing =>
      importCustomCommandsFromJSON(
        serializeCustomCommands(initialCommands),
        existing
      )
    )
    fireEvent.click(screen.getByRole('button', { name: 'Import...' }))
    await screen.findByRole('status')
    await appeared
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
    await waitFor(() => assert.equal(isDismissed(), true))
    assert.equal(calls.length, 0)
  })

  it('exports the selected draft or the whole group without saving the editor', async () => {
    const { calls, dispatcher } = setup()
    fireEvent.change(
      screen.getByRole('textbox', { name: 'PowerShell command' }),
      {
        target: { value: 'edited script' },
      }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Export selected...' }))
    await screen.findByRole('status')
    assert.deepEqual(
      dispatcher.exportCustomCommands.mock.calls[0].arguments[0],
      [{ ...initialCommands[0], command: 'edited script' }]
    )
    fireEvent.click(screen.getByRole('button', { name: 'Export all...' }))
    await waitFor(() =>
      assert.match(screen.getByRole('status').textContent ?? '', /Exported 2/)
    )
    assert.deepEqual(
      dispatcher.exportCustomCommands.mock.calls[1].arguments[0],
      [{ ...initialCommands[0], command: 'edited script' }, initialCommands[1]]
    )
    assert.equal(calls.length, 0)
  })

  it('does not show success or change the draft after a file dialog is cancelled', async () => {
    const { calls, dispatcher } = setup()
    dispatcher.exportCustomCommands.mock.mockImplementation(async () => false)
    fireEvent.click(screen.getByRole('button', { name: 'Import...' }))
    await waitFor(() =>
      assert.equal(
        screen
          .getByRole('button', { name: 'Save', exact: true })
          .hasAttribute('aria-disabled'),
        false
      )
    )
    assert.equal(screen.queryByRole('status'), null)
    assert.equal(screen.queryByRole('alert'), null)
    fireEvent.click(screen.getByRole('button', { name: 'Export all...' }))
    await waitFor(() =>
      assert.equal(
        screen
          .getByRole('button', { name: 'Save', exact: true })
          .hasAttribute('aria-disabled'),
        false
      )
    )
    assert.equal(screen.queryByRole('status'), null)
    assert.equal(calls.length, 0)
  })

  it('surfaces file errors and keeps the existing draft editable', async () => {
    const { dispatcher } = setup()
    dispatcher.importCustomCommands.mock.mockImplementation(async () => {
      throw new Error('Invalid JSON file')
    })
    dispatcher.exportCustomCommands.mock.mockImplementation(async () => {
      throw new Error('Permission denied')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Import...' }))
    await screen.findByRole('alert')
    assert.match(
      screen.getByRole('alert').textContent ?? '',
      /Could not import.*Invalid JSON/
    )
    assert.equal(
      screen.getByRole('textbox', { name: 'Name' }).getAttribute('value'),
      'Build'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Export all...' }))
    await waitFor(() =>
      assert.match(
        screen.getByRole('alert').textContent ?? '',
        /Could not export.*Permission denied/
      )
    )
    assert.equal(screen.queryByRole('status'), null)
  })

  it('blocks editing and closing while a file picker is pending', async () => {
    const { dispatcher } = setup()
    let finish = () => {}
    dispatcher.importCustomCommands.mock.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = () => resolve(null)
        })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Import...' }))
    assert.ok(
      screen
        .getByRole('button', { name: 'Save', exact: true })
        .hasAttribute('aria-disabled')
    )
    assert.ok(
      screen
        .getByRole('button', { name: 'Cancel', exact: true })
        .hasAttribute('aria-disabled')
    )
    assert.ok(
      screen
        .getByRole('textbox', { name: 'PowerShell command' })
        .hasAttribute('disabled')
    )
    finish()
    await waitFor(() =>
      assert.equal(
        screen
          .getByRole('button', { name: 'Save', exact: true })
          .hasAttribute('aria-disabled'),
        false
      )
    )
  })

  it('disables exporting empty or incomplete commands while still allowing import', async () => {
    setup([])
    for (const name of ['Export selected...', 'Export all...']) {
      assert.ok(
        screen.getByRole('button', { name }).hasAttribute('aria-disabled')
      )
    }
    assert.equal(
      screen
        .getByRole('button', { name: 'Import...' })
        .hasAttribute('aria-disabled'),
      false
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add command' }))
    assert.ok(
      screen
        .getByRole('button', { name: 'Export selected...' })
        .hasAttribute('aria-disabled')
    )
  })

  it('shows the exact checkout and never runs a saved command on open', async () => {
    const { calls } = setup()
    assert.ok(screen.getByText('C:\\repo\\worktree'))
    assert.equal(
      screen.getByRole('textbox', { name: 'PowerShell command' }).textContent,
      'npm run build'
    )
    assert.equal(calls.length, 0)
    assert.equal(screen.queryByRole('button', { name: /run/i }), null)
  })

  it('selects and edits an entry without changing the other saved command', async () => {
    const { calls, repository, isDismissed } = setup()
    fireEvent.change(screen.getByRole('combobox', { name: 'Commands' }), {
      target: { value: 'test' },
    })
    fireEvent.change(
      screen.getByRole('textbox', { name: 'PowerShell command' }),
      { target: { value: 'npm run test:unit' } }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
    await waitFor(() => assert.equal(isDismissed(), true))
    assert.deepEqual(calls, [
      {
        repository,
        scope: 'repository',
        commands: [
          initialCommands[0],
          { ...initialCommands[1], command: 'npm run test:unit' },
        ],
      },
    ])
  })

  it('adds a named command and blocks saving incomplete entries', async () => {
    const { calls, isDismissed } = setup([])
    fireEvent.click(screen.getByRole('button', { name: 'Add command' }))
    assert.ok(
      screen
        .getByRole('button', { name: 'Save', exact: true })
        .hasAttribute('aria-disabled')
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Build' },
    })
    fireEvent.change(
      screen.getByRole('textbox', { name: 'PowerShell command' }),
      { target: { value: 'dotnet build' } }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
    await waitFor(() => assert.equal(isDismissed(), true))
    assert.equal(calls[0].commands[0].name, 'Build')
    assert.equal(calls[0].commands[0].command, 'dotnet build')
    assert.ok(calls[0].commands[0].id)
  })

  it('removes entries and allows saving an empty list', async () => {
    const { calls, isDismissed } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Remove command' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove command' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
    await waitFor(() => assert.equal(isDismissed(), true))
    assert.deepEqual(calls[0].commands, [])
  })

  it('does not allow duplicate names in the menu', async () => {
    setup()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Test' },
    })
    assert.match(screen.getByRole('alert').textContent ?? '', /different name/)
    assert.ok(
      screen
        .getByRole('button', { name: 'Save', exact: true })
        .hasAttribute('aria-disabled')
    )
  })

  it('keeps the editor open on failure so the command can be corrected', async () => {
    const { calls, isDismissed } = setup(initialCommands, false)
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
    await waitFor(() =>
      assert.equal(
        screen
          .getByRole('button', { name: 'Save', exact: true })
          .hasAttribute('aria-disabled'),
        false
      )
    )
    assert.equal(calls.length, 1)
    assert.equal(isDismissed(), false)
  })

  it('clearly identifies and saves the global scope without executing commands', async () => {
    const { calls, isDismissed } = setup(initialCommands, true, 'global')
    assert.ok(screen.getByRole('dialog', { name: 'Configure global commands' }))
    assert.ok(
      screen.getByText('Global commands are available in every repository.')
    )
    assert.equal(calls.length, 0)
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
    await waitFor(() => assert.equal(isDismissed(), true))
    assert.equal(calls[0].scope, 'global')
    assert.deepEqual(calls[0].commands, initialCommands)
  })

  function setupExecution(
    t: TestContext,
    expectedDurationMs: number | null = null,
    startupError?: Error
  ) {
    t.mock.method(Terminal.prototype, 'componentDidMount', () => {})
    const write = t.mock.method(Terminal.prototype, 'write', () => {})
    const repository = new Repository('C:\\repo\\worktree', 1, null, false)
    let resolveResult: ((result: CustomCommandResult) => void) | undefined
    let rejectResult: ((error: Error) => void) | undefined
    let output: ((chunk: Buffer) => void) | undefined
    const result = new Promise<CustomCommandResult>((resolve, reject) => {
      resolveResult = resolve
      rejectResult = reject
    })
    const stop = t.mock.fn(async () => {})
    const dispatcher = {
      executeCustomCommand: t.mock.fn(
        (
          _repository: Repository,
          _command: ICustomCommand,
          onOutput: (chunk: Buffer) => void
        ) => {
          if (startupError !== undefined) {
            throw startupError
          }
          output = onOutput
          return { result, stop }
        }
      ),
    }
    let dismissed = false
    const view = render(
      <DialogStackContext.Provider value={{ isTopMost: true }}>
        <CustomCommandRunDialog
          repository={repository}
          command={initialCommands[0]}
          expectedDurationMs={expectedDurationMs}
          dispatcher={dispatcher}
          onDismissed={() => {
            dismissed = true
          }}
        />
      </DialogStackContext.Provider>
    )
    unmount = view.unmount
    return {
      view,
      stop,
      write,
      dispatcher,
      isDismissed: () => dismissed,
      finish: (value: CustomCommandResult) => {
        assert.ok(resolveResult)
        resolveResult(value)
      },
      fail: (error: Error) => {
        assert.ok(rejectResult)
        rejectResult(error)
      },
      output: (chunk: Buffer) => {
        assert.ok(output)
        output(chunk)
      },
    }
  }

  it('streams output in-app and keeps the first run indeterminate until successful', async t => {
    const run = setupExecution(t)
    assert.equal(screen.getByRole('progressbar').hasAttribute('value'), false)
    assert.match(screen.getByRole('status').textContent ?? '', /Running/)
    const chunk = Buffer.from('streamed output')
    run.output(chunk)
    assert.deepEqual(run.write.mock.calls[0].arguments, [chunk])
    const form = run.view.container.querySelector('form')
    assert.ok(form)
    fireEvent.submit(form)
    assert.equal(run.isDismissed(), false)
    run.finish({ kind: 'exited', exitCode: 0 })
    await waitFor(() =>
      assert.match(
        screen.getByRole('status').textContent ?? '',
        /Completed successfully/
      )
    )
    assert.equal(screen.getByRole('progressbar').getAttribute('value'), '100')
    assert.equal(run.dispatcher.executeCustomCommand.mock.callCount(), 1)
    fireEvent.submit(form)
    assert.equal(run.isDismissed(), true)
  })

  it('labels historical progress as estimated and never reaches 100 while still running', async t => {
    const run = setupExecution(t, 1)
    await waitFor(() =>
      assert.equal(screen.getByRole('progressbar').getAttribute('value'), '95')
    )
    assert.ok(screen.getByText(/Estimated progress: 95%/))
    assert.ok(screen.getByText(/Taking longer than last time/))
    assert.match(screen.getByRole('status').textContent ?? '', /Running/)
    run.finish({ kind: 'exited', exitCode: 0 })
    await waitFor(() =>
      assert.equal(screen.getByRole('progressbar').getAttribute('value'), '100')
    )
  })

  it('retains failure output and reports the real nonzero exit code', async t => {
    const run = setupExecution(t)
    run.output(Buffer.from('npm error ENOENT'))
    run.finish({ kind: 'exited', exitCode: 7 })
    await waitFor(() =>
      assert.equal(
        screen.getByRole('status').textContent,
        'Failed (exit code 7)'
      )
    )
    assert.equal(screen.queryByRole('progressbar'), null)
    assert.equal(run.isDismissed(), false)
    assert.equal(run.write.mock.callCount(), 1)
  })

  it('stops without closing and waits for confirmed cancellation', async t => {
    const run = setupExecution(t)
    fireEvent.click(screen.getByRole('button', { name: 'Stop command' }))
    assert.equal(run.stop.mock.callCount(), 1)
    assert.equal(screen.getByRole('status').textContent, 'Stopping...')
    assert.equal(run.isDismissed(), false)
    run.finish({ kind: 'cancelled' })
    await waitFor(() =>
      assert.equal(screen.getByRole('status').textContent, 'Stopped')
    )
    assert.equal(screen.queryByRole('progressbar'), null)
  })

  it('surfaces cancellation failure and lets the user retry', async t => {
    const run = setupExecution(t)
    run.stop.mock.mockImplementation(async () => {
      throw new Error('Could not stop command')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Stop command' }))
    await waitFor(() =>
      assert.match(
        screen.getByRole('alert').textContent ?? '',
        /Could not stop/
      )
    )
    assert.equal(screen.getByRole('status').textContent, 'Running...')
    assert.equal(
      screen
        .getByRole('button', { name: 'Stop command' })
        .hasAttribute('aria-disabled'),
      false
    )
    run.stop.mock.mockImplementation(async () => {})
    run.finish({ kind: 'exited', exitCode: 0 })
    await waitFor(() =>
      assert.equal(
        screen.getByRole('status').textContent,
        'Completed successfully'
      )
    )
  })

  it('shows startup failures in the execution panel', async t => {
    setupExecution(t, null, new Error('PowerShell is unavailable'))
    assert.equal(
      screen.getByRole('status').textContent,
      'Could not run command'
    )
    assert.match(
      screen.getByRole('alert').textContent ?? '',
      /PowerShell is unavailable/
    )
    assert.equal(screen.queryByRole('progressbar'), null)
  })

  it('shows asynchronous process errors rather than a successful completion', async t => {
    const run = setupExecution(t)
    run.fail(new Error('ENOENT'))
    await waitFor(() =>
      assert.match(screen.getByRole('alert').textContent ?? '', /ENOENT/)
    )
    assert.equal(
      screen.getByRole('status').textContent,
      'Could not run command'
    )
  })

  it('prevents app closing while running and releases the guard on completion', async t => {
    const run = setupExecution(t)
    const closing = new window.Event('beforeunload', { cancelable: true })
    window.dispatchEvent(closing)
    assert.equal(closing.defaultPrevented, true)
    assert.ok(
      screen.getByText('Stop the command before closing GitHub Desktop.')
    )
    run.finish({ kind: 'exited', exitCode: 0 })
    await waitFor(() =>
      assert.equal(
        screen.getByRole('status').textContent,
        'Completed successfully'
      )
    )
    const finishedClosing = new window.Event('beforeunload', {
      cancelable: true,
    })
    window.dispatchEvent(finishedClosing)
    assert.equal(finishedClosing.defaultPrevented, false)
  })

  it('stops its owned process when the execution dialog is unmounted', async t => {
    const run = setupExecution(t)
    run.view.unmount()
    unmount = undefined
    assert.equal(run.stop.mock.callCount(), 1)
  })
})
