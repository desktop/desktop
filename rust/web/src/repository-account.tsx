import * as React from 'react'
import { Row } from './upstream/row'

interface IIdentity {
  readonly host: string
  readonly owner: string
  readonly name: string
}
type ITarget =
  | { readonly mode: 'effective' | 'none' }
  | { readonly mode: 'assigned'; readonly host: string; readonly login: string }
interface IActor {
  readonly host: string
  readonly login: string
  readonly id: number
}
type IAssignment =
  | { readonly mode: 'effective' | 'none' }
  | ({ readonly mode: 'assigned' } & IActor)
interface IAccountView {
  readonly basis: string
  readonly scope_id: string | null
  readonly saved: boolean
  readonly revision: number
  readonly assignment: IAssignment
  readonly scoped_metadata: boolean
  readonly repository: IIdentity | null
  readonly remote: string | null
  readonly upstream_setup_error?: string | null
}
interface ICatalogEntry {
  readonly host: string
  readonly login: string
  readonly active: boolean
  readonly state: string
  readonly token_source: string | null
  readonly git_protocol: 'ssh' | 'https' | null
}
interface ICatalog {
  readonly account: IAccountView
  readonly host: string | null
  readonly status: 'available' | 'unavailable'
  readonly reason: string | null
  readonly accounts: ReadonlyArray<ICatalogEntry>
}
interface IPreview {
  readonly basis: string
  readonly current: IAccountView
  readonly target: ITarget
  readonly actor: IActor | null
  readonly repository: IIdentity | null
  readonly can_apply: boolean
  readonly status: 'verified' | 'unverified' | 'disabled' | 'unavailable'
  readonly reason: string | null
}
interface IProps {
  readonly root: string
  readonly accountBasis?: string
  readonly busy: boolean
  readonly onBusy: (value: boolean) => void
  readonly request: (
    method: string,
    parameters: Record<string, unknown>
  ) => Promise<unknown>
  readonly onChanged: () => Promise<void>
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function text(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 4096 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  )
}
function diagnostic(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 4096 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
}
function nullableText(value: unknown) {
  return value === null || text(value)
}
function nullableDiagnostic(value: unknown) {
  return value === null || diagnostic(value)
}
function actor(value: unknown): value is IActor {
  return (
    record(value) &&
    text(value.host) &&
    text(value.login) &&
    typeof value.id === 'number' &&
    Number.isSafeInteger(value.id) &&
    value.id > 0
  )
}
function identity(value: unknown): value is IIdentity {
  return (
    record(value) && text(value.host) && text(value.owner) && text(value.name)
  )
}
function target(value: unknown): value is ITarget {
  return (
    record(value) &&
    (value.mode === 'effective' ||
      value.mode === 'none' ||
      (value.mode === 'assigned' && text(value.host) && text(value.login)))
  )
}
function assignment(value: unknown): value is IAssignment {
  return target(value) && (value.mode !== 'assigned' || actor(value))
}
function view(value: unknown): value is IAccountView {
  return (
    record(value) &&
    text(value.basis) &&
    nullableText(value.scope_id) &&
    typeof value.saved === 'boolean' &&
    (!value.saved || value.scope_id !== null) &&
    typeof value.revision === 'number' &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0 &&
    assignment(value.assignment) &&
    typeof value.scoped_metadata === 'boolean' &&
    (value.repository === null || identity(value.repository)) &&
    nullableText(value.remote) &&
    (value.upstream_setup_error === undefined ||
      nullableDiagnostic(value.upstream_setup_error))
  )
}
function entry(value: unknown): value is ICatalogEntry {
  return (
    record(value) &&
    text(value.host) &&
    text(value.login) &&
    typeof value.active === 'boolean' &&
    text(value.state) &&
    nullableText(value.token_source) &&
    (value.git_protocol === null ||
      value.git_protocol === 'ssh' ||
      value.git_protocol === 'https')
  )
}
function catalog(value: unknown): value is ICatalog {
  return (
    record(value) &&
    view(value.account) &&
    nullableText(value.host) &&
    (value.status === 'available' || value.status === 'unavailable') &&
    nullableDiagnostic(value.reason) &&
    Array.isArray(value.accounts) &&
    value.accounts.every(entry)
  )
}
function sameTarget(a: ITarget, b: ITarget) {
  return (
    a.mode === b.mode &&
    (a.mode !== 'assigned' ||
      (b.mode === 'assigned' && a.host === b.host && a.login === b.login))
  )
}
function preview(value: unknown): value is IPreview {
  if (
    !record(value) ||
    !text(value.basis) ||
    !view(value.current) ||
    !target(value.target) ||
    !(value.actor === null || actor(value.actor)) ||
    !(value.repository === null || identity(value.repository)) ||
    typeof value.can_apply !== 'boolean' ||
    typeof value.status !== 'string' ||
    !['verified', 'unverified', 'disabled', 'unavailable'].includes(
      value.status
    ) ||
    !nullableDiagnostic(value.reason)
  )
    return false
  if (value.can_apply && !value.current.saved) return false
  return (
    !(value.can_apply && value.target.mode === 'assigned') ||
    (value.status === 'verified' &&
      actor(value.actor) &&
      identity(value.repository) &&
      value.repository.host.toLowerCase() === value.target.host.toLowerCase() &&
      value.actor.host.toLowerCase() === value.target.host.toLowerCase() &&
      value.actor.login.toLowerCase() === value.target.login.toLowerCase())
  )
}
function copyTarget(value: ITarget): ITarget {
  return value.mode === 'assigned'
    ? { mode: 'assigned', host: value.host, login: value.login }
    : { mode: value.mode }
}
function targetKey(value: ITarget) {
  return value.mode === 'assigned'
    ? JSON.stringify([value.host.toLowerCase(), value.login.toLowerCase()])
    : value.mode
}
function label(value: ITarget | IActor) {
  return 'mode' in value && value.mode !== 'assigned'
    ? value.mode === 'none'
      ? 'No GitHub account'
      : 'Current GitHub CLI credential'
    : 'host' in value
    ? `${value.host}/${value.login}`
    : ''
}

