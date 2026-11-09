import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Row } from './upstream/row'
import { ImageComparison } from './image-comparison'
import { ILfsPreview, LfsNotice, lfsPreview } from './lfs-preview'
import { DiffLine, DiffLineType } from './upstream/diff/diff-line'
import { DiffHunkHeader } from './upstream/diff/raw-diff'

type GitPath = string | { bytes: number[] }
interface ITarget {
  readonly path: GitPath
  readonly name: string
  readonly staged: boolean
  readonly root: string
  readonly history?: { commit: string; parent: number }
  readonly revision: number
}
interface ILine {
  readonly id: number
  readonly kind: string
  readonly text: string
  readonly old_line: number | null
  readonly new_line: number | null
  readonly no_newline: boolean
}
interface IHunk {
  readonly old_start: number
  readonly old_count: number
  readonly new_start: number
  readonly new_count: number
  readonly lines: ILine[]
}
interface IPreview {
  readonly lfs?: ILfsPreview
  readonly mode: string | null
  readonly oid: string | null
  readonly size: number
  readonly image: { mime: string; data: string } | null
  readonly text: string | null
}
interface IView {
  readonly basis: string
  readonly kind: string
  readonly can_select: boolean
  readonly hunks: IHunk[]
  readonly before: IPreview
  readonly after: IPreview
}
interface IServices {
  readonly request: (
    method: string,
    parameters: Record<string, unknown>
  ) => Promise<unknown>
  readonly onChanged: () => Promise<void>
  readonly onDiscard?: (
    path: GitPath,
    name: string,
    root: string,
    selection: { basis: string; lines: number[] }
  ) => void
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function nullableString(value: unknown): boolean {
  return value === null || typeof value === 'string'
}
function line(value: unknown): value is ILine {
  return (
    record(value) &&
    Number.isSafeInteger(value.id) &&
    typeof value.kind === 'string' &&
    typeof value.text === 'string' &&
    (value.old_line === null || Number.isSafeInteger(value.old_line)) &&
    (value.new_line === null || Number.isSafeInteger(value.new_line)) &&
    typeof value.no_newline === 'boolean'
  )
}
function hunk(value: unknown): value is IHunk {
  return (
    record(value) &&
    ['old_start', 'old_count', 'new_start', 'new_count'].every(key =>
      Number.isSafeInteger(value[key])
    ) &&
    Array.isArray(value.lines) &&
    value.lines.every(line)
  )
}
function preview(value: unknown): value is IPreview {
  return (
    record(value) &&
    (value.lfs === undefined || lfsPreview(value.lfs)) &&
    nullableString(value.mode) &&
    nullableString(value.oid) &&
    typeof value.size === 'number' &&
    nullableString(value.text) &&
    (value.image === null ||
      (record(value.image) &&
        typeof value.image.mime === 'string' &&
        typeof value.image.data === 'string'))
  )
}
function view(value: unknown): value is IView {
  return (
    record(value) &&
    typeof value.basis === 'string' &&
    typeof value.kind === 'string' &&
    typeof value.can_select === 'boolean' &&
    Array.isArray(value.hunks) &&
    value.hunks.every(hunk) &&
    preview(value.before) &&
    preview(value.after)
  )
}
function changed(line: ILine) {
  return line.kind === 'added' || line.kind === 'deleted'
}
function model(line: ILine) {
  const type =
    line.kind === 'added'
      ? DiffLineType.Add
      : line.kind === 'deleted'
      ? DiffLineType.Delete
      : DiffLineType.Context
  return new DiffLine(
    `${line.kind === 'added' ? '+' : line.kind === 'deleted' ? '-' : ' '}${
      line.text
    }`,
    type,
    line.id,
    line.old_line,
    line.new_line,
    line.no_newline
  )
}

function DiffPanel({
  target,
  services,
}: {
  readonly target: ITarget | null
  readonly services: IServices
}) {
  const [data, setData] = React.useState<IView | null>(null)
  const [selected, setSelected] = React.useState(new Set<number>())
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState('')
  const [reload, setReload] = React.useState(0)
  const generation = React.useRef(0)
  React.useLayoutEffect(() => {
    const current = ++generation.current
    setData(null)
    setSelected(new Set())
    if (!target) {
      setBusy(false)
      return
    }
    setBusy(true)
    setMessage('Loading diff…')
    services
      .request(
        target.history ? 'commit_diff' : 'diff_detail',
        target.history
          ? { path: target.path, ...target.history }
          : { path: target.path, staged: target.staged }
      )
      .then(value => {
        if (current !== generation.current) return
        if (!view(value)) throw new Error('Invalid diff service response')
        setData(value)
        setMessage('')
      })
      .catch(error => {
        if (current === generation.current)
          setMessage(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (current === generation.current) setBusy(false)
      })
    return () => {
      generation.current++
    }
  }, [target, reload, services])

  async function apply() {
    if (!data || !target || busy || !selected.size) return
    const current = generation.current
    setBusy(true)
    setMessage('Updating index…')
    try {
      const result = await services.request('select_diff', {
        path: target.path,
        staged: target.staged,
        basis: data.basis,
        lines: Array.from(selected).sort((a, b) => a - b),
      })
      if (current !== generation.current) return
      if (!record(result) || result.code !== 0)
        throw new Error(
          record(result) && typeof result.stderr === 'string'
            ? result.stderr
            : 'Index update failed'
        )
      await services.onChanged()
      if (current === generation.current) setReload(value => value + 1)
    } catch (error) {
      if (current === generation.current)
        setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }
  function toggle(lines: ILine[], include: boolean) {
    setSelected(previous => {
      const next = new Set(previous)
      for (const line of lines.filter(changed)) {
        if (include) next.add(line.id)
        else next.delete(line.id)
      }
      return next
    })
  }
  if (!target) return null
  const all = data?.hunks.flatMap(hunk => hunk.lines).filter(changed) || []
  return (
    <section className="diff-panel" aria-label="File diff">
      <Row>
        <strong>
          {target.history
            ? target.history.commit.slice(0, 7)
            : target.staged
            ? 'Staged'
            : 'Working'}{' '}
          · {target.name}
        </strong>
        <button disabled={busy} onClick={() => setReload(value => value + 1)}>
          Reload diff
        </button>
      </Row>
      <p role="status">{message}</p>
      {data && (
        <React.Fragment>
          <p className="muted">
            {data.before.mode || 'Absent'} → {data.after.mode || 'Absent'}
          </p>
          <LfsNotice label="Before" value={data.before.lfs} />
          <LfsNotice label="After" value={data.after.lfs} />
          {data.kind === 'lfs_unavailable' && (
            <p>
              File contents cannot be compared until the LFS payloads are
              available.
            </p>
          )}
          {data.kind === 'text' && (
            <React.Fragment>
              {!target.history && (
                <Row>
                  <button
                    disabled={busy || !data.can_select}
                    onClick={() => toggle(all, true)}
                  >
                    Select all changes
                  </button>
                  <button
                    disabled={busy || !selected.size}
                    onClick={() => setSelected(new Set())}
                  >
                    Clear selection
                  </button>
                  <button
                    disabled={busy || !selected.size || !data.can_select}
                    onClick={() => void apply()}
                  >
                    {target.staged ? 'Unstage' : 'Stage'} selected lines (
                    {selected.size})
                  </button>
                  {!target.staged && services.onDiscard && (
                    <button
                      disabled={busy || !selected.size || !data.can_select}
                      onClick={() =>
                        services.onDiscard?.(
                          target.path,
                          target.name,
                          target.root,
                          {
                            basis: data.basis,
                            lines: Array.from(selected).sort((a, b) => a - b),
                          }
                        )
                      }
                    >
                      Discard selected lines…
                    </button>
                  )}
                </Row>
              )}
              {!data.can_select && !target.history && (
                <p>
                  No selectable content changes. Use whole-file staging for
                  modes or configured clean filters.
                </p>
              )}
              <div className="diff-hunks">
                {data.hunks.map((hunk, index) => {
                  const lines = hunk.lines.filter(changed)
                  const header = new DiffHunkHeader(
                    hunk.old_start,
                    hunk.old_count,
                    hunk.new_start,
                    hunk.new_count
                  )
                  return (
                    <div className="diff-hunk" key={index}>
                      <label className="diff-hunk-header">
                        <input
                          type="checkbox"
                          aria-label={`Select hunk ${index + 1}`}
                          disabled={busy || !data.can_select}
                          checked={
                            lines.length > 0 &&
                            lines.every(line => selected.has(line.id))
                          }
                          onChange={event =>
                            toggle(lines, event.currentTarget.checked)
                          }
                        />
                        {header.toDiffLineRepresentation()}
                      </label>
                      {hunk.lines.map(line => {
                        const displayed = model(line)
                        return (
                          <div
                            className={`diff-line diff-${line.kind}`}
                            key={line.id}
                          >
                            {displayed.isIncludeableLine() ? (
                              <input
                                type="checkbox"
                                aria-label={`Select line ${line.id}`}
                                disabled={busy || !data.can_select}
                                checked={selected.has(line.id)}
                                onChange={event =>
                                  toggle([line], event.currentTarget.checked)
                                }
                              />
                            ) : (
                              <span />
                            )}
                            <span className="line-number">{line.old_line}</span>
                            <span className="line-number">{line.new_line}</span>
                            <code>
                              {displayed.text}
                              {displayed.noTrailingNewLine && (
                                <small> ⟪No newline at end of file⟫</small>
                              )}
                            </code>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </React.Fragment>
          )}
          {data.kind === 'image' && (
            <ImageComparison
              key={data.basis}
              before={data.before}
              after={data.after}
            />
          )}
          {data.kind === 'binary' && (
            <p>Binary content changed. Use whole-file staging.</p>
          )}
          {data.kind === 'too_large' && (
            <p>
              This file exceeds the current diff preview limit. Use the CLI or
              whole-file staging.
            </p>
          )}
          {data.kind === 'symlink' && (
            <pre>
              {data.before.text || 'Absent'} → {data.after.text || 'Absent'}
            </pre>
          )}
          {data.kind === 'submodule' && (
            <pre>
              Gitlink: {data.before.oid || 'Absent'} →{' '}
              {data.after.oid || 'Absent'}
            </pre>
          )}
        </React.Fragment>
      )}
    </section>
  )
}

/** Mount a browser/native-webview diff surface using shared upstream models. */
export function mountDiff(container: HTMLElement, services: IServices) {
  let target: ITarget | null = null
  let revision = 0
  function render() {
    ReactDOM.render(
      <DiffPanel target={target} services={services} />,
      container
    )
  }
  render()
  return {
    showCommit(
      path: GitPath,
      commit: string,
      parent: number,
      name: string,
      root: string
    ) {
      target = {
        path,
        history: { commit, parent },
        staged: false,
        name,
        root,
        revision: ++revision,
      }
      render()
    },
    showFile(path: GitPath, staged: boolean, name: string, root: string) {
      target = { path, staged, name, root, revision: ++revision }
      render()
    },
    setRepository(root: string | null) {
      if (target && target.root !== root) {
        target = null
        render()
      }
    },
    clear() {
      target = null
      render()
    },
    dispose() {
      ReactDOM.unmountComponentAtNode(container)
    },
  }
}
