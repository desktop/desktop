import * as React from 'react'
import {
  CustomCommandResult,
  ICustomCommand,
  ICustomCommandExecution,
  getCustomCommandProgress,
} from '../../lib/custom-command'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Button } from '../lib/button'
import { Terminal } from '../terminal'

interface ICustomCommandRunDialogProps {
  readonly repository: Repository
  readonly command: ICustomCommand
  readonly expectedDurationMs: number | null
  readonly dispatcher: Pick<Dispatcher, 'executeCustomCommand'>
  readonly onDismissed: () => void
}

type RunState =
  | { readonly kind: 'running' }
  | { readonly kind: 'stopping' }
  | { readonly kind: 'finished'; readonly result: CustomCommandResult }
  | { readonly kind: 'error'; readonly message: string }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Display a single command's live output and retain it until explicitly closed. */
export function CustomCommandRunDialog({
  repository,
  command,
  expectedDurationMs,
  dispatcher,
  onDismissed,
}: ICustomCommandRunDialogProps) {
  const terminal = React.useRef<Terminal>(null)
  const execution = React.useRef<ICustomCommandExecution>()
  const [state, setState] = React.useState<RunState>({ kind: 'running' })
  const [stopError, setStopError] = React.useState<string | null>(null)
  const [closeWarning, setCloseWarning] = React.useState(false)
  const startedAt = React.useRef(performance.now())
  const [elapsedMs, setElapsedMs] = React.useState(0)
  const active = state.kind === 'running' || state.kind === 'stopping'

  React.useEffect(() => {
    if (!active) {
      return
    }
    const timer = window.setInterval(() => {
      setElapsedMs(performance.now() - startedAt.current)
    }, 100)
    return () => window.clearInterval(timer)
  }, [active])

  React.useEffect(() => {
    let mounted = true
    const preventClose = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
      setCloseWarning(true)
    }
    window.addEventListener('beforeunload', preventClose)
    try {
      const run = dispatcher.executeCustomCommand(repository, command, chunk =>
        terminal.current?.write(chunk)
      )
      execution.current = run
      run.result.then(
        result => {
          window.removeEventListener('beforeunload', preventClose)
          if (mounted) {
            setElapsedMs(performance.now() - startedAt.current)
            setState({ kind: 'finished', result })
          }
        },
        error => {
          window.removeEventListener('beforeunload', preventClose)
          if (mounted) {
            setElapsedMs(performance.now() - startedAt.current)
            setState({ kind: 'error', message: errorMessage(error) })
          }
        }
      )
    } catch (error) {
      window.removeEventListener('beforeunload', preventClose)
      setState({ kind: 'error', message: errorMessage(error) })
    }
    return () => {
      mounted = false
      window.removeEventListener('beforeunload', preventClose)
      execution.current
        ?.stop()
        .catch(error =>
          log.error(
            'Failed to stop a custom command when its dialog closed',
            error
          )
        )
    }
  }, [command, dispatcher, repository])

  const onStop = React.useCallback(async () => {
    if (state.kind !== 'running' || execution.current === undefined) {
      return
    }
    setStopError(null)
    setState({ kind: 'stopping' })
    try {
      await execution.current.stop()
    } catch (error) {
      setStopError(errorMessage(error))
      setState({ kind: 'running' })
    }
  }, [state.kind])

  const onClose = React.useCallback(() => {
    if (!active) {
      onDismissed()
    }
  }, [active, onDismissed])

  const failed =
    state.kind === 'error' ||
    (state.kind === 'finished' &&
      state.result.kind === 'exited' &&
      state.result.exitCode !== 0)
  const status =
    state.kind === 'running'
      ? 'Running...'
      : state.kind === 'stopping'
      ? 'Stopping...'
      : state.kind === 'error'
      ? 'Could not run command'
      : state.result.kind === 'cancelled'
      ? 'Stopped'
      : state.result.exitCode === 0
      ? 'Completed successfully'
      : `Failed (exit code ${state.result.exitCode})`
  const succeeded =
    state.kind === 'finished' &&
    state.result.kind === 'exited' &&
    state.result.exitCode === 0
  const estimatedProgress = getCustomCommandProgress(
    elapsedMs,
    expectedDurationMs
  )

  return (
    <Dialog
      id="custom-command-run"
      title={command.name}
      loading={active}
      dismissDisabled={active}
      backdropDismissable={false}
      onDismissed={onClose}
      onSubmit={onClose}
    >
      <DialogContent>
        <div className="command-run-status" role="status" data-failed={failed}>
          {status}
        </div>
        <p className="command-working-directory">
          Working directory: <code>{repository.path}</code>
        </p>
        {(active || succeeded) && (
          <div className="command-progress">
            <progress
              aria-label={
                succeeded ? 'Command complete' : 'Estimated command progress'
              }
              max={100}
              value={succeeded ? 100 : estimatedProgress}
            />
            <p>
              {succeeded
                ? '100% - completed'
                : expectedDurationMs === null
                ? 'Learning duration from this run...'
                : `Estimated progress: ${estimatedProgress}% (last successful run: ${(
                    expectedDurationMs / 1000
                  ).toFixed(1)}s)`}{' '}
              {(elapsedMs / 1000).toFixed(1)}s elapsed.
            </p>
            {active &&
              expectedDurationMs !== null &&
              elapsedMs >= expectedDurationMs && (
                <p>
                  Taking longer than last time. Waiting for the command to
                  finish...
                </p>
              )}
          </div>
        )}
        <div
          className="command-output"
          role="region"
          aria-label="Command output"
        >
          <Terminal
            ref={terminal}
            hideCursor={true}
            disableStdin={true}
            scrollback={2000}
            cols={80}
            rows={16}
          />
        </div>
        {state.kind === 'error' && <p role="alert">{state.message}</p>}
        {stopError !== null && <p role="alert">{stopError}</p>}
        {closeWarning && active && (
          <p role="alert">Stop the command before closing GitHub Desktop.</p>
        )}
        <p className="command-run-hint">
          {active
            ? 'Output appears as the command produces it. Interactive prompts are not supported. Stop the command before closing.'
            : 'The output stays here until you close this window.'}
        </p>
      </DialogContent>
      <DialogFooter>
        <div className="button-group">
          {active && (
            <Button
              type="button"
              onClick={onStop}
              disabled={state.kind === 'stopping'}
            >
              Stop command
            </Button>
          )}
          <Button type="submit" disabled={active}>
            Close
          </Button>
        </div>
      </DialogFooter>
    </Dialog>
  )
}