/** Review a saved repository's account without changing global GitHub CLI selection. */
export function RepositoryAccount({
  root,
  accountBasis,
  busy,
  onBusy,
  request,
  onChanged,
}: IProps) {
  const [current, setCurrent] = React.useState<IAccountView | null>(null),
    [available, setAvailable] = React.useState<ICatalog | null>(null),
    [selected, setSelected] = React.useState<ITarget>({ mode: 'effective' }),
    [review, setReview] = React.useState<IPreview | null>(null),
    [working, setWorking] = React.useState(false),
    [message, setMessage] = React.useState('')
  const epoch = React.useRef(0),
    revision = React.useRef(0),
    running = React.useRef<number | null>(null),
    latest = React.useRef<IAccountView | null>(null),
    previousRoot = React.useRef<string | null>(null)
  function apply(next: IAccountView | null) {
    latest.current = next
    setCurrent(next)
    if (next) setSelected(copyTarget(next.assignment))
  }
  React.useLayoutEffect(() => {
    const preserve =
      previousRoot.current === root &&
      accountBasis !== undefined &&
      latest.current?.basis === accountBasis
    previousRoot.current = root
    epoch.current++
    revision.current++
    setReview(null)
    setAvailable(null)
    setWorking(false)
    if (!preserve) {
      apply(null)
      setSelected({ mode: 'effective' })
      setMessage('')
    }
    if (running.current !== null) {
      running.current = null
      onBusy(false)
    }
    return () => {
      epoch.current++
      revision.current++
    }
  }, [root, accountBasis])
  const disabled = busy || working
  async function run(
    method:
      | 'repository_account'
      | 'repository_account_catalog'
      | 'repository_account_preview'
      | 'set_repository_account',
    parameters: Record<string, unknown>
  ) {
    if (disabled || running.current !== null) return
    const generation = epoch.current,
      read = ++revision.current,
      source = current
    running.current = generation
    setWorking(true)
    onBusy(true)
    setReview(null)
    setMessage('')
    if (
      method === 'repository_account' ||
      method === 'repository_account_catalog'
    ) {
      setAvailable(null)
      if (source) setSelected(copyTarget(source.assignment))
    }
    try {
      let result: unknown
      if (method === 'set_repository_account') {
        try {
          result = await request(method, parameters)
          if (generation === epoch.current && read === revision.current) {
            if (!view(result))
              throw new Error('Invalid saved repository account response')
            apply(result)
            setAvailable(null)
            setMessage('Repository account saved.')
          }
        } finally {
          await onChanged()
        }
        return
      }
      result = await request(method, parameters)
      if (generation !== epoch.current || read !== revision.current) return
      if (method === 'repository_account_catalog') {
        if (!catalog(result))
          throw new Error('Invalid GitHub account catalog response')
        apply(result.account)
        setAvailable(result)
      } else if (method === 'repository_account_preview') {
        if (
          !preview(result) ||
          !target(parameters.target) ||
          !sameTarget(result.target, parameters.target)
        )
          throw new Error('Invalid repository account review')
        if (
          !source ||
          result.current.basis !== source.basis ||
          result.current.scope_id !== source.scope_id
        )
          throw new Error(
            'Repository account changed. Load the current assignment before reviewing again.'
          )
        setReview(result)
      } else {
        if (!view(result))
          throw new Error('Invalid repository account response')
        apply(result)
      }
    } catch (error) {
      if (generation === epoch.current && read === revision.current) {
        if (method === 'set_repository_account') {
          apply(null)
          setAvailable(null)
        }
        setMessage(error instanceof Error ? error.message : String(error))
      }
    } finally {
      if (running.current === generation) running.current = null
      if (generation === epoch.current) {
        setWorking(false)
        onBusy(false)
      }
    }
  }
  const named = new Map<
    string,
    { target: ITarget; active: boolean; state: string; count: number }
  >()
  if (available?.status === 'available')
    for (const account of available.accounts) {
      const choice: ITarget = {
          mode: 'assigned',
          host: account.host,
          login: account.login,
        },
        key = targetKey(choice),
        previous = named.get(key)
      named.set(key, {
        target: choice,
        active: account.active,
        state: account.state,
        count: (previous?.count ?? 0) + 1,
      })
    }
  const retained =
    current?.assignment.mode === 'assigned' ? current.assignment : null
  if (retained && !named.has(targetKey(retained)))
    named.set(targetKey(retained), {
      target: copyTarget(retained),
      active: false,
      state: available?.status === 'available' ? 'not listed' : 'unchecked',
      count: 1,
    })
  const choices: ITarget[] = [
    { mode: 'effective' },
    { mode: 'none' },
    ...[...named.values()].map(value => value.target),
  ]
  return (
    <details className="repository-account">
      <summary>GitHub account for this saved repository</summary>
      <p>
        Choose the GitHub account used for this saved repository. Credentials
        stay in GitHub CLI.
      </p>
      <Row>
        <button
          disabled={disabled}
          onClick={() => void run('repository_account', {})}
        >
          Load repository account
        </button>
        <button
          disabled={disabled}
          onClick={() => void run('repository_account_catalog', {})}
        >
          Refresh available accounts
        </button>
      </Row>
      {current && (
        <>
          {!current.saved && (
            <p>Save this repository before assigning an account.</p>
          )}
          <p>
            Current assignment: {label(current.assignment)}
            {current.assignment.mode === 'assigned'
              ? ` (GitHub ID ${current.assignment.id})`
              : ''}
            .
          </p>
          {current.assignment.mode === 'none' && (
            <p>GitHub API operations are disabled for this saved repository.</p>
          )}
          {current.assignment.mode === 'effective' && (
            <p>This repository uses the current GitHub CLI credential.</p>
          )}
          {current.repository && (
            <p>
              Repository: {current.repository.host}/{current.repository.owner}/
              {current.repository.name}.
            </p>
          )}
          {current.remote && <p>Fetch remote: {current.remote}.</p>}
          {current.upstream_setup_error && (
            <p role="status">
              Parent upstream setup needs attention:{' '}
              {current.upstream_setup_error}
            </p>
          )}
          {available?.status === 'unavailable' && (
            <p>
              Available accounts could not be read. The saved assignment has
              been kept.
            </p>
          )}
          {available?.reason && <p>{available.reason}</p>}
          {available?.status === 'available' &&
            available.accounts.length === 0 && (
              <p>No stored accounts were listed for this host.</p>
            )}
          {retained &&
            available?.status === 'available' &&
            !available.accounts.some(
              account =>
                targetKey({
                  mode: 'assigned',
                  host: account.host,
                  login: account.login,
                }) === targetKey(retained) && account.state === 'success'
            ) && (
              <p>
                The named assignment is retained, but its credentials are not
                currently available in the account catalog.
              </p>
            )}
          <label>
            Repository GitHub account
            <select
              value={targetKey(selected)}
              disabled={disabled || !current.saved}
              onChange={event => {
                if (disabled) return
                const choice = choices.find(
                  value => targetKey(value) === event.currentTarget.value
                )
                if (choice) {
                  revision.current++
                  setSelected(copyTarget(choice))
                  setReview(null)
                  setMessage('')
                }
              }}
            >
              <option value="effective">
                Use current GitHub CLI credential
              </option>
              <option value="none">Do not use a GitHub account</option>
              {[...named.entries()].map(([key, value]) => (
                <option key={key} value={key} disabled={value.count > 1}>
                  {label(value.target)}
                  {value.count > 1
                    ? ' (ambiguous catalog entry)'
                    : value.state === 'unchecked'
                    ? ' (saved assignment)'
                    : value.state !== 'success'
                    ? ' (not currently available)'
                    : value.active
                    ? ' (active in GitHub CLI)'
                    : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={disabled || !current.saved}
            onClick={() =>
              void run('repository_account_preview', {
                target: copyTarget(selected),
              })
            }
          >
            Review repository account
          </button>
        </>
      )}
      {review && (
        <article aria-label="Repository account review">
          <p>
            Change repository account from {label(review.current.assignment)} to{' '}
            {label(review.target)}.
          </p>
          {review.actor && (
            <p>
              Verified account: {review.actor.host}/{review.actor.login} (GitHub
              ID {review.actor.id}).
            </p>
          )}
          {review.repository && (
            <p>
              Repository access checked for {review.repository.host}/
              {review.repository.owner}/{review.repository.name}.
            </p>
          )}
          {review.reason && <p>{review.reason}</p>}
          {review.status === 'disabled' && (
            <p>GitHub API operations will be disabled for this repository.</p>
          )}
          {review.status === 'unverified' && (
            <p>The selected mode has no verified named account.</p>
          )}
          {!review.can_apply && <p>This account change cannot be applied.</p>}
          <button
            disabled={disabled || !review.can_apply}
            onClick={() => {
              if (!review.can_apply) return
              void run('set_repository_account', {
                target: copyTarget(review.target),
                basis: review.basis,
              })
            }}
          >
            Confirm repository account
          </button>
        </article>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  )
}
