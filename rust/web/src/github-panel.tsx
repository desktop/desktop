import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Form } from './upstream/form'
import { Row } from './upstream/row'
import { HorizontalRule } from './upstream/horizontal-rule'
import { HighlightText } from './upstream/highlight-text'

interface IGitHubServices {
  readonly request: (request: {
    repository?: string
    account_basis?: string
    action: Record<string, unknown>
  }) => Promise<unknown>
  readonly onChanged: () => Promise<void>
}
interface IGitHubResult {
  readonly code: number
  readonly data: unknown
  readonly stdout: string
  readonly stderr: string
  readonly hint?: string
}
interface IPanelProps {
  readonly services: IGitHubServices
  readonly root: string | null
  readonly accountBasis?: string
}

type View =
  | 'pull_requests'
  | 'issues'
  | 'workflow_runs'
  | 'repository'
  | 'auth_status'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function isResult(value: unknown): value is IGitHubResult {
  return (
    isRecord(value) &&
    typeof value.code === 'number' &&
    typeof value.stdout === 'string' &&
    typeof value.stderr === 'string' &&
    'data' in value
  )
}
function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : ''
}
function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}
function positive(value: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error('Enter a positive item number')
  return number
}

function GitHubPanel({ services, root, accountBasis }: IPanelProps) {
  const [view, setView] = React.useState<View>('pull_requests')
  const [repository, setRepository] = React.useState('')
  const [filter, setFilter] = React.useState('open')
  const [query, setQuery] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState(
    'Select a GitHub view to load data. Authenticate in Termux with desktop-rs gh auth login.'
  )
  const [data, setData] = React.useState<unknown>(null)
  const [detail, setDetail] = React.useState<Record<string, unknown> | null>(
    null
  )
  const [number, setNumber] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [body, setBody] = React.useState('')
  const [base, setBase] = React.useState('main')
  const [head, setHead] = React.useState('')
  const [draft, setDraft] = React.useState(true)
  const [review, setReview] = React.useState('comment')
  const [strategy, setStrategy] = React.useState('squash')
  const epoch = React.useRef(0)
  const active = React.useRef(true)
  const inFlight = React.useRef<number | null>(null)
  React.useEffect(
    () => () => {
      active.current = false
      epoch.current++
    },
    []
  )
  React.useLayoutEffect(() => {
    epoch.current++
    inFlight.current = null
    setBusy(false)
    setRepository('')
    setQuery('')
    setHead('')
    setBase('main')
    setDraft(true)
    setReview('comment')
    setStrategy('squash')
    setData(null)
    setDetail(null)
    setNumber('')
    setBody('')
    setTitle('')
    setMessage(
      root
        ? 'Repository selected. Load a GitHub view.'
        : 'Open a repository, or check authentication.'
    )
  }, [root, accountBasis])

  async function run(action: Record<string, unknown>, showDetail = false) {
    if (inFlight.current !== null) return
    const generation = epoch.current,
      context = {
        ...(repository.trim() ? { repository: repository.trim() } : {}),
        ...(action.type !== 'auth_status' && accountBasis !== undefined
          ? { account_basis: accountBasis }
          : {}),
      }
    inFlight.current = generation
    setBusy(true)
    setMessage('Contacting GitHub…')
    let failed = false
    try {
      const result = await services.request({
        ...context,
        action,
      })
      if (!active.current || generation !== epoch.current) return
      if (!isResult(result)) throw new Error('Invalid GitHub service response')
      const pendingChecks =
        action.type === 'pull_request_checks' &&
        [1, 8].includes(result.code) &&
        Array.isArray(result.data)
      if (result.code !== 0 && !pendingChecks)
        throw new Error(
          [result.stderr, result.hint].filter(Boolean).join('\n') ||
            `GitHub CLI exited ${result.code}`
        )
      setData(result.data)
      if (showDetail) setDetail(isRecord(result.data) ? result.data : null)
      setMessage(result.stdout || result.hint || 'Loaded')
      if (
        ['create_issue', 'create_pull_request'].includes(String(action.type))
      ) {
        setTitle('')
        setBody('')
      }
      if (
        [
          'close_issue',
          'reopen_issue',
          'comment',
          'review_pull_request',
          'merge_pull_request',
        ].includes(String(action.type))
      ) {
        const type = ['close_issue', 'reopen_issue', 'comment'].includes(
          String(action.type)
        )
          ? 'issue'
          : 'pull_request'
        const updated = await services.request({
          ...context,
          action: { type, number: action.number },
        })
        if (
          active.current &&
          generation === epoch.current &&
          isResult(updated) &&
          updated.code === 0 &&
          isRecord(updated.data)
        ) {
          setDetail(updated.data)
          setData(updated.data)
        }
        if (
          active.current &&
          generation === epoch.current &&
          (action.type === 'comment' || action.type === 'review_pull_request')
        )
          setBody('')
      }
    } catch (error) {
      failed = true
      if (active.current && generation === epoch.current)
        setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      if (
        action.type === 'checkout_pull_request' &&
        active.current &&
        generation === epoch.current
      ) {
        try {
          await services.onChanged()
        } catch (error) {
          if (!failed && active.current && generation === epoch.current)
            setMessage(error instanceof Error ? error.message : String(error))
        }
      }
      if (inFlight.current === generation) inFlight.current = null
      if (active.current && generation === epoch.current) setBusy(false)
    }
  }
  function load(next: View) {
    if (busy) return
    if (next !== view) setQuery('')
    setView(next)
    setDetail(null)
    setNumber('')
    const action =
      next === 'pull_requests' || next === 'issues'
        ? { type: next, state: filter, limit: 30 }
        : { type: next }
    void run(action)
  }
  function openItem(item: Record<string, unknown>) {
    const value =
      view === 'workflow_runs' ? text(item.databaseId) : text(item.number)
    setNumber(value)
    const type =
      view === 'pull_requests'
        ? 'pull_request'
        : view === 'issues'
        ? 'issue'
        : 'workflow_run'
    try {
      void run(
        {
          type,
          ...(type === 'workflow_run'
            ? { id: positive(value) }
            : { number: positive(value) }),
        },
        true
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }
  function action(type: string, extra: Record<string, unknown> = {}) {
    try {
      void run({ type, number: positive(number), ...extra })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }
  const records = Array.isArray(data) ? data.filter(isRecord) : []
  const filtered = records.filter(item =>
    `${text(item.title)} ${text(item.displayTitle)} ${text(item.name)} ${text(
      item.number
    )}`
      .toLowerCase()
      .includes(query.toLowerCase())
  )
  const canUseRepository = Boolean(root)
  return (
    <section className="github-panel" aria-label="GitHub services">
      <HorizontalRule title="GitHub" />
      <label>
        Repository override (optional)
        <input
          value={repository}
          disabled={busy}
          onChange={event => {
            epoch.current++
            setRepository(event.currentTarget.value)
            setData(null)
            setDetail(null)
          }}
          placeholder="HOST/OWNER/REPO or OWNER/REPO"
        />
      </label>
      <p className="muted">
        Credentials stay in GitHub CLI. Sign in using{' '}
        <code>desktop-rs gh auth login</code> in Termux.
      </p>
      <Row className="github-tabs">
        <button disabled={busy} onClick={() => load('auth_status')}>
          Authentication
        </button>
        <button
          disabled={busy || !canUseRepository}
          onClick={() => load('repository')}
        >
          GitHub repository
        </button>
        <button
          disabled={busy || !canUseRepository}
          onClick={() => load('pull_requests')}
        >
          Pull requests
        </button>
        <button
          disabled={busy || !canUseRepository}
          onClick={() => load('issues')}
        >
          Issues
        </button>
        <button
          disabled={busy || !canUseRepository}
          onClick={() => load('workflow_runs')}
        >
          Workflow runs
        </button>
      </Row>
      <p role="status" className="github-status">
        {message}
      </p>
      {(view === 'pull_requests' || view === 'issues') && (
        <Row>
          <label>
            State
            <select
              value={filter}
              disabled={busy}
              onChange={event => setFilter(event.currentTarget.value)}
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="all">All</option>
            </select>
          </label>
          <button
            disabled={busy || !canUseRepository}
            onClick={() => load(view)}
          >
            Reload {view === 'issues' ? 'issues' : 'pull requests'}
          </button>
          <label>
            Filter results
            <input
              value={query}
              onChange={event => setQuery(event.currentTarget.value)}
            />
          </label>
        </Row>
      )}
      <div className="github-items">
        {filtered.map((item, index) => {
          const name = text(item.title || item.displayTitle || item.name)
          const highlight = query
            ? Array.from({ length: name.length }, (_, i) => i)
                .filter(i =>
                  name.toLowerCase().slice(i).startsWith(query.toLowerCase())
                )
                .flatMap(i =>
                  Array.from(
                    { length: query.length },
                    (_, offset) => i + offset
                  )
                )
            : []
          const url = safeUrl(item.url || item.link)
          return (
            <Row key={text(item.number || item.databaseId) || index}>
              {item.number || item.databaseId ? (
                <button disabled={busy} onClick={() => openItem(item)}>
                  <span>#{text(item.number || item.databaseId)} </span>
                  <HighlightText text={name} highlight={highlight} />
                </button>
              ) : (
                <span>{name}</span>
              )}
              <span>
                {text(item.state || item.status)} {text(item.conclusion)}
              </span>
              {url && (
                <a href={url} target="_blank" rel="noopener noreferrer">
                  Open on GitHub
                </a>
              )}
            </Row>
          )
        })}
      </div>
      {data !== null && !Array.isArray(data) && (
        <pre className="github-data">{JSON.stringify(data, null, 2)}</pre>
      )}
      {detail && view === 'pull_requests' && (
        <div>
          <h3>Pull request #{number}</h3>
          <Row>
            <button
              disabled={busy}
              onClick={() => action('pull_request_checks')}
            >
              Checks
            </button>
            <button
              disabled={busy}
              onClick={() => action('checkout_pull_request')}
            >
              Check out pull request
            </button>
          </Row>
          <Form
            onSubmit={() => action('review_pull_request', { review, body })}
          >
            <label>
              Review
              <select
                value={review}
                onChange={event => setReview(event.currentTarget.value)}
              >
                <option value="comment">Comment</option>
                <option value="approve">Approve</option>
                <option value="request_changes">Request changes</option>
              </select>
            </label>
            <label>
              Review body
              <textarea
                value={body}
                onChange={event => setBody(event.currentTarget.value)}
              />
            </label>
            <button disabled={busy}>Submit review</button>
          </Form>
          <Row>
            <label>
              Merge strategy
              <select
                value={strategy}
                onChange={event => setStrategy(event.currentTarget.value)}
              >
                <option value="squash">Squash</option>
                <option value="merge">Merge</option>
                <option value="rebase">Rebase</option>
              </select>
            </label>
            <button
              disabled={busy || !text(detail.headRefOid)}
              onClick={() =>
                action('merge_pull_request', {
                  strategy,
                  head_commit: detail.headRefOid,
                })
              }
            >
              Merge reviewed head
            </button>
          </Row>
        </div>
      )}
      {detail && view === 'issues' && (
        <div>
          <h3>Issue #{number}</h3>
          <Form onSubmit={() => action('comment', { body })}>
            <label>
              Comment
              <textarea
                value={body}
                onChange={event => setBody(event.currentTarget.value)}
                required={true}
              />
            </label>
            <button disabled={busy}>Post comment</button>
          </Form>
          <button
            disabled={busy}
            onClick={() =>
              action(detail.state === 'CLOSED' ? 'reopen_issue' : 'close_issue')
            }
          >
            {detail.state === 'CLOSED' ? 'Reopen issue' : 'Close issue'}
          </button>
        </div>
      )}
      {detail && view === 'workflow_runs' && (
        <button
          disabled={busy}
          onClick={() => {
            try {
              void run({
                type: 'rerun_workflow',
                id: positive(number),
                failed_only: true,
              })
            } catch (error) {
              setMessage(String(error))
            }
          }}
        >
          Rerun failed jobs
        </button>
      )}
      {(view === 'pull_requests' || view === 'issues') && canUseRepository && (
        <details>
          <summary>
            Create {view === 'issues' ? 'issue' : 'pull request'}
          </summary>
          <Form
            onSubmit={() => {
              void run(
                view === 'issues'
                  ? { type: 'create_issue', title, body }
                  : {
                      type: 'create_pull_request',
                      title,
                      body,
                      base,
                      head,
                      draft,
                    }
              )
            }}
          >
            <label>
              Title
              <input
                value={title}
                onChange={event => setTitle(event.currentTarget.value)}
                required={true}
              />
            </label>
            <label>
              Body
              <textarea
                value={body}
                onChange={event => setBody(event.currentTarget.value)}
              />
            </label>
            {view === 'pull_requests' && (
              <React.Fragment>
                <label>
                  Base branch
                  <input
                    value={base}
                    onChange={event => setBase(event.currentTarget.value)}
                    required={true}
                  />
                </label>
                <label>
                  Published head branch
                  <input
                    value={head}
                    onChange={event => setHead(event.currentTarget.value)}
                    required={true}
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={draft}
                    onChange={event => setDraft(event.currentTarget.checked)}
                  />
                  Draft
                </label>
              </React.Fragment>
            )}
            <button disabled={busy}>
              Create {view === 'issues' ? 'issue' : 'pull request'}
            </button>
          </Form>
        </details>
      )}
    </section>
  )
}

/** Mount the shared React frontend without Electron IPC or Node APIs. */
export function mountGitHub(container: HTMLElement, services: IGitHubServices) {
  let root: string | null = null,
    accountBasis: string | undefined
  function render() {
    ReactDOM.render(
      <GitHubPanel
        services={services}
        root={root}
        accountBasis={accountBasis}
      />,
      container
    )
  }
  render()
  return {
    setRepository(value: string | null, basis?: string) {
      if (value !== root || accountBasis !== basis) {
        root = value
        accountBasis = basis
        render()
      }
    },
    dispose() {
      ReactDOM.unmountComponentAtNode(container)
    },
  }
}
