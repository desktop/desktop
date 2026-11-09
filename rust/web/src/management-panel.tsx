import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Form } from './upstream/form'
import { RepositoryContext } from './repository-context'
import { RepositoryAccount } from './repository-account'
import { PublishRepository } from './publish-repository'
import {
  EditorSettings,
  ExternalEditor,
  externalEditor,
} from './editor-settings'
import { Row } from './upstream/row'
import { getWorktreeAriaLabel } from './upstream/models/worktree'

type GitPath = string | { bytes: number[] }
interface IPreferences {
  version: number
  theme: string
  poll_interval_ms: number
  external_editor?: ExternalEditor
}
interface IWorktree {
  path: GitPath
  display_path: string
  head: string
  branch: string | null
  detached: boolean
  locked: string | null
  prunable: string | null
  main: boolean
  bare: boolean
}
interface ISubmodule {
  path: GitPath
  display_path: string
  initialized: boolean
  changed: boolean
  dirty: boolean
}
interface IServices {
  request: (
    method: string,
    parameters: Record<string, unknown>
  ) => Promise<unknown>
  onChanged: () => Promise<void>
  onPreferences: (preferences: IPreferences) => void
  openWorktree: (path: GitPath) => Promise<void>
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
        value => Number.isInteger(value) && value >= 0 && value < 256
      ))
  )
}
function preferences(value: unknown): value is IPreferences {
  return (
    record(value) &&
    value.version === 1 &&
    ['system', 'light', 'dark'].includes(String(value.theme)) &&
    typeof value.poll_interval_ms === 'number' &&
    (value.external_editor === undefined ||
      externalEditor(value.external_editor))
  )
}
function worktree(value: unknown): value is IWorktree {
  return (
    record(value) &&
    path(value.path) &&
    typeof value.display_path === 'string' &&
    typeof value.head === 'string' &&
    (value.branch === null || typeof value.branch === 'string') &&
    typeof value.detached === 'boolean' &&
    typeof value.main === 'boolean' &&
    (value.locked === null || typeof value.locked === 'string') &&
    (value.prunable === null || typeof value.prunable === 'string') &&
    typeof value.bare === 'boolean'
  )
}
function submodule(value: unknown): value is ISubmodule {
  return (
    record(value) &&
    path(value.path) &&
    typeof value.display_path === 'string' &&
    typeof value.initialized === 'boolean' &&
    typeof value.changed === 'boolean' &&
    typeof value.dirty === 'boolean'
  )
}

