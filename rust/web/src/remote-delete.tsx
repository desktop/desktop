import * as React from 'react'
import { Form } from './upstream/form'
interface IEndpoint {
  readonly index: number
  readonly destination: string
  readonly expected: string | null
  readonly phase: string
  readonly available_locally?: boolean
  readonly error: string | null
  readonly backup_oid?: string | null
  readonly backup_direct?: boolean
  readonly restored_as: string[]
}
/** Remote review shared by standalone and combined branch deletion. */
export interface IRemoteDeletionReview {
  readonly basis: string
  readonly remote: string
  readonly reference: string
  readonly endpoints: IEndpoint[]
}
interface IHistory {
  readonly id: string
  readonly remote: string
  readonly reference: string
  readonly phase: string
  readonly local_deletion_receipt_id?: string | null
  readonly error: string | null
  readonly warnings: string[]
  readonly endpoints: IEndpoint[]
}
type History = IHistory | { readonly id: string; readonly error: string }
interface IProps {
  readonly revision?: number
  readonly root: string
  readonly branch: string | null
  readonly busy: boolean
  readonly onBusy: (busy: boolean) => void
  readonly request: (
    method: string,
    parameters: Record<string, unknown>
  ) => Promise<unknown>
  readonly onChanged: () => Promise<void>
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function nullable(value: unknown) {
  return value === null || typeof value === 'string'
}
function endpoint(value: unknown): value is IEndpoint {
  return (
    record(value) &&
    Number.isInteger(value.index) &&
    typeof value.destination === 'string' &&
    nullable(value.expected) &&
    typeof value.phase === 'string' &&
    nullable(value.error) &&
    Array.isArray(value.restored_as) &&
    value.restored_as.every(name => typeof name === 'string') &&
    (value.backup_oid === undefined || nullable(value.backup_oid)) &&
    (value.backup_direct === undefined ||
      typeof value.backup_direct === 'boolean')
  )
}
/** Validate review metadata before enabling a remote branch action. */
export function isRemoteDeletionReview(
  value: unknown
): value is IRemoteDeletionReview {
  return (
    record(value) &&
    typeof value.basis === 'string' &&
    typeof value.remote === 'string' &&
    typeof value.reference === 'string' &&
    Array.isArray(value.endpoints) &&
    value.endpoints.length > 0 &&
    value.endpoints.every(endpoint)
  )
}
function history(value: unknown): value is History[] {
  return (
    Array.isArray(value) &&
    value.every(
      item =>
        record(item) &&
        typeof item.id === 'string' &&
        (('remote' in item &&
          isRemoteDeletionReview({ ...item, basis: '' }) &&
          typeof item.phase === 'string' &&
          nullable(item.error) &&
          Array.isArray(item.warnings) &&
          item.warnings.every(w => typeof w === 'string')) ||
          (!('remote' in item) && typeof item.error === 'string'))
    )
  )
}
function success(value: unknown) {
  if (!record(value) || value.code !== 0)
    throw new Error(
      record(value) && typeof value.stderr === 'string'
        ? value.stderr
        : 'Remote branch operation did not complete'
    )
}
/** Review each configured push destination and retain partial-operation evidence. */
export function RemoteDelete({
  revision: refreshRevision,
  root,
  branch,
  busy,
  onBusy,
  request,
  onChanged,
}: IProps) {
  const [remotes, setRemotes] = React.useState<string[]>([]),
    [remote, setRemote] = React.useState(''),
    [name, setName] = React.useState(''),
    [expected, setExpected] = React.useState(''),
    [fetchBackup, setFetchBackup] = React.useState(false),
    [value, setValue] = React.useState<IRemoteDeletionReview | null>(null),
    [consent, setConsent] = React.useState(false),
    [records, setRecords] = React.useState<History[]>([]),
    [names, setNames] = React.useState<Record<string, string>>({}),
    [forget, setForget] = React.useState<string | null>(null),
    [message, setMessage] = React.useState('')
  const epoch = React.useRef(0),
    revision = React.useRef(0),
    running = React.useRef(false)
  React.useLayoutEffect(() => {
    epoch.current++
    revision.current++
    setRemotes([])
    setRemote('')
    setName('')
    setExpected('')
    setFetchBackup(false)
    setValue(null)
    setConsent(false)
    setRecords([])
    setNames({})
    setForget(null)
    setMessage('')
    if (running.current) {
      running.current = false
      onBusy(false)
    }
    return () => {
      epoch.current++
    }
  }, [root])
  async function load(generation: number) {
    const current = ++revision.current
    const [targets, saved] = await Promise.all([
      request('remote_deletion_targets', {}),
      request('remote_deletion_history', {}),
    ])
    if (generation !== epoch.current || current !== revision.current) return
    if (
      !record(targets) ||
      !Array.isArray(targets.remotes) ||
      !targets.remotes.every(value => typeof value === 'string') ||
      !Array.isArray(targets.upstreams) ||
      !history(saved)
    )
      throw new Error('Invalid remote deletion metadata')
    const upstream = targets.upstreams.find(
      value => record(value) && value.local_ref === `refs/heads/${branch}`
    )
    setRemotes(targets.remotes)
    setRemote(previous =>
      targets.remotes instanceof Array && targets.remotes.includes(previous)
        ? previous
        : record(upstream) && typeof upstream.remote === 'string'
        ? upstream.remote
        : String((targets.remotes as string[])[0] ?? '')
    )
    setName(
      previous =>
        previous ||
        (record(upstream) && typeof upstream.branch === 'string'
          ? upstream.branch
          : '')
    )
    setRecords(saved)
  }
  React.useEffect(() => {
    setValue(null)
    setConsent(false)
    const generation = epoch.current
    void load(generation).catch(error => {
      if (generation === epoch.current) setMessage(String(error))
    })
  }, [root, branch, refreshRevision])
  async function run(task: (generation: number) => Promise<void>) {
    if (busy || running.current) return
    const generation = epoch.current
    running.current = true
    onBusy(true)
    setMessage('')
    try {
      await task(generation)
    } catch (error) {
      if (generation === epoch.current)
        setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      if (generation === epoch.current) {
        running.current = false
        onBusy(false)
      }
    }
  }
  async function changed(generation: number) {
    if (generation !== epoch.current) return
    await onChanged()
    if (generation === epoch.current) await load(generation)
  }
  function invalidate() {
    setValue(null)
    setConsent(false)
  }
  function parameters() {
    return {
      remote,
      branch: name,
      expected: expected.trim()
        ? expected
            .split(',')
            .map(value => (value.trim() === 'missing' ? null : value.trim()))
        : null,
      fetch_backup: fetchBackup,
    }
  }
  return (
    <div className="remote-delete">
      <Form
        onSubmit={() =>
          void run(async generation => {
            invalidate()
            const result = await request('remote_branch_delete_preview', {
              request: parameters(),
            })
            if (generation !== epoch.current) return
            if (!isRemoteDeletionReview(result))
              throw new Error('Invalid remote deletion review')
            setValue(result)
          })
        }
      >
        <label>
          Remote to delete from
          <select
            disabled={busy}
            value={remote}
            onChange={event => {
              setRemote(event.currentTarget.value)
              invalidate()
            }}
          >
            {remotes.map(remote => (
              <option key={remote} value={remote}>
                {remote}
              </option>
            ))}
          </select>
        </label>
        <label>
          Remote branch
          <input
            required={true}
            disabled={busy}
            value={name}
            onChange={event => {
              setName(event.currentTarget.value)
              invalidate()
            }}
            placeholder="refs/heads/topic"
          />
        </label>
        <label>
          Expected IDs (optional, comma separated)
          <input
            disabled={busy}
            value={expected}
            onChange={event => {
              setExpected(event.currentTarget.value)
              invalidate()
            }}
            placeholder="Leave empty to read each server"
          />
        </label>
        <small>
          Supply a full object ID or “missing” for every push destination to
          skip server reads.
        </small>
        <label>
          <input
            type="checkbox"
            disabled={busy}
            checked={fetchBackup}
            onChange={event => {
              setFetchBackup(event.currentTarget.checked)
              invalidate()
            }}
          />
          Fetch missing recovery tips before deleting
        </label>
        <button type="submit" disabled={busy || !remote || !name}>
          Review remote deletion
        </button>
      </Form>
      {value && (
        <div className="remote-delete-review">
          <p>
            Delete {value.reference} from {value.remote}, across{' '}
            {value.endpoints.length} push destination(s).
          </p>
          <ol>
            {value.endpoints.map(endpoint => (
              <li key={endpoint.index}>
                {endpoint.destination}: {endpoint.expected ?? 'branch absent'}
                {endpoint.expected &&
                  !endpoint.available_locally &&
                  !fetchBackup &&
                  ' — recovery tip unavailable locally; enable fetching to retain it'}
              </li>
            ))}
          </ol>
          <p>
            Git checks each reviewed tip at the server. Earlier destinations may
            finish before a later destination refuses. Available local tips are
            retained; fetching also retains tips missing locally.
          </p>
          <label>
            <input
              type="checkbox"
              disabled={busy}
              checked={consent}
              onChange={event => setConsent(event.currentTarget.checked)}
            />
            Delete the reviewed remote branch at these destinations
          </label>
          <button
            disabled={busy || !consent}
            onClick={() =>
              void run(async generation => {
                const basis = value.basis
                invalidate()
                try {
                  success(
                    await request('delete_remote_branch', {
                      request: parameters(),
                      basis,
                    })
                  )
                  if (generation === epoch.current)
                    setMessage('Remote branch deletion completed')
                } finally {
                  await changed(generation)
                }
              })
            }
          >
            Delete reviewed remote branch
          </button>
        </div>
      )}
      <button disabled={busy} onClick={() => void run(load)}>
        Refresh remote deletion history
      </button>
      <ul>
        {records.map(item => (
          <li key={item.id}>
            {'remote' in item ? (
              <>
                <p>
                  {item.remote} {item.reference}: {item.phase} ({item.id})
                </p>
                {item.local_deletion_receipt_id && (
                  <p>
                    Related local deletion record:{' '}
                    {item.local_deletion_receipt_id}
                  </p>
                )}
                {item.error && <p role="alert">{item.error}</p>}
                {item.warnings.map((warning, index) => (
                  <p key={index}>{warning}</p>
                ))}
                <ol>
                  {item.endpoints.map(endpoint => {
                    const key = `${item.id}/${endpoint.index}`
                    return (
                      <li key={key}>
                        <p>
                          {endpoint.destination}: {endpoint.phase}; reviewed tip{' '}
                          {endpoint.expected ?? 'absent'}; retained tip{' '}
                          {endpoint.backup_oid ?? 'unavailable'}
                        </p>
                        {endpoint.error && <p role="alert">{endpoint.error}</p>}
                        {endpoint.backup_direct &&
                          endpoint.backup_oid &&
                          endpoint.backup_oid === endpoint.expected && (
                            <>
                              <label>
                                Restore remote tip as local branch
                                <input
                                  disabled={busy}
                                  value={names[key] ?? ''}
                                  onChange={event =>
                                    setNames({
                                      ...names,
                                      [key]: event.currentTarget.value,
                                    })
                                  }
                                />
                              </label>
                              <button
                                disabled={busy || !names[key]}
                                onClick={() =>
                                  void run(async generation => {
                                    success(
                                      await request('restore_remote_tip', {
                                        receipt_id: item.id,
                                        endpoint: endpoint.index,
                                        name: names[key],
                                      })
                                    )
                                    if (generation === epoch.current)
                                      setMessage(
                                        'Remote tip restored locally without switching'
                                      )
                                    await changed(generation)
                                  })
                                }
                              >
                                Restore remote tip locally
                              </button>
                            </>
                          )}
                        {endpoint.restored_as.map(name => (
                          <small key={name}>Restored locally as {name} </small>
                        ))}
                      </li>
                    )
                  })}
                </ol>
                {forget === item.id ? (
                  <>
                    <p>
                      This permanently removes retained local tips and this
                      record.
                    </p>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async generation => {
                          success(
                            await request('forget_remote_deletion', {
                              receipt_id: item.id,
                            })
                          )
                          if (generation === epoch.current) setForget(null)
                          await changed(generation)
                        })
                      }
                    >
                      Permanently forget remote recovery
                    </button>
                    <button disabled={busy} onClick={() => setForget(null)}>
                      Keep remote recovery
                    </button>
                  </>
                ) : (
                  <button disabled={busy} onClick={() => setForget(item.id)}>
                    Forget remote recovery…
                  </button>
                )}
              </>
            ) : (
              <p role="alert">
                {item.id}: {item.error}
              </p>
            )}
          </li>
        ))}
      </ul>
      <p role="status">{message}</p>
    </div>
  )
}
