import * as React from 'react'
import { Form } from './upstream/form'
import { Ref } from './upstream/ref'
import { Row } from './upstream/row'
import { IBranchPermissions, isBranchPermissions } from './branch-policy'
import { IRemoteDeletionReview, isRemoteDeletionReview } from './remote-delete'
import { UncommittedChangesStrategy as Strategy } from './upstream/models/uncommitted-changes-strategy'
interface IBranch {
  readonly name: string
  readonly ref: string
  readonly oid: string
  readonly local: boolean
  readonly policy?: IBranchPermissions
}
interface ICheckout {
  readonly target: { readonly branch: string }
  readonly dirty: boolean
  readonly can_leave: boolean
  readonly source_branch: string | null
  readonly source_stash: { readonly message: string } | null
  readonly files: ReadonlyArray<{ readonly display_path: string }>
  readonly operation: unknown
  readonly conflicted: boolean
  readonly occupied_worktree: unknown
}
interface IReview {
  readonly upstream?: IRemoteDeletionReview | null
  readonly basis: string
  readonly branch: IBranch
  readonly current: boolean
  readonly force_required: boolean
  readonly checkout: ICheckout | null
  readonly in_use_worktree?: string | null
}
interface IHistory {
  readonly id: string
  readonly name: string
  readonly oid: string
  readonly phase: string
  readonly error: string | null
  readonly backup_oid: string | null
  readonly current_oid: string | null
  readonly restored_as: string | null
  readonly restored_oid: string | null
  readonly checkout_receipt_id: string | null
  readonly remote_deletion_receipt_id?: string | null
}
type IRecord = IHistory | { readonly id: string; readonly error: string }
interface IProps {
  readonly contextBasis?: string
  readonly defaultBranch?: string | null
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
function branch(value: unknown): value is IBranch {
  return (
    record(value) &&
    typeof value.name === 'string' &&
    typeof value.ref === 'string' &&
    typeof value.oid === 'string' &&
    typeof value.local === 'boolean' &&
    (value.policy === undefined ||
      (isBranchPermissions(value.policy) &&
        value.policy.name === value.name &&
        value.policy.reference === value.ref))
  )
}
function nullable(value: unknown) {
  return value === null || typeof value === 'string'
}
function checkout(value: unknown): value is ICheckout {
  return (
    record(value) &&
    record(value.target) &&
    typeof value.target.branch === 'string' &&
    typeof value.dirty === 'boolean' &&
    typeof value.can_leave === 'boolean' &&
    nullable(value.source_branch) &&
    (value.source_stash === null ||
      (record(value.source_stash) &&
        typeof value.source_stash.message === 'string')) &&
    Array.isArray(value.files) &&
    value.files.every(
      file => record(file) && typeof file.display_path === 'string'
    ) &&
    typeof value.conflicted === 'boolean' &&
    'operation' in value &&
    'occupied_worktree' in value
  )
}
function review(value: unknown): value is IReview {
  return (
    record(value) &&
    typeof value.basis === 'string' &&
    (value.upstream === undefined ||
      value.upstream === null ||
      isRemoteDeletionReview(value.upstream)) &&
    branch(value.branch) &&
    value.branch.local &&
    typeof value.current === 'boolean' &&
    typeof value.force_required === 'boolean' &&
    (value.in_use_worktree === undefined || nullable(value.in_use_worktree)) &&
    (value.checkout === null || checkout(value.checkout))
  )
}
function history(value: unknown): value is IRecord {
  return (
    record(value) &&
    typeof value.id === 'string' &&
    (('name' in value &&
      typeof value.name === 'string' &&
      typeof value.oid === 'string' &&
      typeof value.phase === 'string' &&
      nullable(value.error) &&
      nullable(value.backup_oid) &&
      nullable(value.current_oid) &&
      nullable(value.restored_as) &&
      nullable(value.restored_oid) &&
      nullable(value.checkout_receipt_id)) ||
      (!('name' in value) && typeof value.error === 'string'))
  )
}
function success(value: unknown) {
  if (!record(value) || value.code !== 0)
    throw new Error(
      record(value) && typeof value.stderr === 'string'
        ? value.stderr
        : 'Branch operation did not complete'
    )
}
/** Review local deletion and restore retained branch tips/settings without switching. */
export function BranchDelete({
  contextBasis,
  defaultBranch,
  revision: refreshRevision,
  root,
  branch: current,
  busy,
  onBusy,
  request,
  onChanged,
}: IProps) {
  const [branches, setBranches] = React.useState<IBranch[]>([]),
    [selected, setSelected] = React.useState(''),
    [to, setTo] = React.useState(''),
    [value, setValue] = React.useState<IReview | null>(null),
    [includeUpstream, setIncludeUpstream] = React.useState(false),
    [fetchUpstream, setFetchUpstream] = React.useState(false),
    [expectedUpstream, setExpectedUpstream] = React.useState(''),
    [remoteConsent, setRemoteConsent] = React.useState(false),
    [force, setForce] = React.useState(false),
    [strategy, setStrategy] = React.useState(Strategy.StashOnCurrentBranch),
    [replace, setReplace] = React.useState(false),
    [restoreIndex, setRestoreIndex] = React.useState(false),
    [records, setRecords] = React.useState<IRecord[]>([]),
    [names, setNames] = React.useState<Record<string, string>>({}),
    [forget, setForget] = React.useState<string | null>(null),
    [message, setMessage] = React.useState('')
  const selectedBranch = branches.find(branch => branch.ref === selected)
  const canDelete = selectedBranch?.policy?.can_delete !== false
  const policyMessage = selectedBranch?.policy?.delete_reason
  const epoch = React.useRef(0),
    running = React.useRef(false),
    loadRevision = React.useRef(0)
  React.useLayoutEffect(() => {
    epoch.current++
    loadRevision.current++
    setBranches([])
    setSelected('')
    setTo('')
    setIncludeUpstream(false)
    setFetchUpstream(false)
    setExpectedUpstream('')
    setRemoteConsent(false)
    setValue(null)
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
  }, [root, defaultBranch, contextBasis])
  async function load(generation: number) {
    const revision = ++loadRevision.current
    const list = await request('branch_list', {}),
      saved = await request('deleted_branches', {})
    if (generation !== epoch.current || revision !== loadRevision.current)
      return
    if (
      !Array.isArray(list) ||
      !list.every(branch) ||
      !Array.isArray(saved) ||
      !saved.every(history)
    )
      throw new Error('Invalid branch deletion history')
    const local = list.filter(branch => branch.local)
    setBranches(local)
    setRecords(saved)
    setSelected(previous =>
      local.some(branch => branch.ref === previous)
        ? previous
        : local.find(branch => branch.name === current)?.ref ??
          local[0]?.ref ??
          ''
    )
  }
  React.useEffect(() => {
    setValue(null)
    setRemoteConsent(false)
    const generation = epoch.current
    void load(generation).catch(error => {
      if (generation === epoch.current) setMessage(String(error))
    })
  }, [root, current, refreshRevision, defaultBranch, contextBasis])
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
  function upstreamParameters() {
    return includeUpstream
      ? {
          upstream: {
            fetch_backup: fetchUpstream,
            expected: expectedUpstream.trim()
              ? expectedUpstream
                  .split(',')
                  .map(value =>
                    value.trim() === 'missing' ? null : value.trim()
                  )
              : null,
          },
        }
      : {}
  }
  const choice = value?.checkout,
    blocked =
      Boolean(value?.in_use_worktree) ||
      Boolean(
        choice &&
          (choice.conflicted ||
            choice.operation !== null ||
            choice.occupied_worktree !== null)
      )
  return (
    <div className="branch-delete">
      <Form
        onSubmit={() =>
          void run(async generation => {
            setValue(null)
            if (!canDelete) return
            const result = await request('delete_branch_preview', {
              name: selected,
              to_checkout: to || null,
              ...upstreamParameters(),
            })
            if (generation !== epoch.current) return
            if (!review(result) || result.branch.ref !== selected)
              throw new Error('Invalid branch deletion review')
            setValue(result)
            setForce(false)
            setRemoteConsent(false)
            setReplace(false)
            setRestoreIndex(false)
            setStrategy(
              result.checkout && !result.checkout.can_leave
                ? Strategy.MoveToNewBranch
                : Strategy.StashOnCurrentBranch
            )
          })
        }
      >
        <label>
          Local branch to delete
          <select
            value={selected}
            disabled={busy}
            onChange={event => {
              setSelected(event.currentTarget.value)
              setValue(null)
            }}
          >
            {branches.map(branch => (
              <option key={branch.ref} value={branch.ref}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Switch to before deletion (optional)
          <input
            value={to}
            disabled={busy}
            placeholder="Default or recent available branch"
            onChange={event => {
              setTo(event.currentTarget.value)
              setValue(null)
            }}
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={includeUpstream}
            disabled={busy}
            onChange={event => {
              setIncludeUpstream(event.currentTarget.checked)
              setValue(null)
              setRemoteConsent(false)
            }}
          />
          Also delete this branch’s configured upstream
        </label>
        {includeUpstream && (
          <>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={fetchUpstream}
                disabled={busy}
                onChange={event => {
                  setFetchUpstream(event.currentTarget.checked)
                  setValue(null)
                  setRemoteConsent(false)
                }}
              />
              Fetch missing upstream recovery tips before local deletion
            </label>
            <label>
              Expected upstream IDs (optional, comma separated)
              <input
                disabled={busy}
                value={expectedUpstream}
                onChange={event => {
                  setExpectedUpstream(event.currentTarget.value)
                  setValue(null)
                  setRemoteConsent(false)
                }}
                placeholder="Leave empty to read each push destination"
              />
            </label>
            <small>
              Git resolves the configured upstream remote and branch. Supply one
              full ID or “missing” per push URL to skip server reads.
            </small>
          </>
        )}
        <button disabled={busy || !selected || !canDelete}>
          Review branch deletion
        </button>
      </Form>
      {policyMessage && <p role="status">{policyMessage}.</p>}
      {value && (
        <article aria-label="Branch deletion review">
          <p>
            Delete <Ref>{value.branch.name}</Ref> at{' '}
            <Ref>{value.branch.oid}</Ref>.
          </p>
          <p>
            A recovery ref retains its tip and local branch settings. Saved
            stashes remain available.
          </p>
          {value.upstream && (
            <aside aria-label="Upstream deletion review">
              <p>
                Also delete <Ref>{value.upstream.reference}</Ref> from{' '}
                <Ref>{value.upstream.remote}</Ref>, across{' '}
                {value.upstream.endpoints.length} push destination(s).
              </p>
              <ol>
                {value.upstream.endpoints.map(endpoint => (
                  <li key={endpoint.index}>
                    {endpoint.destination}:{' '}
                    {endpoint.expected ?? 'branch absent'}
                    {endpoint.expected &&
                      !endpoint.available_locally &&
                      !fetchUpstream &&
                      ' — recovery tip unavailable locally; enable fetching to retain it'}
                  </li>
                ))}
              </ol>
              <p>
                Recovery tips are prepared first. Remote deletion starts after
                local deletion succeeds. A later refusal can leave the local
                branch deleted and only some push destinations finished; inspect
                both linked recovery records.
              </p>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={remoteConsent}
                  disabled={busy}
                  onChange={event =>
                    setRemoteConsent(event.currentTarget.checked)
                  }
                />
                Delete this reviewed upstream after local deletion
              </label>
            </aside>
          )}
          {value.force_required && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={force}
                disabled={busy}
                onChange={event => setForce(event.currentTarget.checked)}
              />
              Delete this branch even though its commits are not fully merged
            </label>
          )}
          {choice && <p>Switch to {choice.target.branch} before deleting.</p>}
          {blocked ? (
            <p>
              Finish the current operation or choose an available working
              tree/branch, then review again.
            </p>
          ) : (
            choice?.dirty && (
              <>
                <ul>
                  {choice.files.map((file, index) => (
                    <li key={index}>{file.display_path}</li>
                  ))}
                </ul>
                <label className="checkbox-label">
                  <input
                    type="radio"
                    name="delete-strategy"
                    disabled={busy || !choice.can_leave}
                    checked={strategy === Strategy.StashOnCurrentBranch}
                    onChange={() => {
                      setStrategy(Strategy.StashOnCurrentBranch)
                      setReplace(false)
                    }}
                  />
                  Leave my changes on {choice.source_branch}
                </label>
                <label className="checkbox-label">
                  <input
                    type="radio"
                    name="delete-strategy"
                    disabled={busy}
                    checked={strategy === Strategy.MoveToNewBranch}
                    onChange={() => {
                      setStrategy(Strategy.MoveToNewBranch)
                      setReplace(false)
                    }}
                  />
                  Bring my changes to {choice.target.branch}
                </label>
                {strategy === Strategy.StashOnCurrentBranch &&
                  choice.source_stash && (
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={replace}
                        disabled={busy}
                        onChange={event =>
                          setReplace(event.currentTarget.checked)
                        }
                      />
                      Replace my previous saved stash:{' '}
                      {choice.source_stash.message}
                    </label>
                  )}
                {strategy === Strategy.MoveToNewBranch && (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={restoreIndex}
                      disabled={busy}
                      onChange={event =>
                        setRestoreIndex(event.currentTarget.checked)
                      }
                    />
                    Restore saved staging if a temporary stash is needed
                  </label>
                )}
              </>
            )
          )}
          <Row>
            <button
              disabled={
                busy ||
                blocked ||
                (value.force_required && !force) ||
                Boolean(value.upstream && !remoteConsent) ||
                Boolean(
                  choice?.dirty &&
                    strategy === Strategy.StashOnCurrentBranch &&
                    choice.source_stash &&
                    !replace
                )
              }
              onClick={() =>
                void run(async generation => {
                  const selected = value
                  setValue(null)
                  try {
                    success(
                      await request('delete_branch', {
                        name: selected.branch.ref,
                        to_checkout: to || null,
                        force,
                        strategy,
                        replace_stash: replace,
                        restore_index: restoreIndex,
                        basis: selected.basis,
                        ...upstreamParameters(),
                      })
                    )
                    if (generation === epoch.current)
                      setMessage(
                        selected.upstream
                          ? 'Local branch and upstream deleted; linked recovery is available.'
                          : 'Branch deleted; recovery is available.'
                      )
                  } finally {
                    await changed(generation)
                  }
                })
              }
            >
              Delete reviewed branch
            </button>
            <button disabled={busy} onClick={() => setValue(null)}>
              Cancel branch deletion
            </button>
          </Row>
        </article>
      )}
      <button
        disabled={busy}
        onClick={() => void run(generation => load(generation))}
      >
        Refresh deleted branches
      </button>
      {records.map(item =>
        !('name' in item) ? (
          <p key={item.id}>
            {item.id}: {item.error}
          </p>
        ) : (
          <article key={item.id}>
            <p>
              {item.name}: {item.phase}. {item.error}
            </p>
            <p>
              Recovery tip: {item.backup_oid ?? 'Unavailable'}. Current branch
              ref: {item.current_oid ?? 'Absent'}.
            </p>
            {item.checkout_receipt_id && (
              <p>
                Related branch switch record: {item.checkout_receipt_id}.
                Inspect branch switch history and saved stashes after a partial
                checkout.
              </p>
            )}
            {item.remote_deletion_receipt_id && (
              <p>
                Related upstream deletion record:{' '}
                {item.remote_deletion_receipt_id}. Inspect remote deletion
                history before retrying a partial operation.
              </p>
            )}
            {item.restored_as && (
              <p>
                Restored as {item.restored_as}:{' '}
                {item.restored_oid ?? 'Ref absent'}.
              </p>
            )}
            <label>
              Restore name for {item.name}
              <input
                disabled={busy}
                value={names[item.id] ?? ''}
                placeholder={item.name}
                onChange={event => {
                  const name = event.currentTarget.value
                  setNames(previous => ({ ...previous, [item.id]: name }))
                }}
              />
            </label>
            <Row>
              <button
                disabled={
                  busy ||
                  item.backup_oid !== item.oid ||
                  Boolean(item.current_oid && !(names[item.id] ?? ''))
                }
                onClick={() =>
                  void run(async generation => {
                    try {
                      success(
                        await request('restore_deleted_branch', {
                          receipt_id: item.id,
                          name: names[item.id] || null,
                        })
                      )
                      if (generation === epoch.current)
                        setMessage(
                          'Branch tip and settings restored without switching.'
                        )
                    } finally {
                      await changed(generation)
                    }
                  })
                }
              >
                Restore deleted branch
              </button>
              <button disabled={busy} onClick={() => setForget(item.id)}>
                Forget branch recovery…
              </button>
            </Row>
            {forget === item.id && (
              <div>
                <p>
                  Permanently remove this recovery ref and its record. Existing
                  branches, files and stashes remain in place.
                </p>
                <Row>
                  <button disabled={busy} onClick={() => setForget(null)}>
                    Keep branch recovery
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async generation => {
                        success(
                          await request('forget_deleted_branch', {
                            receipt_id: item.id,
                          })
                        )
                        if (generation === epoch.current) {
                          setForget(null)
                          await load(generation)
                        }
                      })
                    }
                  >
                    Permanently forget branch recovery
                  </button>
                </Row>
              </div>
            )}
          </article>
        )
      )}
      {message && <p role="status">{message}</p>}
    </div>
  )
}
