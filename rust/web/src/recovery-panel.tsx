import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Row } from './upstream/row'
import { LfsNotice, lfsPreview } from './lfs-preview'
import { Form } from './upstream/form'
import { BranchRename } from './branch-rename'
import { IBranchPermissions } from './branch-policy'
import { BranchDelete } from './branch-delete'
import { RemoteDelete } from './remote-delete'
import { Branch, BranchType } from './upstream/models/branch'

type GitPath = string | { bytes: number[] }
interface ISnapshot {
  root: string
  branch: string | null
  default_branch?: { reference: string } | null
  branch_policy?: IBranchPermissions | null
  repository_context?: { basis: string } | null
  upstream?: string | null
  ahead?: number | null
  behind?: number | null
  operation?: { kind: string; step: number | null; total: number | null } | null
  files: { path: GitPath; display_path: string; conflicted: boolean }[]
}
interface IServices {
  request: (
    method: string,
    parameters: Record<string, unknown>
  ) => Promise<unknown>
  onChanged: () => Promise<void>
  onBusy?: (busy: boolean) => void
}
interface IBranch {
  name: string
  ref: string
  oid: string
  local: boolean
  upstream: string | null
  worktree: string | null
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
    (value.upstream === null || typeof value.upstream === 'string') &&
    (value.worktree === null || typeof value.worktree === 'string')
  )
}
function RecoveryPanel({
  snapshot,
  services,
  undoRevision,
  enabled,
}: {
  readonly enabled: boolean
  readonly undoRevision: number
  readonly snapshot: ISnapshot | null
  readonly services: IServices
}) {
  const [message, setMessage] = React.useState(''),
    [busy, setBusy] = React.useState(false),
    [detail, setDetail] = React.useState<Record<string, unknown> | null>(null),
    [selected, setSelected] = React.useState<GitPath | null>(null)
  const [branches, setBranches] = React.useState<IBranch[]>([]),
    [upstream, setUpstream] = React.useState(''),
    [revision, setRevision] = React.useState('')
  const [branchRevision, setBranchRevision] = React.useState(0)
  const [markerConsent, setMarkerConsent] = React.useState(false)
  const [lastUndo, setLastUndo] = React.useState<{
    id: string
    path: GitPath
    edited: boolean
  } | null>(null)
  async function branchChanged() {
    await services.onChanged()
    setBranchRevision(value => value + 1)
  }
  const disabled = busy || !enabled
  const epoch = React.useRef(0),
    running = React.useRef<number | null>(null)
  React.useLayoutEffect(() => {
    epoch.current++
    setDetail(null)
    setSelected(null)
    setMarkerConsent(false)
    setLastUndo(null)
    setMessage('')
    setBranches([])
    setBusy(false)
    return () => {
      epoch.current++
    }
  }, [snapshot?.root])
  React.useLayoutEffect(() => {
    setLastUndo(null)
  }, [
    snapshot?.root,
    snapshot?.operation?.kind,
    snapshot?.operation?.step,
    undoRevision,
  ])
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
  async function mutate(method: string, parameters: Record<string, unknown>) {
    try {
      await services.request(method, parameters)
    } finally {
      await services.onChanged()
    }
  }
  async function inspect(path: GitPath, generation: number) {
    const result = await services.request('conflict_detail', { path })
    if (generation !== epoch.current) return
    if (
      !record(result) ||
      typeof result.basis !== 'string' ||
      !Array.isArray(result.stages)
    )
      throw new Error('Invalid conflict response')
    setSelected(path)
    setMarkerConsent(false)
    setDetail(result)
  }
  async function choose(choice: string, generation: number) {
    if (!detail || !selected) return
    let value: unknown
    try {
      value = await services.request('resolve_conflict', {
        path: selected,
        basis: detail.basis,
        choice,
      })
    } finally {
      await services.onChanged()
    }
    if (generation === epoch.current) {
      setDetail(null)
      setSelected(null)
      if (record(value) && typeof value.undo_id === 'string')
        setLastUndo({ id: value.undo_id, path: selected, edited: false })
      setMessage('Resolution staged')
    }
  }
  async function stageEdited(generation: number, allowMarkers: boolean) {
    if (!detail || !selected) return
    const value = await services
      .request('stage_conflict', {
        path: selected,
        basis: detail.basis,
        allow_markers: allowMarkers,
      })
      .catch(async error => {
        if (generation === epoch.current) setMarkerConsent(false)
        // A failed publication may still leave a durable prepared receipt.
        await services.onChanged()
        throw error
      })
    if (generation !== epoch.current) return
    if (record(value) && value.requires_confirmation === true) {
      setMarkerConsent(true)
      setMessage(
        'Git detected leftover conflict markers. Edit the file and refresh, or explicitly stage the reviewed version with markers.'
      )
      return
    }
    if (!record(value) || value.code !== 0)
      throw new Error(
        record(value) && typeof value.stderr === 'string'
          ? value.stderr
          : 'Resolution staging failed'
      )
    await services.onChanged()
    if (generation === epoch.current) {
      setDetail(null)
      setSelected(null)
      setMarkerConsent(false)
      if (typeof value.undo_id === 'string')
        setLastUndo({ id: value.undo_id, path: selected, edited: true })
      setMessage('Edited resolution staged')
    }
  }
  if (!snapshot) return null
  const conflicts = snapshot.files.filter(file => file.conflicted),
    operation = snapshot.operation
  return (
    <section className="recovery-panel" aria-label="Repository operations">
      {operation && (
        <div className="operation-banner">
          <strong>{operation.kind} in progress</strong>
          {operation.step !== null && (
            <span>
              {' '}
              · {operation.step}/{operation.total}
            </span>
          )}
          <Row>
            {[
              'continue',
              'abort',
              ...(operation.kind === 'merge' ? [] : ['skip']),
            ].map(action => (
              <button
                disabled={
                  disabled || (action === 'continue' && conflicts.length > 0)
                }
                key={action}
                onClick={() =>
                  void run(async () => {
                    await mutate('recover', { kind: operation.kind, action })
                    setMessage('Recovery action completed')
                  })
                }
              >
                {action[0].toUpperCase() + action.slice(1)} operation
              </button>
            ))}
          </Row>
        </div>
      )}
      {conflicts.length > 0 && (
        <div>
          <h2>Resolve conflicts</h2>
          <p>
            Choose a version to stage, or resolve the file in an editor and
            stage it. During rebase, ours is the branch being rebased onto;
            theirs is the commit being replayed.
          </p>
          <ul>
            {conflicts.map((file, index) => (
              <li key={index}>
                <button
                  disabled={disabled}
                  onClick={() =>
                    void run(generation => inspect(file.path, generation))
                  }
                >
                  Inspect conflict: {file.display_path}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p role="status">{message}</p>
      {lastUndo && (
        <button
          disabled={disabled}
          onClick={() =>
            void run(async generation => {
              const undo = lastUndo
              await services.request('undo_discard', { undo_id: undo.id })
              await services.onChanged()
              if (generation !== epoch.current) return
              setLastUndo(null)
              await inspect(undo.path, generation)
              if (generation === epoch.current)
                setMessage(
                  undo.edited
                    ? 'Resolution unstaged; working edits kept'
                    : 'Original conflict restored'
                )
            })
          }
        >
          {lastUndo.edited
            ? 'Unstage resolution (keep working files)'
            : 'Undo last resolution'}
        </button>
      )}

      {detail && selected && (
        <div className="conflict-detail">
          <Row>
            <button
              disabled={disabled}
              onClick={() =>
                void run(async generation => {
                  await services.request('open_editor', { path: selected })
                  if (generation === epoch.current)
                    setMessage(
                      'Editor launched. Save the file, then refresh the edited preview.'
                    )
                })
              }
            >
              Open external editor
            </button>
            <button
              disabled={disabled}
              onClick={() =>
                void run(generation => inspect(selected, generation))
              }
            >
              Refresh edited preview
            </button>
            <button
              disabled={disabled || !record(detail.working)}
              onClick={() =>
                void run(generation => stageEdited(generation, false))
              }
            >
              Stage edited resolution
            </button>
            {markerConsent && (
              <button
                disabled={disabled}
                onClick={() =>
                  void run(generation => stageEdited(generation, true))
                }
              >
                Stage with detected conflict markers
              </button>
            )}
          </Row>
          {record(detail.working) && (
            <p>
              Reviewed working version:{' '}
              {typeof detail.working.size === 'number'
                ? detail.working.size
                : 'Unknown'}{' '}
              bytes · {String(detail.working.kind)}. Refresh after saving
              changes in the editor.
            </p>
          )}
          <Row>
            <button
              disabled={disabled}
              onClick={() => void run(generation => choose('ours', generation))}
            >
              Use ours and stage
            </button>
            <button
              disabled={disabled}
              onClick={() =>
                void run(generation => choose('theirs', generation))
              }
            >
              Use theirs and stage
            </button>
            <button
              disabled={disabled}
              onClick={() =>
                void run(generation => choose('delete', generation))
              }
            >
              Resolve as deleted
            </button>
          </Row>
          {Array.isArray(detail.stages) &&
            detail.stages.some(
              entry =>
                record(entry) &&
                record(entry.preview) &&
                entry.preview.mode === '160000'
            ) && (
              <p>
                For submodules, choosing a side stages that commit without
                changing the nested working tree.
              </p>
            )}
          {Array.isArray(detail.stages) &&
            detail.stages.filter(record).map((entry, index) => (
              <details key={index} open={true}>
                <summary>
                  {entry.stage === 1
                    ? 'Base'
                    : entry.stage === 2
                    ? 'Ours'
                    : 'Theirs'}
                </summary>
                {record(entry.preview) && lfsPreview(entry.preview.lfs) && (
                  <LfsNotice label="Version" value={entry.preview.lfs} />
                )}
                {typeof entry.text === 'string' ? (
                  <pre>{entry.text}</pre>
                ) : (
                  <p>
                    Binary, symlink, or large version; choose a side to preserve
                    its exact Git content.
                  </p>
                )}
              </details>
            ))}
        </div>
      )}
      <details>
        <summary>Branch management and integration</summary>
        <p>
          Upstream: {snapshot.upstream || 'Not configured'} · ahead{' '}
          {snapshot.ahead ?? '—'} · behind {snapshot.behind ?? '—'}
        </p>
        <button
          disabled={disabled}
          onClick={() =>
            void run(async generation => {
              const values = await services.request('branch_list', {})
              if (generation === epoch.current) {
                if (!Array.isArray(values) || !values.every(branch))
                  throw new Error('Invalid branch response')
                setBranches(values)
              }
            })
          }
        >
          List branches and worktrees
        </button>
        <ul>
          {branches.map(value => {
            const model = new Branch(
              value.name,
              value.upstream,
              { sha: value.oid },
              value.local ? BranchType.Local : BranchType.Remote,
              value.ref
            )
            return (
              <li key={value.ref}>
                {model.name}{' '}
                {model.upstreamWithoutRemote
                  ? `→ ${model.upstreamWithoutRemote}`
                  : ''}{' '}
                {value.worktree ? `(${value.worktree})` : ''}
              </li>
            )
          })}
        </ul>
        <BranchDelete
          contextBasis={snapshot.repository_context?.basis}
          defaultBranch={snapshot.default_branch?.reference}
          revision={branchRevision}
          root={snapshot.root}
          branch={snapshot.branch}
          busy={disabled}
          onBusy={value => {
            setBusy(value)
            services.onBusy?.(value)
          }}
          request={services.request}
          onChanged={branchChanged}
        />
        <RemoteDelete
          revision={branchRevision}
          root={snapshot.root}
          branch={snapshot.branch}
          busy={disabled}
          onBusy={value => {
            setBusy(value)
            services.onBusy?.(value)
          }}
          request={services.request}
          onChanged={branchChanged}
        />
        <BranchRename
          contextBasis={snapshot.repository_context?.basis}
          root={snapshot.root}
          name={snapshot.branch}
          policy={snapshot.branch_policy}
          busy={disabled}
          onBusy={value => {
            setBusy(value)
            services.onBusy?.(value)
          }}
          request={services.request}
          onChanged={branchChanged}
        />
        <Form
          onSubmit={() => {
            if (snapshot.branch)
              void run(async () =>
                mutate('track_branch', { name: snapshot.branch, upstream })
              )
          }}
        >
          <label>
            Tracking branch
            <input
              value={upstream}
              onChange={event => setUpstream(event.currentTarget.value)}
              placeholder="origin/main"
              required={true}
            />
          </label>
          <button disabled={disabled || !snapshot.branch}>Set upstream</button>
        </Form>
        <label>
          Integration revision
          <input
            value={revision}
            onChange={event => setRevision(event.currentTarget.value)}
            placeholder="Branch, tag, or commit"
          />
        </label>
        <Row>
          <button
            disabled={disabled || !revision}
            onClick={() =>
              void run(async () => mutate('merge', { branch: revision }))
            }
          >
            Merge revision
          </button>
          <button
            disabled={disabled || !revision}
            onClick={() =>
              void run(async () => mutate('rebase', { branch: revision }))
            }
          >
            Rebase onto revision
          </button>
        </Row>
      </details>
    </section>
  )
}

/** Keep conflict choices bound to a fresh server-issued version token. */
export function mountRecovery(container: HTMLElement, services: IServices) {
  let snapshot: ISnapshot | null = null
  let undoRevision = 0
  let enabled = true
  function render() {
    ReactDOM.render(
      <RecoveryPanel
        snapshot={snapshot}
        services={services}
        undoRevision={undoRevision}
        enabled={enabled}
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
    clearResolutionUndo() {
      ++undoRevision
      render()
    },
    dispose() {
      ReactDOM.unmountComponentAtNode(container)
    },
  }
}
