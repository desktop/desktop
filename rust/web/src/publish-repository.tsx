import * as React from 'react'
import { sanitizedRepositoryName } from './upstream/sanitized-repository-name'

type Target =
  | { readonly mode: 'effective' }
  | { readonly mode: 'assigned'; readonly host: string; readonly login: string }
type Request = {
  readonly host: string
  readonly target: Target
  readonly owner: string
  readonly name: string
  readonly description: string
  readonly private: boolean
}
type Account = {
  readonly host: string
  readonly login: string
  readonly state: string
}
type Context = {
  readonly host: string
  readonly name: string
  readonly description: string
  readonly private: boolean
  readonly accounts: ReadonlyArray<Account>
  readonly assignment: {
    readonly mode: string
    readonly host?: string
    readonly login?: string
  }
  readonly origin_exists: boolean
  readonly status: string
  readonly reason: string | null
}
type Review = {
  readonly basis: string
  readonly can_apply: boolean
  readonly can_create: boolean
  readonly create_reason: string
  readonly reason: string | null
  readonly request: Request
  readonly actorLogin: string
  readonly owner: { readonly login: string; readonly kind: string }
  readonly pushes: ReadonlyArray<{
    readonly branch: string
    readonly oid: string
    readonly role: string
  }>
  readonly pushStatus: string
}
type Receipt = {
  readonly id: string
  readonly phase: string
  readonly url: string | null
  readonly error: string | null
  readonly acknowledged: boolean
}
const phaseDescriptions: Record<string, string> = {
  creation_unknown:
    'Repository creation could not be confirmed. Inspect GitHub before acknowledging.',
  created:
    'Remote repository creation was confirmed. No subsequent origin setup, account assignment, or push is recorded.',
  origin_unknown:
    'The origin configuration could not be confirmed. Inspect the local repository.',
  origin_added: 'The origin remote was added.',
  assignment_unknown:
    'The account assignment could not be confirmed. Inspect the repository account.',
  account_assigned: 'The repository account was assigned.',
  push_default_unknown:
    'The default branch push could not be confirmed. Inspect the remote branch.',
  pushed_default: 'The default branch was pushed.',
  push_current_unknown:
    'The current branch push could not be confirmed. Inspect the remote branch.',
  pushed_current: 'The current branch was pushed.',
  complete: 'Publication completed.',
  unreadable:
    'This record could not be read. Inspect its private recovery metadata.',
}
function receipt(value: unknown): value is Receipt {
  return (
    record(value) &&
    typeof value.id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      value.id
    ) &&
    typeof value.phase === 'string' &&
    Object.prototype.hasOwnProperty.call(phaseDescriptions, value.phase) &&
    nullable(value.url) &&
    nullable(value.error) &&
    typeof value.acknowledged === 'boolean'
  )
}
type Props = {
  readonly root: string
  readonly accountBasis?: string
  readonly busy: boolean
  readonly onBusy: (busy: boolean) => void
  readonly request: (
    method: string,
    parameters: Record<string, unknown>
  ) => Promise<unknown>
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function short(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 4096 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  )
}
function nullable(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === 'string' &&
      value.length <= 16384 &&
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
  )
}
function account(value: unknown): value is Account {
  return (
    record(value) &&
    short(value.host) &&
    short(value.login) &&
    short(value.state)
  )
}
function context(value: unknown): value is Context {
  return (
    record(value) &&
    short(value.host) &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    typeof value.private === 'boolean' &&
    Array.isArray(value.accounts) &&
    value.accounts.length <= 128 &&
    value.accounts.every(
      entry =>
        account(entry) &&
        entry.host.toLowerCase() === String(value.host).toLowerCase()
    ) &&
    new Set(value.accounts.map(entry => accountKey(entry))).size ===
      value.accounts.length &&
    record(value.assignment) &&
    ['effective', 'none', 'assigned'].includes(String(value.assignment.mode)) &&
    (value.assignment.mode !== 'assigned' ||
      (short(value.assignment.host) && short(value.assignment.login))) &&
    typeof value.origin_exists === 'boolean' &&
    ['available', 'unavailable'].includes(String(value.status)) &&
    nullable(value.reason)
  )
}
function keyForTarget(value: Target) {
  return value.mode === 'effective' ? 'effective' : accountKey(value)
}
function accountKey(value: { host: string; login: string }) {
  return JSON.stringify([value.host.toLowerCase(), value.login.toLowerCase()])
}
/** Review publication options for an existing local repository. */
export function PublishRepository({
  root,
  accountBasis,
  busy,
  onBusy,
  request,
}: Props) {
  const [host, setHost] = React.useState('github.com')
  const [available, setAvailable] = React.useState<Context | null>(null)
  const [name, setName] = React.useState(''),
    [description, setDescription] = React.useState('')
  const [isPrivate, setPrivate] = React.useState(true),
    [target, setTarget] = React.useState<Target | null>(null)
  const [organizations, setOrganizations] = React.useState<string[]>([]),
    [owner, setOwner] = React.useState<string | null>(null),
    [organizationActor, setOrganizationActor] = React.useState<string | null>(
      null
    )
  const [review, setReview] = React.useState<Review | null>(null)
  const [history, setHistory] = React.useState<Receipt[] | null>(null)
  const [historyMessage, setHistoryMessage] = React.useState('')
  const loaded = React.useRef(false)
  const [message, setMessage] = React.useState(''),
    [orgMessage, setOrgMessage] = React.useState('')
  const epoch = React.useRef(0),
    orgEpoch = React.useRef(0),
    running = React.useRef<number | null>(null)
  React.useLayoutEffect(() => {
    epoch.current++
    orgEpoch.current++
    running.current = null
    setAvailable(null)
    setTarget(null)
    setOrganizations([])
    setOrganizationActor(null)
    setOwner(null)
    setName('')
    setDescription('')
    setPrivate(true)
    setReview(null)
    setHistory(null)
    setHistoryMessage('')
    loaded.current = false
    setMessage('')
    setOrgMessage('')
    return () => {
      epoch.current++
      orgEpoch.current++
    }
  }, [root])
  const previousBasis = React.useRef(accountBasis)
  React.useEffect(() => {
    if (previousBasis.current !== accountBasis) {
      previousBasis.current = accountBasis
      orgEpoch.current++
      setAvailable(null)
      setTarget(null)
      setOrganizations([])
      setOrganizationActor(null)
      setOwner(null)
      setReview(null)
      setHistory(null)
      setHistoryMessage('')
      const wasRunning = running.current !== null
      epoch.current++
      running.current = null
      if (wasRunning) onBusy(false)
    }
  }, [accountBasis])
  const targetKey = target ? keyForTarget(target) : ''
  React.useEffect(() => {
    const generation = ++orgEpoch.current
    setOrganizations([])
    setOrganizationActor(null)
    setOwner(null)
    setOrgMessage('')
    if (!target) return
    void request('publish_organizations', {
      host: host.trim().toLowerCase(),
      target,
    })
      .then(value => {
        if (generation !== orgEpoch.current) return
        if (
          !record(value) ||
          !Array.isArray(value.organizations) ||
          !value.organizations.every(row => record(row) && short(row.login)) ||
          !['available', 'unavailable'].includes(String(value.status)) ||
          !nullable(value.reason) ||
          (value.status === 'available' &&
            (!record(value.actor) ||
              !short(value.actor.login) ||
              !Number.isSafeInteger(value.actor.id) ||
              Number(value.actor.id) <= 0 ||
              (target.mode === 'assigned' &&
                value.actor.login.toLowerCase() !==
                  target.login.toLowerCase())))
        )
          throw new Error('Invalid organization response')
        if (value.status === 'available' && record(value.actor))
          setOrganizationActor(value.actor.login as string)
        setOrganizations(
          value.organizations
            .map(row => row.login)
            .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
        )
        if (value.status !== 'available')
          setOrgMessage(value.reason || 'Organizations are unavailable.')
      })
      .catch(error => {
        if (generation === orgEpoch.current)
          setOrgMessage(error instanceof Error ? error.message : String(error))
      })
    return () => {
      orgEpoch.current++
    }
  }, [root, targetKey])
  function invalidate() {
    setReview(null)
    setMessage('')
  }
  async function run(task: (generation: number) => Promise<void>) {
    const generation = epoch.current
    if (busy || running.current === generation) return
    running.current = generation
    onBusy(true)
    try {
      await task(generation)
    } catch (error) {
      if (generation === epoch.current)
        setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      if (running.current === generation) running.current = null
      if (generation === epoch.current) onBusy(false)
    }
  }
  function selectedRequest(): Request | null {
    const clean = sanitizedRepositoryName(name)
    return target && organizationActor && clean
      ? {
          host: host.trim().toLowerCase(),
          target,
          owner: owner || organizationActor,
          name: clean,
          description,
          private: isPrivate,
        }
      : null
  }
  async function load(generation: number) {
    const value = await request('publish_context', { host: host.trim() })
    if (generation !== epoch.current) return
    if (
      !context(value) ||
      value.host.toLowerCase() !== host.trim().toLowerCase()
    )
      throw new Error('Invalid publishing options response')
    setAvailable(value)
    if (!loaded.current) {
      setName(value.name)
      setDescription(value.description)
      setPrivate(value.private)
      loaded.current = true
    }
    setReview(null)
    setMessage(value.reason || '')
    const signedIn = value.accounts.filter(entry => entry.state === 'success')
    const retained =
      value.assignment.mode === 'assigned'
        ? signedIn.find(
            entry =>
              entry.host.toLowerCase() ===
                String(value.assignment.host).toLowerCase() &&
              entry.login.toLowerCase() ===
                String(value.assignment.login).toLowerCase()
          )
        : undefined
    setTarget(
      retained
        ? { mode: 'assigned', host: retained.host, login: retained.login }
        : value.assignment.mode === 'effective'
        ? { mode: 'effective' }
        : null
    )
  }
  async function preview(generation: number) {
    const selected = selectedRequest()
    if (!selected) return
    const value = await request('publish_preview', { request: selected })
    if (generation !== epoch.current) return
    if (
      !record(value) ||
      !short(value.basis) ||
      typeof value.can_apply !== 'boolean' ||
      typeof value.can_create !== 'boolean' ||
      !short(value.create_reason) ||
      !nullable(value.reason) ||
      !record(value.actor) ||
      !short(value.actor.login) ||
      !Number.isSafeInteger(value.actor.id) ||
      Number(value.actor.id) <= 0 ||
      !record(value.owner) ||
      !short(value.owner.login) ||
      !Number.isSafeInteger(value.owner.id) ||
      Number(value.owner.id) <= 0 ||
      !['personal', 'organization'].includes(String(value.owner.kind)) ||
      !Array.isArray(value.pushes) ||
      value.pushes.length > 2 ||
      !value.pushes.every(
        push =>
          record(push) &&
          short(push.branch) &&
          short(push.oid) &&
          ['default', 'current'].includes(String(push.role))
      ) ||
      !['planned', 'unborn', 'detached'].includes(String(value.push_status))
    )
      throw new Error('Invalid publication review')
    setReview({
      basis: value.basis,
      can_apply: value.can_apply,
      can_create: value.can_create,
      create_reason: value.create_reason,
      reason: value.reason,
      request: selected,
      actorLogin: value.actor.login as string,
      owner: value.owner as Review['owner'],
      pushes: value.pushes as Review['pushes'],
      pushStatus: value.push_status as string,
    })
  }
  async function loadHistory(generation: number) {
    setHistory(null)
    setHistoryMessage('')
    const value = await request('publish_history', {})
    if (generation !== epoch.current) return
    if (
      !record(value) ||
      !Array.isArray(value.receipts) ||
      value.receipts.length > 1000 ||
      !value.receipts.every(receipt) ||
      new Set(value.receipts.map(row => row.id)).size !== value.receipts.length
    )
      throw new Error('Invalid publication history')
    setHistory(value.receipts)
  }
  async function acknowledge(generation: number, id: string) {
    try {
      const value = await request('acknowledge_publish', { receipt_id: id })
      if (generation !== epoch.current) return
      if (
        !record(value) ||
        !receipt(value.receipt) ||
        value.receipt.id !== id ||
        !value.receipt.acknowledged
      )
        throw new Error('Invalid acknowledgement response')
      const updated = value.receipt
      setHistory(
        current => current?.map(row => (row.id === id ? updated : row)) || null
      )
      setHistoryMessage('Receipt acknowledged. No publication was retried.')
    } catch {
      if (generation !== epoch.current) return
      setHistory(null)
      setHistoryMessage(
        'Acknowledgement status is uncertain. Reload publication history before taking further action.'
      )
    }
  }
  const cleaned = sanitizedRepositoryName(name)
  return (
    <details className="publish-repository">
      <summary>Review publication</summary>
      <p>
        Full publication is not available. This screen only reviews. The CLI can
        create the remote repository when its safety checks pass; it does not
        configure origin, assign an account, or push branches.
      </p>
      <label>
        GitHub host{' '}
        <input
          value={host}
          disabled={busy}
          onChange={event => {
            orgEpoch.current++
            setHistory(null)
            setHistoryMessage('')
            setHost(event.currentTarget.value)
            setAvailable(null)
            setTarget(null)
            setOrganizations([])
            setOrganizationActor(null)
            setOwner(null)
            invalidate()
          }}
        />
      </label>
      <button
        type="button"
        disabled={busy || !host.trim()}
        onClick={() => void run(load)}
      >
        Load publishing options
      </button>
      {available && (
        <React.Fragment>
          {available.origin_exists && (
            <p>This repository already has an origin remote.</p>
          )}
          <label>
            Account{' '}
            <select
              value={target ? keyForTarget(target) : ''}
              disabled={busy}
              onChange={event => {
                const selected = event.currentTarget.value
                const found = available.accounts.find(
                  entry => accountKey(entry) === selected
                )
                orgEpoch.current++
                setHistory(null)
                setHistoryMessage('')
                setOrganizations([])
                setOrganizationActor(null)
                setOwner(null)
                setTarget(
                  selected === 'effective'
                    ? { mode: 'effective' }
                    : found
                    ? { mode: 'assigned', host: found.host, login: found.login }
                    : null
                )
                invalidate()
              }}
            >
              <option value="">Choose an account</option>
              <option value="effective">Current GitHub CLI credential</option>
              {available.accounts.map(entry => (
                <option
                  key={accountKey(entry)}
                  value={accountKey(entry)}
                  disabled={entry.state !== 'success'}
                >
                  {entry.login} ({entry.host})
                </option>
              ))}
            </select>
          </label>
          <label>
            Name{' '}
            <input
              value={name}
              disabled={busy}
              onChange={event => {
                setName(event.currentTarget.value)
                invalidate()
              }}
            />
          </label>
          {name !== cleaned && <p>Repository name to review: {cleaned}</p>}
          <label>
            Description{' '}
            <input
              value={description}
              disabled={busy}
              onChange={event => {
                setDescription(event.currentTarget.value)
                invalidate()
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={isPrivate}
              disabled={busy}
              onChange={event => {
                setPrivate(event.currentTarget.checked)
                invalidate()
              }}
            />{' '}
            Keep this code private
          </label>
          {organizations.length > 0 && (
            <label>
              Organization{' '}
              <select
                value={owner || ''}
                disabled={busy}
                onChange={event => {
                  setOwner(event.currentTarget.value || null)
                  invalidate()
                }}
              >
                <option value="">None</option>
                {organizations.map(login => (
                  <option key={login} value={login}>
                    {login}
                  </option>
                ))}
              </select>
            </label>
          )}
          {orgMessage && <p role="status">{orgMessage}</p>}
          <button
            type="button"
            disabled={
              busy ||
              available.origin_exists ||
              available.status !== 'available' ||
              !selectedRequest()
            }
            onClick={() => void run(preview)}
          >
            Review publication
          </button>
          {review && (
            <section aria-label="Publication review">
              <p>
                {review.owner.login}/{review.request.name} ·{' '}
                {review.request.private ? 'Private' : 'Public'}
              </p>
              <p>
                Account: {review.actorLogin} · Owner: {review.owner.kind}
              </p>
              {review.pushes.length > 0 ? (
                <React.Fragment>
                  <p>
                    Planned branches for a future push; no branches are pushed
                    by this review or by the current CLI create.
                  </p>
                  <ul>
                    {review.pushes.map(push => (
                      <li key={push.role}>
                        {push.role}: {push.branch} ({push.oid})
                      </li>
                    ))}
                  </ul>
                </React.Fragment>
              ) : (
                <p>No branch pushes are planned ({review.pushStatus}).</p>
              )}
              <p>
                The name is not reserved and creation permissions have not been
                verified.
              </p>
              {review.reason && <p>{review.reason}</p>}
              <p>
                CLI remote creation:{' '}
                {review.can_create ? 'available' : 'unavailable'}.
              </p>
              <p>{review.create_reason}</p>
            </section>
          )}
        </React.Fragment>
      )}
      <section aria-label="Publication history">
        <h3>Publication history</h3>
        <p>
          Receipts record the last known phase. A repository URL may not be
          available. History is scoped to the selected repository and registry;
          an empty history does not prove a remote does not exist. Acknowledging
          a receipt records your review; it does not retry publication. A prior
          attempt can block another even after acknowledgement; automatic
          reconciliation is not yet implemented.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(loadHistory)}
        >
          Load publication history
        </button>
        {historyMessage && <p role="status">{historyMessage}</p>}
        {history &&
          (history.length === 0 ? (
            <p>No publication receipts.</p>
          ) : (
            <ul>
              {history.map(row => (
                <li key={row.id}>
                  <p>
                    Receipt: {row.id} · Phase: {row.phase}
                  </p>
                  <p>{phaseDescriptions[row.phase]}</p>
                  {row.url ? (
                    <p>Repository URL: {row.url}</p>
                  ) : (
                    <p>Repository URL is unavailable.</p>
                  )}
                  {row.error && <p>{row.error}</p>}
                  {row.acknowledged ? (
                    <p>Reviewed.</p>
                  ) : (
                    row.phase !== 'unreadable' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(generation =>
                            acknowledge(generation, row.id)
                          )
                        }
                      >
                        Acknowledge {row.id}
                      </button>
                    )
                  )}
                </li>
              ))}
            </ul>
          ))}
      </section>
      {message && <p role="status">{message}</p>}
    </details>
  )
}
