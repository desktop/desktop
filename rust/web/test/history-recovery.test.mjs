import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
async function waitFor(check) {
  for (let n = 0; n < 200; n++) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.ok(check(), 'DOM condition did not become true')
}

test('history pins pages and opens exact commit files; recovery uses certified conflict choices', async () => {
  const dom = new JSDOM(
    '<!doctype html><div id="history"></div><div id="recovery"></div>',
    { url: 'http://127.0.0.1:9418', pretendToBeVisual: true }
  )
  globalThis.MessageChannel = undefined
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: dom.window.navigator,
  })
  const { mountHistory, mountRecovery } = await import('../panels.js')
  const author = {
      name: 'Author',
      email: 'author@example.invalid',
      timestamp: 1,
      timezone: '+0000',
    },
    calls = [],
    diffs = []
  const commit = {
    oid: 'a'.repeat(40),
    summary: '<img src=bad>',
    message:
      '<img src=bad>\n\nBody\n\nCo-authored-by: Helper <helper@example.invalid>\n',
    author,
    committer: author,
    parents: ['b'.repeat(40), 'c'.repeat(40)],
    trailers: [
      { token: 'Co-authored-by', value: 'Helper <helper@example.invalid>' },
    ],
  }
  let changes = 0,
    resolveSlow,
    slow = false
  const services = {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'history') {
        if (slow)
          return new Promise(resolve => {
            resolveSlow = resolve
          })
        return {
          revision: 'd'.repeat(40),
          commits: [commit],
          next_offset: parameters.offset === 0 ? 30 : null,
        }
      }
      if (method === 'commit_files')
        return {
          files: [
            { path: { bytes: [102] }, display_path: 'file', status: 'M' },
          ],
        }
      if (method === 'conflict_detail')
        return {
          basis: 'certified',
          stages: [
            { stage: 2, text: '<script>unsafe()</script>' },
            { stage: 3, text: 'theirs' },
          ],
        }
      if (method === 'branch_list')
        return [
          {
            name: 'main',
            ref: 'refs/heads/main',
            oid: 'a'.repeat(40),
            local: true,
            upstream: 'refs/remotes/origin/main',
            worktree: '/repo',
          },
        ]
      return { code: 0, stdout: '', stderr: '' }
    },
    async onChanged() {
      changes++
    },
    onDiff(...values) {
      diffs.push(values)
    },
  }
  const history = mountHistory(document.querySelector('#history'), services),
    recovery = mountRecovery(document.querySelector('#recovery'), services)
  function button(root, text) {
    const result = [...root.querySelectorAll('button')].find(
      button => button.textContent === text
    )
    assert.ok(result, text)
    return result
  }
  const h = document.querySelector('#history'),
    r = document.querySelector('#recovery')
  try {
    history.show('/repo')
    await waitFor(() => h.querySelector('.commit-list button'))
    assert.equal(h.querySelector('img'), null)
    assert.equal(
      h.querySelector('.commit-attribution-component').textContent,
      'Author'
    )
    assert(
      h
        .querySelector('.commit-list small')
        .textContent.includes('Author <author@example.invalid>')
    )
    button(h, 'Older commits').click()
    await waitFor(
      () => calls.filter(call => call.method === 'history').length === 2
    )
    assert.deepEqual(
      calls.filter(call => call.method === 'history').at(-1).parameters,
      { revision: 'd'.repeat(40), offset: 30, limit: 30 }
    )
    await waitFor(() => !button(h, 'Refresh history').disabled)
    h.querySelector('.commit-list button').click()
    await waitFor(() => h.querySelector('article'))
    assert.ok(
      h.textContent.includes('Co-authors: Helper <helper@example.invalid>')
    )
    button(h, 'M file').click()
    assert.deepEqual(diffs.at(-1), [{ bytes: [102] }, commit.oid, 0, 'file'])
    const parent = h.querySelector('select')
    parent.value = '1'
    parent.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    await waitFor(() => !button(h, 'Refresh history').disabled)
    button(h, 'Revert commit').click()
    await waitFor(() => changes === 1)
    assert.equal(
      calls.find(call => call.method === 'revert').parameters.mainline,
      2
    )
    const snapshot = {
      root: '/repo',
      branch: 'main',
      upstream: 'refs/remotes/origin/main',
      ahead: 1,
      behind: 0,
      operation: { kind: 'merge', step: null, total: null },
      files: [{ path: 'file', display_path: 'file', conflicted: true }],
    }
    recovery.setSnapshot(snapshot)
    assert.equal(button(r, 'Continue operation').disabled, true)
    button(r, 'Inspect conflict: file').click()
    await waitFor(() => r.textContent.includes('Use ours and stage'))
    assert.equal(r.querySelector('script'), null)
    button(r, 'Use theirs and stage').click()
    await waitFor(() => changes === 2)
    assert.deepEqual(
      calls.find(call => call.method === 'resolve_conflict').parameters,
      { path: 'file', basis: 'certified', choice: 'theirs' }
    )
    recovery.setSnapshot({ ...snapshot, files: [] })
    await waitFor(() => !button(r, 'Continue operation').disabled)
    button(r, 'Continue operation').click()
    await waitFor(() => changes === 3)
    assert.deepEqual(calls.find(call => call.method === 'recover').parameters, {
      kind: 'merge',
      action: 'continue',
    })
    slow = true
    button(h, 'Refresh history').click()
    await waitFor(() => Boolean(resolveSlow))
    history.setRepository('/other')
    resolveSlow({ revision: 'old', commits: [commit], next_offset: null })
    await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(h.textContent, '')
  } finally {
    history.dispose()
    recovery.dispose()
    dom.window.close()
  }
})

test('shared commit attribution preserves legacy rendering and escapes author names', async () => {
  const built = await build({
    stdin: {
      contents: `import * as React from 'react'; import * as ReactDOM from 'react-dom';
        import {CommitAttribution as Shared} from './upstream/commit-attribution';
        import {CommitAttribution as Legacy} from '../../../app/src/ui/lib/commit-attribution';
        export function render(container, names, legacy) {
          ReactDOM.render(React.createElement(legacy ? Legacy : Shared,
            {avatarUsers: names.map(name => ({name}))}), container)
        }`,
      resolveDir: fileURLToPath(new URL('../src', import.meta.url)),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const { render } = await import(
    `data:text/javascript;base64,${Buffer.from(
      built.outputFiles[0].text
    ).toString('base64')}`
  )
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: 'http://127.0.0.1:9418',
  })
  globalThis.MessageChannel = undefined
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  const container = dom.window.document.querySelector('#root')
  try {
    for (const legacy of [false, true]) {
      for (const [names, expected] of [
        [[], '0 people'],
        [['<img src=x>'], '<img src=x>'],
        [['One', 'Two'], 'One, Two'],
        [['One', 'Two', 'Three'], '3 people'],
      ]) {
        render(container, names, legacy)
        assert.equal(container.textContent, expected)
        assert.equal(container.querySelector('img'), null)
        assert(container.querySelector('.commit-attribution-component'))
      }
    }
  } finally {
    dom.window.close()
  }
})
