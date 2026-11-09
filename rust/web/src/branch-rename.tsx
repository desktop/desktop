import * as React from 'react'
import { Form } from './upstream/form'
import { Ref } from './upstream/ref'
import { INameRulesPolicy, NameRules, optionalNameRules } from './name-rules'
import { IBranchPermissions, isBranchPermissions } from './branch-policy'

interface IStash {
  readonly oid: string
  readonly message: string
}
interface IPlan {
  readonly name_rules?: INameRulesPolicy | null
  readonly basis: string
  readonly name: string
  readonly new_name: string
  readonly oid: string
  readonly unchanged: boolean
  readonly policy?: IBranchPermissions | null
  readonly case_only?: boolean
  readonly case_retry?: boolean
  readonly saved_stashes: IStash[]
  readonly destination_stashes: IStash[]
}
interface IReceipt {
  readonly id: string
  readonly name: string
  readonly new_name: string
  readonly phase: string
  readonly error: string | null
}
type IRecord =
  | { readonly receipt: IReceipt; readonly saved_stashes: IStash[] }
  | { readonly id: string; readonly error: string }
interface IProps {
  readonly root: string
  readonly contextBasis?: string
  readonly name: string | null
  readonly policy?: IBranchPermissions | null
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
function stash(value: unknown): value is IStash {
  return (
    record(value) &&
    typeof value.oid === 'string' &&
    typeof value.message === 'string'
  )
}
function plan(value: unknown): value is IPlan {
  return (
    record(value) &&
    ['basis', 'name', 'new_name', 'oid'].every(
      key => typeof value[key] === 'string'
    ) &&
    typeof value.unchanged === 'boolean' &&
    typeof value.new_name === 'string' &&
    optionalNameRules(value.name_rules, value.new_name) &&
    (value.policy === undefined ||
      value.policy === null ||
      isBranchPermissions(value.policy)) &&
    (value.case_only === undefined || typeof value.case_only === 'boolean') &&
    (value.case_retry === undefined || typeof value.case_retry === 'boolean') &&
    Array.isArray(value.saved_stashes) &&
    value.saved_stashes.every(stash) &&
    Array.isArray(value.destination_stashes) &&
    value.destination_stashes.every(stash)
  )
}
function receipt(value: unknown): value is IReceipt {
  return (
    record(value) &&
    ['id', 'name', 'new_name', 'phase'].every(
      key => typeof value[key] === 'string'
    ) &&
    (value.error === null || typeof value.error === 'string')
  )
}
function history(value: unknown): value is IRecord[] {
  return (
    Array.isArray(value) &&
    value.every(
      item =>
        record(item) &&
        ((typeof item.id === 'string' && typeof item.error === 'string') ||
          (receipt(item.receipt) &&
            Array.isArray(item.saved_stashes) &&
            item.saved_stashes.every(stash)))
    )
  )
}

/** Review branch renames and retain interrupted-work notices across reconnects. */
export function BranchRename({
  root,
  contextBasis,
  name,
  policy,
  busy,
  onBusy,
  request,
  onChanged,
}: IProps) {
  const [newName, setNewName] = React.useState(''),
    [review, setReview] = React.useState<IPlan | null>(null),
    [records, setRecords] = React.useState<IRecord[]>([]),
    [message, setMessage] = React.useState(''),
    [showComplete, setShowComplete] = React.useState(false)
  const canRename =
    policy === undefined ||
    (isBranchPermissions(policy) && policy.name === name && policy.can_rename)
  const policyMessage = isBranchPermissions(policy)
    ? policy.rename_reason
    : null
  const epoch = React.useRef(0),
    running = React.useRef(false),
    historyRevision = React.useRef(0)
  React.useLayoutEffect(() => {
    epoch.current++
    historyRevision.current++
    setNewName('')
    setReview(null)
    setRecords([])
    setMessage('')
    if (running.current) {
      running.current = false
      onBusy(false)
    }
    return () => {
      epoch.current++
    }
  }, [
    root,
    name,
    contextBasis,
    policy?.can_rename,
    policy?.is_default,
    policy?.published,
    policy?.reference,
  ])
  async function load(generation: number) {
    const revision = ++historyRevision.current
    const values = await request('branch_rename_history', {})
    if (generation !== epoch.current || revision !== historyRevision.current)
      return
    if (!history(values)) throw new Error('Invalid branch rename history')
    setRecords(values)
  }
  async function run(task: (generation: number) => Promise<void>) {
    if (busy || running.current) return
    const generation = epoch.current
    running.current = true
    onBusy(true)
    try {
      setMessage('')
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
  React.useEffect(() => {
    const generation = epoch.current
    void load(generation).catch(error => {
      if (generation === epoch.current)
        setMessage(error instanceof Error ? error.message : String(error))
    })
  }, [
    root,
    name,
    contextBasis,
    policy?.can_rename,
    policy?.is_default,
    policy?.published,
    policy?.reference,
  ])
  return (
    <div className="branch-rename">
      <Form
        onSubmit={() => {
          if (!name || !canRename) return
          void run(async generation => {
            setReview(null)
            const value = await request('rename_branch_preview', {
              name: `refs/heads/${name}`,
              new_name: newName,
            })
            if (generation !== epoch.current) return
            if (
              !plan(value) ||
              value.name !== name ||
              value.new_name !== newName
            )
              throw new Error('Invalid branch rename review')
            setReview(value)
          })
        }}
      >
        <label>
          Rename current branch
          <input
            value={newName}
            disabled={busy || !canRename}
            onChange={event => {
              setNewName(event.currentTarget.value)
              setReview(null)
            }}
            required={true}
          />
        </label>
        <button disabled={busy || !name || !canRename}>
          Review branch rename
        </button>
      </Form>
      {policyMessage && <p role="status">{policyMessage}.</p>}
      {review && (
        <div role="group" aria-label="Branch rename review">
          <p>
            <Ref>{review.name}</Ref> → <Ref>{review.new_name}</Ref> at{' '}
            <Ref>{review.oid}</Ref>. Move {review.saved_stashes.length} saved
            change sets with this branch.
          </p>
          {review.destination_stashes.length > 0 && (
            <p>
              Keep {review.destination_stashes.length} existing saved change
              sets associated with the destination name.
            </p>
          )}
          {review.case_only && (
            <p>
              This changes only the branch name’s letter case. Git first
              attempts a normal rename; a case collision can be retried only
              after checking that no other branch owns that name or another
              spelling.
            </p>
          )}
          {review.policy?.published && (
            <p>
              This branch has a configured upstream. Renaming it locally keeps
              that upstream; publishing the new name is a separate action.
            </p>
          )}
          <NameRules policy={review.name_rules} />
          <p>Working files and staged changes remain in place.</p>
          <button
            disabled={
              busy ||
              !canRename ||
              review.unchanged ||
              review.name_rules?.result === 'blocked'
            }
            onClick={() =>
              void run(async generation => {
                if (!canRename || review.name_rules?.result === 'blocked')
                  return
                const selected = review
                setReview(null)
                try {
                  const result = await request('rename_branch', {
                    name: `refs/heads/${selected.name}`,
                    new_name: selected.new_name,
                    basis: selected.basis,
                  })
                  if (!record(result) || result.code !== 0)
                    throw new Error('Branch rename did not complete')
                  if (generation === epoch.current)
                    setMessage('Branch renamed and saved changes reassociated.')
                } finally {
                  await onChanged()
                  if (generation === epoch.current) await load(generation)
                }
              })
            }
          >
            Confirm branch rename
          </button>
        </div>
      )}
      <button
        disabled={busy}
        onClick={() => void run(generation => load(generation))}
      >
        Refresh branch rename history
      </button>
      <label>
        <input
          type="checkbox"
          checked={showComplete}
          onChange={event => setShowComplete(event.currentTarget.checked)}
        />
        Show completed branch renames
      </label>
      {records
        .filter(
          item =>
            showComplete ||
            !('receipt' in item) ||
            item.receipt.phase !== 'complete' ||
            item.receipt.error !== null
        )
        .map(item => {
          if (!('receipt' in item))
            return <p key={item.id}>Unreadable rename receipt: {item.error}</p>
          const value = item.receipt
          return (
            <div key={value.id}>
              <p>
                Branch rename {value.name} → {value.new_name}: {value.phase}.{' '}
                {value.error}
              </p>
              <p>
                Inspect saved changes before retrying. Acknowledging removes
                only this notice.
              </p>
              <ul>
                {item.saved_stashes.map((entry, index) => (
                  <li key={`${index}:${entry.oid}`}>
                    {entry.message} ({entry.oid})
                  </li>
                ))}
              </ul>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async generation => {
                    await request('acknowledge_branch_rename', {
                      receipt_id: value.id,
                    })
                    if (generation === epoch.current) await load(generation)
                  })
                }
              >
                Acknowledge branch rename notice
              </button>
            </div>
          )
        })}
      {message && <p role="status">{message}</p>}
    </div>
  )
}
