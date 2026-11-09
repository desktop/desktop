import * as React from 'react'
import { Form } from './upstream/form'
import { Row } from './upstream/row'

export type ExternalEditor =
  | { readonly kind: 'automatic' }
  | {
      readonly kind: 'command'
      readonly program: string
      readonly args: string[]
      readonly terminal: boolean
    }
interface IEditor {
  readonly name: string
  readonly program: string
  readonly terminal: boolean
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
/** The preferences service accepts an executable plus arguments, never shell text. */
export function externalEditor(value: unknown): value is ExternalEditor {
  return (
    record(value) &&
    (value.kind === 'automatic' ||
      (value.kind === 'command' &&
        typeof value.program === 'string' &&
        Array.isArray(value.args) &&
        value.args.every(arg => typeof arg === 'string') &&
        typeof value.terminal === 'boolean'))
  )
}
/** Configure native editor launches, with an interactive CLI path for terminal editors. */
export function EditorSettings({
  configuration,
  root,
  request,
  onSave,
}: {
  readonly configuration?: ExternalEditor
  readonly root: string | null
  readonly request: (
    method: string,
    parameters: Record<string, unknown>
  ) => Promise<unknown>
  readonly onSave: (editor: ExternalEditor) => Promise<void>
}) {
  const [custom, setCustom] = React.useState(false),
    [program, setProgram] = React.useState(''),
    [args, setArgs] = React.useState(''),
    [terminal, setTerminal] = React.useState(false),
    [found, setFound] = React.useState<IEditor[]>([]),
    [busy, setBusy] = React.useState(false),
    [message, setMessage] = React.useState('')
  const epoch = React.useRef(0)
  React.useLayoutEffect(() => {
    ++epoch.current
    setBusy(false)
    setMessage('')
    return () => {
      ++epoch.current
    }
  }, [root])
  React.useLayoutEffect(() => {
    setCustom(configuration?.kind === 'command')
    if (configuration?.kind === 'command') {
      setProgram(configuration.program)
      setArgs(configuration.args.join('\n'))
      setTerminal(configuration.terminal)
    }
  }, [configuration])
  async function run(task: () => Promise<void>) {
    if (busy) return
    const current = epoch.current
    setBusy(true)
    setMessage('')
    try {
      await task()
    } catch (error) {
      if (current === epoch.current)
        setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      if (current === epoch.current) setBusy(false)
    }
  }
  return (
    <details className="editor-settings">
      <summary>External editor</summary>
      <Form
        onSubmit={() =>
          void run(async () => {
            const current = epoch.current
            await onSave(
              custom
                ? {
                    kind: 'command',
                    program,
                    args:
                      configuration?.kind === 'command' &&
                      args === configuration.args.join('\n')
                        ? configuration.args
                        : args
                        ? args.split('\n')
                        : [],
                    terminal,
                  }
                : { kind: 'automatic' }
            )
            if (current === epoch.current) setMessage('Editor preference saved')
          })
        }
      >
        <label>
          Editor selection{' '}
          <select
            aria-label="Editor selection"
            value={custom ? 'custom' : 'automatic'}
            disabled={busy}
            onChange={event =>
              setCustom(event.currentTarget.value === 'custom')
            }
          >
            <option value="automatic">
              Automatically find an installed editor
            </option>
            <option value="custom">Custom editor command</option>
          </select>
        </label>
        {custom && (
          <>
            <label>
              Editor executable
              <input
                aria-label="Editor executable"
                value={program}
                required={true}
                disabled={busy}
                onChange={event => setProgram(event.currentTarget.value)}
                placeholder="code or /path/to/editor"
              />
            </label>
            <label>
              Editor arguments
              <textarea
                aria-label="Editor arguments"
                value={args}
                disabled={busy}
                onChange={event => setArgs(event.currentTarget.value)}
                rows={4}
              />
            </label>
            <p>
              One argument per line. Use {'{path}'} for the selected file or
              repository, and {'{repo}'} for its repository. Without {'{path}'},
              the path is appended. Arguments are passed directly to the
              executable.
            </p>
            <label>
              <input
                type="checkbox"
                checked={terminal}
                disabled={busy}
                onChange={event => setTerminal(event.currentTarget.checked)}
              />
              Requires an interactive terminal
            </label>
          </>
        )}
        <button disabled={busy}>Save editor preference</button>
      </Form>
      <Row>
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const current = epoch.current
              const value = await request('available_editors', {})
              if (current !== epoch.current) return
              if (!record(value) || !Array.isArray(value.editors))
                throw new Error('Invalid editor discovery response')
              const editors = value.editors.filter(
                (editor): editor is IEditor =>
                  record(editor) &&
                  typeof editor.name === 'string' &&
                  typeof editor.program === 'string' &&
                  typeof editor.terminal === 'boolean'
              )
              setFound(editors)
              setMessage(
                editors.length
                  ? 'Choose an editor and save the preference'
                  : 'No known editors found. Configure an executable path.'
              )
            })
          }
        >
          Find installed editors
        </button>
        <button
          disabled={busy || !root}
          onClick={() =>
            void run(async () => {
              const current = epoch.current
              await request('open_editor', { path: null, repository_id: root })
              if (current === epoch.current) setMessage('Editor launched')
            })
          }
        >
          Open repository in editor
        </button>
      </Row>
      {terminal && custom && (
        <p>
          Use <code>desktop-rs -C repository editor file</code> in Termux or a
          terminal. Terminal editors need an interactive terminal; browser
          launches do not provide one.
        </p>
      )}
      <p role="status">{message}</p>
      <ul>
        {found.map((editor, index) => (
          <li key={index}>
            <button
              disabled={busy}
              onClick={() => {
                setCustom(true)
                setProgram(editor.program)
                setArgs('')
                setTerminal(editor.terminal)
              }}
            >
              {editor.name}
              {editor.terminal ? ' (terminal)' : ''}
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}
