import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Row } from './upstream/row'
import { CommitAttribution } from './upstream/commit-attribution'
import { Commit } from './upstream/models/commit'
import { CommitIdentity } from './upstream/models/commit-identity'

type GitPath = string | { bytes: number[] }
interface IIdentity {
  name: string
  email: string
  timestamp: number
  timezone: string
}
interface ICommit {
  oid: string
  summary: string
  message: string
  parents: string[]
  author: IIdentity
  committer: IIdentity
  trailers: { token: string; value: string }[]
}
interface IFile {
  path: GitPath
  display_path: string
  status: string
}
interface IServices {
  request: (
    method: string,
    parameters: Record<string, unknown>
  ) => Promise<unknown>
  onChanged: () => Promise<void>
  onDiff: (path: GitPath, commit: string, parent: number, name: string) => void
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function identity(value: unknown): value is IIdentity {
  return (
    record(value) &&
    typeof value.name === 'string' &&
    typeof value.email === 'string' &&
    typeof value.timestamp === 'number' &&
    typeof value.timezone === 'string'
  )
}
function commit(value: unknown): value is ICommit {
  return (
    record(value) &&
    typeof value.oid === 'string' &&
    typeof value.summary === 'string' &&
    typeof value.message === 'string' &&
    Array.isArray(value.parents) &&
    value.parents.every(value => typeof value === 'string') &&
    identity(value.author) &&
    identity(value.committer) &&
    Array.isArray(value.trailers) &&
    value.trailers.every(
      value =>
        record(value) &&
        typeof value.token === 'string' &&
        typeof value.value === 'string'
    )
  )
}
function file(value: unknown): value is IFile {
  return (
    record(value) &&
    typeof value.display_path === 'string' &&
    typeof value.status === 'string' &&
    (typeof value.path === 'string' ||
      (record(value.path) &&
        Array.isArray(value.path.bytes) &&
        value.path.bytes.every(
          value => Number.isInteger(value) && value >= 0 && value < 256
        )))
  )
}
function ident(value: IIdentity) {
  const sign = value.timezone.startsWith('-') ? -1 : 1
  const offset =
    sign *
    (Number(value.timezone.slice(1, 3)) * 60 +
      Number(value.timezone.slice(3, 5)))
  return new CommitIdentity(
    value.name,
    value.email,
    new Date(value.timestamp * 1000),
    offset
  )
}
function model(value: ICommit) {
  return new Commit(
    value.oid,
    value.oid.slice(0, 7),
    value.summary,
    value.message.includes('\n')
      ? value.message.slice(value.message.indexOf('\n') + 1)
      : '',
    ident(value.author),
    ident(value.committer),
    value.parents,
    value.trailers,
    []
  )
}

function HistoryPanel({
  root,
  services,
}: {
  readonly root: string | null
  readonly services: IServices
}) {
  const [commits, setCommits] = React.useState<ICommit[]>([]),
    [selected, setSelected] = React.useState<ICommit | null>(null),
    [files, setFiles] = React.useState<IFile[]>([])
  const [revision, setRevision] = React.useState<string | null>(null),
    [next, setNext] = React.useState<number | null>(null),
    [offset, setOffset] = React.useState(0),
    [parent, setParent] = React.useState(0)
  const [busy, setBusy] = React.useState(false),
    [message, setMessage] = React.useState(''),
    [filter, setFilter] = React.useState('')
  const epoch = React.useRef(0),
    running = React.useRef<number | null>(null)
  async function run(task: () => Promise<void>) {
    const generation = epoch.current
    if (running.current === generation) return
    running.current = generation
    setBusy(true)
    try {
      await task()
    } catch (error) {
      if (generation === epoch.current)
        setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      if (running.current === generation) running.current = null
      if (generation === epoch.current) setBusy(false)
    }
  }
  async function load(at: number, pinned: string | null) {
    const generation = epoch.current
    const result = await services.request('history', {
      revision: pinned,
      offset: at,
      limit: 30,
    })
    if (generation !== epoch.current) return
    if (
      !record(result) ||
      !Array.isArray(result.commits) ||
      !result.commits.every(commit) ||
      (result.revision !== null && typeof result.revision !== 'string') ||
      (result.next_offset !== null && typeof result.next_offset !== 'number')
    )
      throw new Error('Invalid history response')
    setCommits(result.commits)
    setRevision(result.revision)
    setNext(result.next_offset)
    setOffset(at)
    setSelected(null)
    setFiles([])
    setMessage(result.commits.length ? '' : 'No commits')
  }
  React.useLayoutEffect(() => {
    epoch.current++
    setCommits([])
    setSelected(null)
    setFiles([])
    setRevision(null)
    setOffset(0)
    setNext(null)
    setMessage('')
    setFilter('')
    setBusy(false)
    if (root) void run(() => load(0, null))
    return () => {
      epoch.current++
    }
  }, [root])
  async function choose(value: ICommit, parentIndex = 0) {
    const generation = epoch.current
    const result = await services.request('commit_files', {
      commit: value.oid,
      parent: parentIndex,
    })
    if (generation !== epoch.current) return
    if (
      !record(result) ||
      !Array.isArray(result.files) ||
      !result.files.every(file)
    )
      throw new Error('Invalid commit file response')
    setSelected(value)
    setParent(parentIndex)
    setFiles(result.files)
  }
  async function mutate(method: string) {
    if (!selected) return
    try {
      await services.request(method, {
        commit: selected.oid,
        ...((method === 'revert' || method === 'cherry_pick') &&
        selected.parents.length > 1
          ? { mainline: parent + 1 }
          : {}),
      })
      setMessage('Operation completed')
    } finally {
      await services.onChanged()
    }
  }
  if (!root) return null
  const current = selected ? model(selected) : null
  return (
    <section className="history-panel" aria-label="Commit history">
      <h2>History</h2>
      <Row>
        <button disabled={busy} onClick={() => void run(() => load(0, null))}>
          Refresh history
        </button>
        <button
          disabled={busy || offset === 0}
          onClick={() =>
            void run(() => load(Math.max(0, offset - 30), revision))
          }
        >
          Newer commits
        </button>
        <button
          disabled={busy || next === null}
          onClick={() => {
            if (next !== null) void run(() => load(next, revision))
          }}
        >
          Older commits
        </button>
      </Row>
      <p role="status">{message}</p>
      <label>
        Filter commits
        <input
          value={filter}
          onChange={event => setFilter(event.currentTarget.value)}
        />
      </label>
      <ol className="commit-list">
        {commits
          .filter(commit =>
            `${commit.summary} ${commit.author.name} ${commit.oid}`
              .toLowerCase()
              .includes(filter.toLowerCase())
          )
          .map(commit => (
            <li key={commit.oid}>
              <button
                disabled={busy}
                onClick={() => void run(() => choose(commit))}
              >
                {commit.oid.slice(0, 7)} {commit.summary}
              </button>
              <small>
                <CommitAttribution avatarUsers={[commit.author]} />{' '}
                {'<' + commit.author.email + '>'}
              </small>
            </li>
          ))}
      </ol>
      {current && selected && (
        <article>
          <h3>{current.summary}</h3>
          <p>
            {current.author.toString()} · {current.author.date.toLocaleString()}
          </p>
          <pre>{current.body}</pre>
          {current.coAuthors.length > 0 && (
            <p>
              Co-authors:{' '}
              {current.coAuthors.map(author => author.toString()).join(', ')}
            </p>
          )}
          <Row>
            <button
              disabled={busy}
              onClick={() => void run(() => mutate('revert'))}
            >
              Revert commit
            </button>
            <button
              disabled={busy}
              onClick={() => void run(() => mutate('cherry_pick'))}
            >
              Cherry-pick commit
            </button>
            <button
              disabled={busy}
              onClick={() => void run(() => mutate('detach'))}
            >
              Check out commit
            </button>
          </Row>
          {selected.parents.length > 1 && (
            <label>
              Compare parent
              <select
                value={parent}
                disabled={busy}
                onChange={event => {
                  const value = Number(event.currentTarget.value)
                  void run(() => choose(selected, value))
                }}
              >
                {selected.parents.map((oid, index) => (
                  <option value={index} key={oid}>
                    {index + 1}: {oid.slice(0, 7)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ul>
            {files.map((file, index) => (
              <li key={index}>
                <button
                  disabled={busy}
                  onClick={() =>
                    services.onDiff(
                      file.path,
                      selected.oid,
                      parent,
                      file.display_path
                    )
                  }
                >
                  {file.status} {file.display_path}
                </button>
              </li>
            ))}
          </ul>
        </article>
      )}
    </section>
  )
}

/** History stays pinned until an explicit refresh or repository switch. */
export function mountHistory(container: HTMLElement, services: IServices) {
  let root: string | null = null
  function render() {
    ReactDOM.render(<HistoryPanel root={root} services={services} />, container)
  }
  render()
  return {
    show(value: string) {
      root = value
      render()
    },
    clear() {
      root = null
      render()
    },
    setRepository(value: string | null) {
      if (root && root !== value) {
        root = null
        render()
      }
    },
    dispose() {
      ReactDOM.unmountComponentAtNode(container)
    },
  }
}
