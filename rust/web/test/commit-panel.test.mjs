import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

async function until(check) {
  for (let n = 0; n < 200; ++n) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert(check(), 'commit panel did not settle')
}

test('commit review requires explicit consent, preserves drafts and rejects stale roots', async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    pretendToBeVisual: true,
    url: 'http://127.0.0.1:9418',
  })
  globalThis.MessageChannel = undefined
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: dom.window.navigator,
  })
  const { mountCommit } = await import('../panels.js')
  const root = document.querySelector('#root'),
    calls = []
  let large = true,
    fail = false,
    changed = 0,
    pending = null
  const plan = {
    basis: 'staged-certificate',
    threshold_bytes: 104857600,
    staged_count: 1,
    large_files: [
      {
        path: { bytes: [255] },
        display_path: '<script>unsafe</script>\n.bin',
        oid: 'a'.repeat(40),
        size: 104857601,
        tracked_by_lfs: true,
      },
    ],
  }
  const view = mountCommit(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'commit_preview') {
        if (pending)
          return new Promise(resolve => {
            pending.resolve = resolve
          })
        return { ...plan, large_files: large ? plan.large_files : [] }
      }
      if (fail) throw new Error('Index changed; review again')
      return { code: 0 }
    },
    async onChanged() {
      ++changed
    },
  })
  const button = text =>
    [...root.querySelectorAll('button')].find(item => item.textContent === text)
  const summary = () => root.querySelector('[name=summary]')
  function setSummary(value) {
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      'value'
    ).set.call(summary(), value)
    summary().dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  }
  const submit = () =>
    root
      .querySelector('form')
      .dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true })
      )
  const commits = () => calls.filter(call => call.method === 'commit')
  try {
    assert(button('Commit').disabled)
    view.setRepository('repo-a')
    view.setEnabled(true)
    setSummary('review me')
    submit()
    await until(
      () => button('Commit anyway') && !button('Commit anyway').disabled
    )
    assert.equal(commits().length, 0)
    assert.equal(root.querySelector('script'), null)
    assert(root.textContent.includes('<script>unsafe</script>'))
    assert(root.textContent.includes('staged blob is still large'))
    assert.deepEqual(calls[0], {
      method: 'commit_preview',
      parameters: { repository_id: 'repo-a' },
    })
    button('Back to changes').click()
    assert(!button('Commit anyway'))
    assert.equal(summary().value, 'review me')
    assert.equal(commits().length, 0)
    submit()
    await until(
      () => button('Commit anyway') && !button('Commit anyway').disabled
    )
    setSummary('edited draft')
    assert(!button('Commit anyway'), 'message edits must invalidate consent')
    submit()
    await until(
      () => button('Commit anyway') && !button('Commit anyway').disabled
    )
    fail = true
    button('Commit anyway').click()
    await until(
      () =>
        root.textContent.includes('Index changed') && !button('Commit').disabled
    )
    assert.equal(summary().value, 'edited draft')
    assert(!button('Commit anyway'), 'failed consent cannot be reused')
    assert.deepEqual(commits()[0].parameters, {
      summary: 'edited draft',
      description: '',
      basis: plan.basis,
      allow_large_files: true,
      repository_id: 'repo-a',
    })
    fail = false
    submit()
    await until(
      () => button('Commit anyway') && !button('Commit anyway').disabled
    )
    button('Commit anyway').click()
    await until(
      () =>
        root.textContent.includes('Commit created') &&
        !button('Commit').disabled
    )
    assert.equal(summary().value, '')
    assert.equal(changed, 2)
    large = false
    setSummary('ordinary change')
    submit()
    await until(
      () =>
        root.textContent.includes('Commit created') &&
        !button('Commit').disabled
    )
    assert.equal(commits().at(-1).parameters.allow_large_files, false)
    assert.equal(summary().value, '')
    setSummary('saved a')
    view.setRepository('repo-b')
    assert.equal(summary().value, '')
    setSummary('saved b')
    view.setRepository(null)
    assert(summary().disabled)
    view.setRepository('repo-b')
    assert.equal(summary().value, 'saved b')
    view.setRepository('repo-a')
    assert.equal(summary().value, 'saved a')
    view.setEnabled(false)
    const before = calls.length
    submit()
    assert.equal(calls.length, before)
    view.setEnabled(true)
    pending = {}
    submit()
    await until(() => pending.resolve)
    assert(summary().disabled)
    view.setRepository('repo-b')
    pending.resolve(plan)
    await new Promise(resolve => setTimeout(resolve, 20))
    assert(!button('Commit anyway'), 'late review must not apply to a new root')
    assert.equal(summary().value, 'saved b')
    assert.equal(commits().length, 3)
  } finally {
    view.dispose()
    dom.window.close()
  }
})
