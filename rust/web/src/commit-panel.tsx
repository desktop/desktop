import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Form } from './upstream/form'
import { Row } from './upstream/row'

type GitPath = string | { bytes: number[] }
interface ILargeFile {
  readonly path: GitPath
  readonly display_path: string
  readonly oid: string
  readonly size: number
  readonly tracked_by_lfs: boolean
}
interface IPlan {
  readonly basis: string
  readonly threshold_bytes: number
  readonly staged_count: number
  readonly large_files: ILargeFile[]
}
interface IDraft {
  readonly summary: string
  readonly description: string
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
function gitPath(value: unknown): value is GitPath {
  return (
    typeof value === 'string' ||
    (record(value) &&
      Array.isArray(value.bytes) &&
      value.bytes.every(
        byte => Number.isInteger(byte) && byte >= 0 && byte <= 255
      ))
  )
}
function plan(value: unknown): value is IPlan {
  return (
    record(value) &&
    typeof value.basis === 'string' &&
    Number.isFinite(value.threshold_bytes) &&
    Number.isInteger(value.staged_count) &&
    Array.isArray(value.large_files) &&
    value.large_files.every(
      file =>
        record(file) &&
        gitPath(file.path) &&
        typeof file.display_path === 'string' &&
        typeof file.oid === 'string' &&
        typeof file.size === 'number' &&
        Number.isFinite(file.size) &&
        typeof file.tracked_by_lfs === 'boolean'
    )
  )
}
function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function CommitPanel({
  root,
  enabled,
  services,
}: {
  readonly root: string | null
  readonly enabled: boolean
  readonly services: IServices
}) {
  const [summary, setSummary] = React.useState(''),
    [description, setDescription] = React.useState('')
  const [busy, setBusy] = React.useState(false),
    [message, setMessage] = React.useState('')
  const [review, setReview] = React.useState<{
    readonly plan: IPlan
    readonly draft: IDraft
  } | null>(null)
  const generation = React.useRef(0),
    lastRoot = React.useRef<string | null>(null)
  const drafts = React.useRef(new Map<string, IDraft>())
  React.useLayoutEffect(() => {
    ++generation.current
    setBusy(false)
    setMessage('')
    setReview(null)
    if (root && root !== lastRoot.current) {
      if (lastRoot.current)
        drafts.current.set(lastRoot.current, { summary, description })
      const saved = drafts.current.get(root)
      setSummary(saved?.summary || '')
      setDescription(saved?.description || '')
      lastRoot.current = root
    }
    return () => {
      ++generation.current
    }
  }, [root])
  async function commit(
    draft: IDraft,
    current: number,
    basis: string,
    allow: boolean
  ) {
    const result = await services.request('commit', {
      ...draft,
      basis,
      allow_large_files: allow,
      repository_id: root,
    })
    if (current !== generation.current) return
    if (!record(result) || result.code !== 0)
      throw new Error(
        record(result) && typeof result.stderr === 'string'
          ? result.stderr
          : 'Commit failed'
      )
    setSummary('')
    setDescription('')
    setReview(null)
    setMessage('Commit created')
    await services.onChanged()
  }
  async function submit(confirmed = false) {
    if (!root || !enabled || busy) return
    if (!summary.trim()) {
      setMessage('Enter a commit summary')
      return
    }
    const current = ++generation.current
    const draft = { summary, description }
    setBusy(true)
    setMessage('Reviewing staged files…')
    try {
      if (confirmed && review) {
        await commit(review.draft, current, review.plan.basis, true)
        return
      }
      setReview(null)
      const value = await services.request('commit_preview', {
        repository_id: root,
      })
      if (current !== generation.current) return
      if (!plan(value)) throw new Error('Invalid commit review response')
      if (value.large_files.length) {
        setReview({ plan: value, draft })
        setMessage('Review oversized staged files before committing')
        return
      }
      setMessage('Creating commit…')
      await commit(draft, current, value.basis, false)
    } catch (error) {
      if (current === generation.current) {
        setReview(null)
        setMessage(errorText(error))
        try {
          await services.onChanged()
        } catch {
          /* Preserve the original failure and draft. */
        }
      }
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }
  return (
    <Form id="commit" onSubmit={() => void submit()}>
      <h2>Commit staged changes</h2>
      <label>
        Summary
        <input
          name="summary"
          required={true}
          autoComplete="off"
          disabled={!root || busy}
          value={summary}
          onChange={event => {
            setSummary(event.currentTarget.value)
            setReview(null)
          }}
        />
      </label>
      <label>
        Description
        <textarea
          name="description"
          rows={3}
          disabled={!root || busy}
          value={description}
          onChange={event => {
            setDescription(event.currentTarget.value)
            setReview(null)
          }}
        />
      </label>
      <button disabled={!root || !enabled || busy} type="submit">
        Commit
      </button>
      <p role="status">{message}</p>
      {review && (
        <section
          className="commit-large-files"
          role="alert"
          aria-label="Oversized staged files"
        >
          <p>
            These staged Git blobs exceed{' '}
            {review.plan.threshold_bytes / 1024 / 1024} MiB. GitHub.com can
            reject pushes containing them. Use Git LFS or unstage the files
            before committing.
          </p>
          <ul>
            {review.plan.large_files.map((file, index) => (
              <li key={index}>
                <code>{file.display_path}</code> · {file.size} bytes
                {file.tracked_by_lfs && (
                  <p>
                    An LFS rule matches, but the staged blob is still large.
                    Check LFS filters and stage the file again.
                  </p>
                )}
              </li>
            ))}
          </ul>
          <Row>
            <button
              type="button"
              disabled={busy || !enabled}
              onClick={() => {
                setReview(null)
                setMessage('Unstage files or configure LFS, then review again')
              }}
            >
              Back to changes
            </button>
            <button
              type="button"
              disabled={busy || !enabled}
              onClick={() => void submit(true)}
            >
              Commit anyway
            </button>
          </Row>
        </section>
      )}
    </Form>
  )
}

/** Mount staged-blob review and repository-scoped in-memory commit drafts. */
export function mountCommit(element: Element, services: IServices) {
  let root: string | null = null,
    enabled = false
  const render = () =>
    ReactDOM.render(
      <CommitPanel root={root} enabled={enabled} services={services} />,
      element
    )
  render()
  return {
    setRepository(next: string | null) {
      if (next === root) return
      root = next
      render()
    },
    setEnabled(next: boolean) {
      if (next === enabled) return
      enabled = next
      render()
    },
    dispose() {
      ReactDOM.unmountComponentAtNode(element)
    },
  }
}
