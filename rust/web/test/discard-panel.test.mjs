import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

async function until(check) {
  for (let n = 0; n < 200; n++) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert(check(), 'discard UI did not settle')
}

test('discard review requires a certified plan, preserves selection, supports undo, and ignores stale roots', async () => {
  const dom = new JSDOM('<div id="root"></div>', {
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
  const { mountDiscard } = await import('../panels.js')
  const root = document.querySelector('#root')
  const calls = [],
    backups = []
  let previewResolve,
    slow = true,
    changed = 0,
    fail = false
  function plan(parameters) {
    return {
      basis: parameters.selection
        ? 'review-lines'
        : `review-${parameters.scope}`,
      files: [
        {
          display_path: '<script>unsafe</script>',
          before: { kind: 'regular', size: 12 },
          after: { kind: 'regular', size: 7 },
        },
      ],
      index_changes: parameters.scope === 'all_changes',
      backup_bytes: 12,
      undo_requires_unchanged_index: false,
    }
  }
  const view = mountDiscard(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'list_discards') return [...backups]
      if (method === 'discard_preview') {
        if (slow)
          return new Promise(resolve => {
            previewResolve = () => resolve(plan(parameters))
          })
        return plan(parameters)
      }
      if (method === 'discard') {
        if (fail) throw new Error('File changed; review discard again')
        const id = `backup-${backups.length}`
        backups.push({ id, state: 'applied', files: plan(parameters).files })
        return { code: 0, undo_id: id }
      }
      if (method === 'forget_discard') {
        const index = backups.findIndex(item => item.id === parameters.undo_id)
        backups.splice(index, 1)
        return { code: 0 }
      }
      if (method === 'undo_discard') {
        const index = backups.findIndex(item => item.id === parameters.undo_id)
        backups[index] = { ...backups[index], state: 'undone' }
        return { code: 0 }
      }
      throw new Error(method)
    },
    async onChanged() {
      changed++
    },
  })
  function button(text) {
    return [...root.querySelectorAll('button')].find(
      button => button.textContent === text
    )
  }
  try {
    view.setRepository('root-one')
    view.showFile({ bytes: [255] }, 'unsafe display', 'root-one')
    await until(() => previewResolve)
    assert(button('Discard reviewed changes').disabled)
    assert(!calls.some(call => call.method === 'discard'))
    previewResolve()
    slow = false
    await until(() => !button('Discard reviewed changes').disabled)
    assert(root.textContent.includes('resets staged changes'))
    assert.equal(root.querySelector('script'), null)
    button('Discard reviewed changes').click()
    await until(
      () =>
        changed === 1 &&
        button('Undo discard') &&
        !button('Undo discard').disabled
    )
    assert.deepEqual(calls.find(call => call.method === 'discard').parameters, {
      path: { bytes: [255] },
      scope: 'all_changes',
      selection: undefined,
      basis: 'review-all_changes',
    })
    button('Undo discard').click()
    await until(
      () =>
        changed === 2 &&
        root.textContent.includes('Discarded changes restored.')
    )
    assert.equal(
      calls.filter(call => call.method === 'undo_discard').at(-1).parameters
        .undo_id,
      'backup-0'
    )
    view.showFile('file', 'file', 'root-one')
    await until(
      () =>
        button('Discard reviewed changes') &&
        !button('Discard reviewed changes').disabled
    )
    const select = root.querySelector('select')
    select.value = 'working_tree'
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    await until(
      () =>
        calls.filter(call => call.method === 'discard_preview').at(-1)
          ?.parameters.scope === 'working_tree' &&
        !button('Discard reviewed changes').disabled
    )
    fail = true
    button('Discard reviewed changes').click()
    await until(() =>
      root.textContent.includes('File changed; review discard again')
    )
    assert.equal(changed, 2)
    assert.equal(
      calls.filter(call => call.method === 'discard').at(-1).parameters.basis,
      'review-working_tree'
    )
    fail = false
    view.showFile('file', 'file', 'root-one', {
      basis: 'captured-diff',
      lines: [2, 4],
    })
    await until(
      () =>
        root.textContent.includes('Discard 2 selected') &&
        !button('Discard reviewed changes').disabled
    )
    button('Discard reviewed changes').click()
    await until(() => changed === 3)
    assert.deepEqual(
      calls.filter(call => call.method === 'discard').at(-1).parameters,
      {
        path: 'file',
        scope: 'working_tree',
        selection: { basis: 'captured-diff', lines: [2, 4] },
        basis: 'review-lines',
      }
    )
    const restored = root.querySelector('input[type=checkbox]')
    restored.click()
    await until(() => button('Delete backup…'))
    button('Delete backup…').click()
    assert(!calls.some(call => call.method === 'forget_discard'))
    button('Keep backup').click()
    button('Delete backup…').click()
    button('Delete backup permanently').click()
    await until(() => root.textContent.includes('Undo backup deleted.'))
    assert.equal(
      calls.filter(call => call.method === 'forget_discard').at(-1).parameters
        .undo_id,
      'backup-0'
    )
    slow = true
    previewResolve = undefined
    view.showFile('stale', 'stale', 'root-one')
    await until(() => previewResolve)
    view.setRepository('root-two')
    previewResolve()
    await new Promise(resolve => setTimeout(resolve, 10))
    assert(!root.textContent.includes('Review discard'))
    assert.equal(root.querySelector('script'), null)
    view.setRepository(null)
    assert.equal(root.textContent, '')
  } finally {
    view.dispose()
    dom.window.close()
  }
})

test('persisted resolution receipts use purpose-specific undo and recovery labels', async () => {
  const dom = new JSDOM('<div id="root"></div>', {
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
  const { mountDiscard } = await import('../panels.js')
  const root = document.querySelector('#root'),
    calls = []
  let records = [
    {
      id: 'choice',
      state: 'applied',
      purpose: 'conflict_choice',
      lfs_payloads_unavailable: 1,
    },
    { id: 'stage', state: 'applied', purpose: 'conflict_stage' },
    { id: 'partial', state: 'prepared', purpose: 'conflict_choice' },
  ]
  const panel = mountDiscard(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'list_discards') return records
      return { code: 0 }
    },
    async onChanged() {},
  })
  const button = text =>
    [...root.querySelectorAll('button')].find(item => item.textContent === text)
  try {
    panel.setRepository('repo-a')
    await until(() => button('Undo resolution'))
    assert(button('Unstage resolution (keep working files)'))
    assert(button('Recover interrupted resolution'))
    assert(
      root.textContent.includes('Some original LFS payloads were unavailable')
    )
    button('Undo resolution').click()
    await until(() => root.textContent.includes('Conflict resolution undone.'))
    assert.deepEqual(
      calls.find(call => call.method === 'undo_discard').parameters,
      { undo_id: 'choice' }
    )
    records = []
    panel.refreshHistory()
    await until(() => root.textContent.includes('No undo backups available.'))
  } finally {
    panel.dispose()
    dom.window.close()
  }
})
