import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Row } from './upstream/row'

interface IServices {
  readonly request: (
    method: string,
    parameters: Record<string, unknown>
  ) => Promise<unknown>
  readonly onChanged: () => Promise<void>
}
interface IFailure {
  readonly message: string
}
type GlobalState = 'checking' | 'ready' | 'unavailable' | IFailure
type RepositoryState =
  | { readonly kind: 'checking' | 'prompt' | 'done' }
  | { readonly kind: 'error' | 'inspection_error'; readonly message: string }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
function installed(value: unknown) {
  if (!record(value) || value.code !== 0)
    throw new Error(
      record(value) && typeof value.stderr === 'string'
        ? value.stderr
        : 'Git LFS setup failed'
    )
}
const globalOptions = {
  scope: 'global',
  skip_repo: true,
  skip_smudge: false,
  repository_id: null,
}

function Initialization({
  root,
  services,
}: {
  readonly root: string | null
  readonly services: IServices
}) {
  const [globalState, setGlobalState] = React.useState<GlobalState>('checking')
  const [globalBusy, setGlobalBusy] = React.useState(false)
  const [repositoryState, setRepositoryState] = React.useState<RepositoryState>(
    {
      kind: 'checking',
    }
  )
  const [repositoryBusy, setRepositoryBusy] = React.useState(false)
  const globalGeneration = React.useRef(0),
    repositoryGeneration = React.useRef(0)
  const completed = React.useRef(new Set<string>())

  async function setupGlobal(force: boolean, current: number) {
    setGlobalBusy(true)
    try {
      installed(
        await services.request('lfs_install', { ...globalOptions, force })
      )
      if (current !== globalGeneration.current) return
      setGlobalState('ready')
    } catch (error) {
      if (current !== globalGeneration.current) return
      setGlobalState({ message: errorText(error) })
    } finally {
      if (current === globalGeneration.current) setGlobalBusy(false)
    }
  }
  React.useLayoutEffect(() => {
    const current = ++globalGeneration.current
    async function start() {
      try {
        const value = await services.request('lfs_tool_status', {})
        if (current !== globalGeneration.current) return
        if (!record(value) || typeof value.available !== 'boolean')
          throw new Error('Invalid Git LFS status response')
        if (!value.available) {
          setGlobalState('unavailable')
          return
        }
        // Match the legacy application startup: initialize global filters
        // without replacing existing values or touching repository hooks.
        await setupGlobal(false, current)
      } catch (error) {
        if (current === globalGeneration.current)
          setGlobalState({ message: errorText(error) })
      }
    }
    void start()
    return () => {
      ++globalGeneration.current
    }
  }, [])

  async function inspectRepository(current: number) {
    if (!root || completed.current.has(root)) {
      setRepositoryState({ kind: 'done' })
      return
    }
    try {
      const value = await services.request('lfs_status', {
        paths: [],
        repository_id: root,
      })
      if (current !== repositoryGeneration.current) return
      if (!record(value) || typeof value.available !== 'boolean')
        throw new Error('Invalid Git LFS status response')
      setRepositoryState({
        kind: value.available && value.using_lfs === true ? 'prompt' : 'done',
      })
    } catch (error) {
      if (current === repositoryGeneration.current)
        setRepositoryState({
          kind: 'inspection_error',
          message: errorText(error),
        })
    }
  }
  React.useLayoutEffect(() => {
    const current = ++repositoryGeneration.current
    setRepositoryBusy(false)
    setRepositoryState({ kind: 'checking' })
    void inspectRepository(current)
    return () => {
      ++repositoryGeneration.current
    }
  }, [root])

  async function setupRepository(force: boolean) {
    if (!root || repositoryBusy) return
    const current = ++repositoryGeneration.current
    setRepositoryBusy(true)
    let failure: unknown
    try {
      installed(
        await services.request('lfs_install', {
          scope: 'global',
          force,
          skip_repo: false,
          skip_smudge: false,
          repository_id: root,
        })
      )
    } catch (error) {
      failure = error
    }
    if (current !== repositoryGeneration.current) return
    // LFS may have written some filters or hooks before reporting a failure.
    try {
      await services.onChanged()
    } catch (error) {
      if (failure === undefined) failure = error
    }
    if (current !== repositoryGeneration.current) return
    if (failure === undefined) {
      completed.current.add(root)
      setRepositoryState({ kind: 'done' })
    } else {
      setRepositoryState({ kind: 'error', message: errorText(failure) })
    }
    setRepositoryBusy(false)
  }
  function dismissRepository() {
    if (root) completed.current.add(root)
    setRepositoryState({ kind: 'done' })
  }
  return (
    <div className="lfs-initialization">
      {typeof globalState === 'object' && (
        <section role="alert" aria-label="Git LFS global setup">
          <h2>Git LFS filter setup needs attention</h2>
          <p>{globalState.message}</p>
          <p>
            Startup setup preserves conflicting filter values. Review your
            global Git configuration before choosing to replace them.
          </p>
          <Row>
            <button
              disabled={globalBusy}
              onClick={() => {
                if (!globalBusy)
                  void setupGlobal(false, ++globalGeneration.current)
              }}
            >
              Retry LFS filter setup
            </button>
            <button
              disabled={globalBusy}
              onClick={() => {
                if (!globalBusy)
                  void setupGlobal(true, ++globalGeneration.current)
              }}
            >
              Replace global LFS filters
            </button>
            <button
              disabled={globalBusy}
              onClick={() => setGlobalState('ready')}
            >
              Not now
            </button>
          </Row>
        </section>
      )}
      {root && repositoryState.kind === 'inspection_error' && (
        <section role="alert" aria-label="Git LFS inspection failed">
          <h2>Could not inspect Git LFS</h2>
          <p>{repositoryState.message}</p>
          <Row>
            <button
              onClick={() => {
                const current = ++repositoryGeneration.current
                setRepositoryState({ kind: 'checking' })
                void inspectRepository(current)
              }}
            >
              Retry repository LFS inspection
            </button>
            <button onClick={dismissRepository}>Not now</button>
          </Row>
        </section>
      )}
      {root &&
        (repositoryState.kind === 'prompt' ||
          repositoryState.kind === 'error') && (
          <section role="alert" aria-label="Initialize repository Git LFS">
            <h2>Initialize Git LFS</h2>
            <p>
              This repository uses Git LFS. Initialize its hooks and global
              filters to work with LFS files. Existing custom hooks are
              preserved unless you choose to replace them.
            </p>
            {repositoryState.kind === 'error' && (
              <p>{repositoryState.message}</p>
            )}
            <Row>
              <button
                disabled={repositoryBusy}
                onClick={() => void setupRepository(false)}
              >
                Initialize repository LFS
              </button>
              {repositoryState.kind === 'error' && (
                <button
                  disabled={repositoryBusy}
                  onClick={() => void setupRepository(true)}
                >
                  Replace existing LFS filters and hooks
                </button>
              )}
              <button disabled={repositoryBusy} onClick={dismissRepository}>
                Not now
              </button>
            </Row>
          </section>
        )}
    </div>
  )
}

/** Run non-forcing startup setup and offer repository initialization/recovery. */
export function mountLfsInitialization(element: Element, services: IServices) {
  let root: string | null = null
  const render = () =>
    ReactDOM.render(<Initialization root={root} services={services} />, element)
  render()
  return {
    setRepository(next: string | null) {
      if (root === next) return
      root = next
      render()
    },
    dispose() {
      ReactDOM.unmountComponentAtNode(element)
    },
  }
}
