import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Row } from './upstream/row'
import {
  INameRulesPolicy,
  NameRules,
  isNameRulesPolicy,
  optionalNameRules,
} from './name-rules'
import {
  UncommittedChangesStrategy as Strategy,
  defaultUncommittedChangesStrategy,
} from './upstream/models/uncommitted-changes-strategy'

type GitPath = string | { readonly bytes: number[] }
interface IStash {
  readonly oid: string
  readonly message: string
}
interface IWorktree {
  readonly path: GitPath
  readonly display_path: string
  readonly prunable: string | null
}
interface ICreation {
  readonly name_rules?: INameRulesPolicy | null
  readonly start_point: string | null
  readonly no_track: boolean
  readonly checkout: boolean
}
type ITarget =
  | { readonly branch: string }
  | { readonly name: string; readonly creation: ICreation }
interface IPlan {
  readonly name_rules?: INameRulesPolicy | null
  readonly basis: string
  readonly target: {
    readonly request: string
    readonly branch: string
    readonly remote: boolean
    readonly creation?: ICreation | null
  }
  readonly source_branch: string | null
  readonly dirty: boolean
  readonly can_leave: boolean
  readonly same_branch: boolean
  readonly conflicted: boolean
  readonly operation: unknown
  readonly files: ReadonlyArray<{ readonly display_path: string }>
  readonly source_stash: IStash | null
  readonly target_stash: IStash | null
  readonly occupied_worktree: IWorktree | null
}
interface IReceipt {
  readonly id: string
  readonly phase: string
  readonly target: { readonly branch: string }
  readonly saved_oid: string | null
  readonly error: string | null
}
type IRecord =
  | { readonly receipt: IReceipt; readonly saved_stashes: IStash[] }
  | { readonly id: string; readonly error: string }
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
  readonly onPreferences: (value: unknown) => void
  readonly onBusy: (busy: boolean) => void
  readonly onStashes: () => void
  readonly openWorktree: (path: GitPath) => Promise<void>
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function path(value: unknown): value is GitPath {
  return (
    typeof value === 'string' ||
    (record(value) &&
      Array.isArray(value.bytes) &&
      value.bytes.every(
        byte => Number.isInteger(byte) && byte >= 0 && byte <= 255
      ))
  )
}
function stash(value: unknown): value is IStash {
  return (
    record(value) &&
    typeof value.oid === 'string' &&
    typeof value.message === 'string'
  )
}
export function changesStrategy(value: unknown): value is Strategy {
  return (
    value === Strategy.AskForConfirmation ||
    value === Strategy.StashOnCurrentBranch ||
    value === Strategy.MoveToNewBranch
  )
}
function creation(value: unknown): value is ICreation {
  return (
    record(value) &&
    (value.start_point === null || typeof value.start_point === 'string') &&
    typeof value.no_track === 'boolean' &&
    typeof value.checkout === 'boolean' &&
    (value.name_rules === undefined ||
      value.name_rules === null ||
      isNameRulesPolicy(value.name_rules))
  )
}
function nameRules(value: IPlan): INameRulesPolicy | null {
  return value.name_rules ?? value.target.creation?.name_rules ?? null
}
function reviewedTarget(value: IPlan): ITarget {
  return value.target.creation
    ? { name: value.target.branch, creation: value.target.creation }
    : { branch: value.target.request }
}
function plan(value: unknown): value is IPlan {
  return (
    record(value) &&
    typeof value.basis === 'string' &&
    record(value.target) &&
    typeof value.target.request === 'string' &&
    typeof value.target.branch === 'string' &&
    typeof value.target.remote === 'boolean' &&
    optionalNameRules(value.name_rules, value.target.branch) &&
    (value.target.creation === undefined ||
      value.target.creation === null ||
      creation(value.target.creation)) &&
    (value.target.creation == null ||
      optionalNameRules(
        value.target.creation.name_rules,
        value.target.branch
      )) &&
    (value.name_rules == null ||
      value.target.creation?.name_rules == null ||
      (value.name_rules.basis === value.target.creation.name_rules.basis &&
        value.name_rules.result === value.target.creation.name_rules.result)) &&
    (value.source_branch === null || typeof value.source_branch === 'string') &&
    ['dirty', 'can_leave', 'same_branch', 'conflicted'].every(
      key => typeof value[key] === 'boolean'
    ) &&
    Array.isArray(value.files) &&
    value.files.every(
      file => record(file) && typeof file.display_path === 'string'
    ) &&
    (value.source_stash === null || stash(value.source_stash)) &&
    (value.target_stash === null || stash(value.target_stash)) &&
    (value.occupied_worktree === null ||
      (record(value.occupied_worktree) &&
        path(value.occupied_worktree.path) &&
        typeof value.occupied_worktree.display_path === 'string' &&
        (value.occupied_worktree.prunable === null ||
          typeof value.occupied_worktree.prunable === 'string')))
  )
}
function receipt(value: unknown): value is IRecord {
  return (
    record(value) &&
    ((typeof value.id === 'string' && typeof value.error === 'string') ||
      (record(value.receipt) &&
        typeof value.receipt.id === 'string' &&
        typeof value.receipt.phase === 'string' &&
        record(value.receipt.target) &&
        typeof value.receipt.target.branch === 'string' &&
        (value.receipt.saved_oid === null ||
          typeof value.receipt.saved_oid === 'string') &&
        (value.receipt.error === null ||
          typeof value.receipt.error === 'string') &&
        Array.isArray(value.saved_stashes) &&
        value.saved_stashes.every(stash)))
  )
}
function savedPreferences(value: unknown) {
  if (
    !record(value) ||
    value.version !== 1 ||
    !['system', 'light', 'dark'].includes(String(value.theme)) ||
    typeof value.poll_interval_ms !== 'number' ||
    !changesStrategy(value.uncommitted_changes)
  )
    throw new Error('Invalid branch switch preferences response')
  return value
}
function succeeded(value: unknown) {
  if (!record(value) || value.code !== 0)
    throw new Error(
      record(value) && typeof value.stderr === 'string'
        ? value.stderr
        : 'Branch switch failed'
    )
  return value
}
function CheckoutPanel({
  snapshot,
  enabled,
  preferred,
  target,
  revision,
  recordsRevision,
  services,
}: {
  readonly snapshot: ISnapshot | null
  readonly enabled: boolean
  readonly preferred: Strategy
  readonly target: ITarget | null
  readonly revision: number
  readonly recordsRevision: number
  readonly services: IServices
}) {
  const [review, setReview] = React.useState<IPlan | null>(null),
    [strategy, setStrategy] = React.useState(Strategy.StashOnCurrentBranch),
    [replace, setReplace] = React.useState(false),
    [restoreIndex, setRestoreIndex] = React.useState(false),
    [remember, setRemember] = React.useState(false),
    [preference, setPreference] = React.useState(preferred),
    [busy, setBusy] = React.useState(false),
    [message, setMessage] = React.useState(''),
    [records, setRecords] = React.useState<IRecord[]>([]),
    [showComplete, setShowComplete] = React.useState(false),
    [removeWorktree, setRemoveWorktree] = React.useState(false)
  const epoch = React.useRef(0),
    running = React.useRef<number | null>(null),
    ownsBusy = React.useRef(false),
    lastReview = React.useRef<{ root: string; revision: number } | null>(null),
    root = snapshot?.root ?? null
  React.useLayoutEffect(() => {
    ++epoch.current
    lastReview.current = null
    setReview(null)
    setMessage('')
    setRecords([])
    setBusy(false)
    setRemoveWorktree(false)
    if (ownsBusy.current) {
      ownsBusy.current = false
      services.onBusy(false)
    }
    return () => {
      ++epoch.current
    }
  }, [root])
  React.useEffect(() => {
    setPreference(preferred)
  }, [preferred])
  React.useEffect(() => {
    setReview(null)
  }, [snapshot?.branch])
  async function load(generation: number) {
    const value = await services.request('checkout_history', {})
    if (generation !== epoch.current) return
    if (!Array.isArray(value) || !value.every(receipt))
      throw new Error('Invalid checkout history')
    setRecords(value)
  }
  React.useEffect(() => {
    if (!root) return
    const generation = epoch.current
    void load(generation).catch(error => {
      if (generation === epoch.current) setMessage(String(error))
    })
  }, [root, snapshot?.branch, services, recordsRevision])
  async function run(task: (generation: number) => Promise<void>) {
    const generation = epoch.current
    if (!enabled || running.current === generation) return
    running.current = generation
    setBusy(true)
    ownsBusy.current = true
    services.onBusy(true)
    try {
      await task(generation)
    } catch (error) {
      if (generation === epoch.current)
        setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      if (running.current === generation) running.current = null
      if (generation === epoch.current) {
        setBusy(false)
        ownsBusy.current = false
        services.onBusy(false)
      }
    }
  }
  async function execute(
    value: IPlan,
    choice: Strategy,
    replaceStash: boolean,
    generation: number,
    options = { remember: false, restoreIndex: false }
  ) {
    const policy = nameRules(value)
    if (policy?.result === 'blocked') {
      setMessage(
        policy.reason ?? 'Branch name is restricted by GitHub repository rules'
      )
      return
    }
    setMessage(value.target.creation ? 'Creating branch…' : 'Switching branch…')
    try {
      if (options.remember) {
        const stored = await services.request('update_preferences', {
          preferences: { uncommitted_changes: choice },
        })
        if (generation !== epoch.current) return
        services.onPreferences(savedPreferences(stored))
      }
      const creating = value.target.creation
      const result = await services.request(
        creating ? 'create_branch' : 'checkout',
        {
          ...(creating
            ? {
                name: value.target.branch,
                start_point: creating.start_point,
                no_track: creating.no_track,
                checkout: creating.checkout,
              }
            : { branch: value.target.request }),
          strategy: choice,
          basis: value.basis,
          replace_stash: replaceStash,
          restore_index: options.restoreIndex,
        }
      )
      if (generation !== epoch.current) return
      if (
        record(result) &&
        result.requires_confirmation === true &&
        plan(result.preview)
      ) {
        setReview(result.preview)
        setMessage(
          typeof result.stderr === 'string'
            ? result.stderr
            : 'Review this branch switch again'
        )
        return
      }
      succeeded(result)
      setReview(null)
      setMessage(
        record(result) && result.unchanged
          ? 'Already on this branch'
          : value.target.creation
          ? value.target.creation.checkout
            ? 'Branch created and switched'
            : 'Branch created'
          : 'Branch switched'
      )
    } finally {
      await services.onChanged()
      await load(generation)
    }
  }
  async function inspect(
    request: ITarget,
    generation: number,
    automatic = true
  ) {
    setMessage('Reviewing branch switch…')
    const value =
      'creation' in request
        ? await services.request('create_branch_preview', {
            name: request.name,
            start_point: request.creation.start_point,
            no_track: request.creation.no_track,
            checkout: request.creation.checkout,
          })
        : await services.request('checkout_preview', { branch: request.branch })
    if (generation !== epoch.current) return
    if (!plan(value)) {
      setReview(null)
      throw new Error('Invalid branch switch review')
    }
    setReplace(false)
    setRemoveWorktree(false)
    setRemember(false)
    setRestoreIndex(false)
    if (value.same_branch) {
      setReview(null)
      setMessage('Already on this branch')
      return
    }
    if (
      automatic &&
      value.occupied_worktree &&
      !value.occupied_worktree.prunable
    ) {
      await services.openWorktree(value.occupied_worktree.path)
      return
    }
    setReview(value)
    setStrategy(
      !value.can_leave
        ? Strategy.MoveToNewBranch
        : preferred === Strategy.AskForConfirmation
        ? Strategy.StashOnCurrentBranch
        : preferred
    )
    if (
      automatic &&
      !value.target.creation &&
      !value.conflicted &&
      value.operation === null &&
      !value.occupied_worktree &&
      (!value.dirty ||
        !value.can_leave ||
        (preferred !== Strategy.AskForConfirmation &&
          !(preferred === Strategy.StashOnCurrentBranch && value.source_stash)))
    ) {
      await execute(
        value,
        !value.can_leave ? Strategy.MoveToNewBranch : preferred,
        false,
        generation
      )
    }
  }
  React.useEffect(() => {
    if (!root || !target || !enabled || busy) return
    if (
      lastReview.current?.root === root &&
      lastReview.current.revision === revision
    )
      return
    // Defer a requested review while controls are busy, then claim it once.
    // Readiness changes must not replay an already submitted branch operation.
    lastReview.current = { root, revision }
    void run(generation => inspect(target, generation))
  }, [root, revision, enabled, busy])
  if (!snapshot) return null
  const disabled = busy || !enabled,
    shown = records.filter(
      item =>
        showComplete ||
        !('receipt' in item) ||
        item.receipt.phase !== 'complete' ||
        item.receipt.error !== null
    )
  return (
    <section className="checkout-panel" aria-label="Branch switching">
      <p role="status">{message}</p>
      {review && (
        <article>
          <h2>
            {review.target.creation
              ? review.target.creation.checkout
                ? 'Create and switch to '
                : 'Create '
              : 'Switch to '}
            {review.target.branch}
            {review.target.remote ? ' (new tracking branch)' : ''}
          </h2>
          <NameRules policy={nameRules(review)} />
          {review.target.creation && (
            <p>
              Start at{' '}
              {review.target.creation.start_point ?? 'the current checkout'}.{' '}
              {review.target.creation.no_track
                ? 'Do not configure upstream tracking.'
                : 'Use native Git upstream defaults.'}{' '}
              {!review.target.creation.checkout &&
                'Working files, staging and the current branch remain in place.'}
            </p>
          )}
          {review.occupied_worktree ? (
            <div>
              <p>
                This branch is registered at{' '}
                {review.occupied_worktree.display_path}.
              </p>
              {review.occupied_worktree.prunable ? (
                <>
                  <p>{review.occupied_worktree.prunable}</p>
                  <button
                    disabled={disabled}
                    onClick={() => setRemoveWorktree(true)}
                  >
                    Remove stale worktree registration…
                  </button>
                  {removeWorktree && (
                    <Row>
                      <button
                        disabled={disabled}
                        onClick={() => setRemoveWorktree(false)}
                      >
                        Keep registration
                      </button>
                      <button
                        disabled={disabled}
                        onClick={() =>
                          void run(async generation => {
                            if (!review.occupied_worktree) return
                            try {
                              succeeded(
                                await services.request('worktree_remove', {
                                  path: review.occupied_worktree.path,
                                  force: false,
                                })
                              )
                            } finally {
                              await services.onChanged()
                            }
                            await inspect(reviewedTarget(review), generation)
                          })
                        }
                      >
                        Remove registered worktree
                      </button>
                    </Row>
                  )}
                </>
              ) : (
                <button
                  disabled={disabled}
                  onClick={() =>
                    void run(async () => {
                      if (review.occupied_worktree)
                        await services.openWorktree(
                          review.occupied_worktree.path
                        )
                    })
                  }
                >
                  Open existing worktree
                </button>
              )}
            </div>
          ) : review.conflicted || review.operation !== null ? (
            <p>
              Finish or abort the current operation/conflicts before switching
              branches.
            </p>
          ) : (
            <>
              {review.dirty && (
                <>
                  <p>
                    Choose what happens to your local changes, including
                    untracked files.
                  </p>
                  <ul>
                    {review.files.map((file, index) => (
                      <li key={index}>{file.display_path}</li>
                    ))}
                  </ul>
                  <label className="checkbox-label">
                    <input
                      type="radio"
                      name="checkout-strategy"
                      checked={strategy === Strategy.StashOnCurrentBranch}
                      disabled={disabled || !review.can_leave}
                      onChange={() => {
                        setStrategy(Strategy.StashOnCurrentBranch)
                        setReplace(false)
                      }}
                    />
                    Leave my changes on {review.source_branch ?? 'this branch'}
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="radio"
                      name="checkout-strategy"
                      checked={strategy === Strategy.MoveToNewBranch}
                      disabled={disabled}
                      onChange={() => {
                        setStrategy(Strategy.MoveToNewBranch)
                        setReplace(false)
                      }}
                    />
                    Bring my changes to {review.target.branch}
                  </label>
                  {strategy === Strategy.StashOnCurrentBranch &&
                    review.source_stash && (
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={replace}
                          disabled={disabled}
                          onChange={event =>
                            setReplace(event.currentTarget.checked)
                          }
                        />
                        Replace my previous saved stash:{' '}
                        {review.source_stash.message}
                      </label>
                    )}
                  {strategy === Strategy.MoveToNewBranch && (
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={restoreIndex}
                        disabled={disabled}
                        onChange={event =>
                          setRestoreIndex(event.currentTarget.checked)
                        }
                      />
                      Restore the saved index if a temporary stash is needed
                    </label>
                  )}
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={remember}
                      disabled={disabled}
                      onChange={event =>
                        setRemember(event.currentTarget.checked)
                      }
                    />
                    Remember this choice for future branch switches
                  </label>
                </>
              )}
              {review.target_stash && (
                <p>
                  The destination has saved changes. They remain available in
                  Stashes after switching.
                </p>
              )}
              <button
                disabled={
                  disabled ||
                  nameRules(review)?.result === 'blocked' ||
                  (review.dirty &&
                    strategy === Strategy.StashOnCurrentBranch &&
                    Boolean(review.source_stash) &&
                    !replace)
                }
                onClick={() =>
                  void run(generation =>
                    execute(review, strategy, replace, generation, {
                      remember,
                      restoreIndex,
                    })
                  )
                }
              >
                {review.target.creation
                  ? review.target.creation.checkout
                    ? 'Create and switch branch'
                    : 'Create branch'
                  : 'Switch branch'}
              </button>
            </>
          )}
          <button disabled={disabled} onClick={() => setReview(null)}>
            Cancel branch switch
          </button>
          <button
            disabled={disabled}
            onClick={() =>
              void run(generation =>
                inspect(reviewedTarget(review), generation, false)
              )
            }
          >
            Refresh branch switch review
          </button>
        </article>
      )}
      <details>
        <summary>Branch switch preference</summary>
        <label>
          Default handling
          <select
            disabled={disabled}
            value={preference}
            onChange={event => {
              if (changesStrategy(event.currentTarget.value))
                setPreference(event.currentTarget.value)
            }}
          >
            <option value={Strategy.AskForConfirmation}>
              Ask about local changes
            </option>
            <option value={Strategy.StashOnCurrentBranch}>
              Leave changes on the current branch
            </option>
            <option value={Strategy.MoveToNewBranch}>
              Bring changes to the new branch
            </option>
          </select>
        </label>
        <button
          disabled={disabled}
          onClick={() =>
            void run(async generation => {
              const value = await services.request('update_preferences', {
                preferences: { uncommitted_changes: preference },
              })
              if (generation === epoch.current) {
                services.onPreferences(savedPreferences(value))
                setMessage('Branch switch preference saved')
              }
            })
          }
        >
          Save branch switch preference
        </button>
      </details>
      <details open={shown.length > 0}>
        <summary>Branch switch records</summary>
        <p>
          Records describe the last attempted phase. Interrupted commands are
          never replayed automatically.
        </p>
        <button disabled={disabled} onClick={() => void run(load)}>
          Refresh branch switch records
        </button>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showComplete}
            onChange={event => setShowComplete(event.currentTarget.checked)}
          />
          Show completed switches
        </label>
        {shown.map((item, index) =>
          'receipt' in item ? (
            <article key={item.receipt.id}>
              <h3>
                {item.receipt.target.branch}: {item.receipt.phase}
              </h3>
              {item.receipt.error && <p>{item.receipt.error}</p>}
              {item.saved_stashes.map(stash => (
                <p key={stash.oid}>Saved stash: {stash.oid}</p>
              ))}
              <Row>
                <button disabled={disabled} onClick={services.onStashes}>
                  Show saved stashes
                </button>
                <button
                  disabled={disabled}
                  onClick={() =>
                    void run(async generation => {
                      succeeded(
                        await services.request('acknowledge_checkout', {
                          receipt_id: item.receipt.id,
                        })
                      )
                      await load(generation)
                    })
                  }
                >
                  Acknowledge switch record
                </button>
              </Row>
            </article>
          ) : (
            <p key={index}>
              {item.id}: {item.error}
            </p>
          )
        )}
      </details>
    </section>
  )
}
/** Reuse the upstream leave/bring strategy model with reviewed Rust checkout. */
export function mountCheckout(container: HTMLElement, services: IServices) {
  let snapshot: ISnapshot | null = null,
    enabled = true,
    preferred = defaultUncommittedChangesStrategy,
    target: ITarget | null = null,
    revision = 0,
    recordsRevision = 0
  function render() {
    ReactDOM.render(
      <CheckoutPanel
        snapshot={snapshot}
        enabled={enabled}
        preferred={preferred}
        target={target}
        revision={revision}
        recordsRevision={recordsRevision}
        services={services}
      />,
      container
    )
  }
  render()
  return {
    setSnapshot(value: ISnapshot | null) {
      if (value?.root !== snapshot?.root) {
        target = null
      }
      snapshot = value
      render()
    },
    setEnabled(value: boolean) {
      enabled = value
      render()
    },
    setStrategy(value: unknown) {
      preferred = changesStrategy(value)
        ? value
        : defaultUncommittedChangesStrategy
      render()
    },
    review(value: string) {
      target = { branch: value }
      ++revision
      render()
    },
    create(name: string, options: ICreation) {
      target = { name, creation: options }
      ++revision
      render()
    },
    refreshHistory() {
      ++recordsRevision
      render()
    },
    dispose() {
      ReactDOM.unmountComponentAtNode(container)
    },
  }
}
