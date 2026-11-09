import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Row } from './upstream/row'
import { createDesktopStashMessage } from './upstream/stash-metadata'

type GitPath = string | { readonly bytes: number[] }
interface IEntry {
  readonly index: number
  readonly oid: string
  readonly name: string
  readonly message: string
  readonly branch: string | null
}
interface IListing {
  readonly basis: string
  readonly entries: IEntry[]
  readonly has_more: boolean
}
interface IFile {
  readonly path: GitPath
  readonly display_path: string
  readonly status: string
  readonly commit: string
  readonly untracked: boolean
}
interface IFiles {
  readonly oid: string
  readonly files: IFile[]
  readonly staged_files: IFile[]
}
interface ISnapshot {
  readonly root: string
  readonly branch: string | null
}
interface IServices {
  readonly request: (
    method: string,
    parameters: Record<string, unknown>
  ) => Promise<unknown>
  readonly onChanged: () => Promise<void>
  readonly onDiff: (
    path: GitPath,
    commit: string,
    parent: number,
    name: string,
    root: string
  ) => void
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function entry(value: unknown): value is IEntry {
  return (
    record(value) &&
    Number.isSafeInteger(value.index) &&
    typeof value.oid === 'string' &&
    typeof value.name === 'string' &&
    typeof value.message === 'string' &&
    (value.branch === null || typeof value.branch === 'string')
  )
}
function listing(value: unknown): value is IListing {
  return (
    record(value) &&
    typeof value.basis === 'string' &&
    Array.isArray(value.entries) &&
    value.entries.every(entry) &&
    typeof value.has_more === 'boolean'
  )
}
function file(value: unknown): value is IFile {
  return (
    record(value) &&
    (typeof value.path === 'string' ||
      (record(value.path) &&
        Array.isArray(value.path.bytes) &&
        value.path.bytes.every(
          byte => Number.isInteger(byte) && byte >= 0 && byte <= 255
        ))) &&
    typeof value.display_path === 'string' &&
    typeof value.status === 'string' &&
    typeof value.commit === 'string' &&
    typeof value.untracked === 'boolean'
  )
}
function files(value: unknown): value is IFiles {
  return (
    record(value) &&
    typeof value.oid === 'string' &&
    Array.isArray(value.files) &&
    value.files.every(file) &&
    Array.isArray(value.staged_files) &&
    value.staged_files.every(file)
  )
}
function succeeded(value: unknown) {
  if (!record(value) || value.code !== 0)
    throw new Error(
      record(value) && typeof value.stderr === 'string'
        ? value.stderr
        : 'Stash operation failed'
    )
  return value
}
function StashPanel({
  snapshot,
  enabled,
  services,
  revision,
}: {
  readonly revision: number
  readonly snapshot: ISnapshot | null
  readonly enabled: boolean
  readonly services: IServices
}) {
  const [list, setList] = React.useState<IListing | null>(null),
    [selected, setSelected] = React.useState<IEntry | null>(null),
    [detail, setDetail] = React.useState<IFiles | null>(null)
  const [busy, setBusy] = React.useState(false),
    [message, setMessage] = React.useState(''),
    [title, setTitle] = React.useState(''),
    [desktop, setDesktop] = React.useState(true),
    [untracked, setUntracked] = React.useState(true),
    [restoreIndex, setRestoreIndex] = React.useState(false),
    [staged, setStaged] = React.useState(false),
    [branch, setBranch] = React.useState(''),
    [confirmation, setConfirmation] = React.useState<'drop' | 'pop' | null>(
      null
    )
  const epoch = React.useRef(0),
    running = React.useRef<number | null>(null)
  const root = snapshot?.root ?? null
  React.useLayoutEffect(() => {
    ++epoch.current
    setList(null)
    setSelected(null)
    setDetail(null)
    setMessage('')
    setBusy(false)
    setTitle('')
    setDesktop(Boolean(snapshot?.branch))
    setUntracked(true)
    setRestoreIndex(false)
    setStaged(false)
    setBranch('')
    setConfirmation(null)
    return () => {
      ++epoch.current
    }
  }, [root])
  async function load(generation: number) {
    const value = await services.request('stash_list', {})
    if (generation !== epoch.current) return
    if (!listing(value)) throw new Error('Invalid stash list response')
    setList(value)
    setSelected(null)
    setDetail(null)
    setConfirmation(null)
  }
  React.useEffect(() => {
    if (!root) return
    const generation = epoch.current
    void load(generation).catch(error => {
      if (generation === epoch.current) setMessage(String(error))
    })
  }, [root, services, revision])
  async function run(task: (generation: number) => Promise<void>) {
    const generation = epoch.current
    if (!enabled || running.current === generation) return
    running.current = generation
    setBusy(true)
    try {
      await task(generation)
    } catch (error) {
      if (generation === epoch.current)
        setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      if (running.current === generation) running.current = null
      if (generation === epoch.current) setBusy(false)
    }
  }
  async function mutate(
    method: string,
    parameters: Record<string, unknown>,
    generation: number
  ) {
    let value: unknown
    try {
      value = await services.request(method, parameters)
    } finally {
      await services.onChanged()
      await load(generation)
    }
    return succeeded(value)
  }
  async function apply(generation: number, pop: boolean) {
    if (!list || !selected) return
    const value = await mutate(
      'stash_apply',
      {
        oid: selected.oid,
        index: selected.index,
        basis: list.basis,
        restore_index: restoreIndex,
        pop,
      },
      generation
    )
    if (generation === epoch.current)
      setMessage(
        typeof value.warning === 'string'
          ? value.warning
          : value.retained === false
          ? 'Stash applied and removed'
          : 'Stash applied; saved entry kept'
      )
  }
  if (!snapshot) return null
  const disabled = busy || !enabled
  return (
    <section className="stash-panel" aria-label="Stashes">
      <h2>Stashes</h2>
      <p role="status">{message}</p>
      <details>
        <summary>Save local changes</summary>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={desktop}
            disabled={disabled || !snapshot.branch}
            onChange={event => setDesktop(event.currentTarget.checked)}
          />
          Associate with current branch
        </label>
        {desktop && snapshot.branch ? (
          <p>{createDesktopStashMessage(snapshot.branch)}</p>
        ) : (
          <label>
            Stash message
            <input
              value={title}
              disabled={disabled}
              onChange={event => setTitle(event.currentTarget.value)}
            />
          </label>
        )}
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={untracked}
            disabled={disabled}
            onChange={event => setUntracked(event.currentTarget.checked)}
          />
          Include untracked files
        </label>
        <button
          disabled={disabled || (desktop && !snapshot.branch)}
          onClick={() =>
            void run(async generation => {
              const value = await mutate(
                'stash_save',
                {
                  message: desktop ? '' : title,
                  desktop,
                  include_untracked: untracked,
                },
                generation
              )
              if (generation === epoch.current)
                setMessage(
                  value.created
                    ? 'Local changes saved'
                    : 'No new stash entry created'
                )
            })
          }
        >
          Save stash
        </button>
      </details>
      <button disabled={disabled} onClick={() => void run(load)}>
        Refresh stashes
      </button>
      {list?.has_more && (
        <p>Showing the newest 1000 entries. Use Git for older stashes.</p>
      )}
      {list && list.entries.length === 0 && <p>No saved stashes.</p>}
      <ul>
        {list?.entries.map(item => (
          <li key={item.index}>
            <button
              disabled={disabled}
              onClick={() =>
                void run(async generation => {
                  const value = await services.request('stash_files', {
                    oid: item.oid,
                  })
                  if (generation !== epoch.current) return
                  if (!files(value) || value.oid !== item.oid)
                    throw new Error('Invalid saved file response')
                  setSelected(item)
                  setDetail(value)
                  setConfirmation(null)
                  setStaged(false)
                  setBranch(snapshot.branch ?? '')
                })
              }
            >
              Inspect {item.name}
            </button>{' '}
            {item.message}
            {item.branch && (
              <span>
                {' '}
                · Branch: {item.branch}
                {item.branch === snapshot.branch ? ' (current)' : ''}
              </span>
            )}
          </li>
        ))}
      </ul>
      {selected && detail && (
        <article>
          <h3>
            {selected.name}: {selected.message}
          </h3>
          <Row>
            <button disabled={disabled} onClick={() => setStaged(false)}>
              Saved working files
            </button>
            <button disabled={disabled} onClick={() => setStaged(true)}>
              Saved staged files
            </button>
          </Row>
          <ul>
            {(staged ? detail.staged_files : detail.files).map(
              (file, index) => (
                <li key={index}>
                  <button
                    disabled={disabled}
                    onClick={() =>
                      services.onDiff(
                        file.path,
                        file.commit,
                        0,
                        file.display_path,
                        snapshot.root
                      )
                    }
                  >
                    {file.status} {file.display_path}
                    {file.untracked ? ' (untracked)' : ''}
                  </button>
                </li>
              )
            )}
          </ul>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={restoreIndex}
              disabled={disabled}
              onChange={event => setRestoreIndex(event.currentTarget.checked)}
            />
            Restore the saved index with --index
          </label>
          <Row>
            <button
              disabled={disabled}
              onClick={() => void run(generation => apply(generation, false))}
            >
              Apply (keep stash)
            </button>
            <button disabled={disabled} onClick={() => setConfirmation('pop')}>
              Pop stash…
            </button>
            <button disabled={disabled} onClick={() => setConfirmation('drop')}>
              Remove stash…
            </button>
          </Row>
          {confirmation && (
            <div role="group" aria-label="Confirm stash action">
              <p>
                {confirmation === 'pop'
                  ? 'Apply the saved changes and remove this entry only after successful application? Conflicted stashes are retained.'
                  : 'Remove this saved stash entry? Working files stay as they are.'}
              </p>
              <Row>
                <button
                  disabled={disabled}
                  onClick={() => setConfirmation(null)}
                >
                  Keep stash
                </button>
                <button
                  disabled={disabled}
                  onClick={() =>
                    void run(async generation => {
                      if (confirmation === 'pop') return apply(generation, true)
                      if (!list) return
                      await mutate(
                        'stash_drop',
                        {
                          oid: selected.oid,
                          index: selected.index,
                          basis: list.basis,
                        },
                        generation
                      )
                      if (generation === epoch.current)
                        setMessage('Stash entry removed')
                    })
                  }
                >
                  {confirmation === 'pop'
                    ? 'Apply and pop stash'
                    : 'Remove saved stash entry'}
                </button>
              </Row>
            </div>
          )}
          <label>
            Associate stash with branch
            <input
              value={branch}
              disabled={disabled}
              onChange={event => setBranch(event.currentTarget.value)}
            />
          </label>
          <button
            disabled={disabled || !branch}
            onClick={() =>
              void run(async generation => {
                if (!list) return
                const value = await mutate(
                  'stash_move',
                  {
                    oid: selected.oid,
                    index: selected.index,
                    basis: list.basis,
                    branch,
                  },
                  generation
                )
                if (generation === epoch.current)
                  setMessage(
                    value.unchanged === true
                      ? 'Stash already associated with this branch'
                      : value.original_retained
                      ? 'Replacement saved; original entry also retained'
                      : 'Stash moved to branch'
                  )
              })
            }
          >
            Move stash to branch
          </button>
        </article>
      )}
    </section>
  )
}
/** Mount pinned stash review and native Git save/apply/recovery operations. */
export function mountStash(container: HTMLElement, services: IServices) {
  let snapshot: ISnapshot | null = null,
    enabled = true,
    revision = 0
  function render() {
    ReactDOM.render(
      <StashPanel
        snapshot={snapshot}
        enabled={enabled}
        services={services}
        revision={revision}
      />,
      container
    )
  }
  render()
  return {
    setSnapshot(value: ISnapshot | null) {
      snapshot = value
      render()
    },
    setEnabled(value: boolean) {
      enabled = value
      render()
    },
    refreshHistory() {
      ++revision
      render()
    },
    dispose() {
      ReactDOM.unmountComponentAtNode(container)
    },
  }
}
