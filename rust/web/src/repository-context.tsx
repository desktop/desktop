import * as React from 'react'
import { Form } from './upstream/form'
import { Row } from './upstream/row'
import { ForkContributionTarget } from './upstream/models/workflow-preferences'

interface IIdentity {
  readonly host: string
  readonly owner: string
  readonly name: string
}
interface IRepositoryContext {
  readonly basis: string
  readonly fork_contribution_target: ForkContributionTarget
  readonly status: 'unverified' | 'verified' | 'stale' | 'unrecognized_remote'
  readonly remote: string | null
  readonly repository: {
    readonly identity: IIdentity
    readonly is_fork: boolean
    readonly parent: IIdentity | null
    readonly updated_at_secs: number
  } | null
  readonly upstream_setup_error?: string | null
  readonly contribution_remote?: string | null
  readonly upstream_status?:
    | 'matches_parent'
    | 'missing'
    | 'mismatch'
    | 'unrecognized'
    | null
}
interface IUpstreamSetupPreview {
  readonly basis: string
  readonly status: 'add' | 'already_configured' | 'blocked' | 'not_fork'
  readonly remote: 'upstream'
  readonly url: string | null
  readonly parent: IIdentity | null
  readonly reason: string | null
}
interface IProps {
  readonly root: string
  readonly accountBasis?: string
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
function text(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 4096 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  )
}
function nullableText(value: unknown): value is string | null {
  return value === null || text(value)
}
function diagnostic(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 4096 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
}
function cloneURL(value: unknown): value is string {
  if (!text(value)) return false
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname.length > 0 &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === ''
    )
  } catch {
    return false
  }
}
function upstreamPreview(value: unknown): value is IUpstreamSetupPreview {
  if (
    !record(value) ||
    !text(value.basis) ||
    value.remote !== 'upstream' ||
    typeof value.status !== 'string' ||
    !['add', 'already_configured', 'blocked', 'not_fork'].includes(value.status)
  )
    return false
  if (
    !(value.url === null || cloneURL(value.url)) ||
    !(value.parent === null || identity(value.parent)) ||
    !(value.reason === null || diagnostic(value.reason))
  )
    return false
  return value.status !== 'add' || (value.url !== null && value.parent !== null)
}
function target(value: unknown): value is ForkContributionTarget {
  return (
    value === ForkContributionTarget.Parent ||
    value === ForkContributionTarget.Self
  )
}
function identity(value: unknown): value is IIdentity {
  return (
    record(value) && text(value.host) && text(value.owner) && text(value.name)
  )
}
function context(value: unknown): value is IRepositoryContext {
  if (
    !record(value) ||
    !text(value.basis) ||
    !target(value.fork_contribution_target) ||
    !nullableText(value.remote)
  )
    return false
  if (
    typeof value.status !== 'string' ||
    !['unverified', 'verified', 'stale', 'unrecognized_remote'].includes(
      value.status
    )
  )
    return false
  if (
    value.contribution_remote !== undefined &&
    !nullableText(value.contribution_remote)
  )
    return false
  if (
    value.upstream_status !== undefined &&
    value.upstream_status !== null &&
    (typeof value.upstream_status !== 'string' ||
      !['matches_parent', 'missing', 'mismatch', 'unrecognized'].includes(
        value.upstream_status
      ))
  )
    return false
  if (
    value.upstream_setup_error !== undefined &&
    value.upstream_setup_error !== null &&
    !diagnostic(value.upstream_setup_error)
  )
    return false
  if (value.repository === null) return value.status !== 'verified'
  return (
    record(value.repository) &&
    identity(value.repository.identity) &&
    typeof value.repository.is_fork === 'boolean' &&
    (value.repository.parent === null || identity(value.repository.parent)) &&
    typeof value.repository.updated_at_secs === 'number' &&
    Number.isSafeInteger(value.repository.updated_at_secs) &&
    value.repository.updated_at_secs >= 0
  )
}
function label(value: IIdentity) {
  return `${value.host}/${value.owner}/${value.name}`
}
/** Inspect cached GitHub metadata and save a reviewed repository contribution preference. */
export function RepositoryContext({
  root,
  accountBasis,
  busy,
  onBusy,
  request,
  onChanged,
}: IProps) {
  const [value, setValue] = React.useState<IRepositoryContext | null>(null),
    [selected, setSelected] = React.useState<ForkContributionTarget>(
      ForkContributionTarget.Parent
    ),
    [upstreamPlan, setUpstreamPlan] =
      React.useState<IUpstreamSetupPreview | null>(null),
    [working, setWorking] = React.useState(false),
    [message, setMessage] = React.useState('')
  const epoch = React.useRef(0),
    running = React.useRef<number | null>(null),
    readRevision = React.useRef(0)
  React.useLayoutEffect(() => {
    epoch.current++
    readRevision.current++
    setValue(null)
    setUpstreamPlan(null)
    setSelected(ForkContributionTarget.Parent)
    setWorking(false)
    setMessage('')
    if (running.current !== null) {
      running.current = null
      onBusy(false)
    }
    return () => {
      epoch.current++
      readRevision.current++
    }
  }, [root, accountBasis])
  const disabled = busy || working
  async function run(
    method:
      | 'repository_context'
      | 'refresh_repository_context'
      | 'set_fork_contribution_target'
      | 'upstream_setup_preview'
      | 'setup_upstream',
    parameters: Record<string, unknown>
  ) {
    if (disabled || running.current !== null) return
    const generation = epoch.current,
      revision = ++readRevision.current
    running.current = generation
    setWorking(true)
    onBusy(true)
    if (method !== 'upstream_setup_preview') setValue(null)
    setUpstreamPlan(null)
    setMessage('')
    try {
      let result: unknown
      if (
        method === 'repository_context' ||
        method === 'upstream_setup_preview'
      ) {
        result = await request(method, parameters)
      } else {
        try {
          result = await request(method, parameters)
        } finally {
          await onChanged()
        }
      }
      if (generation !== epoch.current || revision !== readRevision.current)
        return
      if (method === 'upstream_setup_preview') {
        if (!upstreamPreview(result))
          throw new Error('Invalid parent upstream setup review')
        setUpstreamPlan(result)
        return
      }
      if (method === 'setup_upstream') {
        if (
          !record(result) ||
          result.code !== 0 ||
          typeof result.status !== 'string' ||
          !['added', 'already_configured', 'not_fork'].includes(
            result.status
          ) ||
          !context(result.context)
        )
          throw new Error('Invalid parent upstream setup response')
        setValue(result.context)
        setSelected(result.context.fork_contribution_target)
        setMessage(
          result.status === 'added'
            ? 'Parent upstream configured.'
            : result.status === 'already_configured'
            ? 'Parent upstream is already configured.'
            : 'Parent upstream setup is not needed for this repository.'
        )
        return
      }
      if (!context(result))
        throw new Error('Invalid repository contribution settings response')
      setValue(result)
      setSelected(result.fork_contribution_target)
      setMessage(
        method === 'set_fork_contribution_target'
          ? 'Contribution target saved.'
          : method === 'refresh_repository_context'
          ? 'GitHub repository metadata refreshed.'
          : ''
      )
    } catch (error) {
      if (generation === epoch.current && revision === readRevision.current)
        setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      if (running.current === generation) running.current = null
      if (generation === epoch.current) {
        setWorking(false)
        onBusy(false)
      }
    }
  }
  const repository = value?.repository,
    verified = value?.status === 'verified'
  return (
    <details className="repository-context">
      <summary>GitHub repository and contribution target</summary>
      <p>
        Parent is the default contribution target for forks. Refresh GitHub
        metadata to verify which repository the fetch remote belongs to.
      </p>
      <Row>
        <button
          disabled={disabled}
          onClick={() => void run('repository_context', {})}
        >
          Load contribution settings
        </button>
        <button
          disabled={disabled}
          onClick={() => void run('refresh_repository_context', {})}
        >
          Refresh GitHub repository metadata
        </button>
      </Row>
      {value && (
        <>
          <p>Fetch remote: {value.remote ?? 'none'}.</p>
          {repository && (
            <p>
              {verified ? 'Repository' : 'Cached repository'}:{' '}
              {label(repository.identity)}.
            </p>
          )}
          {value.status === 'unverified' && (
            <p>
              GitHub repository metadata has not been verified. Your
              contribution preference applies after metadata is verified.
            </p>
          )}
          {value.status === 'stale' && (
            <p>
              Cached GitHub repository metadata is stale. Refresh it to verify
              the current fetch remote before this preference affects the
              default branch.
            </p>
          )}
          {value.status === 'unrecognized_remote' && (
            <p>
              The fetch remote is not recognized as a GitHub repository. Your
              contribution preference is saved for use after GitHub metadata can
              be verified.
            </p>
          )}
          {verified &&
            repository &&
            (repository.is_fork ? (
              <>
                {repository.parent && (
                  <p>Parent repository: {label(repository.parent)}.</p>
                )}
                <p>
                  {value.fork_contribution_target ===
                  ForkContributionTarget.Parent
                    ? 'Contributions target the parent repository through upstream.'
                    : 'Contributions target this fork through its fetch remote.'}
                </p>
              </>
            ) : (
              <p>
                This repository is not a fork. Contributions use its fetch
                remote.
              </p>
            ))}
          {value.contribution_remote !== undefined && (
            <p>
              Contribution remote:{' '}
              {value.contribution_remote ?? 'none verified'}.
            </p>
          )}
          {value.upstream_status === 'matches_parent' && (
            <p>Upstream matches the parent repository.</p>
          )}
          {value.upstream_status === 'missing' && (
            <p>No upstream remote is configured for the parent repository.</p>
          )}
          {value.upstream_status === 'mismatch' && (
            <p>
              Upstream points to a different repository. Review its URL before
              contributing to the parent.
            </p>
          )}
          {value.upstream_status === 'unrecognized' && (
            <p>Upstream is not recognized as a GitHub repository.</p>
          )}
          {value.upstream_setup_error && (
            <p role="status">
              Upstream setup needs attention: {value.upstream_setup_error}
            </p>
          )}
          {verified && repository?.is_fork && (
            <section aria-label="Parent upstream setup">
              <button
                disabled={disabled}
                onClick={() => void run('upstream_setup_preview', {})}
              >
                Review parent upstream setup
              </button>
              {upstreamPlan && (
                <article aria-label="Parent upstream setup review">
                  {upstreamPlan.parent && (
                    <p>Parent repository: {label(upstreamPlan.parent)}.</p>
                  )}
                  {upstreamPlan.url && (
                    <p>
                      Proposed upstream URL: <code>{upstreamPlan.url}</code>
                    </p>
                  )}
                  {upstreamPlan.status === 'add' && (
                    <p>Add the parent repository as the upstream remote.</p>
                  )}
                  {upstreamPlan.status === 'already_configured' && (
                    <p>
                      Upstream is already configured for the parent repository.
                    </p>
                  )}
                  {upstreamPlan.status === 'blocked' && (
                    <p>Parent upstream setup is blocked.</p>
                  )}
                  {upstreamPlan.status === 'not_fork' && (
                    <p>
                      Parent upstream setup is not needed for this repository.
                    </p>
                  )}
                  {upstreamPlan.reason && <p>{upstreamPlan.reason}</p>}
                  {upstreamPlan.status === 'add' && (
                    <button
                      disabled={disabled}
                      onClick={() =>
                        void run('setup_upstream', {
                          basis: upstreamPlan.basis,
                        })
                      }
                    >
                      Confirm parent upstream setup
                    </button>
                  )}
                </article>
              )}
            </section>
          )}
          <Form
            onSubmit={() => {
              if (!value || selected === value.fork_contribution_target) return
              void run('set_fork_contribution_target', {
                target: selected,
                basis: value.basis,
              })
            }}
          >
            <label>
              Fork contribution target
              <select
                value={selected}
                disabled={disabled}
                onChange={event => {
                  if (!disabled && target(event.currentTarget.value)) {
                    readRevision.current++
                    setUpstreamPlan(null)
                    setSelected(event.currentTarget.value)
                  }
                }}
              >
                <option value={ForkContributionTarget.Parent}>
                  Parent repository (default)
                </option>
                <option value={ForkContributionTarget.Self}>
                  This repository
                </option>
              </select>
            </label>
            <p>
              For verified forks, Parent uses upstream; This repository uses the
              fork’s fetch remote. The saved preference is retained when GitHub
              metadata is refreshed.
            </p>
            <button
              disabled={disabled || selected === value.fork_contribution_target}
            >
              Save contribution target
            </button>
          </Form>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  )
}
