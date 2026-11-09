import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

async function waitFor(check) {
  for (let n = 0; n < 200; n++) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.ok(check(), 'DOM condition did not become true')
}

test('diff viewer stages hunks, preserves version tokens, unstages lines, and renders safe previews', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: 'http://127.0.0.1:9418',
    pretendToBeVisual: true,
  })
  globalThis.MessageChannel = undefined
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: dom.window.navigator,
  })
  const { mountDiff } = await import('../panels.js')
  const root = document.querySelector('#root'),
    calls = []
  const preview = {
    mode: '100644',
    oid: 'a'.repeat(40),
    size: 4,
    image: null,
    text: null,
  }
  let kind = 'text',
    failure = false,
    changes = 0,
    token = 'version-1'
  const discarded = []
  const lines = [
    {
      id: 0,
      kind: 'context',
      text: 'context',
      old_line: 1,
      new_line: 1,
      no_newline: false,
    },
    {
      id: 1,
      kind: 'deleted',
      text: 'old',
      old_line: 2,
      new_line: null,
      no_newline: false,
    },
    {
      id: 2,
      kind: 'added',
      text: '<script>unsafe()</script>',
      old_line: null,
      new_line: 2,
      no_newline: true,
    },
  ]
  let slowResolve,
    slow = false
  const viewer = mountDiff(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'select_diff') {
        if (failure) throw new Error('File or index changed; reload the diff')
        token = 'version-2'
        return { code: 0, stdout: '', stderr: '' }
      }
      if (slow)
        return new Promise(resolve => {
          slowResolve = resolve
        })
      return {
        basis: token,
        kind,
        can_select: kind === 'text' && method !== 'commit_diff',
        before: preview,
        after:
          kind === 'image'
            ? { ...preview, image: { mime: 'image/png', data: 'aGVsbG8=' } }
            : preview,
        hunks:
          kind === 'text'
            ? [
                {
                  old_start: 1,
                  old_count: 2,
                  new_start: 1,
                  new_count: 2,
                  lines,
                },
              ]
            : [],
      }
    },
    async onChanged() {
      changes++
    },
    onDiscard(...parameters) {
      discarded.push(parameters)
    },
  })
  function button(prefix) {
    const found = [...root.querySelectorAll('button')].find(button =>
      button.textContent.startsWith(prefix)
    )
    assert.ok(found, prefix)
    return found
  }
  async function loaded() {
    await waitFor(
      () =>
        root.querySelector('.diff-hunk') ||
        root.textContent.includes('Binary content') ||
        root.querySelector('img')
    )
  }
  try {
    viewer.showFile({ bytes: [102, 105, 108, 101] }, false, 'file', '/repo')
    await loaded()
    assert.equal(root.querySelector('script'), null)
    assert.ok(root.textContent.includes('No newline at end of file'))
    assert.equal(
      root.querySelectorAll('input[aria-label^="Select line"]').length,
      2
    )
    root.querySelector('input[aria-label="Select hunk 1"]').click()
    button('Discard selected lines').click()
    assert.deepEqual(discarded, [
      [
        { bytes: [102, 105, 108, 101] },
        'file',
        '/repo',
        { basis: 'version-1', lines: [1, 2] },
      ],
    ])
    button('Stage selected lines').click()
    await waitFor(() => changes === 1)
    await waitFor(() => !button('Reload diff').disabled)
    assert.deepEqual(
      calls.find(call => call.method === 'select_diff').parameters,
      {
        path: { bytes: [102, 105, 108, 101] },
        staged: false,
        basis: 'version-1',
        lines: [1, 2],
      }
    )
    assert.equal(
      root.querySelector('input[aria-label="Select hunk 1"]').checked,
      false
    )
    viewer.showFile('file', true, 'file', '/repo')
    await loaded()
    await waitFor(() => !button('Reload diff').disabled)
    root.querySelector('input[aria-label="Select line 2"]').click()
    assert(!root.textContent.includes('Discard selected lines'))
    failure = true
    button('Unstage selected lines').click()
    await waitFor(() => root.textContent.includes('File or index changed'))
    assert.equal(changes, 1)
    assert.equal(
      calls.filter(call => call.method === 'select_diff').at(-1).parameters
        .staged,
      true
    )
    assert.equal(
      calls.filter(call => call.method === 'select_diff').at(-1).parameters
        .basis,
      'version-2'
    )
    failure = false
    viewer.showCommit('historical', 'a'.repeat(40), 1, 'historical', '/repo')
    await waitFor(
      () =>
        calls.at(-1)?.method === 'commit_diff' &&
        root.querySelector('.diff-hunk')
    )
    assert.deepEqual(calls.at(-1).parameters, {
      path: 'historical',
      commit: 'a'.repeat(40),
      parent: 1,
    })
    assert.ok(!root.textContent.includes('Stage selected lines'))
    kind = 'image'
    viewer.showFile('image.png', false, 'image.png', '/repo')
    await waitFor(() => root.querySelector('img'))
    assert.equal(
      root.querySelector('img').getAttribute('src'),
      'data:image/png;base64,aGVsbG8='
    )
    assert.ok(!root.textContent.includes('Stage selected lines'))
    preview.lfs = { oid: 'a'.repeat(64), size: 200, state: 'missing' }
    kind = 'lfs_unavailable'
    viewer.showFile('missing-lfs', false, 'missing-lfs', '/repo')
    await waitFor(() => root.textContent.includes('not cached locally'))
    assert(root.textContent.includes('cannot be compared'))
    assert(!root.textContent.includes('Stage selected lines'))
    for (const [state, hint] of [
      ['corrupt', 'failed verification'],
      ['extension', 'requires an LFS extension'],
      ['unavailable', 'Check Git LFS installation'],
      ['too_large', 'exceeds the preview limit'],
      ['available', 'Verified local payload'],
    ]) {
      preview.lfs.state = state
      kind =
        state === 'too_large'
          ? 'too_large'
          : state === 'available'
          ? 'text'
          : 'lfs_unavailable'
      viewer.showFile(`lfs-${state}`, false, `lfs-${state}`, '/repo')
      await waitFor(() => root.textContent.includes(hint))
    }
    delete preview.lfs
    kind = 'binary'
    viewer.showFile('binary', false, 'binary', '/repo')
    await waitFor(() => root.textContent.includes('Binary content'))
    slow = true
    viewer.showFile('stale', false, 'stale', '/repo')
    await waitFor(() => Boolean(slowResolve))
    viewer.setRepository('/other')
    slowResolve({
      basis: 'stale',
      kind: 'text',
      can_select: true,
      before: preview,
      after: preview,
      hunks: [],
    })
    await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(root.textContent, '')
  } finally {
    viewer.dispose()
    dom.window.close()
  }
})
