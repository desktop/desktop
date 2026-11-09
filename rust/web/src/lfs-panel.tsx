import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Row } from './upstream/row'

type GitPath = string | { bytes: number[] }
interface IFile {
  readonly path: GitPath
  readonly display_path: string
}
interface IPattern {
  readonly pattern: string
  readonly source: string
  readonly tracked: boolean
  readonly lockable: boolean
}
interface IStatus {
  readonly available: boolean
  readonly version: string | null
  readonly using_lfs: boolean | null
  readonly patterns: IPattern[]
  readonly files: { readonly display_path: string; readonly tracked: boolean }[]
  readonly hint?: string
}
interface IServices {
  readonly request: (
    method: string,
    parameters: Record<string, unknown>
  ) => Promise<unknown>
  readonly onChanged: () => Promise<void>
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function status(value: unknown): value is IStatus {
  return (
    record(value) &&
    typeof value.available === 'boolean' &&
    (value.version === null || typeof value.version === 'string') &&
    (value.using_lfs === null || typeof value.using_lfs === 'boolean') &&
    Array.isArray(value.patterns) &&
    value.patterns.every(
      item =>
        record(item) &&
        typeof item.pattern === 'string' &&
        typeof item.source === 'string' &&
        typeof item.tracked === 'boolean' &&
        typeof item.lockable === 'boolean'
    ) &&
    Array.isArray(value.files) &&
    value.files.every(
      item =>
        record(item) &&
        typeof item.display_path === 'string' &&
        typeof item.tracked === 'boolean'
    ) &&
    (value.hint === undefined || typeof value.hint === 'string')
  )
}
function LfsPanel({
  root,
  files,
  services,
}: {
  readonly root: string | null
  readonly files: readonly IFile[]
  readonly services: IServices
}) {
  const [result, setResult] = React.useState<IStatus | null>(null)
  const [message, setMessage] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [scope, setScope] = React.useState('local')
  const [force, setForce] = React.useState(false)
  const [skipRepo, setSkipRepo] = React.useState(false)
  const [skipSmudge, setSkipSmudge] = React.useState(false)
  const [action, setAction] = React.useState('fetch')
  const [remote, setRemote] = React.useState('origin')
  const [refs, setRefs] = React.useState('')
  const [include, setInclude] = React.useState('')
  const [exclude, setExclude] = React.useState('')
  const [all, setAll] = React.useState(false)
  const [recent, setRecent] = React.useState(false)
  const [refetch, setRefetch] = React.useState(false)
  const [dryRun, setDryRun] = React.useState(false)
  const [checkout, setCheckout] = React.useState('')
  const [patterns, setPatterns] = React.useState('')
  const [filename, setFilename] = React.useState(false)
  const [lockable, setLockable] = React.useState('keep')

  const generation = React.useRef(0)
  React.useLayoutEffect(() => {
    ++generation.current
    setResult(null)
    setMessage('')
    setBusy(false)
    setScope(root ? 'local' : 'global')
    setForce(false)
    setSkipRepo(!root)
    setSkipSmudge(false)
    setAction('fetch')
    setRemote('origin')
    setRefs('')
    setInclude('')
    setExclude('')
    setAll(false)
    setRecent(false)
    setRefetch(false)
    setDryRun(false)
    setCheckout('')
    setPatterns('')
    setFilename(false)
    setLockable('keep')
    return () => {
      ++generation.current
    }
  }, [root])
  async function inspect(current: number) {
    const value = await services.request('lfs_status', {
      paths: files.slice(0, 1000).map(file => file.path),
      repository_id: root,
    })
    if (current !== generation.current) return
    if (!status(value)) throw new Error('Invalid Git LFS response')
    setResult(value)
  }
  function lines(value: string, trim = false) {
    return value
      .split('\n')
      .map(value => (trim ? value.trim() : value))
      .filter(Boolean)
  }
  async function operate(method: string, parameters: Record<string, unknown>) {
    if (busy || (!root && method !== 'lfs_install')) return
    const current = ++generation.current
    setBusy(true)
    setMessage('Working…')
    let failure: unknown, response: unknown
    try {
      response = await services.request(method, {
        ...parameters,
        repository_id: root,
      })
      if (!record(response) || response.code !== 0)
        throw new Error(
          record(response) && typeof response.stderr === 'string'
            ? response.stderr
            : 'Git LFS operation failed'
        )
    } catch (error) {
      failure = error
    }
    if (current !== generation.current) return
    try {
      await services.onChanged()
      if (current === generation.current) await inspect(current)
    } catch (error) {
      if (failure === undefined) failure = error
    }
    if (current !== generation.current) return
    setMessage(
      failure !== undefined
        ? failure instanceof Error
          ? failure.message
          : String(failure)
        : record(response) &&
          typeof response.stdout === 'string' &&
          response.stdout
        ? response.stdout
        : 'Git LFS operation completed'
    )
    setBusy(false)
  }
  async function run(install: boolean) {
    if (busy) return
    if (install)
      return operate('lfs_install', {
        scope,
        force,
        skip_repo: !root || skipRepo,
        skip_smudge: skipSmudge,
      })
    const current = ++generation.current
    setBusy(true)
    setMessage('')
    try {
      await inspect(current)
    } catch (error) {
      if (current === generation.current)
        setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }
  function transfer() {
    const request: Record<string, unknown> = { action, remote }
    if (action !== 'pull')
      Object.assign(request, { refs: lines(refs, true), all, dry_run: dryRun })
    if (action !== 'push')
      Object.assign(request, {
        include: action === 'fetch' && all ? null : include || null,
        exclude: action === 'fetch' && all ? null : exclude || null,
      })
    if (action === 'fetch')
      Object.assign(request, { recent: !all && recent, refetch })
    return operate('lfs_transfer', { request })
  }
  return (
    <section className="management">
      <details>
        <summary>Git LFS</summary>
        <p>
          Inspect tracking rules and changed files. Setup configures the
          installed Git LFS tool and pre-push hook.
        </p>
        <Row>
          <button disabled={busy} onClick={() => run(false)}>
            Inspect LFS
          </button>
          <label>
            Configuration{' '}
            <select
              aria-label="LFS configuration scope"
              disabled={busy}
              value={scope}
              onChange={event => setScope(event.currentTarget.value)}
            >
              <option value="local" disabled={!root}>
                This repository
              </option>
              <option value="global">Global Git configuration</option>
            </select>
          </label>
        </Row>
        <Row>
          <label>
            <input
              type="checkbox"
              disabled={busy || !root}
              checked={skipRepo}
              onChange={event => setSkipRepo(event.currentTarget.checked)}
            />
            Skip repository hooks
          </label>
          <label>
            <input
              type="checkbox"
              disabled={busy}
              checked={skipSmudge}
              onChange={event => setSkipSmudge(event.currentTarget.checked)}
            />
            Skip automatic downloads
          </label>
          <label>
            <input
              type="checkbox"
              disabled={busy}
              checked={force}
              onChange={event => setForce(event.currentTarget.checked)}
            />
            Replace existing LFS filters and hook
          </label>
          <button
            disabled={busy || (!root && scope !== 'global')}
            onClick={() => run(true)}
          >
            Install LFS configuration
          </button>
        </Row>
        {!root && (
          <p>
            Global filter setup is available before opening a repository.
            Repository hooks are skipped.
          </p>
        )}
        <details>
          <summary>LFS transfers and checkout</summary>
          <Row>
            <label>
              Action{' '}
              <select
                aria-label="LFS transfer action"
                disabled={!root || busy}
                value={action}
                onChange={event => setAction(event.currentTarget.value)}
              >
                <option value="fetch">Fetch objects</option>
                <option value="pull">Download and update files</option>
                <option value="push">Upload objects</option>
              </select>
            </label>
            <label>
              Remote{' '}
              <input
                aria-label="LFS remote"
                disabled={!root || busy}
                value={remote}
                onChange={event => setRemote(event.currentTarget.value)}
              />
            </label>
          </Row>
          {action !== 'pull' && (
            <label>
              Refs, one per line (empty uses HEAD; with All, empty uses all
              refs)
              <textarea
                aria-label="LFS refs"
                disabled={!root || busy}
                value={refs}
                onChange={event => setRefs(event.currentTarget.value)}
              />
            </label>
          )}
          {action !== 'push' && !(action === 'fetch' && all) && (
            <Row>
              <label>
                Include globs (comma-separated)
                <input
                  aria-label="LFS include"
                  disabled={!root || busy}
                  value={include}
                  onChange={event => setInclude(event.currentTarget.value)}
                />
              </label>
              <label>
                Exclude globs (comma-separated)
                <input
                  aria-label="LFS exclude"
                  disabled={!root || busy}
                  value={exclude}
                  onChange={event => setExclude(event.currentTarget.value)}
                />
              </label>
            </Row>
          )}
          {action !== 'pull' && (
            <Row>
              <label>
                <input
                  type="checkbox"
                  disabled={!root || busy}
                  checked={all}
                  onChange={event => setAll(event.currentTarget.checked)}
                />
                All reachable objects
              </label>
              <label>
                <input
                  type="checkbox"
                  disabled={!root || busy}
                  checked={dryRun}
                  onChange={event => setDryRun(event.currentTarget.checked)}
                />
                Dry run
              </label>
            </Row>
          )}
          {action === 'fetch' && (
            <Row>
              {!all && (
                <label>
                  <input
                    type="checkbox"
                    disabled={!root || busy}
                    checked={recent}
                    onChange={event => setRecent(event.currentTarget.checked)}
                  />
                  Also fetch recent refs
                </label>
              )}
              <label>
                <input
                  type="checkbox"
                  disabled={!root || busy}
                  checked={refetch}
                  onChange={event => setRefetch(event.currentTarget.checked)}
                />
                Refetch cached objects
              </label>
            </Row>
          )}
          <p>
            {action === 'fetch'
              ? 'Fetch downloads objects without changing working files.'
              : action === 'push'
              ? 'Upload sends LFS objects to the remote without pushing Git refs.'
              : 'Download updates missing files and matching pointer placeholders. Modified files are preserved.'}
          </p>
          <button
            disabled={!root || busy || !remote.trim()}
            onClick={() => transfer()}
          >
            {action === 'fetch'
              ? 'Fetch LFS objects'
              : action === 'pull'
              ? 'Download and update LFS files'
              : 'Upload LFS objects'}
          </button>
          <label>
            Checkout globs, one per line (empty selects all indexed LFS files)
            <textarea
              aria-label="LFS checkout patterns"
              disabled={!root || busy}
              value={checkout}
              onChange={event => setCheckout(event.currentTarget.value)}
            />
          </label>
          <button
            disabled={!root || busy}
            onClick={() =>
              operate('lfs_checkout', { patterns: lines(checkout) })
            }
          >
            Populate cached LFS files
          </button>
          <p>
            Cached checkout does not download objects or replace modified files.
          </p>
        </details>
        <details>
          <summary>LFS tracking rules</summary>
          <label>
            Patterns, one per line
            <textarea
              aria-label="LFS tracking patterns"
              disabled={!root || busy}
              value={patterns}
              onChange={event => setPatterns(event.currentTarget.value)}
            />
          </label>
          <Row>
            <label>
              <input
                type="checkbox"
                disabled={!root || busy}
                checked={filename}
                onChange={event => setFilename(event.currentTarget.checked)}
              />
              Treat as literal filenames
            </label>
            <label>
              Lockable rule{' '}
              <select
                aria-label="LFS lockable rule"
                disabled={!root || busy}
                value={lockable}
                onChange={event => setLockable(event.currentTarget.value)}
              >
                <option value="keep">Keep current setting</option>
                <option value="true">Lockable (read-only until locked)</option>
                <option value="false">Not lockable</option>
              </select>
            </label>
          </Row>
          <Row>
            <button
              disabled={!root || busy || !lines(patterns).length}
              onClick={() =>
                operate('lfs_track', {
                  patterns: lines(patterns),
                  filename,
                  lockable: lockable === 'keep' ? null : lockable === 'true',
                })
              }
            >
              Track LFS patterns
            </button>
            <button
              disabled={!root || busy || !lines(patterns).length}
              onClick={() =>
                operate('lfs_untrack', { patterns: lines(patterns) })
              }
            >
              Untrack LFS patterns
            </button>
          </Row>
          <p>
            These actions edit .gitattributes. Stage and commit the rules
            separately; existing Git history is preserved.
          </p>
        </details>
        {message && <p role="status">{message}</p>}
        {result && (
          <div>
            <p>
              {result.available
                ? result.version
                : result.hint || 'Install git-lfs and add it to PATH.'}
            </p>
            <p>
              {!root
                ? 'Open a repository to inspect tracking rules.'
                : result.using_lfs === null
                ? 'Tracking rules unavailable'
                : result.using_lfs
                ? 'This repository uses LFS tracking rules.'
                : 'No LFS tracking rules found.'}
            </p>
            <ul>
              {result.patterns.map((pattern, index) => (
                <li key={index}>
                  {pattern.pattern} ({pattern.source})
                  {pattern.tracked ? '' : ' — excluded'}
                  {pattern.lockable ? ' — lockable' : ''}
                </li>
              ))}
            </ul>
            <ul>
              {result.files.map((file, index) => (
                <li key={index}>
                  {file.display_path}:{' '}
                  {file.tracked ? 'Git LFS' : 'regular Git'}
                </li>
              ))}
            </ul>
            {files.length > 1000 && (
              <p>Showing the first 1000 changed files.</p>
            )}
          </div>
        )}
      </details>
    </section>
  )
}

/** Mount repository-scoped LFS inspection and explicit filter/hook setup. */
export function mountLfs(element: Element, services: IServices) {
  let root: string | null = null
  let files: readonly IFile[] = []
  const render = () =>
    ReactDOM.render(
      <LfsPanel root={root} files={files} services={services} />,
      element
    )
  render()
  return {
    setSnapshot(next: { root: string; files: readonly IFile[] } | null) {
      root = next?.root || null
      files = next?.files || []
      render()
    },
    dispose() {
      ReactDOM.unmountComponentAtNode(element)
    },
  }
}