function ManagementPanel({
  root,
  accountBasis,
  services,
  stored,
}: {
  readonly root: string | null
  readonly accountBasis?: string
  readonly services: IServices
  readonly stored: IPreferences | null
}) {
  const [busy, setBusy] = React.useState(false),
    [message, setMessage] = React.useState(''),
    [theme, setTheme] = React.useState('system'),
    [interval, setInterval] = React.useState(2000)
  const [global, setGlobal] = React.useState(false),
    [key, setKey] = React.useState('user.name'),
    [value, setValue] = React.useState(''),
    [settings, setSettings] = React.useState<Record<string, unknown> | null>(
      null
    )
  const [trees, setTrees] = React.useState<IWorktree[]>([]),
    [modules, setModules] = React.useState<ISubmodule[]>([])
  const [destination, setDestination] = React.useState(''),
    [branch, setBranch] = React.useState(''),
    [moveTo, setMoveTo] = React.useState(''),
    [url, setUrl] = React.useState(''),
    [modulePath, setModulePath] = React.useState('')
  const [createBranch, setCreateBranch] = React.useState(true),
    [start, setStart] = React.useState('')
  const epoch = React.useRef(0),
    running = React.useRef<number | null>(null)
  React.useLayoutEffect(() => {
    epoch.current++
    setTrees([])
    setModules([])
    setSettings(null)
    setMessage('')
    setBusy(false)
    return () => {
      epoch.current++
    }
  }, [root])
  React.useLayoutEffect(() => {
    if (stored) {
      setTheme(stored.theme)
      setInterval(stored.poll_interval_ms)
    }
  }, [stored])
  async function run(task: (generation: number) => Promise<void>) {
    const generation = epoch.current
    if (running.current === generation) return
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
  async function loadPreferences(generation: number) {
    const result = await services.request('get_preferences', {})
    if (generation !== epoch.current) return
    if (!preferences(result)) throw new Error('Invalid preferences response')
    setTheme(result.theme)
    setInterval(result.poll_interval_ms)
    services.onPreferences(result)
  }
  React.useEffect(() => {
    void run(loadPreferences)
  }, [])
  async function loadTrees(generation: number) {
    const result = await services.request('worktrees', {})
    if (generation !== epoch.current) return
    if (!Array.isArray(result) || !result.every(worktree))
      throw new Error('Invalid worktree response')
    setTrees(result)
  }
  async function loadModules(generation: number) {
    const result = await services.request('submodules', {})
    if (generation !== epoch.current) return
    if (!Array.isArray(result) || !result.every(submodule))
      throw new Error('Invalid submodule response')
    setModules(result)
  }
  async function mutate(
    method: string,
    parameters: Record<string, unknown>,
    generation: number,
    refresh: 'trees' | 'modules'
  ) {
    await services.request(method, parameters)
    await services.onChanged()
    if (generation !== epoch.current) return
    if (refresh === 'trees') await loadTrees(generation)
    else await loadModules(generation)
    setMessage('Operation completed')
  }
  async function readSettings(generation: number) {
    const result = await services.request('git_settings', {
      scope: global ? 'global' : 'local',
    })
    if (generation !== epoch.current) return
    if (!record(result) || !record(result.values))
      throw new Error('Invalid Git settings response')
    setSettings(result.values)
  }
  return (
    <section
      className="management-panel"
      aria-label="Settings and repository management"
    >
      <h2>Settings and repository management</h2>
      <EditorSettings
        configuration={stored?.external_editor}
        root={root}
        request={services.request}
        onSave={async editor => {
          const result = await services.request('update_preferences', {
            preferences: { external_editor: editor },
          })
          if (!preferences(result))
            throw new Error('Invalid preferences response')
          services.onPreferences(result)
        }}
      />

      <p role="status">{message}</p>
      <details>
        <summary>Appearance and refresh</summary>
        <Form
          onSubmit={() =>
            void run(async generation => {
              const result = await services.request('update_preferences', {
                preferences: { theme, poll_interval_ms: interval },
              })
              if (generation !== epoch.current) return
              if (!preferences(result))
                throw new Error('Invalid preferences response')
              services.onPreferences(result)
              setMessage('Preferences saved')
            })
          }
        >
          <label>
            Theme
            <select
              value={theme}
              onChange={event => setTheme(event.currentTarget.value)}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label>
            Repository refresh interval (milliseconds)
            <input
              type="number"
              min="500"
              max="60000"
              value={interval}
              onChange={event => setInterval(Number(event.currentTarget.value))}
            />
          </label>
          <p className="muted">Lower intervals update more frequently.</p>
          <button disabled={busy}>Save preferences</button>
        </Form>
      </details>
      <details>
        <summary>Git identity and configuration</summary>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={global}
            onChange={event => {
              setGlobal(event.currentTarget.checked)
              setSettings(null)
            }}
          />
          Global scope
        </label>
        <p className="muted">
          Values shown belong to the selected scope. Unset repository values
          inherit Git's global configuration.
        </p>
        <button
          disabled={busy || (!root && !global)}
          onClick={() => void run(readSettings)}
        >
          Read Git settings
        </button>
        {settings && <pre>{JSON.stringify(settings, null, 2)}</pre>}
        <Form
          onSubmit={() =>
            void run(async generation => {
              await services.request('set_git_setting', {
                scope: global ? 'global' : 'local',
                key,
                value,
              })
              await readSettings(generation)
              setMessage('Git setting saved')
            })
          }
        >
          <label>
            Git setting
            <select
              value={key}
              onChange={event => setKey(event.currentTarget.value)}
            >
              {[
                'user.name',
                'user.email',
                'user.signingkey',
                'commit.gpgsign',
                'gpg.format',
                'init.defaultbranch',
                'core.autocrlf',
                'core.filemode',
                'fetch.prune',
                'pull.ff',
              ].map(key => (
                <option key={key}>{key}</option>
              ))}
            </select>
          </label>
          <label>
            Setting value
            <input
              value={value}
              onChange={event => setValue(event.currentTarget.value)}
              required={true}
            />
          </label>
          <button disabled={busy || (!root && !global)}>
            Save Git setting
          </button>
          <button
            type="button"
            disabled={busy || (!root && !global)}
            onClick={() =>
              void run(async generation => {
                await services.request('set_git_setting', {
                  scope: global ? 'global' : 'local',
                  key,
                  value: null,
                })
                await readSettings(generation)
              })
            }
          >
            Unset Git setting
          </button>
        </Form>
      </details>
      {root && (
        <React.Fragment>
          <RepositoryAccount
            root={root}
            accountBasis={accountBasis}
            busy={busy}
            onBusy={setBusy}
            request={services.request}
            onChanged={services.onChanged}
          />
          <PublishRepository
            root={root}
            accountBasis={accountBasis}
            busy={busy}
            onBusy={setBusy}
            request={services.request}
            onChanged={services.onChanged}
          />
          <RepositoryContext
            accountBasis={accountBasis}
            root={root}
            busy={busy}
            onBusy={setBusy}
            request={services.request}
            onChanged={services.onChanged}
          />
          <details>
            <summary>Working trees</summary>
            <button disabled={busy} onClick={() => void run(loadTrees)}>
              Refresh worktrees
            </button>
            <ul>
              {trees.map((tree, index) => {
                const label = getWorktreeAriaLabel({
                  path: tree.display_path,
                  head: tree.head,
                  branch: tree.branch,
                  isDetached: tree.detached,
                  isLocked: tree.locked !== null,
                  isPrunable: tree.prunable !== null,
                  type: tree.main ? 'main' : 'linked',
                })
                return (
                  <li key={index}>
                    <strong>{label}</strong>
                    <p>{tree.display_path}</p>
                    <Row>
                      <button
                        disabled={busy || tree.prunable !== null || tree.bare}
                        onClick={() =>
                          void run(async () => services.openWorktree(tree.path))
                        }
                      >
                        Open worktree
                      </button>
                      {!tree.main && (
                        <React.Fragment>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run(generation =>
                                mutate(
                                  'worktree_lock',
                                  {
                                    path: tree.path,
                                    locked: tree.locked === null,
                                    reason: 'Kept from Desktop',
                                  },
                                  generation,
                                  'trees'
                                )
                              )
                            }
                          >
                            {tree.locked === null
                              ? 'Lock worktree'
                              : 'Unlock worktree'}
                          </button>
                          <button
                            disabled={busy || tree.locked !== null}
                            onClick={() =>
                              void run(generation =>
                                mutate(
                                  'worktree_remove',
                                  { path: tree.path, force: false },
                                  generation,
                                  'trees'
                                )
                              )
                            }
                          >
                            Remove clean worktree
                          </button>
                          <button
                            disabled={busy || !moveTo || tree.locked !== null}
                            onClick={() =>
                              void run(generation =>
                                mutate(
                                  'worktree_move',
                                  { from: tree.path, to: moveTo },
                                  generation,
                                  'trees'
                                )
                              )
                            }
                          >
                            Move worktree
                          </button>
                        </React.Fragment>
                      )}
                    </Row>
                  </li>
                )
              })}
            </ul>
            <label>
              Move destination
              <input
                value={moveTo}
                onChange={event => setMoveTo(event.currentTarget.value)}
              />
            </label>
            <Form
              onSubmit={() =>
                void run(generation =>
                  mutate(
                    'worktree_add',
                    {
                      path: destination,
                      branch,
                      new_branch: createBranch,
                      ...(createBranch && start.trim()
                        ? { start: start.trim() }
                        : {}),
                    },
                    generation,
                    'trees'
                  )
                )
              }
            >
              <label>
                New worktree directory
                <input
                  value={destination}
                  onChange={event => setDestination(event.currentTarget.value)}
                  required={true}
                />
              </label>
              <label>
                Worktree branch
                <input
                  value={branch}
                  onChange={event => setBranch(event.currentTarget.value)}
                  required={true}
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={createBranch}
                  onChange={event =>
                    setCreateBranch(event.currentTarget.checked)
                  }
                />
                Create a new branch
              </label>
              {createBranch && (
                <label>
                  Starting revision (optional)
                  <input
                    value={start}
                    onChange={event => setStart(event.currentTarget.value)}
                  />
                </label>
              )}
              <button disabled={busy}>Create worktree</button>
            </Form>
          </details>
          <details>
            <summary>Submodules</summary>
            <Row>
              <button disabled={busy} onClick={() => void run(loadModules)}>
                Refresh submodules
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void run(generation =>
                    mutate(
                      'submodule_update',
                      { paths: [], recursive: true },
                      generation,
                      'modules'
                    )
                  )
                }
              >
                Initialize and update all
              </button>
            </Row>
            <ul>
              {modules.map((module, index) => (
                <li key={index}>
                  <strong>{module.display_path}</strong> ·{' '}
                  {module.initialized ? 'initialized' : 'not initialized'}{' '}
                  {module.dirty ? '· local changes' : ''}{' '}
                  {module.changed ? '· different commit' : ''}
                  <Row>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(generation =>
                          mutate(
                            'submodule_update',
                            { paths: [module.path], recursive: true },
                            generation,
                            'modules'
                          )
                        )
                      }
                    >
                      Update submodule
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(generation =>
                          mutate(
                            'submodule_sync',
                            { paths: [module.path], recursive: true },
                            generation,
                            'modules'
                          )
                        )
                      }
                    >
                      Sync URL
                    </button>
                    <button
                      disabled={busy || !module.initialized}
                      onClick={() =>
                        void run(generation =>
                          mutate(
                            'submodule_deinit',
                            { paths: [module.path], force: false },
                            generation,
                            'modules'
                          )
                        )
                      }
                    >
                      Deinitialize clean submodule
                    </button>
                  </Row>
                </li>
              ))}
            </ul>
            <Form
              onSubmit={() =>
                void run(generation =>
                  mutate(
                    'submodule_add',
                    { url, path: modulePath },
                    generation,
                    'modules'
                  )
                )
              }
            >
              <label>
                Submodule URL
                <input
                  value={url}
                  onChange={event => setUrl(event.currentTarget.value)}
                  required={true}
                />
              </label>
              <label>
                Submodule relative path
                <input
                  value={modulePath}
                  onChange={event => setModulePath(event.currentTarget.value)}
                  required={true}
                />
              </label>
              <button disabled={busy}>Add submodule</button>
            </Form>
          </details>
        </React.Fragment>
      )}
    </section>
  )
}
export function mountManagement(container: HTMLElement, services: IServices) {
  let root: string | null = null,
    accountBasis: string | undefined,
    stored: IPreferences | null = null
  function render() {
    ReactDOM.render(
      <ManagementPanel
        root={root}
        accountBasis={accountBasis}
        services={services}
        stored={stored}
      />,
      container
    )
  }
  render()
  return {
    setRepository(value: string | null, basis?: string) {
      if (root !== value || accountBasis !== basis) {
        root = value
        accountBasis = basis
        render()
      }
    },
    setPreferences(value: IPreferences) {
      stored = value
      render()
    },
    dispose() {
      ReactDOM.unmountComponentAtNode(container)
    },
  }
}
