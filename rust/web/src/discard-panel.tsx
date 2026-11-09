import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Row } from './upstream/row'

type GitPath = string | { bytes: number[] }
interface ISelection {
  readonly basis: string
  readonly lines: number[]
}
interface ITarget {
  readonly path: GitPath
  readonly name: string
  readonly selection?: ISelection
  readonly revision: number
}
interface IFile {
  readonly display_path: string
  readonly before: { kind: string; size: number }
  readonly after: { kind: string; size: number }
}
interface IPlan {
  readonly basis: string
  readonly files: IFile[]
  readonly index_changes: boolean
  readonly backup_bytes: number
  readonly undo_requires_unchanged_index: boolean
}
interface IBackup {
  readonly id: string
  readonly state: string
  readonly purpose?: string
  readonly lfs_payloads_unavailable?: number
  readonly files?: IFile[]
  readonly error?: string
}
interface IServices {
  readonly request: (
    method: string,
    parameters: Record<string, unknown>
  ) => Promise<unknown>
  readonly onChanged: () => Promise<void>
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function file(value: unknown): value is IFile {
  return (
    record(value) &&
    typeof value.display_path === 'string' &&
    record(value.before) &&
    typeof value.before.kind === 'string' &&
    typeof value.before.size === 'number' &&
    record(value.after) &&
    typeof value.after.kind === 'string' &&
    typeof value.after.size === 'number'
  )
}
function plan(value: unknown): value is IPlan {
  return (
    record(value) &&
    typeof value.basis === 'string' &&
    Array.isArray(value.files) &&
    value.files.every(file) &&
    typeof value.index_changes === 'boolean' &&
    typeof value.backup_bytes === 'number' &&
    typeof value.undo_requires_unchanged_index === 'boolean'
  )
}
function backup(value: unknown): value is IBackup {
  return (
    record(value) &&
    typeof value.id === 'string' &&
    typeof value.state === 'string' &&
    (value.purpose === undefined ||
      ['discard', 'conflict_choice', 'conflict_stage'].includes(
        String(value.purpose)
      )) &&
    (value.lfs_payloads_unavailable === undefined ||
      Number.isSafeInteger(value.lfs_payloads_unavailable)) &&
    (value.files === undefined ||
      (Array.isArray(value.files) && value.files.every(file))) &&
    (value.error === undefined || typeof value.error === 'string')
  )
}
function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
function succeeded(value: unknown) {
  if (!record(value) || value.code !== 0)
    throw new Error(
      record(value) && typeof value.stderr === 'string'
        ? value.stderr
        : 'Discard operation failed'
    )
}

function DiscardPanel({
  repository,
  target,
  services,
  historyRevision,
}: {
  readonly historyRevision: number
  readonly repository: string | null
  readonly target: ITarget | null
  readonly services: IServices
}) {
  const [scope, setScope] = React.useState('all_changes')
  const [showRestored, setShowRestored] = React.useState(false)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [review, setReview] = React.useState<IPlan | null>(null)
  const [backups, setBackups] = React.useState<IBackup[]>([])
  const [busy, setBusy] = React.useState(false)
  const [dismissed, setDismissed] = React.useState(false)
  const [message, setMessage] = React.useState('')
  const [previewRevision, setPreviewRevision] = React.useState(0)
  const [revision, setRevision] = React.useState(0)
  const generation = React.useRef(0)
  const historyGeneration = React.useRef(0)
  React.useLayoutEffect(() => {
    ++generation.current
    ++historyGeneration.current
    setReview(null)
    setDeleteId(null)
    setBackups([])
    setBusy(false)
    setDismissed(false)
    setMessage('')
    setScope(target?.selection ? 'working_tree' : 'all_changes')
    return () => {
      ++generation.current
      ++historyGeneration.current
    }
  }, [repository, target])
  React.useEffect(() => {
    if (!repository) return
    const current = ++historyGeneration.current
    services
      .request('list_discards', {})
      .then(value => {
        if (current !== historyGeneration.current) return
        if (!Array.isArray(value) || !value.every(backup))
          throw new Error('Invalid discard history response')
        setBackups(value)
      })
      .catch(error => {
        if (current === historyGeneration.current) setMessage(errorText(error))
      })
  }, [repository, target, revision, services, historyRevision])
  React.useEffect(() => {
    if (!repository || !target || dismissed) return
    const current = ++generation.current
    setReview(null)
    setBusy(true)
    setMessage('Preparing discard review…')
    services
      .request('discard_preview', {
        path: target.path,
        scope: target.selection ? 'working_tree' : scope,
        selection: target.selection,
      })
      .then(value => {
        if (current !== generation.current) return
        if (!plan(value)) throw new Error('Invalid discard review response')
        setReview(value)
        setMessage('')
      })
      .catch(error => {
        if (current === generation.current) setMessage(errorText(error))
      })
      .finally(() => {
        if (current === generation.current) setBusy(false)
      })
    return () => {
      ++generation.current
    }
  }, [repository, target, scope, dismissed, services, previewRevision])

  async function discard() {
    if (!target || !review || busy) return
    const current = generation.current
    setBusy(true)
    setMessage('Discarding reviewed changes…')
    try {
      succeeded(
        await services.request('discard', {
          path: target.path,
          scope: target.selection ? 'working_tree' : scope,
          selection: target.selection,
          basis: review.basis,
        })
      )
      if (current !== generation.current) return
      await services.onChanged()
      if (current !== generation.current) return
      setBusy(false)
      setDismissed(true)
      setReview(null)
      setRevision(value => value + 1)
      setMessage('Changes discarded. Undo is available below.')
    } catch (error) {
      if (current === generation.current) {
        setMessage(errorText(error))
        setRevision(value => value + 1)
      }
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }
  async function undo(item: IBackup) {
    if (busy) return
    const current = generation.current
    setBusy(true)
    setMessage(
      item.purpose && item.purpose !== 'discard'
        ? 'Restoring conflict resolution…'
        : 'Restoring discarded changes…'
    )
    try {
      succeeded(await services.request('undo_discard', { undo_id: item.id }))
      if (current !== generation.current) return
      await services.onChanged()
      if (current !== generation.current) return
      setBusy(false)
      setDismissed(true)
      setReview(null)
      setRevision(value => value + 1)
      setMessage(
        item.purpose && item.purpose !== 'discard'
          ? 'Conflict resolution undone.'
          : 'Discarded changes restored.'
      )
    } catch (error) {
      if (current === generation.current) {
        setMessage(errorText(error))
        setRevision(value => value + 1)
      }
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }
  async function forget(item: IBackup) {
    if (busy || deleteId !== item.id) return
    const current = generation.current
    setBusy(true)
    try {
      succeeded(await services.request('forget_discard', { undo_id: item.id }))
      if (current !== generation.current) return
      setDeleteId(null)
      setRevision(value => value + 1)
      setMessage('Undo backup deleted.')
    } catch (error) {
      if (current === generation.current) setMessage(errorText(error))
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }
  if (!repository) return null
  const available = backups.filter(
    item => showRestored || item.state !== 'undone'
  )
  return (
    <section className="discard-panel" aria-label="Discard and undo">
      <h2>Discard and undo</h2>
      <p role="status">{message}</p>
      {target && !dismissed && (
        <div className="discard-review">
          <h3>Review discard · {target.name}</h3>
          {target.selection ? (
            <p>
              Discard {target.selection.lines.length} selected changed lines.
              Staged changes are kept.
            </p>
          ) : (
            <label>
              Changes to discard
              <select
                value={scope}
                disabled={busy}
                onChange={event => setScope(event.currentTarget.value)}
              >
                <option value="all_changes">
                  Working file and staged changes · restore HEAD
                </option>
                <option value="working_tree">
                  Working file only · keep staged changes
                </option>
              </select>
            </label>
          )}
          {review && (
            <React.Fragment>
              <ul>
                {review.files.map((item, index) => (
                  <li key={index}>
                    {item.display_path}: {item.before.kind} ({item.before.size}{' '}
                    bytes) → {item.after.kind} ({item.after.size} bytes)
                  </li>
                ))}
              </ul>
              {review.index_changes && (
                <p>This also resets staged changes for these paths.</p>
              )}
              <p>
                About {review.backup_bytes} bytes of undo data will be saved in
                this repository.
              </p>
              {review.undo_requires_unchanged_index && (
                <p>
                  This index contains special flags. Undo will require that no
                  other index changes have occurred.
                </p>
              )}
            </React.Fragment>
          )}
          <Row>
            <button disabled={busy || !review} onClick={() => void discard()}>
              Discard reviewed changes
            </button>
            <button disabled={busy} onClick={() => setDismissed(true)}>
              Close review
            </button>
            <button
              disabled={busy}
              onClick={() => setPreviewRevision(value => value + 1)}
            >
              Reload discard review
            </button>
          </Row>
        </div>
      )}
      <button disabled={busy} onClick={() => setRevision(value => value + 1)}>
        Refresh undo backups
      </button>
      {backups.some(item => item.state === 'undone') && (
        <label>
          <input
            type="checkbox"
            checked={showRestored}
            onChange={event => setShowRestored(event.currentTarget.checked)}
          />
          Show restored backups
        </label>
      )}
      {available.length === 0 ? (
        <p>No undo backups available.</p>
      ) : (
        <ul>
          {available.map(item => (
            <li key={item.id}>
              <span>
                {item.files?.map(file => file.display_path).join(', ') ||
                  'Unreadable backup'}
              </span>{' '}
              <button
                disabled={busy || !['prepared', 'applied'].includes(item.state)}
                onClick={() => void undo(item)}
              >
                {item.purpose === 'conflict_stage'
                  ? item.state === 'prepared'
                    ? 'Recover interrupted resolution'
                    : 'Unstage resolution (keep working files)'
                  : item.purpose === 'conflict_choice'
                  ? item.state === 'prepared'
                    ? 'Recover interrupted resolution'
                    : 'Undo resolution'
                  : item.state === 'prepared'
                  ? 'Recover interrupted discard'
                  : 'Undo discard'}
              </button>
              {!!item.lfs_payloads_unavailable && (
                <p>
                  Some original LFS payloads were unavailable. Pointer and
                  working-file backups are retained; those payloads may need
                  fetching.
                </p>
              )}
              {['applied', 'undone'].includes(item.state) &&
                (deleteId === item.id ? (
                  <Row>
                    <span>
                      This permanently removes the undo backup. Working files
                      stay as they are.
                    </span>
                    <button disabled={busy} onClick={() => void forget(item)}>
                      Delete backup permanently
                    </button>
                    <button disabled={busy} onClick={() => setDeleteId(null)}>
                      Keep backup
                    </button>
                  </Row>
                ) : (
                  <button disabled={busy} onClick={() => setDeleteId(item.id)}>
                    Delete backup…
                  </button>
                ))}
              {item.error && <p role="alert">{item.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Mount discard review and durable undo without Electron dependencies. */
export function mountDiscard(element: Element, services: IServices) {
  let repository: string | null = null
  let target: ITarget | null = null
  let revision = 0
  let historyRevision = 0
  const render = () =>
    ReactDOM.render(
      <DiscardPanel
        repository={repository}
        historyRevision={historyRevision}
        target={target}
        services={services}
      />,
      element
    )
  render()
  return {
    setRepository(next: string | null) {
      if (next === repository) return
      repository = next
      target = null
      render()
    },
    showFile(
      path: GitPath,
      name: string,
      root: string,
      selection?: ISelection
    ) {
      if (root !== repository) return
      target = { path, name, selection, revision: ++revision }
      render()
    },
    refreshHistory() {
      ++historyRevision
      render()
    },
    dispose() {
      ReactDOM.unmountComponentAtNode(element)
    },
  }
}
